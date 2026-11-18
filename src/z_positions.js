'use strict';
// node src/z_positions.js  -> results/z_positions.json
// Fixed benchmark / gate positions: the shipped policy (without deepening, for speed) plays seeded shuffles until K cards
// remain; the state and the next card are stored.  bench: 30 positions for K = 12, 13, 14.  gate: 45 positions for each
// K = 6..13 (360 positions, different seeds).
const fs = require('fs'); const E = require('./engine.js'); const R = E.DEFAULT_RULES;
const ship = JSON.parse(fs.readFileSync(__dirname + '/../results/shipped_policies.json'))['52'];
const spec = Object.assign({}, ship, { deepen: null }); delete spec.exact;
const pol = E.createSearcher(R, spec);
function gen(K, seed0, n) {
  const out = [];
  for (let s = seed0; out.length < n; s++) {
    const deck = E.shuffledDeck(s), st = E.newGame(R); pol.reset(); let i = 0;
    while (!st.over && st.rem > K) { const v = deck[i++]; E.applyMove(R, st, v, pol.choose(st, v)); }
    if (st.over) continue;
    out.push({ seed: s, K, cols: Array.from(st.cols), deck: Array.from(st.deck), rem: st.rem, busts: st.busts, stays: st.stays, prev: st.prev, card: deck[i] });
  }
  return out;
}
const bench = {}, gate = [];
for (const K of [12, 13, 14]) bench[K] = gen(K, 7100000 + K * 1000, 30);
for (let K = 6; K <= 13; K++) gate.push(...gen(K, 7200000 + K * 1000, 45));
fs.writeFileSync(__dirname + '/../results/z_positions.json', JSON.stringify({ bench, gate }));
console.log('bench', Object.keys(bench).map((k) => k + ':' + bench[k].length).join(' '), 'gate', gate.length);
