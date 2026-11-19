'use strict';
// cross-check x_exact against the engine's own exact endgame, then size reduced games
const E = require('./engine.js'); const { createExact } = require('./exact.js');
const R = E.DEFAULT_RULES;
const X = createExact(R, { logCap: 22 });
const eg = E.createSearcher(R, { depth: 1, endgameK: 7 });
const base = E.createSearcher(R, { depth: 1 });
let maxd = 0, n = 0;
for (let s = 1; s <= 40; s++) {
  const deck = E.shuffledDeck(900000 + s), st = E.newGame(R); eg.reset(); X.clear(); let i = 0;
  while (!st.over) {
    const v = deck[i++];
    let m;
    if (st.rem <= 7) {
      m = eg.choose(st, v); const q = X.q(st, v);
      for (const a of m.scores) { const b = q.find((x) => x.stay === a.stay && x.col === a.col); maxd = Math.max(maxd, Math.abs(a.value - b.value)); n++; }
    } else m = base.choose(st, v);
    E.applyMove(R, st, v, m);
  }
}
console.log('cross-check actions', n, 'max abs diff', maxd);
for (const [name, cfg, lc] of [['13 ranks x1, 4 cols', { copiesPerRank: 1 }, 22], ['A-10 x2 (20 cards), 4 cols', { ranks: 'A23456789T'.split(''), rankValues: [1,2,3,4,5,6,7,8,9,10], copiesPerRank: 2 }, 27], ['13 ranks x2 (26 cards), 3 cols', { copiesPerRank: 2, numCols: 3 }, 27]]) {
  if (process.argv[2] && !name.startsWith(process.argv[2])) continue;
  const r = E.compile(cfg), x = createExact(r, { logCap: lc }), t = Date.now();
  try { const v = x.value(E.newGame(r)); console.log(name, 'V*', v.toFixed(2), 'states', x.states(), ((Date.now() - t) / 1000).toFixed(1) + 's'); }
  catch (e) { console.log(name, e.message, ((Date.now() - t) / 1000).toFixed(1) + 's'); }
}
