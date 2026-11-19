'use strict';
// node src/z_build_kernel.js   compiles src/z_kernel.ts with the npm-local AssemblyScript in scratch/z_asc
// (cd scratch/z_asc && npm install assemblyscript@0.27.31) and writes src/exact2_kernel.wasm.js (base64, one file,
// loadable with require() or a <script> tag before exact2.js).  Nothing is installed system-wide.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..'), asc = path.join(root, 'scratch/z_asc/node_modules/.bin/asc'), out = path.join(root, 'scratch/z_asc/kernel.wasm');
cp.execFileSync(asc, [path.join(__dirname, 'z_kernel.ts'), '-o', out, '-O3', '--converge', '--runtime', 'stub', '--importMemory', '--noAssert', '--use', 'abort=', '--textFile', out.replace('.wasm', '.wat')], { stdio: 'inherit' });
const b = fs.readFileSync(out);
fs.writeFileSync(path.join(__dirname, 'exact2_kernel.wasm.js'), "'use strict';\n// Built by src/z_build_kernel.js from src/z_kernel.ts (WebAssembly kernel of src/exact2.js). Do not edit.\n(function (root, k) { if (typeof module === 'object' && module.exports) module.exports = k; else root.TwentyOneExactKernel = k; })(typeof self !== 'undefined' ? self : this, { base64: '" + b.toString('base64') + "' });\n");
console.log('kernel.wasm', b.length, 'bytes');
