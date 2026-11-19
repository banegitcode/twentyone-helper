// node confirm.js <champion_log.jsonl> <samp_in.jsonl> <out.jsonl> [worker k] [K]
// Confirmation pass (fresh random orders, independent of the selection pass): for decisions where the first pass found an alternative that
// looked better (naive >= MINADV and naive/se >= MINZ), re-evaluate champion vs that alternative with N fresh paired rollouts (same reference A:
// horizon-8 hybrid rollouts).  The mean of these fresh differences over the selected decisions is an UNBIASED estimate of the gain from the rule
// "flip to the alternative if the first pass looked better"; labels (alternative type) come from the first pass and are independent of the fresh data.
const L = require('./lib.js'); const fs = require('fs');
const [logf, inf, out] = [process.argv[2], process.argv[3], process.argv[4]]; const wk = +(process.argv[5] || 0), WK = +(process.argv[6] || 1);
const P = (k, d) => (process.env[k] !== undefined ? +process.env[k] : d);
const HORIZON = P('HORIZON', 8), KX = P('KX', 8), NFRESH = P('NFRESH', 96), MINADV = P('MINADV', 25), MINZ = P('MINZ', 1.0), MAXG = P('MAXG', 1e9);
const E = L.E, rules = L.rules, pol = L.rolloutPolicy(0), X = L.exactSolver(21), nnv = L.makeNNValue();
const dec = new Map(); for (const l of fs.readFileSync(logf, 'utf8').split('\n')) { if (!l) continue; const d = JSON.parse(l); if (d.t === 'dec') dec.set(d.g + ':' + d.step, d); }
const sel = []; const lastg = {};
for (const f of inf.split(',')) { const rs = fs.readFileSync(f, 'utf8').split('\n').filter((x) => x).map((x) => JSON.parse(x)); const lg = Math.max(...rs.map((r) => r.g)); for (const r of rs) if (r.n && r.g < lg && r.g < MAXG && r.naive >= MINADV && r.naive / Math.max(r.naiveSe, 1) >= MINZ) sel.push(r); }
sel.sort((a, b) => a.g - b.g || a.step - b.step);
const fd = fs.openSync(out, 'a');
function rollout(st0, v, a, rest) {
  const g = E.cloneGame(st0); E.applyMove(rules, g, v, a); pol.reset(); let i = 0;
  while (!g.over) {
    if (g.rem <= KX) { let t; try { t = X.value(g); } catch (e) { X.clear(); t = X.value(g); } return g.score + t; }
    if (i >= HORIZON) return g.score + nnv(g);
    const x = rest[i++]; E.applyMove(rules, g, x, pol.choose(g, x));
  }
  return g.score;
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
sel.forEach((r, idx) => {
  if (idx % WK !== wk) return; const d = dec.get(r.g + ':' + r.step); const st = L.mkState(d); const v = d.v;
  const ca = { stay: d.stay, col: d.col }, ba = r.cands[r.best]; const alt = { stay: ba.stay, col: ba.col };
  const rest = []; for (let x = 1; x <= 10; x++) for (let i = 0; i < d.deck[x] - (x === v ? 1 : 0); i++) rest.push(x);
  const rng = E.mulberry32(987654 + r.g * 131 + r.step); const df = [];
  for (let k = 0; k < NFRESH; k++) { for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; } df.push(rollout(st, v, alt, rest) - rollout(st, v, ca, rest)); }
  const m = mean(df), se = Math.sqrt(df.reduce((s, x) => s + (x - m) * (x - m), 0) / (df.length - 1) / df.length);
  fs.writeSync(fd, JSON.stringify({ g: r.g, step: r.step, rem: r.rem, first: { naive: r.naive, se: r.naiveSe }, fresh: m, freshSe: se, n: NFRESH, champ: r.champ, alt: r.alt, pf: r.pf, champAct: [d.stay, d.col], altAct: [ba.stay, ba.col] }) + '\n');
});
fs.closeSync(fd);
