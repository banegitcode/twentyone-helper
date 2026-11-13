'use strict';
// Builds the policy lists for the backtests from the tuned weight files.
// w1..w3 were tuned before the streak rule was corrected (flat +250); w4 is refit under the escalating streak.
const fs = require('fs');
const L = (f) => JSON.parse(fs.readFileSync('results/' + f)).w;
const w1 = L('w_d1.json'), w2 = L('w2_d1.json'), w3 = L('w3_d2.json');
const w4 = fs.existsSync('results/w4_d2.json') ? L('w4_d2.json') : w3;
const flat = Object.assign({}, w4, { fut: [w4.fut[0], w4.fut[1], w4.fut[1] - (w4.fut[0] - w4.fut[1])] }); // 2nd bust costed like the 1st
const mk = (w) => ({ depth: 2, w, stayInner: 'forced', cache: true, endgameK: 4, deepen: { depth: 3, margin: 150, topK: 3 } });
const ship = mk(w4);
const specs = [
  { name: 'Baseline (2 cards, hand weights)', spec: { depth: 1 } },
  { name: 'Baseline weights, 3 cards', spec: { depth: 2 }, heavy: true },
  { name: 'Tuned v1 (CEM), 2 cards', spec: { depth: 1, w: w1 } },
  { name: 'Tuned v2 (+features), 2 cards', spec: { depth: 1, w: w2 } },
  { name: 'Tuned v3 (old streak rule), 3 cards', spec: { depth: 2, w: w3, stayInner: 'forced' } },
  { name: 'Tuned v4 (refit, new streak rule), 3 cards', spec: { depth: 2, w: w4, stayInner: 'forced' } },
  { name: 'v4, 2nd bust costed like 1st', spec: { depth: 2, w: flat, stayInner: 'forced' } },
  { name: 'v4 + exact endgame (last 6)', spec: { depth: 2, w: w4, stayInner: 'forced', endgameK: 6 } },
  { name: 'v4 + selective 4-card lookahead', spec: { depth: 2, w: w4, stayInner: 'forced', cache: true, deepen: { depth: 3, margin: 150, topK: 3 } } },
  { name: 'SHIPPED: v4 + selective + endgame 4', spec: ship },
  { name: 'v4, full 4 cards', spec: { depth: 3, w: w4, stayInner: 'forced', cache: true }, n: 3000, timeGames: 30, heavy: true },
  { name: 'MC rollouts (3-card base, 60 x 2-card)', spec: { type: 'mc', base: { depth: 2, w: w4, stayInner: 'forced' }, rollout: { depth: 1, w: w2 }, rollouts: 60, topK: 3, margin: 150 }, n: 1000, timeGames: 3, heavy: true },
];
fs.writeFileSync('results/specs.json', JSON.stringify(specs));
fs.writeFileSync('results/specs_dev.json', JSON.stringify(specs.filter((s) => !s.heavy)));
fs.writeFileSync('results/ship_full.json', JSON.stringify(ship));
for (const N of [25, 35, 45]) {
  const f = 'w4_h' + N + '.json';
  const rows = [{ name: 'Baseline', spec: { depth: 1 } }, { name: 'Full-deck weights (v4)', spec: ship }];
  if (fs.existsSync('results/' + f)) rows.push({ name: 'Weights tuned for ' + N + ' cards', spec: mk(L(f)) });
  fs.writeFileSync('results/specs_h' + N + '.json', JSON.stringify(rows));
}
console.log(specs.length, 'specs');
