'use strict';
// Trainer for the value network with a selectable input feature set (plain JS, Adam, MSE; same recipe as train_nn.js).
// node src/y_train.js <feat 1|2> <data specs> <out.json> <hidden e.g. 128,48> <epochs> [init.json|ext:init.json] [lr]
//   data specs: comma list of file:width[:lambda]  (width 57 = features+MC label; 58 = features+MC+TD; label = lambda*MC+(1-lambda)*TD)
//   The stored 56 features are decoded back to the exact position and re-featurised, so any feature set can be trained
//   from the existing self-play files. ext:init.json = start from a 56-input net, new inputs get zero weights.
const fs = require('fs'); const E = require('./engine.js');
const feat = +process.argv[2], specs = process.argv[3].split(','), out = process.argv[4];
const hidden = process.argv[5].split(',').map(Number), epochs = +process.argv[6], initArg = process.argv[7] && process.argv[7] !== '-' ? process.argv[7] : null, lr0arg = +process.argv[8] || 0;
const NF = feat === 2 ? E.NF2 : E.NF, R = E.DEFAULT_RULES;
const cols = new Int32Array(4), deck = new Int32Array(11), f = new Float64Array(128), g = new Float64Array(128);
let total = 0; const srcs = specs.map((s) => { const [file, w, lam] = s.split(':'); const b = fs.readFileSync(file); const a = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); total += a.length / +w; return { a, w: +w, lam: lam == null ? 1 : +lam }; });
const Xm = new Float32Array(total * NF), Y = new Float32Array(total); let n = 0, maxErr = 0;
for (const { a, w, lam } of srcs) {
  const rows = a.length / w;
  for (let r = 0; r < rows; r++, n++) {
    const o = r * w, rem = Math.round(a[o + 1] * 52), H = Math.round(a[o] * 52), busts = a[o + 2] ? 0 : a[o + 3] ? 1 : 2, stays = Math.round(a[o + 5] * 2), prev = Math.round(a[o + 7] * 5);
    Y[n] = w === 58 ? lam * a[o + 56] + (1 - lam) * a[o + 57] : a[o + 56];
    if (feat === 1) { for (let x = 0; x < 56; x++) Xm[n * NF + x] = a[o + x]; continue; }
    for (let v = 1; v <= 10; v++) deck[v] = Math.round(a[o + 7 + v] * rem);
    for (let q = 0; q < 4; q++) { const p = o + 20 + 9 * q; cols[q] = a[p] ? E.mkCol(Math.round(a[p + 2] * 21), a[p + 3] ? 1 : 0, Math.round(a[p + 4] * 4), a[p + 6] ? 0 : 1) : 0; }
    E.featurize2(cols, deck, rem, H, busts, stays, prev, 4, f, R.pts, R.sb);
    if (r % 97 === 0) for (let x = 0; x < 56; x++) { const d = Math.abs(f[x] - a[o + x]); if (d > maxErr) maxErr = d; }
    for (let x = 0; x < NF; x++) Xm[n * NF + x] = f[x];
  }
}
if (feat === 2) console.log('decode check: max |re-featurised - stored| on the first 56 inputs =', maxErr.toExponential(2));
const rng = E.mulberry32(12345);
const sizes = [NF, ...hidden, 1];
let layers = sizes.slice(1).map((nOut, li) => {
  const nIn = sizes[li], W = new Float64Array(nIn * nOut), b = new Float64Array(nOut), s = Math.sqrt(2 / nIn);
  for (let k = 0; k < W.length; k++) { let u = 0; while (!u) u = rng(); W[k] = s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
  return { nIn, nOut, W, b };
});
if (initArg) {
  const ext = initArg.startsWith('ext:'), src = JSON.parse(fs.readFileSync(ext ? initArg.slice(4) : initArg)); const L0 = src.layers || src.nn.layers;
  layers = L0.map((l) => ({ nIn: l.nIn, nOut: l.nOut, W: Float64Array.from(l.W), b: Float64Array.from(l.b) }));
  if (ext) { const l = layers[0], W = new Float64Array(NF * l.nOut); for (let o = 0; o < l.nOut; o++) for (let i = 0; i < l.nIn; i++) W[o * NF + i] = l.W[o * l.nIn + i]; layers[0] = { nIn: NF, nOut: l.nOut, W, b: l.b }; }
  if (layers[0].nIn !== NF) throw new Error('init net has ' + layers[0].nIn + ' inputs, feature set has ' + NF);
}
const L = layers.length, SZ = [NF, ...layers.map((l) => l.nOut)];
const adam = layers.map((l) => ({ mW: new Float64Array(l.W.length), vW: new Float64Array(l.W.length), mb: new Float64Array(l.nOut), vb: new Float64Array(l.nOut), gW: new Float64Array(l.W.length), gb: new Float64Array(l.nOut) }));
const act = SZ.map((k) => new Float64Array(k)), delta = SZ.map((k) => new Float64Array(k));
function forward(off) {
  const a0 = act[0]; for (let i = 0; i < NF; i++) a0[i] = Xm[off + i];
  for (let li = 0; li < L; li++) {
    const l = layers[li], x = act[li], y = act[li + 1], W = l.W, nIn = l.nIn, last = li === L - 1;
    for (let o = 0, k = 0; o < l.nOut; o++) { let s = l.b[o]; for (let i = 0; i < nIn; i++, k++) s += W[k] * x[i]; y[o] = last || s > 0 ? s : 0; }
  }
  return act[L][0];
}
function backward(err) {
  delta[L][0] = err;
  for (let li = L - 1; li >= 0; li--) {
    const l = layers[li], gg = adam[li], x = act[li], d = delta[li + 1], dp = delta[li], W = l.W, nIn = l.nIn;
    if (li > 0) dp.fill(0);
    for (let o = 0, k = 0; o < l.nOut; o++) {
      const e = d[o]; if (e === 0) { k += nIn; continue; }
      gg.gb[o] += e;
      if (li > 0) for (let i = 0; i < nIn; i++, k++) { gg.gW[k] += e * x[i]; dp[i] += e * W[k]; }
      else for (let i = 0; i < nIn; i++, k++) gg.gW[k] += e * x[i];
    }
    if (li > 0) for (let i = 0; i < nIn; i++) if (x[i] <= 0) dp[i] = 0;
  }
}
let step = 0;
function apply(lr, bs) {
  step++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, step), c2 = 1 - Math.pow(b2, step);
  for (let li = 0; li < L; li++) {
    const l = layers[li], gg = adam[li];
    for (let k = 0; k < l.W.length; k++) { const gr = gg.gW[k] / bs; gg.mW[k] = b1 * gg.mW[k] + (1 - b1) * gr; gg.vW[k] = b2 * gg.vW[k] + (1 - b2) * gr * gr; l.W[k] -= lr * (gg.mW[k] / c1) / (Math.sqrt(gg.vW[k] / c2) + 1e-8); gg.gW[k] = 0; }
    for (let k = 0; k < l.nOut; k++) { const gr = gg.gb[k] / bs; gg.mb[k] = b1 * gg.mb[k] + (1 - b1) * gr; gg.vb[k] = b2 * gg.vb[k] + (1 - b2) * gr * gr; l.b[k] -= lr * (gg.mb[k] / c1) / (Math.sqrt(gg.vb[k] / c2) + 1e-8); gg.gb[k] = 0; }
  }
}
const idx = new Int32Array(total); for (let i = 0; i < total; i++) idx[i] = i;
for (let i = total - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
const nVal = Math.min(100000, Math.floor(total * 0.03)), nTr = total - nVal, BS = 256;
const valLoss = () => { let s = 0; for (let k = nTr; k < total; k++) { const e = forward(idx[k] * NF) - Y[idx[k]]; s += e * e; } return s / nVal; };
const save = () => { const o = { scale: 1000, layers: layers.map((l) => ({ nIn: l.nIn, nOut: l.nOut, W: Array.from(l.W, (x) => +x.toFixed(5)), b: Array.from(l.b, (x) => +x.toFixed(5)) })) }; if (feat === 2) o.feat = 2; fs.writeFileSync(out, JSON.stringify(o)); };
console.log(total, 'rows, net', SZ.join('-'), 'val mse at start', valLoss().toFixed(5));
let best = Infinity;
for (let ep = 0; ep < epochs; ep++) {
  const lr = (lr0arg || (initArg ? 3e-4 : 1e-3)) * Math.pow(0.1, ep / Math.max(1, epochs - 1) * 1.3), t0 = Date.now();
  for (let i = nTr - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
  let tr = 0;
  for (let k = 0; k < nTr; k++) { const e = forward(idx[k] * NF) - Y[idx[k]]; tr += e * e; backward(e); if ((k + 1) % BS === 0) apply(lr, BS); }
  const v = valLoss(); if (v < best) { best = v; save(); }
  console.log('epoch', ep + 1, 'train', (tr / nTr).toFixed(5), 'val', v.toFixed(5), 'lr', lr.toExponential(1), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
