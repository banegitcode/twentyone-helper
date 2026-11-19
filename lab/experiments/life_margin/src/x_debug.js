'use strict';
// node src/x_debug.js <N> <seedStart> <games> [minRegret=100]  print the policy's costly late-game mistakes next to exact values
const fs = require('fs'); const E = require('./engine.js'); const { createExact } = require('./exact.js'); const R = E.DEFAULT_RULES;
const [N, s0, games, minR] = [+process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5] || 100];
const ship = JSON.parse(fs.readFileSync(__dirname + '/../results/shipped_policies.json'))['52'];
const pol = E.createSearcher(R, ship), X = createExact(R, { logCap: 24 });
const col = (c) => c === 0 ? '--' : E.softTotal(c) + (E.aceOf(c) && E.hardOf(c) <= 11 ? 's' : '') + '/' + E.nOf(c);
for (let s = 0; s < games; s++) {
  const deck = E.shuffledDeck(s0 + s), st = E.newGame(R); pol.reset(); X.clear(); let i = 0;
  while (!st.over) {
    const v = deck[i++], m = pol.choose(st, v);
    if (st.rem <= N && st.rem > 4) {
      const q = X.q(st, v); let best = q[0]; for (const a of q) if (a.value > best.value) best = a;
      const mine = q.find((a) => a.stay === m.stay && a.col === m.col);
      if (best.value - mine.value >= minR) {
        console.log('seed', s0 + s, 'rem', st.rem, 'card', v, 'cols', Array.from(st.cols).map(col).join(' '), 'deck', Array.from(st.deck).slice(1).join(''), 'busts', st.busts, 'stays', st.stays, 'prev', st.prev, 'deepened', m.deepened);
        for (const a of m.scores) { const e = q.find((x) => x.stay === a.stay && x.col === a.col); console.log('   ', (a.stay >= 0 ? 'stay' + a.stay : '     '), 'col' + a.col, 'search', a.value.toFixed(0), a.deep != null ? 'deep ' + a.deep.toFixed(0) : '          ', 'exact', e.value.toFixed(0), a === m.scores.find((x) => x.stay === m.stay && x.col === m.col) ? '<- played' : '', e === best ? '<- best' : ''); }
      }
    }
    E.applyMove(R, st, v, m);
  }
}
