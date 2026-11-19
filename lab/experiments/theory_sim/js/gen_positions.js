// node gen_positions.js <seedStart> <count> <out.jsonl>
// Plays the champion-like FAST policy (shipped network, 1-card lookahead, forced-only stays, exact last 4; no deepen/exact-13)
// from Landon's engine, and logs (a) pre-draw positions at selected cards-left, (b) every decision (for Stay statistics).
const fs = require('fs'); const root = '/workspace/21lab/engine/twentyone-solver/';
const E = require(root + 'src/engine.js');
const shipped = JSON.parse(fs.readFileSync(root + 'results/shipped_policies.json'))['52'];
const spec = { depth: 1, stayInner: shipped.stayInner, cache: true, endgameK: 4, nn: shipped.nn };
const rules = E.DEFAULT_RULES; const pol = E.createSearcher(rules, spec);
const [s0, n, out] = [+process.argv[2], +process.argv[3], process.argv[4]];
const REMS = new Set([2, 4, 6, 8, 10, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44]);
const lines = [];
for (let s = s0; s < s0 + n; s++) {
  const deck = E.shuffledDeck(s); const st = E.newGame(rules); pol.reset(); let i = 0;
  while (!st.over) {
    if (REMS.has(st.rem)) lines.push(JSON.stringify({ t: 'pos', seed: s, rem: st.rem, cols: Array.from(st.cols), deck: Array.from(st.deck).slice(1), busts: st.busts, stays: st.stays, prev: st.prev, score: st.score }));
    const v = deck[i++]; const m = pol.choose(st, v);
    // number of plain placements that bust / score for this card
    let nb = 0, ns = 0, nopt = 0; for (let j = 0; j < 4; j++) { const p = rules.pts[st.cols[j] * 11 + v]; if (p < 0) nb++; else if (p > 0) ns++; }
    lines.push(JSON.stringify({ t: 'mv', seed: s, rem: st.rem, card: v, busts: st.busts, stays: st.stays, stay: m.stay, col: m.col, plainBust: nb, plainScore: ns, cols: Array.from(st.cols) }));
    E.applyMove(rules, st, v, m);
  }
  lines.push(JSON.stringify({ t: 'end', seed: s, score: st.score, busts: st.busts, played: st.played }));
}
fs.writeFileSync(out, lines.join('\n') + '\n');
