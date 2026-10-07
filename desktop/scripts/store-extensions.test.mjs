import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyStoreCrx} from '../dist/host/crx-verification.js';
import {StoreExtensions,newerVersion} from '../dist/host/store-extensions.js';
import {id,publisherHash,packageFixture} from './fixtures/store-packages.mjs';
const verify=(data,expected)=>verifyStoreCrx(data,expected,publisherHash);

test('CRX3 verifies archive and both proofs, rejects tampering, wrong ID and untrusted publisher',()=>{
  const data=packageFixture();
  assert.ok(verify(data,id).key);
  assert.throws(()=>verifyStoreCrx(data,id),/Chrome Web Store signatures/);
  assert.throws(()=>verify(packageFixture('1',[],{noPublisher:true}),id),/Chrome Web Store signatures/);
  assert.throws(()=>verify(data,'a'.repeat(32)),/does not match/);
  const tampered=Buffer.from(data);tampered[tampered.length-1]^=1;
  assert.throws(()=>verify(tampered,id),/verification failed/);
  assert.throws(()=>verify(data.subarray(0,20),id),/header size/);
});
test('extension versions compare numerically and reject malformed versions',()=>{
  assert.equal(newerVersion('1.10','1.9'),true);
  assert.equal(newerVersion('1.0.0','1'),false);
  assert.equal(newerVersion('0.9','1'),false);
  assert.throws(()=>newerVersion('1.beta','1'),/Invalid/);
});
async function setup(t) {
  const profile=await mkdtemp(join(tmpdir(),'tern-store-test-'));
  t.after(()=>rm(profile,{recursive:true,force:true}));
  const loaded=new Map();let failVersion='',data=packageFixture(),consent=true,consents=0,fetches=0,loads=0;
  const session={extensions:{
    getExtension:id=>loaded.get(id),getAllExtensions:()=>[...loaded.values()],
    removeExtension:id=>loaded.delete(id),
    loadExtension:async path=>{
      loads++; const manifest=JSON.parse(await readFile(join(path,'manifest.json'),'utf8'));
      if(manifest.version===failVersion)throw new Error('Unsupported new worker');
      const entry={id,name:manifest.name,version:manifest.version,manifest};loaded.set(id,entry);return entry;
    },
  }};
  const options={chromeVersion:'150.0.0.0',changed(){},fetch:async()=>{fetches++;return new Response(data);},
    consent:async()=>{consents++;return consent;}};
  const library=new StoreExtensions(session,profile,options,verify);
  return {profile,loaded,library,options,session,setData:value=>data=value,setConsent:value=>consent=value,
    fail:value=>failVersion=value,counters:()=>({consents,fetches,loads})};
}
test('store consent uses verified package, cancellation leaves no registration or code loaded',async t=>{
  const f=await setup(t);f.setConsent(false);
  assert.equal(await f.library.install(id),false);
  assert.equal(f.loaded.size,0);assert.deepEqual(f.library.list(),[]);assert.equal(f.counters().loads,0);
  await assert.rejects(readFile(join(f.profile,'store-extensions.json')),/ENOENT/);
  f.setConsent(true);assert.equal(await f.library.install(id),true);
  assert.equal(f.library.list()[0].id,id);assert.equal(f.counters().consents,2);
  await assert.rejects(f.library.install(id),/already installed/);
});
test('disabled extensions stay disabled across restart and automatic updates; uninstall deletes registration',async t=>{
  const f=await setup(t);await f.library.install(id);await f.library.setEnabled(id,false);
  assert.equal(f.loaded.size,0);
  const restored=new StoreExtensions(f.session,f.profile,f.options,verify);await restored.restore();
  assert.equal(restored.list()[0].enabled,false);assert.equal(f.loaded.size,0);
  const before=f.counters().fetches;await restored.checkUpdates();assert.equal(f.counters().fetches,before);
  await restored.setEnabled(id,true);assert.equal(f.loaded.has(id),true);
  await restored.remove(id);assert.deepEqual(restored.list(),[]);assert.equal(f.loaded.size,0);
  const again=new StoreExtensions(f.session,f.profile,f.options,verify);await again.restore();assert.deepEqual(again.list(),[]);
});
test('background updates pause for added website access and interactive approval installs same identity',async t=>{
  const f=await setup(t);await f.library.install(id);
  f.setData(packageFixture('1.1',[],{manifest:{content_scripts:[{matches:['https://*/*'],js:['content.js']}]}}));
  await f.library.checkUpdates();assert.equal(f.library.list()[0].version,'1.0');
  assert.match(f.library.list()[0].updateStatus,/permission approval/);assert.equal(f.counters().consents,1);
  await f.library.checkUpdates(true);assert.equal(f.library.list()[0].version,'1.1');assert.equal(f.counters().consents,2);
  assert.equal(f.loaded.get(id).version,'1.1');
});
test('load failure rolls back to prior working code and registration',async t=>{
  const f=await setup(t);await f.library.install(id);const original=f.library.list()[0].path;
  f.setData(packageFixture('1.2'));f.fail('1.2');await f.library.checkUpdates();
  assert.equal(f.loaded.get(id).version,'1.0');assert.equal(f.library.list()[0].path,original);
  assert.match(f.library.list()[0].error,/Unsupported new worker/);
  assert.equal(JSON.parse(await readFile(join(f.profile,'store-extensions.json'),'utf8')).entries[0].version,'1.0');
});
test('native messaging and invalid signatures never load a worker or prompt for consent',async t=>{
  const f=await setup(t);f.setData(packageFixture('1',['nativeMessaging']));
  await assert.rejects(f.library.install(id),/native messaging/);assert.equal(f.counters().consents,0);assert.equal(f.counters().loads,0);
  const data=packageFixture();data[data.length-1]^=1;f.setData(data);
  await assert.rejects(f.library.install(id),/signature verification/);assert.equal(f.counters().loads,0);
});
test('corrupt registration is preserved and blocks installation',async t=>{
  const f=await setup(t);await writeFile(join(f.profile,'store-extensions.json'),'broken');
  await assert.rejects(f.library.restore(),/preserved/);
  await assert.rejects(f.library.install(id),/repair/);
  assert.equal(await readFile(join(f.profile,'store-extensions.json'),'utf8'),'broken');
});
test('navigating away while downloading cancels before consent or loading',async t=>{
  const f=await setup(t);
  await assert.rejects(f.library.install(id,()=>false),/store page changed/);
  assert.equal(f.counters().consents,0);assert.equal(f.counters().loads,0);
});
test('registry save failure restores the previous loaded extension and leaves registration unchanged',async t=>{
  const f=await setup(t);await f.library.install(id);
  const before=await readFile(join(f.profile,'store-extensions.json'),'utf8');
  const {mkdir}=await import('node:fs/promises');await mkdir(join(f.profile,'store-extensions.json.tmp'));
  f.setData(packageFixture('2.0'));await f.library.checkUpdates();
  assert.equal(f.loaded.get(id).version,'1.0');assert.equal(f.library.list()[0].version,'1.0');
  assert.equal(await readFile(join(f.profile,'store-extensions.json'),'utf8'),before);
});
test('successful updates retain only the current and previous working versions',async t=>{
  const f=await setup(t);await f.library.install(id);
  for(const version of ['1.1','1.2','1.3']){f.setData(packageFixture(version));await f.library.checkUpdates();}
  const {readdir}=await import('node:fs/promises');
  const files=await readdir(join(f.profile,'store-extensions',id));
  assert.equal(files.length,2);assert.ok(files.some(name=>name.startsWith('1.2-')));assert.ok(files.some(name=>name.startsWith('1.3-')));
});
