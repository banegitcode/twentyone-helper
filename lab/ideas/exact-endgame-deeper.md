# Idea: exact-endgame-deeper (21 Search)

Status: **proposal + measurements; no score claim.** The only paired runs done are 4-game plumbing smoke tests (see "Handing it to the Referee").
Conventions: **MEASURED** = produced on this box by code in `experiments/exact-endgame-deeper/` (box heavily loaded, load average 25-40 on 8 cores; table-position
counts are exact and machine independent, times are single-process CPU ms and inflated by an unknown factor). **unverified (from repo)** = taken from
engine/twentyone-solver logs/README, not used for any conclusion. **GUESS** = extrapolation or opinion.

## 1. Idea
Make the exact endgame start earlier than 13-14 cards (target 18-24) inside ~2.0-2.5 s per card, by (a) state compression, (b) bound-based pruning,
(c) transposition-table reuse, and (d) a depth-limited expectimax with an evaluator at the frontier for positions that still do not fit.

## 2. Why (and what was already in the champion)
Read from the code (engine/twentyone-solver/src/exact.js, exact2.js, z_kernel.ts) - not from its logs:
| ingredient (my original plan) | already in champion's exact2? |
|---|---|
| deck as value-class counts (10 classes, chance node over classes with probability count/rem) | yes (mixed-radix deck index, per-deck tables) |
| columns sorted canonically before hashing | yes (sorting network on class ids) |
| column compression (n cards, hard total, ace flag, all-7s flag) | yes, and stronger: **deck-aware column classes** (two columns are merged when every sub-sequence of the remaining deck gives the same outcomes), recomputed per deck |
| streak/busts/stays in the key, streak dropped when no card can score | yes (table per busts x stays x streak) |
| Stay cap (stays that can never be used dropped; Stay only as "clear i, put card there", never with an empty column) | yes |
| transposition table, one-card positions computed inline, table kept between moves, budgeted solves + `ponder` | yes |
| WASM kernel | yes |
| bound-based pruning (alpha-beta / upper bounds) | **no** - tested here, see 4.2 |
| frontier-evaluator fallback | partly: when a solve does not finish the move falls back to the champion's own NN search (`base.choose`), solved positions are kept |
So my original compressed solver would have been a weaker re-implementation of exact2. I did not build it; I built what the champion lacked for checking and for extending it.

## 3. Correctness (MEASURED)
Independent reference `ref/brute.c`: rules coded from RULES.md, **individual cards** (deck = subset of the unseen cards, each equally likely), explicit column card lists, raw-state memo, no
symmetry, every legal Stay (any non-empty column, any placement column, one Stay per card as in the Referee's default) - so it also tests exact2's "Stay only as clear-i-and-place-on-i" cut.
Positions: Referee baseline engine `expect1` on bench `dev200` (3,202 positions, N = 6..24; N = cards still to place, current card included).
| N | positions | actions compared | max abs V0 diff | max abs Q diff | mismatches (>0.01) |
|---|---|---|---|---|---|
| 6,7 | 347 | 1,552 | 2.9e-5 | 8.1e-5 | 0 |
| 8 | 176 | 812 | 6.5e-5 | 1.2e-4 | 0 |
| 9 | 24 | 108 | 3.3e-5 | 1.0e-4 | 0 |
| 10 | 8 | 48 | 1.6e-5 | 1.1e-4 | 0 |
exact2 WASM and JS kernels and my `exact3` (unrestricted) all agree with brute force on V0 and on **every** legal action's Q; `choose()` returned an optimal action in all positions
(differences are float32 storage rounding). Brute-force search lines never produced a streak above 4 (matches the logic: every scoring card clears a distinct column and an empty column cannot score).
This verifies exact2 only for N <= 10 (brute force cost), which is where the table logic is already exercised; it does not prove N = 14+.

## 4. What I measured toward "deeper"
### 4.1 Cost of the champion's exact2 (WASM kernel), from an empty table (MEASURED, loaded box, CPU ms)
Positions: "mine" = Referee expect1 baseline policy (more busts, fewer Stays left -> cheaper); "his" = the 30 positions per K the champion's shipped policy produced
(`results/z_positions.json`; positions are only inputs, states recomputed here: e.g. seeds 7112000/1/2 give 231,770 / 205,377 / 3,258,690 stored positions, identical to his log (unverified from repo), CPU 1.3x his logged time).
`solve` = complete value of the position; `choose` = the on-tap query for the dealt card (what a move needs). Full table: `results/tables.txt`.
| N | set (n) | choose positions med / p90 / max | choose CPU-ms med / p90 / max | share of positions whose choose() fits 3.2M new positions (~2 s) |
|---|---|---|---|---|
| 12 | his (12) | 521k / 2.97M / 4.1M | 340 / 2,614 / 4,067 | 10/12 |
| 13 | his (12) | 1.12M / 3.07M / 11.1M | 725 / 2,750 / 12,782 | 10/12 |
| 14 | his (5, partial, first five only) | 14.6M / 15.1M / 17.6M | 20,188 / 21,342 / 22,086 | 0/5 |
| 10 | mine (12) | 38.7k / 57k / 92k | 18 / 28 / 52 | 12/12 |
| 12 | mine (12) | 105k / 432k / 518k | 52 / 262 / 333 | 12/12 |
| 13 | mine (12) | 276k / 1.03M / 2.1M | 148 / 747 / 1,965 | 12/12 |
| 14 | mine (12) | 579k / 1.62M / 9.4M | 324 / 1,240 / 11,935 | 11/12 |
| 15 | mine (6) | 1.08M / 2.67M / 12.0M | 770 / 2,254 / 15,293 | 5/6 |
| 16 | mine (6) | 2.08M / 4.91M / 41.4M | 1,668 / 5,464 / 66,357 | 3/6 |
Throughput ~1.6M table positions per CPU second for these SMALL solves (<= ~5M positions, tables that stay in cache; see section 8.7: it falls to 0.65-0.9M/s for the 15-45M-position solves of real games, so do not use 1.6M/s for a game-level budget). Samples are small; p90/max over 5-12 positions are rough. Position cost varies by >100x with the position (Stays left, busts, columns).
**Answer to "max N within ~2.0 s per card":** champion-like positions (his): median N = 13, p90 N <= 12 (N = 12: p90 2.6 s). Easier positions (mine): median N = 16, p90 N = 14-15. N = 18 or more is far outside:
stored positions grow ~2-3x per extra card (13 -> 14 -> 15 -> 16 medians on "mine": 0.28M, 0.58M, 1.08M, 2.08M choose positions), so **GUESS** N = 18 needs ~10-30M median / 100M+ p90 positions (~10-60 s CPU, GBs of table), N = 20+ 10^9 and up.
His count_states.json says 1.3e13 positions at 24 cards left - unverified (from repo), not needed for the conclusion.

### 4.2 Bound-based pruning: does not prune (MEASURED/CALCULATED)
Best sound upper bound I could derive (`js/ub_diag.py`): LP over per-card-value "prices" so that every possible clear of a column is paid for (base points <= sum of price x cards available
in columns + deck), plus 437.5 per clear for streak (a run of 4 pays 1750) plus 1000 if no bust yet. The LP base alone is only 1.0-1.3x the exact value, but it has no streak/perfect parts; the sound total is
**1.6-2.2x the exact value at the root** (N = 10, 11, 12; 60 positions; median 2.06 / 2.18 / 2.17). At the root, `points + UB(child) <= best exact Q` held for **4 of 288 actions (1.4%)**. Deeper nodes have a larger relative gap
(the +1000 and streak allowances do not shrink). Conclusion: with sound analytic bounds, alpha-beta / branch-and-bound cuts ~nothing; a bound tight enough (<~1.1x) would itself need a search of comparable cost. I did not
add pruning code to the solver, since the diagnostic shows the best-case prune rate. (A weaker closed-form bound is looser still.)

### 4.3 Restricted-action (approximate) exact search: bad trade (MEASURED)
`exact3` option `restrict` = {noBust: never bust voluntarily when a non-bust move exists; greedyScore: if a move clears a column, only consider clearing moves; stayForced: Stay only when every placement busts}.
A restricted search value is the **true expected score of the restricted policy**, so `V_full - V_restricted` is its exact expected loss. 25 positions per N, JS kernel, same positions:
| variant | stored positions vs full (N=8 / 10 / 12) | mean loss in points (N=8 / 10 / 12) |
|---|---|---|
| noBust | 0.49 / 0.46 / 0.49 | 76 / 90 / 117 |
| greedyScore | 0.65 / 0.71 / 0.69 | 105 / 123 / 123 |
| stayForced | 0.99 / 0.97 / 0.95 | 2.5 / 3.3 / 5.0 |
| all three | 0.29 / 0.27 / 0.28 | 155 / 179 / 202 |
Saving 2-4x costs 76-200 points: useless (voluntary busts and non-greedy clears are often exactly right in the endgame). `stayForced` saves only 1-5%.

### 4.4 Reuse across consecutive cards: the cost is the FIRST exact move only (MEASURED)
`js/reuse.js` (8 positions at N = 12, random deal order, exact move each turn): after the first `choose()` at N0 **every later move needed 0 new table positions** (also when `value(root)` was solved first).
Total exact-endgame cost = cost of the first exact move at the start card N0; the later N0-1 moves are table lookups. Consequences: (1) the "2.5 s per card" budget only has to cover one move at N0;
(2) if the 3-minute clock is a pooled game clock rather than a hard per-move limit, the early moves cost milliseconds and a large bank can be spent once at N0 (e.g. 60 s ~ 100M positions ~ N = 16-17 on typical positions; **GUESS from the growth rates above**) - **question for Landon/lead: is thinking time pooled?**
(3) the champion's budgeted scheme already benefits: a move whose solve is cut off keeps its solved positions, later moves finish it.

### 4.5 Parallelism (MEASURED upper bound)
Splitting the first move over workers with private tables by root action: median 4 distinct actions, redundant work 1.6x -> speed-up bound **1.25-1.36x** at N = 10-12 even with 8 workers. Not worth it; a shared-memory table
(SharedArrayBuffer + atomics, WASM threads) would be needed, which I did not build.

### 4.6 Frontier-evaluator fallback (built; timing MEASURED, no score)
`js/hybrid.js`: `withExactEndFallback(rules, base, {xK, budget, logCap, evaluator, depth})`, same shape as `exact2.withExactEnd`. Evaluator interface: `evaluator({cols, deck, rem, busts, stays, prev}) -> expected points still to come`
(state after a placement, before the next card; counts only). With a stand-in heuristic (timing only), depth-limited search takes median 0.05-0.07 ms (1 card ply), 1.7-6.5 ms (2 plies, up to 330 ms worst) at N = 16-24.
The champion's own `base.choose` (NN, 1/2-ply, selective deeper) is already such a fallback, and is the default when no evaluator is given; I expect no gain from replacing it by a stand-in.

## 5. Expected gain
- CALCULATED: nothing about score. What I can state: exactly solving more cards cannot lower the expected score (it is the optimum of the true objective from that point), and the first exact move is the only cost (4.4).
- unverified (from repo): exact endgame at 13 / 14 / 15 cards scored 8941 / 8966 / 8980, i.e. ~+14 to +25 per extra card with shrinking returns, measured with a per-move cap/early version. The Referee measured the champion `shipped52` (xK 13, 100k positions/move) at **8,871.7 +- 38.0** (set1000).
- GUESS: going from the shipped 13-card/100k-budget setting to a complete solve from 15-16 cards with a ~3M-position budget is worth +10 to +50 points (needs >= 1000 paired games to see; SE of a paired 1000-game diff is probably 10-25). Going past 16 is not possible within 2 s with this solver on champion-like positions.
- Honest summary: the target of 18-24 cards is **not reachable** with exact compression (the champion already has the strong compression); realistic reach is 14-16 cards, mostly by raising the budget/threshold, or more if the clock is pooled (4.4).

## 6. Exact algorithm (what is delivered)
Champion's exact2 kernel (memoised expectimax over value-class deck counts, sorted deck-aware column classes, tables per busts x stays x streak) unchanged; `exact3.js` is the same code with an optional
`restrict` (off by default = identical to exact2: verified by brute-force check and 4 games game-for-game). `hybrid.withExactEndFallback` = exact `choose(st, v, budget)` when rem <= xK, else (or when the budget is hit) the
champion's search (or the evaluator-based depth-limited search). Budget is counted in NEW table positions per move, not seconds, so results do not depend on machine load.
Rule interpretations (same as RULES.md / bench sim): one Stay per card; Stay does not break a streak; three 7s = exactly three cards all 7s, 600 instead of 400; soft ace counts 11 unless that busts, soft 21 clears;
5 cards totalling 21 pays 1000, 5 cards <21 pays 800, a bust on the 5th card is a bust; streak bonus table 250/500/1000 for the 2nd/3rd/4th scoring card (a 5th+ is unreachable: 4 columns, every scoring card clears a distinct column);
Perfect Bonus +1000 added at the end of the deck if no bust (3rd bust ends the game with no bonus). Two Stays before a single card are not considered (same as the champion/Referee default).

## 7. Handing it to the Referee
Submission (all under experiments/exact-endgame-deeper/, engine/ untouched): `adapter.js`, JSON-lines protocol of bench/README.md, modeled on bench/champion/champion_adapter.js.
```
cd /workspace/21lab/bench
python3 compare.py --a "cmd:node champion/champion_adapter.js --config shipped52" \
                   --b "cmd:node ../experiments/exact-endgame-deeper/adapter.js --config deeper:16" --set set1000 --workers 4 --cache
```
Configs: `parity13` (exact3 with shipped52's own parameters), `deeper:K[:budget[:logCap]]` (defaults budget 3,200,000 new positions per move ~ 2 s, logCap 25 = ~400 MB per worker), `...:eval` (stand-in evaluator fallback, plumbing only).
Suggested ladder for the Referee (each is one paired run; cost per game is dominated by the first exact move): `deeper:14`, `deeper:15`, `deeper:16`. Smoke tests I ran (4 games, set1000, `--limit 4`, NOT evidence): `parity13` vs shipped52 = identical per game (+0.0 +- 0.0, as required);
`deeper:16` vs shipped52 = +312.5 +- 236.6 (z 1.3, n = 4, noise). Raw files: `results/smoke*/`. Static scan (`audit.py --static` on adapter.js, js/hybrid.js, exact3.js, policy_exact3.js, common.js): 0 HIGH hits, passed (the analysis scripts that read dev200 positions are flagged HIGH by design and are not on the adapter's path). The dynamic future-order audit has not been run; it only touches counts/columns/busts/stays/streak/current card like the champion adapter (the code path is the champion's own exact2 + my wrapper), but the Referee should run it.
Blockers for a paired test: none for plumbing. Open: (1) per-game runtime on a loaded box (first exact move can take several seconds; budget is deterministic so scores are reproducible, wall time is not); (2) whether thinking time is pooled (4.4) - would justify `deeper:17+` with budget ~1e8 and logCap 27 (1.6 GB/worker); (3) 1000-game cost: estimate ~1.5-3x the shipped52 cost per game (GUESS).

## 8. Pooled clock (follow-up, 2026-11-18; Landon confirmed the 3-minute clock is pooled over the whole game)
All of 8 is MEASURED on a heavily loaded box (load average 22-34 on 8 cores) unless labelled CALCULATED or GUESS. CPU = process.cpuUsage of the worker; wall = real time (about 2.3-2.7x CPU here because of the load).
Raw files: `results/first_move_K16_18.json/.log`, `results/first_move_K17_logCap27.log`, `results/think_pooled*.jsonl`, `results/smoke_pooled*.log`, `results/pooled_tables.txt`; code `js/pooled.js`, `js/first_move.js`, `js/gen_champion_positions.js`, `adapter.js`.

### 8.1 Design (CALCULATED from the clock rules and measured reuse)
Because every later move is a table lookup (section 4.4), the exact endgame costs one big move. `adapter.js --config pooled:K[:logCap[:clockSec[:cpu|wall[:reserveSec]]]]`
(`js/pooled.js`) does, at the first move with <= K cards left: solve in slices of 1M new table positions and, between slices, give up *for this move* (play the champion's normal search, keep the solved positions) if
- **memory**: table positions > 70% of capacity (`0.70 * 2^logCap`; measured capacity before the table is full is 0.72-0.76 x 2^logCap positions; a full table is cleared and the work is lost), or
- **clock**: time spent in this solve > `allowed = min(clockSec - used - reserveSec - estBase * cardsLeft, maxSolveSec - solveUsed)`, with `used` = this game's think time so far, `reserveSec` = 20 s margin for UI/network, `estBase` = running mean of the champion search's ms per move
  (150 ms until measured; the remaining moves are charged at full search price = worst case), `maxSolveSec` = 100 s cumulative solve time per game.
After a memory give-up the table is freed and the next move (about 2.5x cheaper) is tried; at most 2 memory give-ups per game. Once the 100 s are used up only 20k-position slices are tried (to pick up answers already in the table).
Clock units: `cpu` (default for the bench: independent of box load, scores reproducible except when the clock binds) or `wall` (production: the real clock). Budgets are position counts, so the bench result does not depend on how loaded the box is, except through the clock rule.

### 8.2 Memory per worker (MEASURED + CALCULATED)
Table = `12 << logCap` bytes (virtual, touched as used): logCap 25: 403 MB, **26: 806 MB (default)**, 27: 1.61 GB. Measured RSS of a worker: 255 MB at 12M stored positions, 400 MB at 22M, 777 MB at the 47M cap, 1,435 MB at 94M (logCap 27) -> **about 16 bytes per stored position + ~30 MB base**.
Rule of thumb: RAM per worker = 0.05 GB + 0.8 GB x 2^(logCap-26). On this box (about 5 GB available, 10-11 GB used by others) use `--workers 3` at logCap 26 (about 2.5 GB peak) and at most 2 at logCap 27.

### 8.3 First exact move on champion-like positions (MEASURED)
Positions: the champion's shipped52 network search (exact endgame removed) played the first 14 `dev200` games until K cards were left (`js/gen_champion_positions.js`; 6 positions per K used). Empty table, `exact2` WASM, `choose()` for the dealt card, logCap 26 (47.0M position cap), CPU seconds:
| K | finished within 47M positions | positions of finished (min / median / max) | CPU s of finished (min / median / max) | not finished (CPU s spent before giving up) |
|---|---|---|---|---|
| 16 | 4/6 | 7.2M / 16.4M / 35.7M | 7.0 / 15.9 / 44.1 | 2 (68, 69) |
| 17 | 3/6 | 14.3M / 14.6M / 24.8M | 15.4 / 17.1 / 29.2 | 3 (71, 59, 62) |
| 18 | 1/6 | 25.8M | 31.4 | 5 (60-72) |
At logCap 27 (94M positions, 1.4 GB RSS) one of the K = 17 positions that failed at 47M still did not finish (169 s CPU); I stopped that run (lean), so logCap 27 is not shown to rescue K = 17. Throughput ~0.9-1.1M positions per CPU second here (earlier 1.6M/s on easier positions).
Small samples (n = 6): the heavy tail (Stays left, columns) decides, a position either needs ~10-45M positions or more than 47M.
**Max K with a safety margin:** K = 16 for the first move (about two thirds fit in memory and in ~45 s CPU); K = 17 is a stretch (half); K = 18 mostly does not fit in 800 MB. When it does not fit, the retry at the next card (K-1, about 2.5x cheaper, GUESS from the ~2.5x growth per card) usually does.

### 8.4 Think time per game (MEASURED; games = first 4 set1000 games, one worker each)
| config (rule version) | CPU think s per game | wall think s per game (loaded box) | first exact move positions (M) | give-ups memory/clock | max RSS |
|---|---|---|---|---|---|
| pooled:16:26, final rule | 15, 41, 102, 26 (mean 46) | 34, 97, 272, 76 | 11.9, 25.7, 15.1, 21.8 | (0,0) (0,0) (1,7) (0,0) | 774 MB |
| pooled:17:26 | 25, 68, 102, 63 (mean 65) | 69, 172, 239, 137 | 18.4, 40.2, 21.2, 43.9 | (0,0) (0,0) (1,9) (0,0) | 777 MB |
| pooled:17:26:180:wall (3 games) | 70, 102, 107 | 70, 102, 107 | 18.4, 22.0, 20.2 | (0,0) (0,3) (0,10) | 400 MB |
(An earlier version without the 100 s cumulative cap spent 167 s CPU / 391 s wall in one of the 4 games: that is why `maxSolveSec` exists.) All CPU totals are below the 180 s pool (max 107 s with the cap). In `cpu` mode the wall time on this loaded box exceeded 180 s in 2 of 8 games (239 s, 272 s),
purely because the box was 2.3-2.7x slow; in `wall` mode the rule bounded all three games at <= 107 s wall. The slowest single move is the first exact move (up to ~100 s): **the Referee's harness must not impose a per-decision timeout below ~120 s.**
Average of the non-exact moves is small (the champion's search, ~10-100 ms/move); the whole game without the big solve is a few seconds.
Plumbing scores (4 games each, `--limit 4`, NOT evidence): pooled:16:26 +475.0 +- 275.0 (earlier rule +412.5 +- 315.2), pooled:17:26 +362.5 +- 352.0, pooled:17:26 wall (3 games) +266.7 +- 418.7, all vs shipped52 (mean 9212.5 on these games).

### 8.5 Expected gain (separate)
- CALCULATED/MEASURED: the exact solve from K cards plays the optimal move from that point; compared with the shipped 13-card/100k-position setting the extra exact stretch is K-13 = 3-4 cards (when the solve fits). In the 4-game smoke runs the exact endgame started at 16/17 cards in 3 of 4 games (the 4th started later after a give-up).
- unverified (from repo): 13/14/15-card exact endgame scores 8941/8966/8980 (about +14 to +25 per card). Measured champion baseline: shipped52 = 8,871.7 +- 38.0 (set1000, Referee).
- GUESS: with returns shrinking, a complete solve from 16-17 cards instead of 13 is worth about +20 to +60 points per game on average (not measurable below ~1000 paired games). No score is claimed.
- GUESS (cost): ~46-65 CPU seconds per game on this loaded box -> 1000 games are about 13-18 CPU hours per config (about 5-6 h wall at 3 workers if the box were not loaded 2.5x; more here). The Referee may pre-screen with `--limit 300` (cannot be ACCEPTED at n < 1000).

### 8.6 Recommended Referee runs (max 3; run from /workspace/21lab/bench; B = candidate, diff = B - A)
1. `pooled:16:26` (primary: first move fits for ~2/3 of games, 806 MB per worker):
```
python3 compare.py --a "cmd:node champion/champion_adapter.js --config shipped52" --b "cmd:node ../experiments/exact-endgame-deeper/adapter.js --config pooled:16:26 --timelog results/think_pooled16.jsonl" --set set1000 --workers 3
```
2. `pooled:17:26` (stretch, same memory; costlier per game):
```
python3 compare.py --a "cmd:node champion/champion_adapter.js --config shipped52" --b "cmd:node ../experiments/exact-endgame-deeper/adapter.js --config pooled:17:26 --timelog results/think_pooled17.jsonl" --set set1000 --workers 3
```
3. `deeper:15` (control without the pooled clock: 3.2M positions per move, 403 MB; isolates how much comes from pooling the clock vs just starting at 15):
```
python3 compare.py --a "cmd:node champion/champion_adapter.js --config shipped52" --b "cmd:node ../experiments/exact-endgame-deeper/adapter.js --config deeper:15" --set set1000 --workers 4 --cache
```
(`--cache` is omitted on purpose for the pooled configs: if the 100 s clock cap binds, the result depends on CPU speed.) `--timelog` appends one JSON line per game (think time cpu/wall, give-ups, positions, RSS); on the real clock use `pooled:K:26:180:wall`. The adapter's clock rule makes the cpu-mode result deterministic given the position cap except when the 100 s clock cap binds (then it depends on CPU speed).

### 8.7 Deterministic pooled variant `pooledp` (added 2026-11-18 13:xx; new files only: `adapter2.js`, `js/pooledp.js`, `js/policy_p.js`; adapter.js / js/pooled.js are unchanged)
Why: the `pooled:` rule gives up on a CPU-time cap (100 s), so on a slower or faster machine the same game is played differently. `pooledp` replaces every time limit by a count of NEW table positions per game (WASM and JS kernels give identical counts: checked on 3 games, identical moves and counts), so decisions are identical on any machine.
Config: `adapter2.js --config pooledp:K[:logCap[:maxPositions[:tailTotal[:tailMove[:wallGuardSec]]]]]`, defaults `pooledp:16:26` = maxPositions 45,000,000, tailTotal 28,000,000, tailMove 14,000,000, tailK 14, floorK 12, floorMove 2,000,000, logCap 26 (806 MB table, memory give-up at 0.70 x 2^26 = 46.98M positions, never reached because 45M < 46.98M).
**Which budget applies on which path** (per game; the table is emptied at the start of each game and when the main budget is used up; the shipped 100,000-position budget is used NOWHERE):
1. MAIN: the first move with <= K cards left solves in slices of 1M positions with up to 45M new positions in the game. Finished -> every later move is a table lookup (budget irrelevant; 2M allowed per move for safety).
2. TAIL (after the main budget ended): each later move with <= 14 cards left retries with min(14M, tail pool left) new positions (pool 28M per game; a cap give-up in the tail keeps its table, so the next move resumes). 15 cards is skipped: a solve from scratch there needs about 20M+ (GUESS from 2.5x per card; measured 14 cards: 2-50M, 13 cards: 1-12M, labeler README).
3. FLOOR: with <= 12 cards left a move always gets 2M new positions that are not counted against the tail pool (a solve from scratch at 12 cards: about 0.3M, measured on one position), so the last 12 cards are exact even after the pools are used up.
4. A move that is not solved within its budget is played by the champion's network search (its wall-clock deepening switched off, like the bench adapters).
**Position rate: why 1.6M/s was wrong for games.** The Referee's 0.83M/s over real games is right; my 1.6M/s came from small solves (<= 5M positions, where the table stays in the processor cache) at 10-14 cards. From the Referee's 103-game file `bench/results/think_pooled16.jsonl` (MEASURED by the Referee, load 10-27; my own regrouping, CPU seconds of the first solve): solves with < 5M positions run at 1.13M/s, 5-15M: 0.89M/s, 15-30M: 0.75M/s, 30-50M: 0.66M/s, all finished solves 0.745M/s; my own first-move runs at K = 16-18 gave 0.82-0.91M/s. The 800 MB table makes big solves cache-miss bound. (Games that hit the memory cap look slower still, 0.47M/s of peak positions, because retries redo work.) For setting the cap I use the game-level rate 0.62-0.75M/s (observed in my pooledp games: 0.62-0.69M/s overall for the capped games) and 0.56M/s as the pessimistic rate.
**maxPositions choice (CALCULATED + MEASURED):** worst-case positions per game = main 45M + tail 28M + floor (<= ~4M seen 2.3-3.5M) = about 77M. CPU for that: 77M / 0.67M/s = 115 s (measured game with 75.3M positions: 112.9 s CPU on the loaded box); pessimistic 77M / 0.56M/s = 138 s. Both are below the 150 s box-CPU target. On the Mac (1.5x faster, parent's factor) that is about 77 s typical-worst and 92 s pessimistic of CPU. The other (non-capped) games need 6-41M positions = 5-58 s CPU. 45M main cap rationale: the table is full at about 47M anyway, so a larger cap cannot help (logCap 27 needs 1.6 GB RSS).
**Cap-binding rate:** Referee's 103 pooled:16:26 games: 28 (27%) needed more than 47M positions in the first solve (all of these would hit the 45M cap; only 1 finished solve in that file used more than 43M and less than 47M). In my 8 pooledp:16:26 games (first 8 of set1000): 2/8 (25%) hit the main cap, the other 6 finished with 6.0-41.1M positions (exactMain). In those 2 games the tail made the exact endgame start at 12-13 cards in one game (tail solved, 16.3M tail positions) and at 12 cards (floor) in the other; the tail pool of 28M was fully used in one of them. Positions per game, CPU s (loaded box, CPU not wall): finished games 13.4, 23.6, 36.9, 32.1, 5.5, 57.8 s; capped games 112.9 and 78.6 s; the one slowest wall time was 128 s (loaded box, 1.1-1.5x CPU in this run). Raw: `results/think_pooledp16.jsonl` (final config), `results/think_pooledp16_v1_tail25M10M.jsonl` (earlier tail rule: tail 25M/10M with no tailK, and tail table kept), `results/think_pooledp16_keeptable.jsonl`, logs `results/smoke_pooledp16*.log`.
**Wall-clock guard (live play only, off on the bench):** `pooledp:16:26:45000000:28000000:14000000:<wallGuardSec>` (e.g. 120): a move's solve is also abandoned when this game's wall think time plus (running mean of the base search's wall ms per move) x cards left would pass wallGuardSec. It makes decisions machine-dependent, so never use it in a Referee run.
**Plumbing scores (8 games, NOT evidence):** shipped52 9006.2 +- 307.3, pooledp:16:26 9312.5 +- 414.1, paired +306.2 +- 201.0 (z 1.5; n=8 can never be ACCEPTED). The Referee needs >= 1000 paired games.
**Exact command (run from /workspace/21lab/bench; no --cache: A could be cached, but B is expensive and deterministic, so caching B is fine too if the box allows; first-solve outcomes are now machine-independent):**
```
python3 compare.py --a "cmd:node champion/champion_adapter.js --config shipped52" --b "cmd:node ../experiments/exact-endgame-deeper/adapter2.js --config pooledp:16:26 --timelog results/think_pooledp16.jsonl" --set set1000 --workers 3
```
Memory: about 0.8 GB per worker at the cap (RSS measured 744 MB). `--workers 3` needs about 2.5 GB.

### 8.8 Logged variant `deeperlog` (added 2026-11-18; `adapter2.js` only)
`adapter2.js --config deeperlog:K[:budget[:logCap]] --movelog FILE` plays exactly like `adapter.js --config deeper:K[:budget[:logCap]]` (same js/hybrid.js and exact3 table; a wrapper only observes) and appends one line per game: `{game, config, pid, moves:[{rem, exact, newPos, tableAfter, ms}]}`: rem = cards left including the current card; exact true = solve finished, false = gave up (champion search played), null = not attempted (rem > K); newPos = new table positions of that move's solve; ms = CPU ms. Check: deeper:16 vs deeperlog:16 on set1000 games 0-4: identical (mean 9470.0 both, paired diff +0.0 +- 0.0; `results/smoke_deeperlog16.log`, `results/movelog_deeperlog16.jsonl`).
```
python3 compare.py --a "cmd:node ../experiments/exact-endgame-deeper/adapter.js --config deeper:16" --b "cmd:node ../experiments/exact-endgame-deeper/adapter2.js --config deeperlog:16 --movelog results/movelog_deeperlog16.jsonl" --set set1000 --workers 3
```
(or use only B with `--a` = shipped52; give-up rates by cards left = group `moves` by `rem` and average `exact === false`.)
