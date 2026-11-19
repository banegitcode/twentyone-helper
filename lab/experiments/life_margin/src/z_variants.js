'use strict';
// node src/z_variants.js [out=results/z_variants.json]
// exact2.js against exact.js on rule variants (fewer columns, Stay breaks the streak, no / one Stay, flat streak bonus,
// two busts, six cards per column) in a 13-card game (one of each rank): the value of the whole game from the start and
// value + every action value at positions met in 30 random playouts.  Checks the parts the standard-rules gate cannot.
const fs = require('fs'), path = require('path');
const E = require('./engine.js'), O = require('./exact.js'), N = require('./exact2.js');
const outF = process.argv[2] || path.join(__dirname, '../results/z_variants.json');
const variants = [
  ['standard, 13 cards', {}], ['3 columns', { numCols: 3 }], ['2 columns', { numCols: 2 }], ['1 column', { numCols: 1 }],
  ['Stay breaks streak', { stayBreaksStreak: true }], ['no Stays', { maxStays: 0 }], ['one Stay', { maxStays: 1 }], ['three Stays', { maxStays: 3 }],
  ['flat streak bonus 300', { streakBonus: 300 }], ['two busts end the game', { maxBusts: 2 }], ['six cards per column', { maxCardsPerCol: 6 }],
  ['3 columns, Stay breaks streak, perfect 500', { numCols: 3, stayBreaksStreak: true, perfectBonus: 500 }],
  ['A-10 x2 (20 cards), 2 columns', { ranks: 'A23456789T'.split(''), rankValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], copiesPerRank: 2, numCols: 2 }],
];
const out = []; let allOk = true;
for (const [name, c] of variants) {
  const cfg = Object.assign({ copiesPerRank: 1 }, c), R = E.compile(cfg);
  const X0 = O.createExact(R, { logCap: 27 }), XS = [N.createExact(R, { logCap: 24, wasm: false }), N.createExact(R, { logCap: 24 })];
  const v0 = X0.value(E.newGame(R)), s0 = X0.states(); let maxD = 0, nQ = 0, s1 = 0;
  for (const X of XS) { const v1 = X.value(E.newGame(R)); maxD = Math.max(maxD, Math.abs(v1 - v0)); s1 = X.states(); }
  const rng = E.mulberry32(77);
  for (let g = 0; g < 30; g++) {
    const deck = E.shuffledDeck(8800000 + g, R), st = E.newGame(R); let i = 0;
    while (!st.over) {
      const v = deck[i++], q0 = X0.q(st, v), b0 = Math.max(...q0.map((a) => a.value));
      for (const X of XS) {
        const q1 = X.q(st, v); q0.forEach((a, k) => { maxD = Math.max(maxD, Math.abs(a.value - q1[k].value)); nQ++; });
        const m = X.choose(st, v), a = q0.find((x) => x.stay === m.stay && x.col === m.col); maxD = Math.max(maxD, Math.abs(a.value - b0), Math.abs(m.value - b0));
        maxD = Math.max(maxD, Math.abs(X.value(st) - X0.value(st)));
      }
      E.applyMove(R, st, v, q0[Math.floor(rng() * q0.length)]);      // random legal move: reaches odd positions
    }
  }
  const ok = maxD < 0.01; if (!ok) allOk = false;
  out.push({ name, wholeGameValue: v0, oldEntries: s0, newEntries: s1, actionValuesCompared: nQ, maxAbsDiff: maxD, ok });
  console.log(name.padEnd(44), 'V', v0.toFixed(2), 'entries old', s0, 'new', s1, 'x' + (s0 / s1).toFixed(1), 'checked', nQ, 'max diff', maxD.toExponential(2), ok ? 'ok' : 'FAIL');
}
fs.writeFileSync(outF, JSON.stringify({ allOk, variants: out }, null, 1));
console.log(allOk ? 'ALL OK' : 'FAILURES');
