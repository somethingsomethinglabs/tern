import assert from 'node:assert/strict';
import { test } from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import { installWebsitePermissions } from '../host/website-permissions.ts';

function fixture(extra = {}) {
  const handlers = {};
  const session = {
    setPermissionCheckHandler: value => handlers.check = value,
    setPermissionRequestHandler: value => handlers.request = value,
    setDevicePermissionHandler: value => handlers.device = value,
    setDisplayMediaRequestHandler: value => handlers.display = value,
    on: (name, value) => handlers[name] = value,
  };
  let active = true, approve = false, url = 'https://example.com/editor';
  const prompts = [], notices = [];
  const contents = { isDestroyed: () => false, getURL: () => url,
    on: (name, listener) => handlers[name] = listener, once: (name, listener) => handlers[name] = listener };
  const controller = installWebsitePermissions(session, {
    active: () => active, current: () => contents,
    prompt: (...args) => { prompts.push(args); return approve; },
    notice: value => notices.push(value), extensionClipboard: () => false, ...extra,
  });
  return {
    handlers, contents, prompts, notices, controller,
    configure: values => { active = values.active ?? active; approve = values.approve ?? approve; url = values.url ?? url; },
    request: (permission, details = {}) => {
      let result;
      handlers.request(contents, permission, value => result = value,
        { requestingUrl: url, isMainFrame: true, ...details });
      return result;
    },
  };
}

test('file access needs an explicit decision with origin, path and access mode', () => {
  const f = fixture();
  const details = { isMainFrame: false, filePath: '/tmp/chosen.txt', isDirectory: false, fileAccessType: 'writable' };
  assert.equal(f.request('fileSystem', details), false);
  f.handlers['did-start-navigation']({}, 'https://example.com/editor', false, true);
  f.configure({ approve: true });
  assert.equal(f.request('fileSystem', details), true);
  assert.match(f.prompts[1][0], /https:\/\/example.com/);
  assert.match(f.prompts[1][1], /Read and change.*\n\/tmp\/chosen.txt/);
  assert.equal(f.handlers.check(null, 'fileSystem', 'https://example.com', details), true);
  assert.equal(f.handlers.check(null, 'fileSystem', 'https://example.com', { ...details, fileAccessType: 'readable' }), true);
  f.configure({ approve: false });
  assert.equal(f.handlers.check(null, 'fileSystem', 'https://example.com', { ...details, filePath: '/tmp/private.txt' }), false);
  assert.equal(f.handlers.check(null, 'fileSystem', 'https://attacker.example', details), false);
  f.handlers['did-start-navigation']({}, 'https://example.com/next', false, true);
  f.configure({ approve: false });
  assert.equal(f.handlers.check(null, 'fileSystem', 'https://example.com', details), false);
  assert.equal(f.request('fileSystem'), false);
});

test('background, insecure and third-party permission requests cannot prompt or approve', () => {
  const f = fixture(); f.configure({ approve: true });
  assert.equal(f.request('notifications', { requestingUrl: 'https://attacker.example/' }), false);
  assert.equal(f.request('notifications', { isMainFrame: false }), false);
  f.configure({ active: false });
  assert.equal(f.request('geolocation'), false);
  f.configure({ active: true, url: 'http://example.com/' });
  assert.equal(f.request('notifications'), false);
  assert.equal(f.prompts.length, 0);
});

test('known permissions prompt, unknown permissions, devices and sensitive directories deny', () => {
  const f = fixture(); f.configure({ approve: true });
  for (const permission of ['notifications', 'geolocation', 'clipboard-read'])
    assert.equal(f.request(permission), true);
  assert.equal(f.request('media', { mediaTypes: ['audio', 'video'] }), true);
  assert.equal(f.request('media', { mediaTypes: ['unknown'] }), false);
  assert.equal(f.request('unknown'), false);
  assert.equal(f.handlers.device({}), false);
  f.handlers.display({}, value => assert.deepEqual(value, {}));
  f.handlers['file-system-access-restricted']({}, {}, value => assert.equal(value, 'deny'));
  assert.equal(f.handlers.check(f.contents, 'clipboard-sanitized-write', 'https://example.com'), true);
});

test('native picker checks with no tab require path-specific approval from the selected origin', () => {
  const f = fixture();
  const details = { filePath: '/tmp/picked.txt', isDirectory: false, fileAccessType: 'writable' };
  assert.equal(f.handlers.check(null, 'fileSystem', 'https://example.com', details), false);
  f.handlers['did-start-navigation']({}, 'https://example.com/editor', false, true);
  f.configure({ approve: true });
  assert.equal(f.handlers.check(null, 'fileSystem', 'https://example.com', details), true);
  assert.equal(f.handlers.check(null, 'fileSystem', 'https://attacker.example', details), false);
  f.configure({ active: false });
  assert.equal(f.handlers.check(null, 'fileSystem', 'https://example.com', { ...details, filePath: '/tmp/another.txt' }), false);
});

test('denied requests cannot repeatedly reopen native prompts until navigation', () => {
  const f = fixture();
  assert.equal(f.request('notifications'), false);
  assert.equal(f.request('notifications'), false);
  assert.equal(f.prompts.length, 1);
  f.handlers['did-start-navigation']({}, 'https://example.com/next', false, true);
  f.request('notifications'); assert.equal(f.prompts.length, 2);
});

test('a native picker can return while its owning window lacks focus, without enabling media', () => {
  const f = fixture({fileActive: () => true}); f.configure({active:false,approve:true});
  const details = {filePath:'/tmp/selected.txt',isDirectory:false,fileAccessType:'writable'};
  assert.equal(f.handlers.check(null,'fileSystem','https://example.com',details),true);
  assert.equal(f.request('media',{mediaTypes:['video']}),false);
});

test('blocking persists, overrides existing approvals and clears grants', async t => {
  const directory = await mkdtemp(join(tmpdir(),'tern-policy-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const policyPath = join(directory,'permissions.json');
  const f = fixture({policyPath}); f.configure({approve:true});
  assert.equal(f.request('notifications'),true);
  f.controller.setPolicy('https://example.com','notifications','block');
  assert.equal(f.handlers.check(f.contents,'notifications','https://example.com',{isMainFrame:true}),false);
  const restarted = fixture({policyPath}); restarted.configure({approve:true});
  assert.equal(restarted.request('notifications'),false);
  assert.equal(restarted.prompts.length,0);
  restarted.controller.setPolicy('https://example.com','notifications','ask');
  assert.equal(restarted.request('notifications'),true);
});

test('media approval covers only the requested device types', () => {
  const f = fixture(); f.configure({approve:true});
  assert.equal(f.request('media',{mediaTypes:['video']}),true);
  assert.equal(f.handlers.check(f.contents,'media','https://example.com',{isMainFrame:true,mediaType:'video'}),true);
  assert.equal(f.handlers.check(f.contents,'media','https://example.com',{isMainFrame:true,mediaType:'audio'}),false);
  f.configure({approve:false});
  assert.equal(f.request('media',{mediaTypes:['audio']}),false);
});
