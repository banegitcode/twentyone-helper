const L = require('./lib.js'); const E = L.E; const pol = L.fastPolicy(); const rules = L.rules;
const X = L.exactSolver(21);
for (const KX of [8]) { const t0 = Date.now(); let tot = 0, nd = 0;
  for (let r = 0; r < 6; r++) { const deck = E.shuffledDeck(900 + r); const st = E.newGame(rules); pol.reset(); let i = 0;
    while (!st.over) { if (st.rem <= KX) { tot += X.value(st); break; } const v = deck[i++]; E.applyMove(rules, st, v, pol.choose(st, v)); nd++; } }
  console.log('KX', KX, 'ms/rollout', (Date.now() - t0) / 6, 'decisions', nd / 6); }
