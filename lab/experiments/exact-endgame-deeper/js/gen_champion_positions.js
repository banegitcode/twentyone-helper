'use strict';
// node js/gen_champion_positions.js K1,K2,.. games out.json  -> champion-like positions: the champion's shipped52 network search (exact endgame removed,
// deepen.budgetMs 0) plays bench dev200 shuffles until K cards remain; the engine state and the dealt card are stored (same format as results/z_positions.json).
const fs = require('fs'), path = require('path'); const C = require('./common.js'); const E = C.E, R = C.R;
const Ks = process.argv[2].split(',').map(Number), games = +process.argv[3], out = process.argv[4];
const { createPolicy } = require(path.join(C.ENGINE_SRC, 'x_policies.js'));
const spec = JSON.parse(fs.readFileSync(path.join(C.ENGINE_SRC, '../results/shipped_policies.json')))['52']; delete spec.exact; if (spec.deepen) spec.deepen.budgetMs = 0;
const pol = createPolicy(R, spec); const kmin = Math.min(...Ks);
const lines = fs.readFileSync(path.join(__dirname, '../../../bench/shuffles/dev200.txt'), 'utf8').split('\n').filter((l) => l.trim()).slice(0, games);
const res = {}; Ks.forEach((k) => (res[k] = []));
lines.forEach((l, gi) => {
  const codes = l.trim().split(/\s+/).map(Number), deck = codes.map((c) => Math.min(c % 13 + 1, 10)), st = E.newGame(R); pol.reset(); let i = 0;
  while (!st.over && st.rem >= kmin) {
    if (Ks.includes(st.rem)) res[st.rem].push({ seed: gi, K: st.rem, cols: Array.from(st.cols), deck: Array.from(st.deck), rem: st.rem, busts: st.busts, stays: st.stays, prev: st.prev, card: deck[i] });
    const v = deck[i++]; E.applyMove(R, st, v, pol.choose(st, v));
  }
  process.stderr.write('game ' + gi + ' done\n');
});
fs.writeFileSync(out, JSON.stringify(res));
console.log(Object.keys(res).map((k) => k + ':' + res[k].length).join(' '));
