// smoke: the corr patch changes root values by the expected amounts and (for phase-only) leaves the chosen move unchanged on random positions
const E = require('./src/engine.js'); const fs = require('fs'); const path = require('path');
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../../engine/twentyone-solver/results/ship_nn.json'))); delete spec.deepen;
const R = E.DEFAULT_RULES, P0 = E.createSearcher(R, spec), P1 = E.createSearcher(R, Object.assign({}, spec, { corr: { a: 387.4, b: 7.58 } }));
let same = 0, n = 0, dv = [];
for (let seed = 1; seed <= 6; seed++) { const deck = E.shuffledDeck(seed, R), st = E.newGame(R); let i = 0;
  while (!st.over && i < 40) { const v = deck[i++]; const a = P0.choose(st, v), b = P1.choose(st, v); n++; if (a.stay === b.stay && a.col === b.col) same++; dv.push(b.value - a.value); E.applyMove(R, st, v, a); } }
console.log('decisions', n, 'same move', same, 'mean root-value shift', (dv.reduce((x, y) => x + y, 0) / dv.length).toFixed(1), 'min', Math.min(...dv).toFixed(1), 'max', Math.max(...dv).toFixed(1));
