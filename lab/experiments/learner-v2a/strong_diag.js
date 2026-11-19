#!/usr/bin/env node
'use strict';
// Held-out Stay diagnostic with 21 Streak's STRONG labels (experiments/streak-measure/raw/reeval_strong_*.jsonl; dev200 positions, shipped52 play, >16 cards left).
// strong = mean over 64 paired random orders of [rollout(alt move) - rollout(champion move)] (tail = champion search, horizon 16, then net value, exact from 8 cards): >0 means the alternative is better.
// For each flagged decision we evaluate 1-ply  Q(move) = dpts + net(child)  with the champion network (v2a nets are gated to leaves with <=15 cards left, so above 16 cards they equal the champion: nothing to evaluate)
// and report which side the net's 1-ply Q picks vs the strong label, the Stay-involved subset (champion Stays, alt does not), and the net's implied marginal value of a Stay at these positions.
const fs = require('fs'), path = require('path');
const RM = path.join(__dirname, '../regret_map'), SM = path.join(__dirname, '../streak-measure/raw'); const L = require(path.join(RM, 'lib.js')); const E = L.E, R = L.rules;
const net = L.makeNNValue();
const dec = new Map(); for (const l of fs.readFileSync(path.join(RM, 'data_dev200_champion_all.jsonl'), 'utf8').split('\n')) { if (!l) continue; const d = JSON.parse(l); if (d.t === 'dec') dec.set(d.g + ':' + d.step, d); }
const acts = new Map(); for (const f of fs.readdirSync(RM).filter((x) => /^conf_[0-9]\.jsonl$/.test(x)).sort()) for (const l of fs.readFileSync(path.join(RM, f), 'utf8').split('\n')) { if (!l) continue; const r = JSON.parse(l); if (r.champAct) acts.set(r.g + ':' + r.step, r); }
const strong = []; for (const f of fs.readdirSync(SM).filter((x) => /^reeval_strong_\d\.jsonl$/.test(x)).sort()) for (const l of fs.readFileSync(path.join(SM, f), 'utf8').split('\n')) if (l) strong.push(JSON.parse(l));
const out = [];
for (const s of strong) {
  const d = dec.get(s.g + ':' + s.step), c = acts.get(s.g + ':' + s.step); if (!d || !c) continue;
  const st = L.mkState(d), v = d.v;
  const q = (a) => { const g = E.cloneGame(st); const ev = E.applyMove(R, g, v, { stay: a[0], col: a[1] }); const g2 = E.cloneGame(g); return { dpts: g.score - st.score, val: net(g2), child: g2 }; };
  const qc = q(c.champAct), qa = q(c.altAct);
  const dNet = (qa.dpts + qa.val) - (qc.dpts + qc.val);      // net's preference for alt over champion move (points)
  // implied marginal value of a Stay at the champion's child / alt's child: same child position with stays_left +1
  const sv = (g) => { if (g.stays >= 2) return null; const h = E.cloneGame(g); h.stays = g.stays + 1; return net(h) - net(g); };
  const sc = (a) => { const e = d.scores.find((x) => x.stay === a[0] && x.col === a[1]); return e ? (e.deep !== undefined ? e.deep : e.value) : null; }; const e1 = (a) => { const e = d.scores.find((x) => x.stay === a[0] && x.col === a[1]); return e ? e.value : null; };
  const scA = sc(c.altAct), scC = sc(c.champAct), e1A = e1(c.altAct), e1C = e1(c.champAct);
  out.push({ searchD: scA !== null && scC !== null ? scA - scC : null, search1: e1A !== null && e1C !== null ? e1A - e1C : null, g: s.g, step: s.step, rem: s.rem, strong: s.strong, se: s.strongSe, dNet, stayInvolved: !!(s.champ.stay && !s.alt.stay), altStay: !!s.alt.stay, champStay: !!s.champ.stay, svChamp: sv(qc.child), svAlt: sv(qa.child), stays: d.stays });
}
const m = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
function summ(name, rs) {
  if (!rs.length) return; const alt = rs.filter((r) => r.strong > 0), sig = rs.filter((r) => Math.abs(r.strong) > 2 * r.se);
  const netAlt = rs.filter((r) => r.dNet > 0).length, agree = rs.filter((r) => (r.dNet > 0) === (r.strong > 0)).length;
  const sw = rs.filter((r) => r.strong / r.se > 2); // decisions where the strong label says alt is better by >2 SE
  const x = rs.map((r) => r.strong), y = rs.map((r) => r.dNet), mx = m(x), my = m(y); let sxy = 0, sxx = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  console.log(`${name}: n=${rs.length} | mean strong(alt-champ) ${mx.toFixed(1)} | mean net 1-ply (alt-champ) ${my.toFixed(1)} | strong says alt better in ${alt.length}, net 1-ply says alt better in ${netAlt} | sides agree ${agree}/${rs.length} | strong z>2 for alt: ${sw.length}, of which net 1-ply picks alt: ${sw.filter((r) => r.dNet > 0).length} | slope(net on strong) ${(sxy / sxx).toFixed(2)}`);
}
summ('all 71', out); summ('Stay-involved (champion Stays, alt not)', out.filter((r) => r.stayInvolved)); summ('mid-game no-Stay-involved, rem 17-32', out.filter((r) => !r.stayInvolved && !r.champStay && !r.altStay && r.rem <= 32)); summ('rem >= 33 no-Stay', out.filter((r) => !r.stayInvolved && !r.champStay && !r.altStay && r.rem >= 33));
const si = out.filter((r) => r.stayInvolved); console.log('Stay-involved rows: net 1-ply says champion (Stay) better by', (-m(si.map((r) => r.dNet))).toFixed(1), 'pts on average; strong label says champion (Stay) better by', (-m(si.map((r) => r.strong))).toFixed(1), '(+-', (Math.sqrt(m(si.map((r) => r.se ** 2)) / si.length)).toFixed(1), ') -> net over-values the Stay line by', (-(m(si.map((r) => r.dNet)) - m(si.map((r) => r.strong)))).toFixed(1));
const sd = si.filter((r) => r.searchD !== null), s1 = si.filter((r) => r.search1 !== null); console.log('Stay-involved rows: search value alt-champ (logged root values; champion played champion move so this is <= 0 when the search itself chose it): final/deepened', m(sd.map((r) => r.searchD)).toFixed(1), '(n=' + sd.length + ') | 1-ply-only', m(s1.map((r) => r.search1)).toFixed(1), '(n=' + s1.length + ')');
const svs = out.map((r) => r.svChamp).filter((x) => x !== null); console.log('net-implied marginal value of one more Stay at these positions (champion child, mean):', m(svs).toFixed(1), 'pts (n=' + svs.length + ')');
fs.writeFileSync(path.join(__dirname, 'results/strong_diag_rows.json'), JSON.stringify(out));
// is the alternative deepened too?  (selective deepening: only the top candidates get the 2-deeper look; comparing a deepened value with a non-deepened one is apples vs oranges)
{ let nC = 0, nA = 0, both = 0, n = 0, dd = [], gap = [];
  for (const s of strong) { const d = dec.get(s.g + ':' + s.step), c = acts.get(s.g + ':' + s.step); if (!d || !c || !(s.champ.stay && !s.alt.stay)) continue; n++;
    const ec = d.scores.find((x) => x.stay === c.champAct[0] && x.col === c.champAct[1]), ea = d.scores.find((x) => x.stay === c.altAct[0] && x.col === c.altAct[1]);
    if (ec && ec.deep !== undefined) nC++; if (ea && ea.deep !== undefined) nA++; if (ec && ea && ec.deep !== undefined && ea.deep !== undefined) { both++; dd.push(ea.deep - ec.deep); }
    if (ec && ec.deep !== undefined) gap.push(ec.deep - ec.value); if (ea && ea.deep !== undefined) gap.push(NaN); }
  const g2 = []; for (const s of strong) { const d = dec.get(s.g + ':' + s.step), c = acts.get(s.g + ':' + s.step); if (!d || !c || !(s.champ.stay && !s.alt.stay)) continue; const ec = d.scores.find((x) => x.stay === c.champAct[0] && x.col === c.champAct[1]); if (ec && ec.deep !== undefined) g2.push(ec.deep - ec.value); }
  console.log(`Stay-involved (${n}): champion move deepened in ${nC}, alt deepened in ${nA}, both ${both}; deepened-minus-shallow value of the champion move averages ${m(g2).toFixed(1)} pts (n=${g2.length}); alt-champ when both deepened ${m(dd).toFixed(1)}`); }
