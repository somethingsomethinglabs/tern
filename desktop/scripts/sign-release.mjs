import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, basename, join } from 'node:path';
import { verifyReleaseFuses } from './release-fuses.mjs';

// The publisher supplies a private key file. No keys are generated or embedded
// implicitly, and the private key is never copied into release artifacts.
const [directory, archiveUrl, sequenceText] = process.argv.slice(2);
if (!directory || !archiveUrl || !sequenceText || !process.env.TERN_RELEASE_SIGNING_KEY)
  throw new Error('Usage: TERN_RELEASE_SIGNING_KEY=/private/key.pem node scripts/sign-release.mjs PACKAGE HTTPS_ARCHIVE_URL SEQUENCE');
const source = resolve(directory), url = new URL(archiveUrl), sequence = Number(sequenceText);
if (url.protocol !== 'https:' || url.username || url.password || url.hash || !Number.isSafeInteger(sequence) || sequence < 1)
  throw new Error('Use an HTTPS archive URL and a positive release sequence.');
const key = createPrivateKey(await readFile(process.env.TERN_RELEASE_SIGNING_KEY));
if (key.asymmetricKeyType !== 'ed25519') throw new Error('Publisher signing key must be Ed25519.');
const config = JSON.parse(await readFile(join(source, 'resources/update-config.json'), 'utf8'));
const expected = createPublicKey(config.publicKey).export({type:'spki',format:'der'});
if (!createPublicKey(key).export({type:'spki',format:'der'}).equals(expected))
  throw new Error('Signing key does not match the publisher key trusted by this release.');
await verifyReleaseFuses(join(source, 'Tern'));
const build = JSON.parse(await readFile(join(source, 'resources/build.json'), 'utf8'));
if (build.format !== 1 || build.dirty || !/^[a-f0-9]{40}$/.test(build.sourceCommit))
  throw new Error('Release signing requires a clean build with a recorded source commit.');
const archive = source + '.tar.gz';
const result = spawnSync('tar', ['--sort=name', '--owner=0', '--group=0', '--numeric-owner', '-czf', archive, '-C', dirname(source), basename(source)], { stdio: 'inherit' });
if (result.status !== 0) throw new Error('Could not archive release.');
const hash = createHash('sha256');
for await (const chunk of createReadStream(archive)) hash.update(chunk);
const metadata = JSON.parse(await readFile(join(source, 'resources', 'security.json'), 'utf8'));
if (!metadata.hardened || !metadata.cookieEncryption) throw new Error('Refusing to sign an unhardened release.');
const { extractFile } = await import('@electron/asar');
const version = JSON.parse(extractFile(join(source, 'resources/app.asar'), 'package.json').toString()).version;
const publishedAt = Date.now();
const payload = JSON.stringify({ format: 1, sequence, version, platform: 'linux', arch: 'x64', url: url.href,
  publishedAt, expires: publishedAt + 14 * 86400000, sha256: hash.digest('hex'), bytes: (await stat(archive)).size });
await writeFile(source + '.manifest.json', JSON.stringify({ payload, signature: sign(null, Buffer.from(payload), key).toString('base64') }) + '\n');
console.log(`Signed release archive and manifest created for ${version}, sequence ${sequence}.`);
