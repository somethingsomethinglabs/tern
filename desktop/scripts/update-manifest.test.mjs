import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyManifest, compareVersions } from '../host/update-manifest.ts';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const now = 1800000000000;
const manifest = { format: 1, sequence: 2, version: '1.2.3', publishedAt: now, expires: now + 86400000,
  platform: 'linux', arch: 'x64', url: 'https://releases.example/tern.tar.gz', sha256: 'a'.repeat(64), bytes: 1000 };
function signed(value) { const payload = JSON.stringify(value); return { payload, signature: sign(null, Buffer.from(payload), privateKey).toString('base64') }; }
test('accepts authenticated current releases and rejects tampering and publisher substitution', () => {
  assert.deepEqual(verifyManifest(signed(manifest), pem, 1, now), manifest);
  const envelope = signed(manifest); envelope.payload = envelope.payload.replace('1.2.3', '9.9.9');
  assert.throws(() => verifyManifest(envelope, pem, 1, now), /signature/);
  const wrong = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  assert.throws(() => verifyManifest(signed(manifest), wrong, 1, now), /signature/);
});
test('rejects rollback, expired metadata, oversized payloads, insecure URLs and incompatible platforms', () => {
  assert.throws(() => verifyManifest(signed(manifest), pem, 2, now));
  for (const patch of [{ expires: now }, { publishedAt: now + 600000 }, { expires: now + 15 * 86400000 },
    { platform: 'win32' }, { bytes: 2 ** 32 }, { url: 'http://example.com/a' }, { url: 'https://user:pass@example.com/a' }])
    assert.throws(() => verifyManifest(signed({ ...manifest, ...patch }), pem, 1, now));
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
});
