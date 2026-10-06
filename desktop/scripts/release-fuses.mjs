import assert from 'node:assert/strict';
import { flipFuses, getCurrentFuseWire, FuseVersion, FuseV1Options, FuseState } from '@electron/fuses';

export const releaseFuses = {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
};
export async function verifyReleaseFuses(executable) {
  const wire = await getCurrentFuseWire(executable);
  for (const [option, enabled] of Object.entries(releaseFuses)) {
    if (option === 'version') continue;
    assert.equal(wire[option], enabled ? FuseState.ENABLE : FuseState.DISABLE,
      `Release fuse ${FuseV1Options[option]} must be ${enabled ? 'enabled' : 'disabled'}`);
  }
}
export async function hardenRelease(executable) {
  await flipFuses(executable, releaseFuses);
  await verifyReleaseFuses(executable);
}
