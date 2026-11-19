'use strict';
// Cross-entropy method over leaf weights. Tunes on seeds >= 1,000,000 only.
// node src/tune.js <depth> <gens> <pop> <games> <outfile> [initfile] [horizon]
const fs = require('fs'); const P = require('./pool.js'); const E = require('./engine.js');
const [depth, gens, pop, games, out, init, hz] = [+process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], process.argv[6], process.argv[7], +process.argv[8] || 0];
const B = init && init !== '-' ? JSON.parse(fs.readFileSync(init)).w : E.BASELINE_WEIGHTS;
const toVec = (w) => [...w.fut, w.perfect, w.perfH, w.stay, w.streak, w.p21, w.safe, w.four, ...w.cnt.slice(1, 5), ...w.tot.slice(2, 21), w.pAny || 0, ...(w.forced || [0, 0, 0]), w.soft || 0, w.empty || 0, w.streak2 || 0];
const toW = (x) => ({ fut: x.slice(0, 3), perfect: x[3], perfH: x[4], stay: x[5], stayCap: 52, streak: x[6], p21: x[7], safe: x[8], four: x[9],
  cnt: [0, ...x.slice(10, 14)], tot: [0, 0, ...x.slice(14, 33), 0], pAny: x[33], forced: x.slice(34, 37), soft: x[37], empty: x[38], streak2: x[39] });
let mu = toVec(B);
let sd = [15, 15, 15, 200, 4, 4, 60, 80, 30, 60, 30, 30, 30, 30, ...new Array(19).fill(30)];
if (init && init !== '-') sd = sd.map((s) => s * 0.5);
sd.push(80, 200, 200, 200, 25, 25, 80);
if (process.env.SDSTREAK) sd[6] = +process.env.SDSTREAK; // widen the streak weight after a rule change
const sdScale = +process.env.SD || 1; sd = sd.map((s) => s * sdScale);
const rng = E.mulberry32(99 + depth);
const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const spec = (x) => ({ depth, w: toW(x), stayInner: process.env.STAYS || true });
if (1000000 + (gens + 1) * games > 1500000) throw new Error('tuning seeds would reach the validation range');
(async () => {
  const VAL0 = 1500000, VALN = 4000;
  const score = async (x, s0, n) => { const g = await P.evaluate(spec(x), s0, n, { horizon: hz }); return g.reduce((a, r) => a + r[0], 0) / n; };
  let bestVal = await score(mu, VAL0, VALN), bestMu = mu.slice();
  console.log('gen 0 val', bestVal.toFixed(1));
  for (let g = 1; g <= gens; g++) {
    const s0 = 1000000 + g * games;            // fresh tuning seeds each generation
    const cands = Array.from({ length: pop }, () => mu.map((m, i) => m + sd[i] * gauss()));
    const sc = []; for (const c of cands) sc.push(await score(c, s0, games));
    const idx = sc.map((s, i) => i).sort((a, b) => sc[b] - sc[a]).slice(0, Math.floor(pop / 4));
    const nm = mu.map((_, i) => idx.reduce((a, k) => a + cands[k][i], 0) / idx.length);
    const ns = mu.map((_, i) => Math.sqrt(idx.reduce((a, k) => a + (cands[k][i] - nm[i]) ** 2, 0) / idx.length));
    mu = mu.map((m, i) => 0.3 * m + 0.7 * nm[i]); sd = sd.map((s, i) => Math.max(0.3 * s + 0.7 * ns[i], 0.5));
    const v = await score(mu, VAL0, VALN);
    if (v > bestVal) { bestVal = v; bestMu = mu.slice(); fs.writeFileSync(out, JSON.stringify({ depth, val: v, w: toW(bestMu) })); }
    console.log('gen', g, 'val', v.toFixed(1), 'best', bestVal.toFixed(1), 'elite', (idx.reduce((a, k) => a + sc[k], 0) / idx.length).toFixed(1));
  }
  P.close();
})();
