'use strict';
// node src/z_policy.js [mode=shipped|full] [seed0=5000000] [games=20] [out]
// Shipped policy (results/shipped_policies.json key "52", deepen.budgetMs guard removed) with the exact endgame from
// src/exact.js (old) and from src/exact2.js (new), on the same shuffles, back to back in one process.
//   shipped: the spec as shipped (exact from 12 cards, 100,000 new positions per move, else the base search)
//   full:    the same with the per-move cap removed (complete solve from 12 cards)
// Every first point where the two games part is checked with a separate copy of the OLD solver: both moves' exact values.
const fs = require('fs'), path = require('path');
const E = require('./engine.js'), O = require('./exact.js'), N = require('./exact2.js'), R = E.DEFAULT_RULES;
const { createPolicy } = require('./x_policies.js');
const mode = process.argv[2] || 'shipped', seed0 = +process.argv[3] || 5000000, games = +process.argv[4] || 20;
const outF = process.argv[5] || path.join(__dirname, '../results/z_policy_' + mode + '.json');
const ship = JSON.parse(fs.readFileSync(path.join(__dirname, '../results/shipped_policies.json')))['52'];
const base = JSON.parse(JSON.stringify(ship)); delete base.exact; delete base.deepen.budgetMs;
const ex = Object.assign({}, ship.exact); if (mode === 'full') { ex.budget = 0; }
// shipped: exactly what x_policies.js builds (exact.js, table kept between games).  full: the same wrapper with a shared
// table that is emptied before each game (with no cap the old table would otherwise fill up over several games).
const XO = mode === 'full' ? O.createExact(R, { logCap: 27 }) : null;
const pOld = mode === 'full' ? O.withExactEnd(R, createPolicy(R, base), ex, XO) : createPolicy(R, Object.assign({}, base, { exact: ex }));
const pNew = N.withExactEnd(R, createPolicy(R, base), Object.assign({}, ex, mode === 'full' ? { logCap: 24 } : {}));
const XV = O.createExact(R, { logCap: 26 });
const rows = []; let s0 = 0, s1 = 0;
for (let g = 0; g < games; g++) {
  const seed = seed0 + g, deck = E.shuffledDeck(seed), a = E.newGame(R), b = E.newGame(R);
  pOld.reset(); pNew.reset(); if (XO) XO.clear(); let i = 0, same = true, div = null, ex0 = 0, ex1 = 0, late0 = 0, late1 = 0;
  while (!a.over || !b.over) {
    const v = deck[i++];
    const m0 = a.over ? null : pOld.choose(a, v), m1 = b.over ? null : pNew.choose(b, v);
    if (m0 && a.rem <= ex.xK) { late0++; if (m0.exact) ex0++; } if (m1 && b.rem <= ex.xK) { late1++; if (m1.exact) ex1++; }
    if (same && (m0.stay !== m1.stay || m0.col !== m1.col)) {
      same = false; div = { rem: a.rem, card: v, old: { stay: m0.stay, col: m0.col, exact: !!m0.exact }, new: { stay: m1.stay, col: m1.col, exact: !!m1.exact } };
      if (a.rem <= 13) try { XV.clear(); const q = XV.q(a, v), f = (m) => q.find((x) => x.stay === m.stay && x.col === m.col).value;
        div.oldMoveExactValue = f(m0); div.newMoveExactValue = f(m1); div.bestExactValue = Math.max(...q.map((x) => x.value)); } catch (e) { div.checkFailed = e.message; }
    }
    if (m0) E.applyMove(R, a, v, m0); if (m1) E.applyMove(R, b, v, m1);
  }
  s0 += a.score; s1 += b.score;
  rows.push({ seed, old: a.score, new: b.score, lateMoves: [late0, late1], exactMoves: [ex0, ex1], firstDifference: div });
  console.log(seed, 'old', a.score, 'new', b.score, 'exact moves', ex0 + '/' + late0, ex1 + '/' + late1, div ? JSON.stringify(div) : '');
}
const res = { mode, seed0, games, oldAverage: s0 / games, newAverage: s1 / games, identicalGames: rows.filter((r) => r.old === r.new).length, exactMovesOld: rows.reduce((x, r) => x + r.exactMoves[0], 0), exactMovesNew: rows.reduce((x, r) => x + r.exactMoves[1], 0), lateMoves: rows.reduce((x, r) => x + r.lateMoves[0], 0), rows };
fs.writeFileSync(outF, JSON.stringify(res, null, 1));
console.log('mode', mode, 'old average', res.oldAverage, 'new average', res.newAverage, 'identical games', res.identicalGames + '/' + games, 'exact late moves old', res.exactMovesOld, 'new', res.exactMovesNew);
