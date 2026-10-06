import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ExtensionLibrary} from '../dist/host/extensions.js';

test('native-messaging extensions are rejected before any background worker can start', async t => {
  const directory = await mkdtemp(join(tmpdir(),'tern-extension-policy-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const path = join(directory,'extension'); await mkdir(path);
  await writeFile(join(path,'manifest.json'),JSON.stringify({manifest_version:3,name:'Native access',version:'1',permissions:['nativeMessaging']}));
  let loads = 0;
  const library = new ExtensionLibrary({extensions:{loadExtension:async () => {loads++;throw new Error('Must not load');}}},directory);
  await assert.rejects(library.add(path),/native messaging are blocked/);
  assert.equal(loads,0);
  await writeFile(join(directory,'extensions.json'),JSON.stringify([path]));
  await library.restore();
  assert.equal(loads,0);
  assert.match(library.list()[0].error,/native messaging are blocked/);
});
