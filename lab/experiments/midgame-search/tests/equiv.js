'use strict';
// Position-level equivalence: msearch with the extra pass off must choose exactly what the champion's createSearcher chooses (rem >= 17), on positions
// reached by playing dev200 shuffles with the champion's own search.  usage: node tests/equiv.js [games=5]
const fs = require('fs'), path = require('path');
const C = require('../js/common.js'), E = C.E, R = C.R;
const MS = require('../js/msearch.js'), { loadNet } = require('../js/policy.js');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../engine/twentyone-solver/results/shipped_policies.json'), 'utf8'))['52'];
base.deepen.budgetMs = 0; const spec = JSON.parse(JSON.stringify(base)); delete spec.exact;
const nn = loadNet('ship_nn'); const champ = E.createSearcher(R, Object.assign({}, spec, { nn }));
const mine = MS.create(R, null, { nnLeaf: nn, dm: 150, dk: 3, dd: 2, depth: 1 });
const lines = fs.readFileSync(path.join(__dirname, '../../../bench/shuffles/dev200.txt'), 'utf8').trim().split('\n');
const N = +(process.argv[2] || 5); let pos = 0, diff = 0, valDiff = 0;
for (let g = 0; g < N; g++) {
  const codes = lines[g].trim().split(/\s+/).map(Number), vals = codes.map((c) => { const r = c % 13; return r === 0 ? 1 : r >= 9 ? 10 : r + 1; });
  const st = E.newGame(R); champ.reset(); mine.reset();
  for (let i = 0; i < 52 && !st.over; i++) {
    const v = vals[i];
    if (st.rem >= 17) {
      const a = champ.choose(st, v), b = mine.choose(st, v); pos++;
      if (a.stay !== b.stay || a.col !== b.col) { diff++; console.log('DIFF game', g, 'card', i, a.stay, a.col, b.stay, b.col); }
      for (let k = 0; k < a.scores.length; k++) if (Math.abs(a.scores[k].value - b.scores[k].value) > 1e-9) valDiff++;
      E.applyMove(R, st, v, a);
    } else E.applyMove(R, st, v, champ.choose(st, v));
  }
}
console.log('positions', pos, 'move diffs', diff, 'root value diffs', valDiff);
