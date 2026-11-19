// Random-policy traces from Landon's engine, to cross-check scoring in theory_sim.
// Output lines: seed | then per move "stay col pts" ... | final score
// node crosscheck_gen.js <seedStart> <count> <out.txt>
const E = require('/workspace/21lab/engine/twentyone-solver/src/engine.js');
const [s0, n, out] = [+process.argv[2], +process.argv[3], process.argv[4]];
const rules = E.DEFAULT_RULES; const lines = [];
let rs = 12345; const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
for (let s = s0; s < s0 + n; s++) {
  const deck = E.shuffledDeck(s); const st = E.newGame(rules); const mv = []; let i = 0;
  // mix of strategies: "smart-ish": prefer a column that scores, else random; random stays 5%
  while (!st.over) {
    const v = deck[i++]; let stay = -1;
    if (st.stays > 0 && rnd() < 0.08) stay = Math.floor(rnd() * 4);
    // choose scoring column if any
    const cols = Array.from(st.cols); if (stay >= 0) cols[stay] = 0;
    let col = -1; const sc = [];
    for (let j = 0; j < 4; j++) if (rules.pts[cols[j] * 11 + v] > 0) sc.push(j);
    if (sc.length && rnd() < 0.9) col = sc[Math.floor(rnd() * sc.length)];
    else if (s % 2 === 1 && rnd() < 0.8) { // 'builder': put card on the safe column with most cards (builds 5-card/777 columns)
      let bj = -1, bn = -1; for (let j = 0; j < 4; j++) { if (rules.pts[cols[j] * 11 + v] < 0) continue; const nn = (cols[j] >> 6) & 7; if (nn > bn) { bn = nn; bj = j; } } col = bj >= 0 ? bj : Math.floor(rnd() * 4); }
    else { const safe = []; for (let j = 0; j < 4; j++) if (rules.pts[cols[j] * 11 + v] >= 0) safe.push(j); col = (safe.length && rnd() < 0.85) ? safe[Math.floor(rnd() * safe.length)] : Math.floor(rnd() * 4); }
    const ev = E.applyMove(rules, st, v, { stay, col });
    mv.push(stay + ',' + col + ',' + (ev.pts + ev.streak) + ',' + (ev.bust ? 1 : 0));
  }
  lines.push(s + ' ' + st.score + ' ' + st.busts + ' ' + st.counts.s21 + ' ' + st.counts.s777 + ' ' + st.counts.s5 + ' ' + st.counts.s521 + ' | ' + mv.join(' '));
}
require('fs').writeFileSync(out, lines.join('\n') + '\n');
