// Champion-network-implied expected future points V_nn(position) = sum_v p(v) * best-action value (Landon's search value, fast policy),
// for the variants (stays,busts) in {(2,0),(1,0),(0,0),(2,1),(2,2)}, on positions with stays=2,busts=0.
// node implied_values.js <positions.jsonl> <out.csv> <rem list comma> <maxPerRem>
const fs = require('fs'); const root = '/workspace/21lab/engine/twentyone-solver/';
const E = require(root + 'src/engine.js');
const shipped = JSON.parse(fs.readFileSync(root + 'results/shipped_policies.json'))['52'];
const rules = E.DEFAULT_RULES;
const pol = E.createSearcher(rules, { depth: 1, stayInner: shipped.stayInner, cache: true, endgameK: 4, nn: shipped.nn });
const rems = new Set(process.argv[4].split(',').map(Number)); const MAXP = +process.argv[5];
const cnt = {}; const rows = ['seed,rem,V20,V10,V00,V21,V22'];
const variants = [[2, 0], [1, 0], [0, 0], [2, 1], [2, 2]];
for (const l of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  if (!l.startsWith('{"t":"pos"')) continue; const p = JSON.parse(l);
  if (!rems.has(p.rem) || p.stays !== 2 || p.busts !== 0) continue;
  cnt[p.rem] = (cnt[p.rem] || 0) + 1; if (cnt[p.rem] > MAXP) continue;
  const vals = variants.map(([s, b]) => {
    let tot = 0;
    for (let v = 1; v <= 10; v++) {
      const c = p.deck[v - 1]; if (!c) continue;
      const st = E.newGame(rules); st.cols = Int32Array.from(p.cols); st.deck = Int32Array.from([0].concat(p.deck)); st.rem = p.rem;
      st.played = 52 - p.rem; st.busts = b; st.stays = s; st.prev = p.prev; st.score = 0; pol.reset();
      const r = pol.choose(st, v); tot += c * r.value;
    }
    return tot / p.rem;
  });
  rows.push([p.seed, p.rem].concat(vals.map((x) => x.toFixed(2))).join(','));
}
fs.writeFileSync(process.argv[3], rows.join('\n') + '\n');
