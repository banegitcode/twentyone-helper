#!/usr/bin/env node
'use strict';
// Compiles js/z_kernel_g.ts with AssemblyScript and writes js/exact3g_kernel.wasm.js (base64).
// Usage: ASC=/path/to/asc node js/z_build_kernel_g.js
const fs = require('fs'), path = require('path'), cp = require('child_process');
const dir = __dirname;
const asc = process.env.ASC || path.join('/tmp/asc-exact3g2/node_modules/.bin/asc');
const outDir = path.join(dir, '..', 'scratch');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'kernel.wasm');
cp.execFileSync(asc, [path.join(dir, 'z_kernel_g.ts'), '-o', out, '-O3', '--converge', '--runtime', 'stub', '--importMemory', '--noAssert', '--use', 'abort=', '--textFile', out.replace('.wasm', '.wat')], { stdio: 'inherit' });
const b = fs.readFileSync(out);
fs.writeFileSync(path.join(dir, 'exact3g_kernel.wasm.js'),
  "'use strict';\n// Built by js/z_build_kernel_g.js from js/z_kernel_g.ts (WebAssembly kernel of js/exact3g.js). Do not edit.\n(function (root, k) { if (typeof module === 'object' && module.exports) module.exports = k; else root.TwentyOneExactKernel = k; })(typeof self !== 'undefined' ? self : this, { base64: '" + b.toString('base64') + "' });\n");
console.log('exact3g_kernel.wasm.js', b.length, 'bytes');
