'use strict';
// Trains a distribution network: instead of one number (expected points to come) it predicts how those points are
// spread over bins, so the search can maximise the chance of beating an opponent. Plain JS, Adam, cross-entropy.
// node src/train_dist.js <data.bin[,more.bin]> <out.json> <hidden e.g. 128,48> <epochs> <nBins> <binW> [init.json]
// data rows: NF features + points actually scored afterwards / 1000 (a blend file made with lambda = 1).
const fs = require('fs'); const E = require('./engine.js');
const NF = E.NF, ROW = NF + 1;
const files = process.argv[2].split(','), out = process.argv[3], hidden = process.argv[4].split(',').map(Number);
const epochs = +process.argv[5], NB = +process.argv[6], BW = +process.argv[7], initF = process.argv[8];
const parts = files.map((f) => { const b = fs.readFileSync(f); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); });
const total = parts.reduce((a, p) => a + p.length / ROW, 0);
const rowOf = (i) => { for (const p of parts) { const n = p.length / ROW; if (i < n) return [p, i * ROW]; i -= n; } };
const rng = E.mulberry32(777), sizes = [NF, ...hidden, NB], L = sizes.length - 1;
const layers = sizes.slice(1).map((nOut, li) => {
  const nIn = sizes[li], W = new Float64Array(nIn * nOut), b = new Float64Array(nOut), s = Math.sqrt(2 / nIn) * (li === L - 1 ? 0.1 : 1);
  for (let k = 0; k < W.length; k++) { let u = 0; while (!u) u = rng(); W[k] = s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
  return { nIn, nOut, W, b };
});
if (initF) JSON.parse(fs.readFileSync(initF)).layers.forEach((l, li) => {   // reuse the hidden layers of a value network
  if (li < L - 1 && l.nIn === layers[li].nIn && l.nOut === layers[li].nOut) { layers[li].W = Float64Array.from(l.W); layers[li].b = Float64Array.from(l.b); }
});
const adam = layers.map((l) => ({ mW: new Float64Array(l.W.length), vW: new Float64Array(l.W.length), mb: new Float64Array(l.nOut), vb: new Float64Array(l.nOut), gW: new Float64Array(l.W.length), gb: new Float64Array(l.nOut) }));
const act = sizes.map((n) => new Float64Array(n)), delta = sizes.map((n) => new Float64Array(n));
const binOf = (y) => Math.max(0, Math.min(NB - 1, Math.floor(Math.round(y * 1000) / BW)));
function forward(p, off) {            // leaves softmax probabilities in act[L]
  const a0 = act[0]; for (let i = 0; i < NF; i++) a0[i] = p[off + i];
  for (let li = 0; li < L; li++) {
    const l = layers[li], x = act[li], y = act[li + 1], W = l.W, nIn = l.nIn, last = li === L - 1;
    for (let o = 0, k = 0; o < l.nOut; o++) { let s = l.b[o]; for (let i = 0; i < nIn; i++, k++) s += W[k] * x[i]; y[o] = last || s > 0 ? s : 0; }
  }
  const y = act[L]; let mx = -Infinity, z = 0; for (let o = 0; o < NB; o++) if (y[o] > mx) mx = y[o];
  for (let o = 0; o < NB; o++) { y[o] = Math.exp(y[o] - mx); z += y[o]; } for (let o = 0; o < NB; o++) y[o] /= z;
}
function backward(target) {
  const dl = delta[L], y = act[L]; for (let o = 0; o < NB; o++) dl[o] = y[o] - (o === target ? 1 : 0);
  for (let li = L - 1; li >= 0; li--) {
    const l = layers[li], g = adam[li], x = act[li], d = delta[li + 1], dp = delta[li], W = l.W, nIn = l.nIn;
    if (li > 0) dp.fill(0);
    for (let o = 0, k = 0; o < l.nOut; o++) {
      const e = d[o]; if (e === 0) { k += nIn; continue; }
      g.gb[o] += e;
      if (li > 0) for (let i = 0; i < nIn; i++, k++) { g.gW[k] += e * x[i]; dp[i] += e * W[k]; }
      else for (let i = 0; i < nIn; i++, k++) g.gW[k] += e * x[i];
    }
    if (li > 0) for (let i = 0; i < nIn; i++) if (x[i] <= 0) dp[i] = 0;
  }
}
let step = 0;
function apply(lr, bs) {
  step++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, step), c2 = 1 - Math.pow(b2, step);
  for (let li = 0; li < L; li++) {
    const l = layers[li], g = adam[li];
    for (let k = 0; k < l.W.length; k++) { const gr = g.gW[k] / bs; g.mW[k] = b1 * g.mW[k] + (1 - b1) * gr; g.vW[k] = b2 * g.vW[k] + (1 - b2) * gr * gr; l.W[k] -= lr * (g.mW[k] / c1) / (Math.sqrt(g.vW[k] / c2) + 1e-8); g.gW[k] = 0; }
    for (let k = 0; k < l.nOut; k++) { const gr = g.gb[k] / bs; g.mb[k] = b1 * g.mb[k] + (1 - b1) * gr; g.vb[k] = b2 * g.vb[k] + (1 - b2) * gr * gr; l.b[k] -= lr * (g.mb[k] / c1) / (Math.sqrt(g.vb[k] / c2) + 1e-8); g.gb[k] = 0; }
  }
}
const idx = new Int32Array(total); for (let i = 0; i < total; i++) idx[i] = i;
for (let i = total - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
const nVal = Math.min(100000, Math.floor(total * 0.03)), nTr = total - nVal, BS = 256;
function valLoss() {                  // cross-entropy, and how far the predicted mean is from the truth (points)
  let s = 0, me = 0;
  for (let k = nTr; k < total; k++) {
    const [p, off] = rowOf(idx[k]); forward(p, off); const y = act[L]; s -= Math.log(Math.max(1e-12, y[binOf(p[off + NF])]));
    let m = 0; for (let o = 0; o < NB; o++) m += y[o] * (o * BW + BW / 2 - 25); me += m - p[off + NF] * 1000;
  }
  return [s / nVal, me / nVal];
}
const save = () => fs.writeFileSync(out, JSON.stringify({ scale: 1000, dist: { nBins: NB, binW: BW }, layers: layers.map((l) => ({ nIn: l.nIn, nOut: l.nOut, W: Array.from(l.W, (x) => +x.toFixed(5)), b: Array.from(l.b, (x) => +x.toFixed(5)) })) }));
console.log(total, 'rows, net', sizes.join('-'), 'val CE at start', valLoss()[0].toFixed(4));
let best = Infinity;
for (let ep = 0; ep < epochs; ep++) {
  const lr = 1e-3 * Math.pow(0.1, ep / Math.max(1, epochs - 1) * 1.3), t0 = Date.now();
  for (let i = nTr - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
  let tr = 0;
  for (let k = 0; k < nTr; k++) {
    const [p, off] = rowOf(idx[k]); forward(p, off); const tg = binOf(p[off + NF]); tr -= Math.log(Math.max(1e-12, act[L][tg])); backward(tg);
    if ((k + 1) % BS === 0) apply(lr, BS);
  }
  const [v, me] = valLoss(); if (v < best) { best = v; save(); }
  console.log('epoch', ep + 1, 'train CE', (tr / nTr).toFixed(4), 'val CE', v.toFixed(4), 'mean error', me.toFixed(0), 'lr', lr.toExponential(1), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
