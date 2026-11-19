#!/usr/bin/env node
'use strict';
// Targeted 2-step-ish label, no full games. For champion Stay uses on set1000 shipped52 that were
// discretionary (a no-Stay placement existed) and, in the logged game, a forced bust happened
// within GAPMAX cards with Perfect still on the table and this Stay used the last Stay:
// label Stay vs the champion's best no-Stay root action with paired random orders of the
// unseen multiset (never the true remaining order). Tail = fast 0-ply network, horizon H,
// exact from KX. This is a labeler, not a policy.
//   nice -n 10 node stay_then_bust.js <worker k> <K> <out.jsonl>
const path = require('path'), fs = require('fs');
const RM = path.join(__dirname, '../regret_map');
const L = require(path.join(RM, 'lib.js'));
const [wk, WK, out] = [+process.argv[2], +process.argv[3], process.argv[4]];
const P = (k, d) => (process.env[k] !== undefined ? +process.env[k] : d);
const H = P('H', 16), KX = P('KX', 8), NF = P('NFRESH', 48), GAPMAX = P('GAPMAX', 8), SEEDOFF = P('SEEDOFF', 7712345);
const E = L.E, rules = L.rules, pol = L.rolloutPolicy(0), X = L.exactSolver(21), nnv = L.makeNNValue();

function nSafe(cols, v) {
  let n = 0; for (let j = 0; j < 4; j++) if (rules.pts[cols[j] * 11 + v] >= 0) n++;
  return n;
}

const by = new Map();
for (const l of fs.readFileSync(path.join(RM, 's1k_champ_all.jsonl'), 'utf8').split('\n')) {
  if (!l) continue; const d = JSON.parse(l);
  if (d.t !== 'dec') continue;
  if (!by.has(d.g)) by.set(d.g, []);
  by.get(d.g).push(d);
}
const targets = [];
for (const [g, decs] of by) {
  decs.sort((a, b) => a.step - b.step);
  let lastStay = null;
  for (const r of decs) {
    if (r.stay >= 0) lastStay = r;
    if (!r.bust) continue;
    let anySafe = false; for (let j = 0; j < 4; j++) if (rules.pts[r.cols[j] * 11 + r.v] >= 0) anySafe = true;
    if (anySafe || !lastStay) continue; // not a forced bust
    const gap = lastStay.rem - r.rem;
    const ns = nSafe(lastStay.cols, lastStay.v);
    if (ns === 0) continue;            // Stay itself was forced, could not be saved
    if (r.busts !== 0) continue;       // Perfect already gone
    if (lastStay.rem <= 16) continue;  // not above the exact/fallback horizon of interest
    if (gap > GAPMAX) continue;
    const alts = (lastStay.scores || []).filter((a) => a.stay < 0);
    if (!alts.length) continue;
    const best = alts.reduce((a, b) => ((b.value > a.value ? b : a)));
    targets.push({ g, stay: lastStay, bustRem: r.rem, gap, nSafe: ns, alt: { stay: best.stay, col: best.col }, champAct: { stay: lastStay.stay, col: lastStay.col } });
  }
}
targets.sort((a, b) => a.g - b.g || a.stay.step - b.stay.step);
if (wk === 0) process.stderr.write('targets ' + targets.length + ' H=' + H + ' KX=' + KX + ' NF=' + NF + '\n');

function rollout(st0, v, a, rest) {
  const g = E.cloneGame(st0); E.applyMove(rules, g, v, a); pol.reset(); let i = 0;
  while (!g.over) {
    if (g.rem <= KX) { let t; try { t = X.value(g); } catch (e) { X.clear(); t = X.value(g); } return g.score + t; }
    if (i >= H) return g.score + nnv(g);
    const x = rest[i++]; E.applyMove(rules, g, x, pol.choose(g, x));
  }
  return g.score;
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const fd = fs.openSync(out, 'a');
targets.forEach((t, idx) => {
  if (idx % WK !== wk) return;
  const d = t.stay; const st = L.mkState(d); const v = d.v; const t0 = Date.now();
  const rest = []; for (let x = 1; x <= 10; x++) for (let i = 0; i < d.deck[x] - (x === v ? 1 : 0); i++) rest.push(x);
  const rng = E.mulberry32(SEEDOFF + d.g * 131 + d.step * 11); const df = []; X.clear();
  for (let n = 0; n < NF; n++) {
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = rest[i]; rest[i] = rest[j]; rest[j] = tmp; }
    df.push(rollout(st, v, t.alt, rest) - rollout(st, v, t.champAct, rest));
  }
  const m = mean(df), se = Math.sqrt(df.reduce((s, x) => s + (x - m) * (x - m), 0) / (df.length - 1) / df.length);
  fs.writeSync(fd, JSON.stringify({
    g: d.g, step: d.step, rem: d.rem, gap: t.gap, bustRem: t.bustRem, nSafe: t.nSafe,
    stays: d.stays, fresh: m, freshSe: se, n: NF, ms: Date.now() - t0, H, KX, tail: 'fast',
    champAct: [t.champAct.stay, t.champAct.col], altAct: [t.alt.stay, t.alt.col]
  }) + '\n');
  process.stderr.write('wk' + wk + ' ' + idx + '/' + targets.length + ' g=' + d.g + ' rem=' + d.rem + ' gap=' + t.gap + ' d=' + m.toFixed(1) + ' se=' + se.toFixed(1) + ' ms=' + (Date.now() - t0) + '\n');
});
fs.closeSync(fd);
