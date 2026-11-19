// node exact_regret.js <champion_log.jsonl> <rexMax> <out.jsonl> [worker k] [K]
// For every champion decision with st.rem <= rexMax (cards left incl. the current card) compute the EXACT value (expectimax over the
// unseen multiset, engine exact2 solver, one Stay per card) of every distinct legal action; regret = best - champion's action.
const L = require('./lib.js'); const fs = require('fs');
const [file, REX, out] = [process.argv[2], +process.argv[3], process.argv[4]]; const wk = +(process.argv[5] || 0), WK = +(process.argv[6] || 1);
const games = new Map();
for (const l of fs.readFileSync(file, 'utf8').split('\n')) { if (!l) continue; const d = JSON.parse(l); if (d.t !== 'dec') continue; if (!games.has(d.g)) games.set(d.g, []); games.get(d.g).push(d); }
const X = L.exactSolver(+(process.env.LOGCAP || 22)); const fd = fs.openSync(out, 'a'); const E = L.E;
let gi = 0;
for (const [g, decs] of games) {
  if (process.env.GEVEN && g % 2 !== 0) continue; if (process.env.GMOD && g % +process.env.GMOD !== 0) continue;
  if ((gi++) % WK !== wk) continue;
  X.clear();
  const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  const sel = decs.filter((d) => d.rem <= REX && d.rem >= +(process.env.REXMIN || 0) && (!ONLY || ONLY.has(g + ':' + d.step))).sort((a, b) => b.rem - a.rem);
  for (const d of sel) {
    const st = L.mkState(d); const t0 = Date.now(); let q;
    try { q = X.q(st, d.v); } catch (e) { fs.writeSync(fd, JSON.stringify({ g, step: d.step, rem: d.rem, failed: String(e.message) }) + '\n'); continue; }
    const seen = new Map(), rep = new Map(); for (const a of q) { const k = L.afterKey(st, d.v, a); if (!seen.has(k)) { seen.set(k, a.value); rep.set(k, a); } }
    const kc = L.afterKey(st, d.v, { stay: d.stay, col: d.col }); const best = Math.max(...seen.values()); const vc = seen.get(kc); let bk = kc; for (const [k, x] of seen) if (x > seen.get(bk) + 1e-9 && x >= best - 1e-9) bk = k; const ba = rep.get(bk);
    fs.writeSync(fd, JSON.stringify({ g, step: d.step, rem: d.rem, best, champ: vc, regret: best - vc, nDistinct: seen.size, nNear: [...seen.values()].filter((x) => x > best - 1e-6).length, champExactFlag: d.exact, ms: Date.now() - t0, champ: L.moveInfo(st, d.v, { stay: d.stay, col: d.col }), alt: L.moveInfo(st, d.v, ba), pf: { ...L.posFeat(st, d.v), busts: d.busts, stays: d.stays, prev: d.prev, v: d.v }, champAct: [d.stay, d.col], bestAct: [ba.stay, ba.col] }) + '\n');
  }
}
fs.closeSync(fd);
