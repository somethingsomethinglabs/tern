import { _electron as electron, chromium } from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const profile=await mkdtemp(join(tmpdir(),'tern-live-store-'));
const id='eimadpbcbfnmbkopoojfekhnkhdbieeh';
let app, child, approvalTimer;
const packaged = !!process.env.TERN_EXECUTABLE;
let nativeApprovals = 0;
const nativeWindows = () => {
  try { return execFileSync('xdotool',['search','--onlyvisible','--pid',String(child.pid)],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split('\n').filter(Boolean); }
  catch { return []; }
};
async function launch() {
  const env={...process.env,ELECTRON_RUN_AS_NODE:'',TERN_PROFILE:profile};
  if(packaged)Object.assign(env,{LC_ALL:'C.UTF-8',GDK_BACKEND:'x11',GTK_USE_PORTAL:'0',DBUS_SESSION_BUS_ADDRESS:'unix:path='+join(profile,'no-session-bus')});
  if (packaged) {
    // The release disables the Node inspector used by _electron.launch. Use
    // Chromium CDP and the real native consent dialog in this disposable profile.
    child=spawn(resolve(process.env.TERN_EXECUTABLE),['--remote-debugging-port=0','--ozone-platform=x11'],{env,stdio:['ignore','ignore','pipe']});
    child.stderr.on('data', bytes => { const message = bytes.toString(); if (/FATAL|Check failed|segfault|assertion/i.test(message)) console.log('Packaged error:', message.slice(-2000)); });
    const endpoint=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Packaged browser did not expose its test CDP endpoint')),30000);
      child.stderr.on('data',bytes=>{const match=bytes.toString().match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);reject(Error('Packaged browser exited: '+code));});
    });
    const browser=await chromium.connectOverCDP(endpoint);
    app={context:()=>browser.contexts()[0],firstWindow:async()=>{
      const deadline=Date.now()+30000;
      while(Date.now()<deadline){const shell=browser.contexts()[0].pages().find(page=>page.url()==='tern://app/index.html');if(shell)return shell;await new Promise(resolve=>setTimeout(resolve,100));}
      throw Error('Packaged Tern shell did not open');
    },close:async()=>{
      if(child.exitCode===null && child.signalCode===null){
        const ended=new Promise(resolve=>child.once('exit',resolve));
        child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
        try{await ended;}finally{clearTimeout(timer);}
      }
      await browser.close().catch(()=>{});
    }};
  } else {
    app=await electron.launch({args:['.'],cwd:resolve('desktop'),chromiumSandbox:true,env});
    await app.evaluate(({dialog})=>{
      globalThis.storePrompts=[];
      dialog.showMessageBox=async (_window,options)=>{globalThis.storePrompts.push(options);return {response:1,checkboxChecked:false};};
      dialog.showMessageBoxSync=()=>1;
    });
  }
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
  const initialWindows=new Set(packaged?nativeWindows():[]);
  if(packaged)approvalTimer=setInterval(()=>{
    try {
    if(packaged && nativeApprovals===0) {
      // Only a new native window belonging to this disposable test process
      // can receive test input. The browser page and other applications cannot.
      const active=nativeWindows().find(id=>!initialWindows.has(id));
      if(active) {
        const parent=execFileSync('xprop',['-id',active,'WM_TRANSIENT_FOR'],{encoding:'utf8'});
        if([...initialWindows].some(id=>parent.includes('0x'+Number(id).toString(16)))) {
          execFileSync('xdotool',['windowfocus','--sync',active]);
          console.log('Approving the test process native consent dialog.');
          execFileSync('xdotool',['key','--window',active,'--clearmodifiers','Tab','Return']);nativeApprovals++;
        }
      }
    }
    } catch { /* A native window can disappear between inspection and input. */ }
  },100);
  await store.getByRole('button',{name:/Add to (Tern|Chrome)/}).click({timeout:45000});
  const installDeadline=Date.now()+90000;
  while (!(await shell.evaluate(()=>window.tern.snapshot())).extensions.some(entry=>entry.id===id)) {
    const error=await store.evaluate(()=>window.chrome.extension?.lastError?.message);
    if(error)throw Error('Store install failed: '+error);
    if (Date.now()>installDeadline) {
      console.log('Store body:',(await store.locator('body').innerText()).slice(-3500));
      if(!packaged)console.log('Prompts:',await app.evaluate(()=>globalThis.storePrompts));
      throw Error('Store install did not register extension');
    }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  clearInterval(approvalTimer);
  const state=await shell.evaluate(()=>window.tern.snapshot());
  assert.equal(state.extensions.find(entry=>entry.id===id).name,'Dark Reader');
  await store.getByRole('button',{name:/Remove from (Tern|Chrome)/}).waitFor({timeout:20000});
  if(packaged)assert.equal(nativeApprovals,1);
  else {const prompts=await app.evaluate(()=>globalThis.storePrompts);assert.equal(prompts.length,1);assert.match(prompts[0].message,/Install Dark Reader/);}
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
  clearInterval(approvalTimer);
  if(app)await app.close().catch(()=>{});
  else if(child && child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');
  await rm(profile,{recursive:true,force:true});
}
