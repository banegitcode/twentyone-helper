'use strict';
// node src/x_streaks.js <seedStart> <games>  where the points come from under the shipped policy, and how long streaks run
const E = require('./engine.js'); const { createPolicy } = require('./x_policies.js'); const R = E.DEFAULT_RULES;
const spec = require('../results/shipped_policies.json')['52'], pol = createPolicy(R, spec);
const s0 = +process.argv[2], n = +process.argv[3];
let base = 0, streak = 0, perfect = 0, total = 0; const runs = {}, perGame4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], sbTot = {}; let clears = 0;
for (let g = 0; g < n; g++) {
  const deck = E.shuffledDeck(s0 + g), st = E.newGame(R); pol.reset && pol.reset(); let i = 0, run = 0, n4 = 0, sc = 0;
  const end = () => { if (run) { runs[run] = (runs[run] || 0) + 1; if (run >= 4) n4++; } run = 0; };
  while (!st.over) {
    const v = deck[i++], p0 = st.prev, m = pol.choose(st, v), before = st.score; E.applyMove(R, st, v, m);
    const d = st.score - before;
    if (st.prev > 0 && d > 0 && !(st.over && st.prev === p0 && d === R.cfg.perfectBonus)) { const sb = R.sb[Math.min(p0, R.sb.length - 1)]; streak += sb; sc += sb; run++; clears++; } else end();
  }
  end(); perGame4[Math.min(9, n4)]++; total += st.score; if (st.busts === 0) perfect += R.cfg.perfectBonus;
}
console.log('games', n, 'avg', (total / n).toFixed(0), '| streak bonus per game', (streak / n).toFixed(0), '| perfect bonus per game', (perfect / n).toFixed(0), '| clears per game', (clears / n).toFixed(2));
console.log('streak runs per game by length:', Object.keys(runs).map((k) => k + ':' + (runs[k] / n).toFixed(2)).join('  '));
console.log('games with k streaks of 4+:', perGame4.map((c, k) => k + ':' + (100 * c / n).toFixed(1) + '%').join('  '));
