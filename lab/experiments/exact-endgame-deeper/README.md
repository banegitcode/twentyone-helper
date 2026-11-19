# exact-endgame-deeper (owner: 21 Search)

Question: can the exact endgame start earlier than 13-14 cards inside ~2.0-2.5 s per card?  Write-up: `../../ideas/exact-endgame-deeper.md`.
Everything here was measured on this box while it was heavily loaded by other agents (load average 25-40 on 8 cores): **table-position counts are exact
and machine independent; times are single-process CPU milliseconds (process.cpuUsage), inflated by an unknown factor (cache/SMT contention)**.
Numbers copied from engine/twentyone-solver are labelled "unverified (from repo)" in the write-up and are not used for any conclusion.

## Layout
```
ref/gen_positions.c   plays the Referee's baseline engine (bench/native engines.h, expect1) on bench/shuffles/dev200 and dumps positions with N cards left
ref/brute.c           INDEPENDENT reference solver: individual cards, explicit column card lists, rules coded from RULES.md, raw-state memo, no symmetry
positions/            dev200_expect1.txt (3,202 positions, N = 6..24), N8/N9s/N10s subsets used for the brute-force check
js/common.js          loads the champion's engine.js/exact2.js READ-ONLY from engine/ (override with TWENTYONE_SRC=...), position -> engine state
js/crosscheck.js      compares a compressed solver (exact2 or exact3) with brute-force V0 and every action's Q, both kernels
js/timing.js          states + CPU ms per solve for N = 10..16 (solve = X.ponder to completion, choose = X.choose for the dealt card), empty table each time
js/exact3.js          copy of exact2.js (JS kernel) + optional restricted-action search (opts.restrict). With no restrict it is exact2 line for line
js/restrict_eval.js   states / time / expected point loss of the restricted searches vs the full one
js/ub_diag.py         tightness of the best sound upper bound (LP dual of card "prices") vs exact values; root-action pruning count
js/reuse.js           how much of later moves is already in the table after the first exact move
js/parallel_est.js    upper bound on speed-up from splitting one move over workers with private tables
js/pooled.js          pooled-clock exact endgame with the time-safety rule (adapter config pooled:K)
js/first_move.js      cost of the first exact move at K=16..18 on champion-like positions
js/gen_champion_positions.js  positions from the champion's own play (dev200)
js/pooled_tables.py   tables for the pooled section
js/hybrid.js          withExactEndFallback (same shape as exact2.withExactEnd) + depth-limited expectimax with an evaluator interface + stand-in evaluator
js/frontier_timing.js time of the depth-limited fallback
js/policy_exact3.js   drop-in for the champion's x_policies.createPolicy with a new spec key `exact3`
js/paired.js          small in-process paired runner (plumbing check; the Referee's compare.py is the real harness)
adapter.js            bench submission (JSON-lines stdin/stdout), see below
results/              all raw outputs (brute_N*.txt, t_*.json/log, restrict_eval.json, ub_diag.txt, parallel_est.json, frontier_timing.json, smoke*)
```

## Build / run
No build step for JS.  C tools: `gcc -O2 -std=gnu11 -o ref/brute ref/brute.c` (no g++ on this box; gcc builds C only), same for ref/gen_positions.c.
Python (only ub_diag.py): `/workspace/venv/bin/python` has scipy (`python3 -m venv /workspace/venv && /workspace/venv/bin/pip install scipy`).

```
# 1. positions (already in positions/)
./ref/gen_positions ../../bench/shuffles/dev200.txt expect1 0 200 6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,22,24 > positions/dev200_expect1.txt
# 2. correctness: brute force (N<=8 all 176+347 positions, N=9: 24, N=10: 8; N=10 takes minutes) vs compressed solver
./ref/brute positions/dev200_expect1.txt 8 > results/brute_N8.txt
node js/crosscheck.js results/brute_N8.txt positions/dev200_expect1.txt exact2 1     # last arg 1 = WASM kernel, 0 = JS kernel
node js/crosscheck.js results/brute_N8.txt positions/dev200_expect1.txt exact3 0
# 3. timing benchmark (champion's exact2, WASM) on my positions, or on the champion's own bench positions (--set his)
node js/timing.js --solver exact2 --set mine --N 12,13,14 --n 12 --cap 50000000 --logCap 27 --out results/t.json
# 4. other experiments
node js/restrict_eval.js 8,10,12 25 ; /workspace/venv/bin/python js/ub_diag.py results/t_exact2_mine_10_12.json
node js/reuse.js 12 8 ; node js/parallel_est.js 10,11,12 10 ; node js/frontier_timing.js
```

## Submission to the Referee
```
cd /workspace/21lab/bench
python3 compare.py --a "cmd:node champion/champion_adapter.js --config shipped52" \
                   --b "cmd:node ../experiments/exact-endgame-deeper/adapter.js --config deeper:16" --set set1000 --workers 4 --cache
```
Configs: `pooled:K[:logCap[:clockSec[:cpu|wall[:reserveSec]]]]` (pooled 3-minute clock: one big exact solve at the first move with <= K cards left, slices of 1M positions, give up for the move if memory > 70% of the table or the per-game clock would be endangered; RAM per worker ~0.05 GB + 0.8 GB x 2^(logCap-26); `--timelog FILE` writes per-game think times), `parity13` (exact3 with shipped52's own settings; must equal shipped52 game for game), `deeper:K[:budget[:logCap]]` (default budget 3,200,000
new positions per move, logCap 25; the budget is a position count so scores do not depend on machine load).  The champion's network/search is used unchanged
for every move above K cards and for any move whose exact solve does not finish.  Nothing under engine/ is modified.

## adapter2.js (new files only; adapter.js and the js files used by deeper:/pooled: are not touched by it)
* `adapter2.js --config pooledp:K[:logCap[:maxPositions[:tailTotal[:tailMove[:wallGuardSec]]]]]` -- deterministic pooled exact endgame, every limit a position count (js/pooledp.js, js/policy_p.js). See ideas/exact-endgame-deeper.md section 8.7.
* `adapter2.js --config deeperlog:K[:budget[:logCap]] --movelog FILE` -- plays exactly like adapter.js deeper:K and logs per move: cards left, exact solve finished or gave up, new positions (section 8.8). `adapter2.js --config shipped52` = the champion unchanged.
* History note: at 12:45 I had edited adapter.js (added a pooledp config) and js/pooled.js (deterministic mode) while the Referee was running; at 13:3x I restored both to their pre-12:45 content (pooled.js byte-identical to the backup taken before the edit; adapter.js = the same file minus the pooledp doc lines and branch). The 12:45 edits did not change pooled:K or deeper:N decisions (the new code paths were only active when `maxPositionsGame` was set; `clearEachGame` was off).
