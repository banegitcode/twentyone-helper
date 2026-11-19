const L = require('./lib.js'); const E = L.E; const rules = L.rules; const sh = L.J('shipped_policies.json')['52'];
for (const depth of [0, 1]) {
  const pol = E.createSearcher(rules, { depth, stayInner: sh.stayInner, cache: true, endgameK: 4, nn: sh.nn });
  const t0 = Date.now(); let sum = 0, n = 0;
  for (let s = 0; s < 40; s++) { const r = E.playGame(rules, pol, 5000 + s); sum += r.score; n++; }
  console.log('depth', depth, 'mean', (sum / n).toFixed(0), 'ms/game', ((Date.now() - t0) / n).toFixed(0));
}
