import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';

// node-llama-cpp 3.21.1 probes Linux binaries through child_process.fork
// when called from an Electron utility process (utilityProcess is main-only).
// Load directly in our already isolated AI utility instead: an incompatible
// native binding terminates that disposable process, and the host reports the
// failure. RunAsNode stays disabled. No browser/main-process load is skipped.
const require = createRequire(import.meta.url);
const root = dirname(dirname(require.resolve('node-llama-cpp')));
const target = join(root,'dist/bindings/utils/testBindingBinary.js');
const source = await readFile(target,'utf8');
const guard = '\n    // Tern: the caller is already a disposable native AI utility process.\n    if (process.versions.electron && process.type === "utility") return true;';
const original = source.replace(guard,'');
if (createHash('sha256').update(original).digest('hex') !== '87857f7fcddbf87c4d14a32331f88b3fefb5c40471f7b0151e94d46d881d6354')
  throw new Error('The native AI dependency changed. Review its utility-process compatibility patch before building.');
if (!source.includes(guard)) {
  const declaration = 'export async function testBindingBinary(bindingBinaryPath, extBackendsPath, gpu, testTimeout = 1000 * 60 * 5, pipeOutputOnNode = false) {';
  await writeFile(target,source.replace(declaration,declaration+guard));
}
