#!/usr/bin/env node
'use strict';
// Re-label the Theorist's confirmed-flip decisions (dev200, shipped52, cards left >=17, no-empty-column and/or Stay types) with a STRONGER reference than 'reference A':
//   tail policy = the champion's own search (shipped52 network, depth 1 + selective deepening, NO exact endgame inside the rollout) instead of the 0-ply network,
//   horizon H plies (default 16) then the shipped network's value of the position, exact expectimax value once <= KX (8) cards remain,
//   paired (common random orders of the unseen multiset) champion move vs the Theorist's alternative, NFRESH fresh orders (seeds disjoint from the Theorist's).
// The random orders are sampled from the remaining multiset (legal: no knowledge of the true order); this is a labeler, not a policy.
//   node reeval.js <worker k> <K> <out.jsonl>   env: H=16 KX=8 NFRESH=64 TAIL=champ|fast MINREM=17
const path = require('path'), fs = require('fs');
const RM = path.join(__dirname, '../regret_map');
const L = require(path.join(RM, 'lib.js'));
const [wk, WK, out] = [+process.argv[2], +process.argv[3], process.argv[4]];
const P = (k, d) => (process.env[k] !== undefined ? +process.env[k] : d);
const H = P('H', 16), KX = P('KX', 8), NF = P('NFRESH', 64), MINREM = P('MINREM', 17), TAIL = process.env.TAIL || 'champ', SEEDOFF = P('SEEDOFF', 5551234);
const E = L.E, rules = L.rules, X = L.exactSolver(21), nnv = L.makeNNValue();
const { createPolicy } = require(path.join(L.ROOT, 'engine/twentyone-solver/src/x_policies.js'));
let pol;
if (TAIL === 'champ') { const s = L.championSpec(); delete s.exact; pol = createPolicy(rules, s); } else pol = L.rolloutPolicy(0);
const dec = new Map(); for (const l of fs.readFileSync(path.join(RM, 'data_dev200_champion_all.jsonl'), 'utf8').split('\n')) { if (!l) continue; const d = JSON.parse(l); if (d.t === 'dec') dec.set(d.g + ':' + d.step, d); }
const flips = [];
for (const f of fs.readdirSync(RM).filter((x) => /^conf_[0-9]\.jsonl$/.test(x)).sort()) for (const l of fs.readFileSync(path.join(RM, f), 'utf8').split('\n')) { if (!l) continue; const r = JSON.parse(l); if (r.fresh === undefined || r.rem < MINREM) continue; if (r.pf.nEmpty === 0 || r.champ.stay || r.alt.stay) flips.push(r); }
flips.sort((a, b) => a.g - b.g || a.step - b.step);
const fd = fs.openSync(out, 'a');
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
flips.forEach((r, idx) => {
  if (idx % WK !== wk) return; const d = dec.get(r.g + ':' + r.step); const st = L.mkState(d); const v = d.v; const t0 = Date.now();
  const ca = { stay: r.champAct[0], col: r.champAct[1] }, alt = { stay: r.altAct[0], col: r.altAct[1] };
  const rest = []; for (let x = 1; x <= 10; x++) for (let i = 0; i < d.deck[x] - (x === v ? 1 : 0); i++) rest.push(x);
  const rng = E.mulberry32(SEEDOFF + r.g * 131 + r.step * 7); const df = []; X.clear();
  for (let n = 0; n < NF; n++) {
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    df.push(rollout(st, v, alt, rest) - rollout(st, v, ca, rest));
  }
  const m = mean(df), se = Math.sqrt(df.reduce((s, x) => s + (x - m) * (x - m), 0) / (df.length - 1) / df.length);
  fs.writeSync(fd, JSON.stringify({ g: r.g, step: r.step, rem: r.rem, theoristFresh: r.fresh, theoristFreshSe: r.freshSe, strong: m, strongSe: se, n: NF, ms: Date.now() - t0, H, KX, tail: TAIL, pf: r.pf, champ: r.champ, alt: r.alt }) + '\n');
});
fs.closeSync(fd);
