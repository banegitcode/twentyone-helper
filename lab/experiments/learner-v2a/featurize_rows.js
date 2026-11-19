#!/usr/bin/env node
'use strict';
// pos.jsonl -> binary float32 matrix: per row [56 engine features | champion net value (points, x1000 scale applied)].  Uses the champion's own featurize (engine.js) and the weights of ship_nn.json
// (== network deeper:16 uses: shipped_policies.json["52"].nn), H = cards left (bench protocol: horizon Infinity).   node featurize_rows.js in.pos.jsonl out.feat.f32 [--spec shipped52|ship_nn]
const fs = require('fs'), path = require('path'), readline = require('readline');
const DIR = path.join(__dirname, '../../engine/twentyone-solver'); const E = require(path.join(DIR, 'src/engine.js')); const R = E.DEFAULT_RULES;
const spec = JSON.parse(fs.readFileSync(path.join(DIR, 'results/shipped_policies.json')))['52'], nn = spec.nn;
const L = nn.layers.map((l) => ({ nIn: l.nIn, nOut: l.nOut, W: Float64Array.from(l.W), b: Float64Array.from(l.b) }));
const A = new Float64Array(256), B = new Float64Array(256), f = new Float64Array(E.NF);
function net() { let x = A, y = B; for (let i = 0; i < E.NF; i++) x[i] = f[i];
  for (let li = 0; li < L.length; li++) { const l = L[li], last = li === L.length - 1; for (let o = 0, k = 0; o < l.nOut; o++) { let s = l.b[o]; for (let i = 0; i < l.nIn; i++, k++) s += l.W[k] * x[i]; y[o] = last || s > 0 ? s : 0; } const t = x; x = y; y = t; } return x[0] * (nn.scale || 1000); }
const [inp, outp] = process.argv.slice(2); const rows = fs.readFileSync(inp, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const out = new Float32Array(rows.length * (E.NF + 1)); const cols = new Int32Array(4), deck = new Int32Array(11);
rows.forEach((r, n) => {
  for (let j = 0; j < 4; j++) { const cs = r.cols[j]; if (!cs.length) { cols[j] = 0; continue; } let hard = 0, ace = 0, not7 = 0; for (const v of cs) { hard += v; if (v === 1) ace = 1; if (v !== 7) not7 = 1; } cols[j] = E.mkCol(hard, ace, cs.length, not7); }
  let rem = 0; for (let v = 1; v <= 10; v++) { deck[v] = r.deck[v - 1]; rem += deck[v]; }
  E.featurize(cols, deck, rem, rem, r.busts, r.stays, Math.min(r.streak, R.sb.length - 1), 4, f);
  const o = n * (E.NF + 1); for (let i = 0; i < E.NF; i++) out[o + i] = f[i]; out[o + E.NF] = net();
});
fs.writeFileSync(outp, Buffer.from(out.buffer)); console.error('rows', rows.length);
