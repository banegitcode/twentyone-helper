const L = require('./lib.js'); const E = L.E; const rules = L.rules; const sh = L.J('shipped_policies.json')['52']; const fs = require('fs');
const decs = []; for (const l of fs.readFileSync('data_dev200_champion_all.jsonl', 'utf8').split('\n')) { if (!l) continue; const d = JSON.parse(l); if (d.t === 'dec' && d.g < 6 && [14, 20, 30, 40].includes(d.rem)) decs.push(d); }
for (const depth of [1, 2, 3]) {
  const pol = E.createSearcher(rules, { depth, stayInner: sh.stayInner, cache: true, endgameK: 4, nn: sh.nn });
  const t0 = Date.now(); let same = 0;
  for (const d of decs) { pol.reset(); const st = L.mkState(d); const m = pol.choose(st, d.v); if (m.stay === d.stay && m.col === d.col) same++; }
  console.log('depth', depth, 'ms/decision', ((Date.now() - t0) / decs.length).toFixed(0), 'same as champion', same, '/', decs.length);
}
