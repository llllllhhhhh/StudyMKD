import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(root, 'public', 'tessdata')
const workerTarget = resolve(root, 'public', 'tesseract')
const coreTarget = resolve(root, 'public', 'tesseract-core')

await Promise.all([
  mkdir(target, { recursive: true }),
  mkdir(workerTarget, { recursive: true }),
  mkdir(coreTarget, { recursive: true }),
])
await Promise.all([
  copyFile(
    resolve(root, 'node_modules', '@tesseract.js-data', 'chi_sim', '4.0.0_best_int', 'chi_sim.traineddata.gz'),
    resolve(target, 'chi_sim.traineddata.gz'),
  ),
  copyFile(
    resolve(root, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'),
    resolve(target, 'eng.traineddata.gz'),
  ),
  copyFile(
    resolve(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
    resolve(workerTarget, 'worker.min.js'),
  ),
  ...[
    'tesseract-core-lstm.wasm.js',
    'tesseract-core-lstm.wasm',
    'tesseract-core-simd-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm',
  ].map((file) => copyFile(
    resolve(root, 'node_modules', 'tesseract.js-core', file),
    resolve(coreTarget, file),
  )),
])
