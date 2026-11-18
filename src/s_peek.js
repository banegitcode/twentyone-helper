'use strict';
// node src/s_peek.js <seedStart> <games>   What is it worth to SEE the next card before placing the current one?
// The peeking player tries every move for the current card, then asks the shipped search what the known next card
// would be worth from there, and keeps the move with the best total. Paired with the shipped player on the same deals.
const E = require('./engine.js'); const R = E.DEFAULT_RULES;
const spec = JSON.parse(JSON.stringify(require('../results/shipped_policies.json')['52'])); spec.deepen.budgetMs = 0; delete spec.exact;
const pol = E.createSearcher(R, spec), s0 = +process.argv[2], n = +process.argv[3];
const moves = (st) => { const o = []; for (let j = 0; j < 4; j++) o.push({ stay: -1, col: j }); if (st.stays > 0) for (let i = 0; i < 4; i++) if (st.cols[i]) for (let j = 0; j < 4; j++) o.push({ stay: i, col: j }); return o; };
let a = 0, b = 0, d2 = 0; const t = Date.now();
for (let g = 0; g < n; g++) {
  const deck = E.shuffledDeck(s0 + g, R);
  let st = E.newGame(R), i = 0; pol.reset();
  while (!st.over) { const v = deck[i++]; E.applyMove(R, st, v, pol.choose(st, v)); }
  const base = st.score;
  st = E.newGame(R); i = 0; pol.reset();
  while (!st.over) {
    const v = deck[i], w = deck[i + 1]; i++;
    if (w === undefined) { E.applyMove(R, st, v, pol.choose(st, v)); continue; }
    let best = null, bestV = -Infinity; const seen = new Set();
    for (const m of moves(st)) {
      const h = E.cloneGame(st); E.applyMove(R, h, v, m);
      const key = Array.from(h.cols).sort().join(',') + '|' + h.busts + '|' + h.stays + '|' + h.prev + '|' + h.score; if (seen.has(key)) continue; seen.add(key);
      const val = (h.score - st.score) + (h.over ? 0 : pol.choose(h, w).value);
      if (val > bestV) { bestV = val; best = m; }
    }
    E.applyMove(R, st, v, best);
  }
  a += base; b += st.score; d2 += (st.score - base) ** 2;
  if ((g + 1) % 25 === 0 || g === n - 1) { const k = g + 1, md = (b - a) / k, sd = Math.sqrt(Math.max(0, d2 / k - md * md)); console.log('games', k, '| shipped search', (a / k).toFixed(0), '| seeing the next card', (b / k).toFixed(0), '| gain', md.toFixed(0), '±', (1.96 * sd / Math.sqrt(k)).toFixed(0), ((Date.now() - t) / 1000).toFixed(0) + 's'); }
}
