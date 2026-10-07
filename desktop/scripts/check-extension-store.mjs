import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const profile=await mkdtemp(join(tmpdir(),'tern-live-store-'));
const id='eimadpbcbfnmbkopoojfekhnkhdbieeh';
let app;
async function launch() {
  app=await electron.launch({...(process.env.TERN_EXECUTABLE?{executablePath:process.env.TERN_EXECUTABLE}:{}),
    args:['.'],cwd:resolve('desktop'),chromiumSandbox:true,
    env:{...process.env,ELECTRON_RUN_AS_NODE:'',TERN_PROFILE:profile}});
  await app.evaluate(({dialog})=>{
    globalThis.storePrompts=[];
    dialog.showMessageBox=async (_window,options)=>{globalThis.storePrompts.push(options);return {response:1,checkboxChecked:false};};
    dialog.showMessageBoxSync=()=>1;
  });
  const shell=await app.firstWindow();
  await shell.getByRole('img',{name:'Tern',exact:true}).waitFor();
  await shell.emulateMedia({reducedMotion:'reduce'});
  return shell;
}
try {
  await writeFile(join(profile,'preferences.json'),JSON.stringify({summaryModel:''}));
  let shell=await launch();
  await shell.getByRole('button',{name:'Extensions',exact:true}).click();
  await shell.getByRole('button',{name:'Browse Chrome Web Store'}).click();
  const deadline=Date.now()+30000;
  while(!app.context().pages().some(page=>page.url().startsWith('https://chromewebstore.google.com/'))) {
    if(Date.now()>deadline)throw Error('Store tab did not open');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const store=app.context().pages().find(page=>page.url().startsWith('https://chromewebstore.google.com/'));
  store.on('console',msg=>{if(msg.type()==='error')console.log('Store console:',msg.text().slice(0,250));});
  await store.goto('https://chromewebstore.google.com/detail/dark-reader/'+id,{waitUntil:'domcontentloaded'});
  await store.getByRole('button',{name:/Add to (Tern|Chrome)/}).click({timeout:45000});
  const installDeadline=Date.now()+90000;
  while (!(await shell.evaluate(()=>window.tern.snapshot())).extensions.some(entry=>entry.id===id)) {
    if (Date.now()>installDeadline) {
      console.log('Store body:',(await store.locator('body').innerText()).slice(-3500));
      console.log('Prompts:',await app.evaluate(()=>globalThis.storePrompts));
      throw Error('Store install did not register extension');
    }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  const state=await shell.evaluate(()=>window.tern.snapshot());
  assert.equal(state.extensions.find(entry=>entry.id===id).name,'Dark Reader');
  await store.getByRole('button',{name:/Remove from (Tern|Chrome)/}).waitFor({timeout:20000});
  const prompts=await app.evaluate(()=>globalThis.storePrompts);
  assert.equal(prompts.length,1);assert.match(prompts[0].message,/Install Dark Reader/);
  await shell.getByRole('button',{name:'Extensions',exact:true}).click();
  await mkdir(resolve('design/qa/extensions'),{recursive:true});
  await shell.screenshot({path:resolve('design/qa/extensions/store-installed.png')});
  await shell.getByRole('dialog').getByRole('button',{name:'Open Dark Reader',exact:true}).click();
  const popupDeadline=Date.now()+20000;
  while(!app.context().pages().some(page=>page.url().startsWith('chrome-extension://'+id+'/'))) {
    if(Date.now()>popupDeadline)throw Error('Dark Reader popup did not open');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  console.log('Live store install, permission consent, stable identity and popup passed.');
  await app.close();shell=await launch();
  assert.equal((await shell.evaluate(()=>window.tern.snapshot())).extensions.find(entry=>entry.id===id).enabled,true);
  await shell.evaluate(id=>window.tern.command({type:'setExtensionEnabled',id,enabled:false}),id);
  await app.close();shell=await launch();
  assert.equal((await shell.evaluate(()=>window.tern.snapshot())).extensions.find(entry=>entry.id===id).enabled,false);
  await shell.evaluate(id=>window.tern.command({type:'setExtensionEnabled',id,enabled:true}),id);
  const entry=(await shell.evaluate(()=>window.tern.snapshot())).extensions.find(entry=>entry.id===id);
  await shell.evaluate(path=>window.tern.command({type:'removeExtension',path}),entry.path);
  assert.equal((await shell.evaluate(()=>window.tern.snapshot())).extensions.length,0);
  console.log('Restart, disabled-state persistence, enable and removal passed.');
} finally {
  if(app)await app.close().catch(()=>{});
  await rm(profile,{recursive:true,force:true});
}
