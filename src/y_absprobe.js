'use strict';
// node src/y_absprobe.js <exact-label file (57 wide)> <rows> <maxRem>
// How close is the abstract (frozen-proportion deck) value to the exact value, next to the shipped network, on
// exactly-solved late positions? Prints RMS error by cards left.
const fs = require('fs'); const E = require('./engine.js'); const R = E.DEFAULT_RULES;
const A = require('./y_abs.js').createAbs(R, { logCap: 24 });
const nn = JSON.parse(fs.readFileSync(__dirname + '/../results/shipped_policies.json'))['52'].nn;
const b = fs.readFileSync(process.argv[2]), a = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), W = 57, total = a.length / W;
const want = +process.argv[3], maxRem = +process.argv[4], rng = E.mulberry32(99);
const f = new Float64Array(128), g = new Float64Array(128), agg = {};
const net = (o) => { let x = f, y = g; for (let i = 0; i < 56; i++) x[i] = a[o + i]; for (let li = 0; li < nn.layers.length; li++) { const l = nn.layers[li], last = li === nn.layers.length - 1; for (let q = 0, k = 0; q < l.nOut; q++) { let s = l.b[q]; for (let i = 0; i < l.nIn; i++, k++) s += l.W[k] * x[i]; y[q] = last || s > 0 ? s : 0; } const t = x; x = y; y = t; } return x[0] * 1000; };
let done = 0;
while (done < want) {
  const r = Math.floor(rng() * total), o = r * W, rem = Math.round(a[o + 1] * 52); if (rem > maxRem || rem < 3) continue;
  const st = { cols: new Int32Array(4), deck: new Int32Array(11), rem, busts: a[o + 2] ? 0 : a[o + 3] ? 1 : 2, stays: Math.round(a[o + 5] * 2), prev: Math.round(a[o + 7] * 5) };
  for (let v = 1; v <= 10; v++) st.deck[v] = Math.round(a[o + 7 + v] * rem);
  for (let q = 0; q < 4; q++) { const p = o + 20 + 9 * q; st.cols[q] = a[p] ? E.mkCol(Math.round(a[p + 2] * 21), a[p + 3] ? 1 : 0, Math.round(a[p + 4] * 4), a[p + 6] ? 0 : 1) : 0; }
  const ex = a[o + 56] * 1000, ab = A.value(st), nv = net(o);
  const s = agg[rem] || (agg[rem] = { n: 0, ab: 0, nv: 0, bias: 0, var: 0, m: 0 });
  s.n++; s.ab += (ab - ex) ** 2; s.nv += (nv - ex) ** 2; s.bias += ab - ex; s.m += ex; s.var += ex * ex; done++;
}
for (const rem of Object.keys(agg)) { const s = agg[rem]; console.log('cards left', rem, 'n', s.n, 'exact value sd', Math.sqrt(s.var / s.n - (s.m / s.n) ** 2).toFixed(0), '| abstract RMS err', Math.sqrt(s.ab / s.n).toFixed(0), 'bias', (s.bias / s.n).toFixed(0), '| shipped net RMS err', Math.sqrt(s.nv / s.n).toFixed(0)); }
