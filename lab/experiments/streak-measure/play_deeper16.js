#!/usr/bin/env node
'use strict';
// Streak-audit replay driver (21 Streak). Plays the champion deeper:16 (same construction as experiments/exact-labeler/gen_positions.js --policy deeper16,
// = bench adapter --config deeper:16) on TRAINING shuffles (seed-base >= 3e9, same RNG/shuffle as gen_positions.js) and logs EVERY decision:
// observable pre-state, the dealt card, the policy's root action values (scores), the move, the event.  The deck ORDER is written only in the
// per-game 'end' record ("order") for OFFLINE analysis labels; it is never given to the policy (policy.choose gets st and v only).
//   node play_deeper16.js --first 0 --count 120 --stride 1 --out out.jsonl [--seed-base 3000000001]
// game g uses the shuffle of gen_positions.js game g. Workers split by (first, stride).
const fs = require('fs'), path = require('path');
const LAB = path.join(__dirname, '../..');
const SRC = path.join(LAB, 'engine/twentyone-solver/src');
const E = require(path.join(SRC, 'engine.js')), R = E.DEFAULT_RULES;
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const first = +arg('first', 0), count = +arg('count', 10), stride = +arg('stride', 1), seedBase = +arg('seed-base', 3000000001), out = arg('out', 'out.jsonl');
if (seedBase < 3e9) { console.error('seed-base must be >= 3e9'); process.exit(2); }
const benchKeys = new Set();
for (const f of ['set1000.txt', 'set5000.txt', 'dev200.txt']) for (const l of fs.readFileSync(path.join(LAB, 'bench/shuffles', f), 'utf8').split('\n')) if (l.trim()) benchKeys.add(l.trim().split(/\s+/).map((c) => Math.min((+c % 13) + 1, 10)).join(','));
const spec = JSON.parse(fs.readFileSync(path.join(SRC, '../results/shipped_policies.json')))['52'];
delete spec.exact; if (spec.deepen) spec.deepen.budgetMs = 0; spec.exact3 = { xK: 16, budget: 3200000, logCap: 25 };
const pol = require(path.join(LAB, 'experiments/exact-endgame-deeper/js/policy_exact3.js')).createPolicy(R, spec);
const fd = fs.openSync(out, 'a');
for (let n = 0; n < count; n++) {
  const g = first + n * stride;
  const rng = E.mulberry32(((seedBase + g * 7919) >>> 0) ^ 0x5bd1e995), ranks = Array.from({ length: 52 }, (_, i) => i % 13);
  for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ranks[i], ranks[j]] = [ranks[j], ranks[i]]; }
  const vals = ranks.map((r) => Math.min(r + 1, 10));
  if (benchKeys.has(vals.join(','))) { fs.writeSync(fd, JSON.stringify({ t: 'skip', g }) + '\n'); continue; }
  const st = E.newGame(R); pol.reset(); let step = 0, cpu0 = process.cpuUsage();
  while (!st.over) {
    const v = vals[step];
    const pre = { cols: Array.from(st.cols), deck: Array.from(st.deck), rem: st.rem, busts: st.busts, stays: st.stays, prev: st.prev, score: st.score };
    const m = pol.choose(st, v);
    const sc = (m.scores || []).map((a) => ({ stay: a.stay, col: a.col, value: a.value, deep: a.deep }));
    const ev = E.applyMove(R, st, v, m);
    fs.writeSync(fd, JSON.stringify({ t: 'dec', g, step, v, ...pre, stay: m.stay, col: m.col, exact: !!m.exact, mval: m.value, scores: sc, pts: ev.pts, sb: ev.streak || 0, perfect: ev.perfect || 0, bust: ev.bust, cleared: ev.cleared }) + '\n');
    step++;
  }
  const c = process.cpuUsage(cpu0);
  fs.writeSync(fd, JSON.stringify({ t: 'end', g, score: st.score, busts: st.busts, played: st.played, reason: st.reason, cpu: (c.user + c.system) / 1e6, counts: st.counts, order: vals.slice(0, step) }) + '\n');
}
fs.closeSync(fd);
