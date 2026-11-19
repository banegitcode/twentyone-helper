#!/usr/bin/env node
'use strict';
// Exact regret of the champion's FALLBACK SEARCH (shipped52 search without exact solve: 1-ply expectimax over the network + selective deeper look + exact last 4 cards, deepen.budgetMs = 0)
// on held-out decision positions of dec.jsonl, for a given leaf network: --alt none (champion) | --alt model.json (nnAlt used at leaves with lo..hi cards left).
// For each decision (parent position with k cards left) and each next card value v still in the deck: the search picks a move; regret = max_a Q_exact(a) - Q_exact(chosen),
// Q_exact = dpts + exact v(child) from the labels.  Output one JSON line per (decision, v):  {pid,k,v,n,regret,wrong}  plus a summary on stderr.
//   node regret_search.js --pos data/all.pos.jsonl --dec data/all.dec.jsonl --games hold.json [--alt none|model.json --lo 10 --hi 15] > out.jsonl
const fs = require('fs'), path = require('path');
process.env.TWENTYONE_SRC = path.join(__dirname, 'src');
const E = require('./src/engine.js'), R = E.DEFAULT_RULES, { createPolicy } = require('./src/x_policies.js');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const alt = arg('alt', 'none'), LO = +arg('lo', 10), HI = +arg('hi', 15);
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '../../engine/twentyone-solver/results/shipped_policies.json')))['52'];
const spec = JSON.parse(JSON.stringify(base)); delete spec.exact; if (spec.deepen) spec.deepen.budgetMs = 0;
if (alt !== 'none') { let m = JSON.parse(fs.readFileSync(path.resolve(alt), 'utf8')); if (m.nn) m = m.nn; spec.nnAlt = { layers: m.layers, scale: m.scale || 1000, lo: LO, hi: HI }; }
const pol = createPolicy(R, spec);
const rows = new Map(); for (const l of fs.readFileSync(arg('pos'), 'utf8').split('\n')) if (l.trim()) { const r = JSON.parse(l); rows.set(r.id, r); }
const hold = arg('games', null) ? new Set(JSON.parse(fs.readFileSync(arg('games'))).map(String)) : null;
function mkState(r) {
  const cols = new Int32Array(4);
  for (let j = 0; j < 4; j++) { const cs = r.cols[j]; if (!cs.length) continue; let hard = 0, ace = 0, not7 = 0; for (const v of cs) { hard += v; if (v === 1) ace = 1; if (v !== 7) not7 = 1; } cols[j] = E.mkCol(hard, ace, cs.length, not7); }
  const st = E.newGame(R); st.cols = cols; st.deck.fill(0); let rem = 0; for (let v = 1; v <= 10; v++) { st.deck[v] = r.deck[v - 1]; rem += st.deck[v]; }
  st.rem = rem; st.played = 52 - rem; st.horizon = Infinity; st.busts = r.busts; st.stays = r.stays; st.prev = Math.min(r.streak, R.sb.length - 1); st.score = 0; return st;
}
const key = (s) => Array.from(s.cols).sort((a, b) => a - b).join(',') + '|' + s.busts + s.stays + s.prev;
let nd = 0, sumReg = 0, wrong = 0, skipped = 0;
for (const l of fs.readFileSync(arg('dec'), 'utf8').split('\n')) {
  if (!l.trim()) continue; const d = JSON.parse(l); if (hold && !hold.has(String(d.game))) continue;
  const P = rows.get(d.pid); const st0 = mkState(P);
  for (const vg of d.vals) {
    const ids = vg.acts.map((a) => a.cid); if (ids.some((c) => c !== null && !rows.get(c).ok)) { skipped++; continue; }
    const qe = vg.acts.map((a) => a.dpts + (a.cid === null ? 0 : rows.get(a.cid).v));
    const keys = vg.acts.map((a) => { const s2 = E.cloneGame(st0); E.applyMove(R, s2, vg.v, { stay: a.mv[0], col: a.mv[1] }); return s2.over ? 'over' + a.dpts : key(s2); });
    const sc = E.cloneGame(st0); const m = pol.choose(sc, vg.v);
    const s3 = E.cloneGame(st0); E.applyMove(R, s3, vg.v, m); const kc = s3.over ? 'over' + (s3.score - st0.score) : key(s3);
    const ia = keys.indexOf(kc); if (ia < 0) { skipped++; continue; }
    const regret = Math.max(...qe) - qe[ia]; nd++; sumReg += regret; wrong += regret > 0.5;
    console.log(JSON.stringify({ pid: d.pid, game: d.game, k: d.k, v: vg.v, n: vg.n, regret, wrong: regret > 0.5 ? 1 : 0 }));
  }
}
console.error(JSON.stringify({ alt, decisions_v: nd, mean_regret: nd ? sumReg / nd : null, wrong_rate: nd ? wrong / nd : null, skipped }));
