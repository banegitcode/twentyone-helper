'use strict';
// Turns a two-label file from `gen_data.js ... td` into a normal training file.
// node src/blend.js <in.bin> <out.bin> <lambda>   label = lambda * (points actually scored) + (1 - lambda) * (search value)
const fs = require('fs'); const E = require('./engine.js');
const [inF, outF, lam] = [process.argv[2], process.argv[3], +process.argv[4]];
const b = fs.readFileSync(inF), a = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
const IR = E.NF + 2, OR = E.NF + 1, n = a.length / IR, o = new Float32Array(n * OR);
let d = 0;
for (let i = 0; i < n; i++) {
  for (let x = 0; x < E.NF; x++) o[i * OR + x] = a[i * IR + x];
  const mc = a[i * IR + E.NF], td = a[i * IR + E.NF + 1]; d += (mc - td) * (mc - td);
  o[i * OR + E.NF] = lam * mc + (1 - lam) * td;
}
fs.writeFileSync(outF, Buffer.from(o.buffer));
console.log(n, 'rows, mean squared gap between the two labels', (d / n).toFixed(4));
