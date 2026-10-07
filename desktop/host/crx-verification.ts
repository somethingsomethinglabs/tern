import { createHash, createPublicKey, createVerify } from "node:crypto";

// CRX3 format and publisher trust root from Chromium components/crx_file.
// https://chromium.googlesource.com/chromium/src/+/main/components/crx_file/crx3.proto
const STORE_KEY_HASH = "61f7f2a6bfcf74cd0bc1fe2497cc9b04254c658f79f2145392867ea8366367cf";
export function extensionKeyId(key: Buffer) {
  return createHash("sha256").update(key).digest("hex").slice(0, 32)
    .replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));
}

// Only the wire types used by the CRX3 schema are accepted. Bounds and field
// counts keep a malformed header from consuming unbounded work or memory.
function fields(data: Buffer) {
  const result = new Map<number, Buffer[]>();
  let offset = 0, count = 0;
  const integer = () => {
    let value = 0;
    for (let i = 0; i < 5 && offset < data.length; i++) {
      const byte = data[offset++];
      value += (byte & 127) * 2 ** (7 * i);
      if (!(byte & 128) && value <= 0xffffffff) return value;
    }
    throw new Error("Invalid CRX signature header.");
  };
  while (offset < data.length) {
    if (++count > 1000) throw new Error("Too many CRX signature fields.");
    const tag = integer(), field = Math.floor(tag / 8), wire = tag % 8;
    if (!field) throw new Error("Invalid CRX signature field.");
    if (wire === 0) { integer(); continue; }
    const size = wire === 2 ? integer() : wire === 1 ? 8 : wire === 5 ? 4 : -1;
    if (size < 0 || size > data.length - offset) throw new Error("Incomplete CRX signature header.");
    if (wire === 2) {
      const values = result.get(field) ?? [];
      values.push(data.subarray(offset, offset + size)); result.set(field, values);
    }
    offset += size;
  }
  return result;
}
function single(values: Map<number, Buffer[]>, field: number) {
  const list = values.get(field);
  if (list?.length !== 1 || !list[0].length) throw new Error("Missing or duplicate CRX signature field.");
  return list[0];
}

export function verifyStoreCrx(data: Buffer, expectedId: string, publisherHash = STORE_KEY_HASH) {
  if (!/^[a-p]{32}$/.test(expectedId) || data.length < 12 ||
      data.subarray(0, 4).toString() !== "Cr24" || data.readUInt32LE(4) !== 3)
    throw new Error("A signed CRX3 store package is required.");
  const size = data.readUInt32LE(8);
  if (size > 1024 * 1024 || size < 1 || 12 + size >= data.length)
    throw new Error("Invalid CRX signature header size.");
  const header = fields(data.subarray(12, 12 + size));
  const signed = single(header, 10000), id = single(fields(signed), 1);
  if (id.length !== 16 || id.toString("hex").replace(/[0-9a-f]/g,
      digit => String.fromCharCode(97 + parseInt(digit, 16))) !== expectedId)
    throw new Error("The signed package does not match the requested extension.");
  const length = Buffer.alloc(4); length.writeUInt32LE(signed.length);
  const archive = data.subarray(12 + size);
  let developerKey: Buffer | undefined, storeProof = false, proofs = 0;
  for (const field of [2, 3]) for (const bytes of header.get(field) ?? []) {
    if (++proofs > 32) throw new Error("Too many CRX signatures.");
    const proof = fields(bytes), key = single(proof, 1), signature = single(proof, 2);
    const publicKey = createPublicKey({ key, format: "der", type: "spki" });
    if (publicKey.asymmetricKeyType !== (field === 2 ? "rsa" : "ec"))
      throw new Error("Invalid CRX signature key type.");
    const verifier = createVerify("sha256");
    verifier.update(Buffer.from("CRX3 SignedData\0"));
    verifier.update(length); verifier.update(signed); verifier.update(archive);
    if (!verifier.verify(publicKey, signature)) throw new Error("Extension package signature verification failed.");
    if (extensionKeyId(key) === expectedId) developerKey = key;
    if (createHash("sha256").update(key).digest("hex") === publisherHash) storeProof = true;
  }
  if (!developerKey || !storeProof) throw new Error("The package needs valid developer and Chrome Web Store signatures.");
  return { key: developerKey.toString("base64"), archive };
}
