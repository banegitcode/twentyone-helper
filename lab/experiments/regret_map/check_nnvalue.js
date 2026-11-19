// sanity: champion root value of an action (depth-0 search) == immediate points + nnValue(afterstate)?
const L = require('./lib.js'); const E = L.E; const sh = L.J('shipped_policies.json')['52']; const fs = require('fs'); const nnv = L.makeNNValue();
const p0 = E.createSearcher(L.rules, { depth: 0, stayInner: sh.stayInner, cache: false, nn: sh.nn }); let n = 0, maxd = 0;
for (const l of fs.readFileSync('data_dev200_champion_all.jsonl', 'utf8').split('\n')) { if (!l) continue; const d = JSON.parse(l); if (d.t !== 'dec' || d.g > 3 || d.rem < 20) continue;
  const st = L.mkState(d); const m = p0.choose(st, d.v); for (const a of m.scores.slice(0, 3)) { const g = E.cloneGame(st); const ev = E.applyMove(L.rules, g, d.v, a); const mine = (ev.pts + (ev.streak || 0)) + nnv(Object.assign(g, { score: 0 })); maxd = Math.max(maxd, Math.abs(mine - a.value)); n++; } }
console.log('checked', n, 'max |searcher depth-0 value - (pts + nnValue)|', maxd.toFixed(3));
