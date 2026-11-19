// node mc_check.js <log> <rem> <nGames> <K> [out]   Monte Carlo check of exact2's value against the engine's own dynamics:
// from the logged state at <rem> cards left, play the EXACT policy (argmax of exact2 q at every card) on K random orders of the unseen cards.
// If exact2's V* is the engine's true expectation, mean(final score - V*) = 0.
const L = require('./lib.js'); const fs = require('fs'); const E = L.E, rules = L.rules;
const [file, REM, NG, K] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
const X = L.exactSolver(+(process.env.LOGCAP || 22));
const recs = []; for (const l of fs.readFileSync(file, 'utf8').split('\n')) { if (!l) continue; const d = JSON.parse(l); if (d.t === 'dec' && d.rem === REM) recs.push(d); }
let seed = +(process.env.SEED || 777); const rng = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const res = [], per = []; let nBust = 0, nPerfect = 0, N = 0;
for (const d of recs.slice(0, NG)) {
  X.clear(); const st = L.mkState(d); let q; try { q = X.q(st, d.v); } catch (e) { continue; }
  const V = Math.max(...q.map((a) => a.value)); const rest = []; for (let x = 1; x <= 10; x++) for (let i = 0; i < d.deck[x] - (x === d.v ? 1 : 0); i++) rest.push(x);
  const rs = [];
  for (let k = 0; k < K; k++) {
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    const g = E.cloneGame(st); const order = [d.v, ...rest]; let i = 0;
    while (!g.over && i < order.length) { const x = order[i++]; const qq = X.q(g, x); let b = qq[0]; for (const a of qq) if (a.value > b.value) b = a; E.applyMove(rules, g, x, b); }
    rs.push(g.score - V); N++; if (g.busts > 0) nBust++; else nPerfect++;
  }
  const m = rs.reduce((a, b) => a + b, 0) / K; per.push(m); res.push(...rs);
}
const mean = res.reduce((a, b) => a + b, 0) / res.length; const sd = Math.sqrt(res.reduce((a, b) => a + (b - mean) ** 2, 0) / (res.length - 1));
console.log(JSON.stringify({ rem: REM, states: per.length, playouts: res.length, meanResidual: +mean.toFixed(2), se: +(sd / Math.sqrt(res.length)).toFixed(2), sd: +sd.toFixed(0), noBustShare: +(nPerfect / N).toFixed(3) }));
