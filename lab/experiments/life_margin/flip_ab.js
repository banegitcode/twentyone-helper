// Decision-level A/B ("flip analysis"): at logged b=1 positions (js/gen_positions.js output) and each possible next card, compare the champion-like
// fast policy (depth-1 network) with the same policy + life-margin leaf correction.  For decisions where they differ ("flips") play paired rollouts:
// the two first moves, then the CHAMPION policy for both continuations, same random order of the unseen cards.  Output: flip rate and mean gain per flip.
//   node flip_ab.js <positions.jsonl> <minRem> <maxPositions> <nRoll> <out.json> [worker k] [of K]
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', '..', 'engine', 'twentyone-solver');
const E0 = require(path.join(DIR, 'src', 'engine.js'));
const E1 = require(path.join(__dirname, 'src', 'engine.js'));
const shipped = JSON.parse(fs.readFileSync(path.join(DIR, 'results', 'shipped_policies.json')))['52'];
const spec = () => ({ depth: 1, stayInner: shipped.stayInner, cache: true, endgameK: 4, nn: shipped.nn });
const PTS = [[12, 0], [16, 88], [24, 176], [28, 237], [40, 485], [52, 600]];
const corr = (H) => { if (H <= PTS[0][0]) return 0; for (let i = 1; i < PTS.length; i++) if (H <= PTS[i][0]) { const [h0, v0] = PTS[i - 1], [h1, v1] = PTS[i]; return v0 + (v1 - v0) * (H - h0) / (h1 - h0); } return PTS[PTS.length - 1][1]; };
const rules0 = E0.DEFAULT_RULES, rules1 = E1.DEFAULT_RULES;
globalThis.__LIFE_CORR = null;
const pol0 = E0.createSearcher(rules0, spec());
const pol1 = E1.createSearcher(rules1, spec());
const [file, MINREM, MAXP, NR, out] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], process.argv[6]];
const wk = +(process.argv[7] || 0), WK = +(process.argv[8] || 1);
const pos = [];
for (const l of fs.readFileSync(file, 'utf8').split('\n')) { if (!l.startsWith('{"t":"pos"')) continue; const d = JSON.parse(l); if (d.busts === 1 && d.rem >= MINREM) pos.push(d); }
const mine = pos.slice(0, MAXP).filter((_, i) => i % WK === wk);
const mk = (E, rules, p, v) => { const st = E.newGame(rules); st.cols = Int32Array.from(p.cols); st.deck = Int32Array.from([0].concat(p.deck)); st.rem = p.rem; st.played = 52 - p.rem; st.busts = p.busts; st.stays = p.stays; st.prev = p.prev; st.score = 0; return st; };
const res = { decisions: 0, flips: 0, flipRows: [], weightSum: 0, flipWeight: 0 };
for (const p of mine) {
  for (let v = 1; v <= 10; v++) {
    const w = p.deck[v - 1] / p.rem; if (!w) continue;
    globalThis.__LIFE_CORR = null; pol0.reset(); const m0 = pol0.choose(mk(E0, rules0, p, v), v);
    globalThis.__LIFE_CORR = corr; pol1.reset(); const m1 = pol1.choose(mk(E1, rules1, p, v), v); globalThis.__LIFE_CORR = null;
    res.decisions++; res.weightSum += w;
    if (m0.stay === m1.stay && m0.col === m1.col) continue;
    // equivalent actions (same resulting state) are not real flips: compare resulting columns multiset
    const a0 = mk(E0, rules0, p, v), a1 = mk(E0, rules0, p, v);
    a0.deck[v]--; a0.rem--; a0.played++; a1.deck[v]--; a1.rem--; a1.played++;
    E0.applyMove(rules0, mk(E0, rules0, p, v), v, m0); // sanity: legal
    const key = (m) => { const g = mk(E0, rules0, p, v); E0.applyMove(rules0, g, v, m); return Array.from(g.cols).sort().join(',') + '|' + g.busts + g.stays + g.prev + g.score; };
    if (key(m0) === key(m1)) continue;
    res.flips++; res.flipWeight += w;
    // paired rollouts
    const rest = []; for (let x = 1; x <= 10; x++) for (let i = 0; i < p.deck[x - 1] - (x === v ? 1 : 0); i++) rest.push(x);
    const rng = E0.mulberry32(p.seed * 31 + v * 7 + p.rem); const diffs = [];
    for (let r = 0; r < NR; r++) {
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
      const sc = [m0, m1].map((m) => { const g = mk(E0, rules0, p, v); E0.applyMove(rules0, g, v, m); pol0.reset(); let i = 0; while (!g.over) { const x = rest[i++]; E0.applyMove(rules0, g, x, pol0.choose(g, x)); } return g.score; });
      diffs.push(sc[1] - sc[0]);
    }
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    res.flipRows.push({ seed: p.seed, rem: p.rem, card: v, w, mean, sd: Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (diffs.length - 1)), n: diffs.length, bust0: Array.from(E0.cloneGame ? [] : []).length });
  }
}
fs.writeFileSync(out, JSON.stringify(res));
