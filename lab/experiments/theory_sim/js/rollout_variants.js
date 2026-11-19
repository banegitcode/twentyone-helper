// node rollout_variants.js <positions.jsonl> <rem> <nPos> <nRoll> <out.json> [worker k of K]
// Paired rollouts with Landon's FAST network policy (1-card lookahead, exact last 4). For each logged champion-like position
// (stays=2, busts=0 unless noted) the same random orders of the remaining deck are played under variants of (stays, busts).
// Output: per variant the mean future points; paired differences vs (2,0) with SE.  Uses only random orders (no peeking by the policy).
const fs = require('fs'); const root = '/workspace/21lab/engine/twentyone-solver/';
const E = require(root + 'src/engine.js');
const shipped = JSON.parse(fs.readFileSync(root + 'results/shipped_policies.json'))['52'];
const rules = E.DEFAULT_RULES;
const pol = E.createSearcher(rules, { depth: 1, stayInner: shipped.stayInner, cache: true, endgameK: 4, nn: shipped.nn });
const [file, REM, NP, NR, out] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], process.argv[6]];
const wk = +(process.argv[7] || 0), WK = +(process.argv[8] || 1);
const pos = [];
for (const l of fs.readFileSync(file, 'utf8').split('\n')) { if (!l.startsWith('{"t":"pos"')) continue; const d = JSON.parse(l); if (d.rem === REM && d.stays === 2 && d.busts === 0) pos.push(d); }
const mine = pos.slice(0, NP).filter((_, i) => i % WK === wk);
const ALLV = [[2, 0], [1, 0], [0, 0], [2, 1], [2, 2]];
const variants = process.env.VARS ? process.env.VARS.split(',').map((i) => ALLV[+i]) : ALLV;
const results = []; // per position: array [variant][rollout]
for (const p of mine) {
  const rest = []; for (let v = 1; v <= 10; v++) for (let i = 0; i < p.deck[v - 1]; i++) rest.push(v);
  const rng = E.mulberry32(p.seed * 7 + REM);
  const per = variants.map(() => []);
  for (let r = 0; r < NR; r++) {
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    variants.forEach(([s, b], vi) => {
      const st = E.newGame(rules); st.cols = Int32Array.from(p.cols); st.deck = Int32Array.from([0].concat(p.deck)); st.rem = p.rem;
      st.played = 52 - p.rem; st.busts = b; st.stays = s; st.prev = p.prev; st.score = 0; pol.reset();
      let i = 0; while (!st.over) { const v = rest[i++]; E.applyMove(rules, st, v, pol.choose(st, v)); }
      per[vi].push(st.score);
    });
  }
  results.push({ seed: p.seed, per });
}
fs.writeFileSync(out, JSON.stringify({ rem: REM, variants, results }));
