'use strict';
// time the exact endgame solver: node src/egtime.js K [games] [horizon]
const E = require('./engine.js'); const R = E.DEFAULT_RULES;
const K = +process.argv[2], n = +process.argv[3] || 100, hz = +process.argv[4] || Infinity;
const pol = E.createSearcher(R, { depth: 1, endgameK: K });
let worst = 0, tot = 0, cnt = 0, first = 0, firstMax = 0, fc = 0;
for (let s = 1; s <= n; s++) {
  const deck = E.shuffledDeck(3000000 + s), st = E.newGame(R, { horizon: hz }); pol.reset(); let i = 0;
  while (!st.over) {
    const v = deck[i++]; const t = performance.now(); const m = pol.choose(st, v); const ms = performance.now() - t;
    if (m.exact) { tot += ms; cnt++; if (ms > worst) worst = ms; if (E.cardsLeftToPlay(st) === K) { first += ms; fc++; if (ms > firstMax) firstMax = ms; } }
    E.applyMove(R, st, v, m);
  }
}
console.log('K', K, 'horizon', hz, 'first exact move: mean', (first / fc).toFixed(2), 'ms, max', firstMax.toFixed(1), 'ms | all exact moves mean', (tot / cnt).toFixed(2));
