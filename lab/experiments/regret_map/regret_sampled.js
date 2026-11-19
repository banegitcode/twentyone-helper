// node regret_sampled.js <champion_log.jsonl> <out.jsonl> [worker k] [K]
// SAMPLED reference regret for champion decisions with st.rem > REXMAX (cards left incl. the current one).
// Candidates = distinct afterstate classes of the champion's own root scores within WINDOW points of its best (<= MAXCAND, champion's move always in).
// Reference value of a candidate = mean over paired random orders of the unseen cards of: points now + rollout-policy play (ROLLDEPTH 0 = network 0-ply, 1 = network 1-card lookahead) until
// KX cards remain, then the EXACT expectimax value of that position (so the last KX cards are played perfectly).  Same random orders for all candidates
// (common random numbers).  The reference policy is the fast network policy, NOT perfect play: regrets are "one-step deviation gain under that continuation".
// HORIZON=T: stop each rollout after T further cards and use the shipped network's value of that position (variance reduction; adds the network's leaf bias).
// Adaptive N: sample in blocks of STEP up to NMAX; stop when every alternative is clearly worse (z<-ZSTOP) or its paired SE < SESTOP, or NMAX.
// Selection-bias control: best alternative is chosen on odd rollouts and its advantage over the champion is measured on even ones (and vice versa).
const L = require('./lib.js'); const fs = require('fs');
const [file, out] = [process.argv[2], process.argv[3]]; const wk = +(process.argv[4] || 0), WK = +(process.argv[5] || 1);
const P = (k, d) => (process.env[k] !== undefined ? +process.env[k] : d);
const REXMAX = P('REXMAX', 11), KX = P('KX', 8), WINDOW = P('WINDOW', 200), MAXCAND = P('MAXCAND', 4), N0 = P('N0', 16), STEP = P('STEP', 16), NMAX = P('NMAX', 96), ZSTOP = P('ZSTOP', 2.5), SESTOP = P('SESTOP', 30);
const MINREM = P('MINREM', 0), SKIPG = process.env.GAMES ? new Set(process.env.GAMES.split(',').map(Number)) : null;
const ROLLDEPTH = P('ROLLDEPTH', 0), PSAMP = P('PSAMP', 0.4);
const HORIZON = P('HORIZON', Infinity), nnv = L.makeNNValue();
const E = L.E, rules = L.rules, pol = L.rolloutPolicy(ROLLDEPTH), X = L.exactSolver(+(process.env.LOGCAP || 21));
const games = new Map();
for (const l of fs.readFileSync(file, 'utf8').split('\n')) { if (!l) continue; const d = JSON.parse(l); if (d.t !== 'dec') continue; if (!games.has(d.g)) games.set(d.g, []); games.get(d.g).push(d); }
const fd = fs.openSync(out, 'a');
let seed = 12345;
function rollout(st0, v, a, rest) {
  const g = E.cloneGame(st0); const ev = E.applyMove(rules, g, v, a); pol.reset(); let i = 0;
  while (!g.over) {
    if (g.rem <= KX) { let tail; try { tail = X.value(g); } catch (e) { X.clear(); tail = X.value(g); } return g.score + tail; }
    if (i >= HORIZON) return g.score + nnv(g);      // horizon leaf: the shipped network's value of the position (expected points to come)
    const x = rest[i++]; E.applyMove(rules, g, x, pol.choose(g, x));
  }
  return g.score;
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function seOf(a) { const n = a.length; if (n < 2) return Infinity; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1) / n); }
let gi = 0;
for (const [g, decs] of games) {
  if (g < P('GFROM', 0) || g >= P('GTO', 1e9)) continue;
  if ((gi++) % WK !== wk) continue; if (SKIPG && !SKIPG.has(g)) continue;
  X.clear();
  for (const d of decs) {
    if (d.rem <= REXMAX || d.rem < MINREM || d.rem > P('MAXREM', 999)) continue;
    const st = L.mkState(d); const v = d.v; const t0 = Date.now();
    // classes from the champion's score list
    const tier = d.scores.some((a) => a.deep !== undefined) ? d.scores.filter((a) => a.deep !== undefined) : d.scores;
    const cls = new Map();
    for (const a of tier) { const k = L.afterKey(st, v, a); const val = a.deep !== undefined ? a.deep : a.value; if (!cls.has(k) || cls.get(k).cv < val) cls.set(k, { a: { stay: a.stay, col: a.col }, cv: val, k }); }
    const kc = L.afterKey(st, v, { stay: d.stay, col: d.col });
    if (!cls.has(kc)) cls.set(kc, { a: { stay: d.stay, col: d.col }, cv: -1e9, k: kc });
    const champCv = Math.max(...[...cls.values()].map((c) => c.cv));
    let cands = [...cls.values()].filter((c) => c.k === kc || c.cv >= champCv - WINDOW).sort((x, y) => y.cv - x.cv);
    if (cands.length > MAXCAND) { const keep = cands.slice(0, MAXCAND); if (!keep.some((c) => c.k === kc)) keep[MAXCAND - 1] = cands.find((c) => c.k === kc); cands = keep; }
    if (cands.length >= 2) { const hsh = (Math.imul(g * 1000 + d.step, 2654435761) >>> 0) / 4294967296; if (hsh >= PSAMP) { fs.writeSync(fd, JSON.stringify({ g, step: d.step, rem: d.rem, notSampled: true, nCand: cands.length }) + '\n'); continue; } }
    if (cands.length < 2) { fs.writeSync(fd, JSON.stringify({ g, step: d.step, rem: d.rem, single: true, nCls: cls.size }) + '\n'); continue; }
    const ci = cands.findIndex((c) => c.k === kc);
    const rest = []; for (let x = 1; x <= 10; x++) for (let i = 0; i < d.deck[x] - (x === v ? 1 : 0); i++) rest.push(x);
    const R = cands.map(() => []);
    const rng = E.mulberry32((seed = (seed * 1103515245 + 12345) & 0x7fffffff) ^ (g * 7919 + d.step));
    let n = 0;
    while (n < NMAX) {
      const blk = n === 0 ? N0 : STEP;
      for (let r = 0; r < blk; r++) { for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; } cands.forEach((c, k) => R[k].push(rollout(st, v, c.a, rest))); }
      n = R[0].length;
      let done = true;
      for (let k = 0; k < cands.length; k++) { if (k === ci) continue; const df = R[k].map((x, i) => x - R[ci][i]); const se = seOf(df), m = mean(df); if (!(m / se < -ZSTOP || se < SESTOP || (n >= 32 && m / se < -1.5))) done = false; }
      if (done) break;
    }
    const diffs = cands.map((c, k) => R[k].map((x, i) => x - R[ci][i]));
    const means = diffs.map(mean), ses = diffs.map(seOf);
    // naive (selection-biased) regret and split-sample regret
    let bk = 0; for (let k = 1; k < cands.length; k++) if (means[k] > means[bk]) bk = k;
    const naive = means[bk];
    const half = (sel) => { const idx = diffs[0].map((_, i) => i).filter((i) => (i % 2) === sel), ev = diffs[0].map((_, i) => i).filter((i) => (i % 2) !== sel); let b = 0, bm = -Infinity; cands.forEach((c, k) => { const m = mean(idx.map((i) => diffs[k][i])); if (m > bm) { bm = m; b = k; } }); const dd = idx; const evv = ev.map((i) => diffs[b][i]); return { b, v: mean(evv), se: seOf(evv) }; };
    const h0 = half(0), h1 = half(1); const ss = (h0.v + h1.v) / 2, ssSe = Math.sqrt(h0.se * h0.se + h1.se * h1.se) / 2;
    const cb = cands[bk];
    fs.writeSync(fd, JSON.stringify({ g, step: d.step, rem: d.rem, w: 1 / PSAMP, n, nCand: cands.length, nCls: cls.size, champIdx: ci, champMean: mean(R[ci]), best: bk, naive, naiveSe: ses[bk], ss, ssSe, ms: Date.now() - t0,
      champ: L.moveInfo(st, v, { stay: d.stay, col: d.col }), alt: L.moveInfo(st, v, cb.a), pf: { ...L.posFeat(st, v), busts: d.busts, stays: d.stays, prev: d.prev, v }, cands: cands.map((c, k) => ({ stay: c.a.stay, col: c.a.col, cv: c.cv, m: means[k], se: ses[k], abs: mean(R[k]) })) }) + '\n');
  }
}
fs.closeSync(fd);
