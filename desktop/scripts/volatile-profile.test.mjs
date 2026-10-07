import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statSync,statfsSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {volatileWebsiteProfile} from '../dist/host/volatile-profile.js';
test('extension-capable volatile profiles use private tmpfs directories and remove their files',t=>{
  let tmpfs=false;try{tmpfs=process.platform==='linux' && statfsSync('/dev/shm').type===0x01021994;}catch{}
  if(!tmpfs)return t.skip('Linux tmpfs is required');
  const profile=volatileWebsiteProfile();assert.ok(profile);t.after(()=>profile.close());
  assert.equal(statfsSync(profile.path).type,0x01021994);
  assert.equal(statSync(profile.path).mode & 0o777,0o700);
  profile.close();assert.equal(existsSync(profile.path),false);
});
test('volatile profile creation rejects persistent disk filesystems',t=>{
  const directory=mkdtempSync(join(tmpdir(),'tern-disk-profile-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  if(statfsSync(directory).type===0x01021994)return t.skip('Temporary directory already uses tmpfs');
  assert.equal(volatileWebsiteProfile(directory),undefined);
});
