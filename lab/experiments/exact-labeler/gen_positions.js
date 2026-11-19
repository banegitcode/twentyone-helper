#!/usr/bin/env node
'use strict';
// Training-position generator for the exact labeler: the champion policy plays games on OUT-OF-BENCH shuffles and every sampled position
// (taken after a placement, before the next card is revealed) is written in label.js input format.  JSON lines on stdout, progress on stderr.
//   node gen_positions.js --games 200 [--seed-base 3000000001] [--max-left 26] [--min-left 1] [--every 1] [--sample 1.0] [--lefts 16,14,13]
//                         [--policy shipped52|deeper16] [--bust-eps 0.0] [--bust-seek 0.0] [--with-exact] [--include-bench-check 1]
// Seeds: game g uses mulberry32(seedBase + g * 7919) (the engine's RNG; the bench sets are splitmix64 streams with seeds 2101000 / 2105000 / 2100200).
//   seed-base must be >= 3,000,000,000 (refused otherwise); in addition every generated shuffle is compared (value sequence) with all bench shuffles
//   (set1000, set5000, dev200: read-only) and skipped if identical.
// Policy: --policy shipped52 (default): champion shipped52 network + search WITHOUT the exact endgame (cheap; the early game is identical), or with its exact-13 via --with-exact.
//   --policy deeper16: the new champion deeper:16 (exact endgame from 16 cards, 3.2M new positions per move, logCap 25; --exact-budget / --exact-logcap) = what bench adapter.js --config deeper:16 plays; costs ~5-60 CPU s per game.
//   It sees only the observable state (columns, remaining counts, busts, stays, streak) and the dealt card: never the future order.
// Bust oversampling (to get more positions near / after busts, which a strong policy rarely visits):
//   --bust-eps p   with probability p per move ignore the policy and place the card on a uniformly random column (no Stay)
//   --bust-seek q  with probability q per move, if some column placement would bust, take one of the busting placements (uniform) instead of the policy move
// Output fields: id "<seedBase>:<game>:<moveIndex>", cols (card VALUES per column, Ace = 1, J/Q/K = 10, in dealt order), deck (13 counts by rank A,2..10,J,Q,K),
//   busts, stays, streak (consecutive scoring placements just completed, engine `prev`, 0..4), score (points so far, no Perfect Bonus), left (cards still unseen), game seed.
const fs = require('fs'), path = require('path');
const SRC = process.env.TWENTYONE_SRC || path.join(__dirname, '../../engine/twentyone-solver/src');
const E = require(path.join(SRC, 'engine.js')), R = E.DEFAULT_RULES, { createPolicy } = require(path.join(SRC, 'x_policies.js'));
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const games = +arg('games', 100), seedBase = +arg('seed-base', 3000000001), maxLeft = +arg('max-left', 26), minLeft = +arg('min-left', 1), every = +arg('every', 1);
const policyName = arg('policy', 'shipped52'), exactBudget = +arg('exact-budget', 3200000), exactLogCap = +arg('exact-logcap', 25);
const lefts = arg('lefts', '') ? new Set(arg('lefts').split(',').map(Number)) : null, sample = +arg('sample', 1), bustEps = +arg('bust-eps', 0), bustSeek = +arg('bust-seek', 0), withExact = argv.includes('--with-exact');
if (seedBase < 3e9) { console.error('refusing seed-base < 3,000,000,000 (bench shuffles come from seeds 2101000, 2105000, 2100200)'); process.exit(2); }
const BENCH = path.join(__dirname, '../../bench/shuffles'), benchKeys = new Set();
for (const f of ['set1000.txt', 'set5000.txt', 'dev200.txt']) { try { for (const l of fs.readFileSync(path.join(BENCH, f), 'utf8').split('\n')) if (l.trim()) benchKeys.add(l.trim().split(/\s+/).map((c) => Math.min((+c) % 13 + 1, 10)).join(',')); } catch (e) { console.error('warning: cannot read ' + f); } }
const spec = JSON.parse(fs.readFileSync(path.join(SRC, '../results/shipped_policies.json')))['52'];
if (!withExact) delete spec.exact; if (spec.deepen) spec.deepen.budgetMs = 0;
let pol;
if (policyName === 'deeper16') {   // champion deeper:16 = shipped52 search + exact endgame from 16 cards (exact3, budget `exactBudget` new positions per move, logCap 25): same as bench adapter --config deeper:16
  delete spec.exact; spec.exact3 = { xK: 16, budget: exactBudget, logCap: exactLogCap };
  pol = require(path.join(__dirname, '../exact-endgame-deeper/js/policy_exact3.js')).createPolicy(R, spec);
} else if (policyName === 'shipped52') pol = createPolicy(R, spec); else { console.error('unknown --policy'); process.exit(2); }
let skipped = 0, emitted = 0, busts0 = 0;
for (let g = 0; g < games; g++) {
  const rng = E.mulberry32(((seedBase + g * 7919) >>> 0) ^ 0x5bd1e995), ranks = Array.from({ length: 52 }, (_, i) => i % 13);   // rank 0..12 (A..K), 4 suits
  for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ranks[i], ranks[j]] = [ranks[j], ranks[i]]; }
  const vals = ranks.map((r) => Math.min(r + 1, 10));
  if (benchKeys.has(vals.join(','))) { skipped++; continue; }
  const prng = E.mulberry32(((seedBase + g * 104729) >>> 0) ^ 0x1b873593);   // only for the optional bust oversampling
  const st = E.newGame(R), cols = [[], [], [], []], seen = new Int32Array(13); pol.reset();
  for (let i = 0; i < 52 && !st.over; i++) {
    const v = vals[i]; let m = pol.choose(st, v);
    if (bustEps > 0 && prng() < bustEps) m = { stay: -1, col: Math.floor(prng() * 4) };
    else if (bustSeek > 0 && prng() < bustSeek) { const b = []; for (let j = 0; j < 4; j++) if (R.pts[st.cols[j] * 11 + v] < 0) b.push(j); if (b.length) m = { stay: -1, col: b[Math.floor(prng() * b.length)] }; }
    if (m.stay >= 0) cols[m.stay] = [];
    const ev = E.applyMove(R, st, v, m); seen[ranks[i]]++;
    if (ev.cleared) cols[m.col] = []; else cols[m.col].push(v);
    const left = 51 - i;
    if (st.over || left < minLeft || left > maxLeft || (lefts && !lefts.has(left)) || (i % every) !== 0 || (sample < 1 && prng() >= sample)) continue;
    process.stdout.write(JSON.stringify({ id: seedBase + ':' + g + ':' + i, cols: cols.map((c) => c.slice()), deck: Array.from(seen, (c) => 4 - c), busts: st.busts, stays: st.stays, streak: st.prev, score: st.score, left, game: seedBase + g * 7919 }) + '\n'); emitted++;
  }
  if (st.busts === 0) busts0++;
  if ((g + 1) % 20 === 0) console.error('games', g + 1, 'positions', emitted);
}
console.error(JSON.stringify({ games, skippedBenchCollisions: skipped, positions: emitted, zeroBustGames: busts0, seedBase, bustEps, bustSeek, withExact }));
