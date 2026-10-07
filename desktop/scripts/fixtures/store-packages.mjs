import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import AdmZip from 'adm-zip';
import {extensionKeyId} from '../../dist/host/crx-verification.js';
const developer = generateKeyPairSync('rsa',{modulusLength:2048});
const publisher = generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const publicBytes = pair => pair.publicKey.export({type:'spki',format:'der'});
export const id = extensionKeyId(publicBytes(developer));
export const publisherHash = createHash('sha256').update(publicBytes(publisher)).digest('hex');
function varint(number) {
  const bytes=[];
  do { bytes.push((number & 127) | (number > 127 ? 128 : 0)); number = Math.floor(number/128); } while(number);
  return Buffer.from(bytes);
}
function field(number,bytes) { return Buffer.concat([varint(number*8+2),varint(bytes.length),bytes]); }
export function packageFixture(version='1.0', permissions=[], options={}) {
  const zip=new AdmZip();
  zip.addFile('manifest.json',Buffer.from(JSON.stringify({manifest_version:3,name:'Store fixture',version,permissions,...options.manifest})));
  zip.addFile('content.js',Buffer.from('document.body.dataset.storeFixture="active";'));
  const archive=zip.toBuffer();
  const crxId=Buffer.from([...id].map(char=>(char.charCodeAt(0)-97).toString(16)).join(''),'hex');
  const signed=field(1,crxId),size=Buffer.alloc(4);size.writeUInt32LE(signed.length);
  const input=Buffer.concat([Buffer.from('CRX3 SignedData\0'),size,signed,archive]);
  const proof=pair=>Buffer.concat([field(1,publicBytes(pair)),field(2,sign('sha256',input,pair.privateKey))]);
  const header=Buffer.concat([field(2,proof(developer)),...(options.noPublisher?[]:[field(3,proof(publisher))]),field(10000,signed)]);
  const prefix=Buffer.alloc(12);prefix.write('Cr24');prefix.writeUInt32LE(3,4);prefix.writeUInt32LE(header.length,8);
  return Buffer.concat([prefix,header,archive]);
}
