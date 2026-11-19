# exact-labeler: exact value labels for 21 Learner

Built on Landon's `exact2` solver (engine/twentyone-solver/src/exact2.js + the WASM kernel, JS fallback), loaded read-only. Nothing under engine/ or bench/ is modified.

```
node gen_positions.js --policy deeper16 --games 200 --max-left 20 [--bust-eps 0.1] [--bust-seek 0.2] > positions.jsonl   # out-of-bench positions played by the champion deeper:16 (default policy: shipped52 without exact endgame)
nice -n 10 node label.js [--mem-mb 800] [--max-positions 60000000] [--flag-fallback] < positions.jsonl > labels.jsonl
node validate.js --in validation_positions.jsonl --n 50 --max-left 9            # vs. independent brute force
```
(`nice -n 19` starves completely on this box while other agents run at nice 0 and the load is 17-40: a nice-19 job got 0.7% of a core; nice 10 about 5%. I used nice 0 for the short validation/timing runs.)

## Input (one JSON object per line on stdin) and output (one line per input, same order)

```
{"id":..., "cols":[[..],[..],[..],[..]], "deck":[13 counts], "busts":0..3, "stays":0..2, "streak":0..4, "score":any}
{"id":..., "v":..., "ok":true|false, "ms":..., "cpu_ms":..., "n":cards_left, "pos":new_table_positions, ["err":...], [fb fields]}
```
`v` = exact expected points still to come under optimal play from this position, which is taken after a placement and before the next card is revealed: the average over the next card of the best action's value (action points + future), including the Perfect Bonus (+1000) when busts == 0 at the end. It does not include `score` (carried through only; the input `score` is ignored). `v` is float32-precise (|error| about 1e-4), because exact2 stores float32.
`ms` is wall milliseconds of the solve, `cpu_ms` the CPU time of the solve (use this when the box is loaded; wall was 2-5x CPU in my runs). `pos` = new table positions this line had to compute (0 = answered from the table of an earlier line).
Bad input (inconsistent cards, a column already at 21 / bust, etc.) gives `ok:false` with `err`, never a made-up number.

## Format assumptions (please check against what 21 Learner emits)
* **cols**: card VALUES per column in dealt order (only the multiset matters, order is ignored). Ace = **1** (the solver itself decides whether it counts as 11; never write 11 for an Ace). 2-10 as is. J/Q/K = 10. If a column holds 11, 12 or 13 it is read as a RANK (J/Q/K) and counted as 10 (output `warn` says so; `--cols` is only a flag for that warning). Max 4 cards per column (a 5th card always clears it) and each column must be live: total below 21 and not already a bust/21 (those would have been cleared).
* **deck**: remaining (unseen) card counts, 13 entries by RANK `[A,2,3,...,10,J,Q,K]` (index 0 = Ace; J/Q/K merged into value 10 by the labeler). A 10-entry list is read as counts by VALUE `[A..9, ten-valued]`. The deck is the cards still to be dealt after the last placement (the card that was just placed is not in it). Consistency check: a value cannot appear more often (columns + deck) than the 52-card deck has it.
* **busts** 0-3 (3 = game over, label 0). **stays** = Stays STILL AVAILABLE (2 at the start, like the engine's `stays_left`), not stays used.
* **streak** = number of consecutive scoring placements (a column cleared for points) ending with the last placement; bust or a non-scoring placement resets it to 0, using a Stay does NOT reset it (engine config `stayBreaksStreak: false`, RULES.md). The next scoring column gets the bonus `[0,250,500,1000,2000][streak]`; values above 4 are clamped to 4 (the bonus stops growing at +2000), which is the engine's own rule. This is the engine's `prev` field.
* One Stay per card at most (bench default `--spc 1`), as in exact2 and in the brute force.
* Horizon: the full rest of the 52-card deck (no timer-card shortening). `n` = cards left in the deck = cards still to be placed.

## Budgets
* `--max-positions N` (default 60,000,000 new table positions per line): when a position needs more, the line returns `ok:false, err:"position budget exceeded"` (progress is kept in the table, so a later sub-position profits).
* `--mem-mb M` (default 800; table = 12 bytes << logCap, logCap = floor(log2(M MiB / 12)), min 18, max 28): if the table fills up the line returns `ok:false, err:"table full"` and the table is emptied. Capacity is about 0.72-0.76 x 2^logCap positions (400 MB: about 24M positions; 800 MB: about 48M); RSS is about 30 MB + 16 bytes per stored position.
* Both are counts, not times, so labels and which lines fail are identical on any machine.

## Table reuse across lines
exact2 keeps its transposition table as long as the next position's deck is a sub-deck of the deck the table was built for (otherwise it rebuilds). So: put the positions of one game together, in play order (cards left decreasing): the first line pays the solve, the later lines of that game are mostly table lookups (measured: a 12-cards-left position cost 306k new positions, the next 11 positions of the same game cost 0 new positions, 0.005-0.015 ms each). Positions of different games just restart the table (the cost of a line is whatever it needs). Sorting by cards left across games does NOT help. `--cold 1` forces an empty table for every line (timing only).

## --flag-fallback: would shipped52's exact endgame give up here?  ("fb")
shipped52 (results/shipped_policies.json "52": `exact: {xK:13, logCap:21, budget:100000}`) tries the exact solve only with <= 13 cards left (counting the card just revealed) and falls back to the network search when `X.choose(st, v, 100000)` needs more than 100,000 NEW positions. That decision happens after the next card v is revealed, but the labeled position is pre-reveal, so for every value v still in the deck we run exactly that call on a FRESH exact2 table (logCap 21, budget 100,000; the table is cleared for each v) and report
* `fb_frac` = share of next cards (weighted by copies left in the deck) for which shipped52 gives up, `fb` = fb_frac >= 0.5, `fb_any` = fb_frac > 0, `fb_why` = `"gt13"` (more than 13 cards left: no exact attempt at all: fb true, fb_frac 1) or `"budget100k"`, `fb_ms` = wall ms of this check.
* Caveat: fresh table = pessimistic for positions the real policy reaches after an earlier solve of the same game that left the sub-positions in its table (shipped52 keeps its table between moves of a game; a give-up also keeps the positions it solved). The flag is for weighting training data, not an exact replay of any single game.

## --deep MAXN: depth-limited target for 17..MAXN cards left  ("exact": false)
```
node label.js --deep 20 [--samples S] [--try-exact] [--frontier 16] --mem-mb 800 --max-positions 40000000 < positions.jsonl
```
For a position with F+1 .. MAXN cards left (F = `--frontier`, default 16) the labeler expands chance nodes and decision nodes (all distinct actions: card on each distinct live column; Stay i + card on i only when no column is empty, exact2's own restriction) until exactly F cards are left and takes the EXACT value (exact2) at those frontier positions; everything shares one table. Output: `exact:false, mode:"depth-limited", depth` (= cards left - F chance levels expanded), `frontier`, `samples` ("all" or S), `n16` (number of exact frontier solves), `pos` (new table positions used), and, when sampled, `se`.
* `--samples S`: at the TOP chance node only, average over S individual unseen cards drawn without replacement (seeded by the id: reproducible) instead of all card values. Unbiased; `se` is the standard error of that mean (unreliable with S < 4: two similar samples give a tiny `se`). Lower chance levels are always expanded in full (sampling inside a max would bias the value upward). `--samples 0` (default) = all values.
* The whole target shares the `--max-positions` budget: exceeding it gives `ok:false, err:"depth-limited target exceeded the budget"`. `--try-exact` first tries the exact solve (same budget), and only when that fails falls back to the depth-limited target. More than MAXN cards: `ok:false`.
* Positions with <= F cards still go through the exact path (`exact:true`).
* Check of the expansion code: with `--frontier 7 --deep 11` on 12 validation positions (9-10 cards left) the depth-limited value equals the exact value to <= 1e-4 (all 12), so the chance/decision expansion is right; sampled versions (S=3) were within about 1-2 `se` of it.
* **Cost (MEASURED, loaded box, CPU)**: this is not cheap. The frontier solves at 16 cards are the 10-25M-position problems of the next section, and the expansion needs several of them (they overlap in the table, but the union is close to the exact 17-card solve). On 6 champion positions with 17-20 cards left (`deep_positions.jsonl`; budget 40M positions, 800 MB table, S = 3 or 2): 17 cards: one finished (6 frontier solves, 21.1M positions, 32 s CPU), one exceeded the budget (55 s CPU); 18 cards: 3/3 exceeded (55-67 s CPU each); 20 cards: 2/2 exceeded (56-57 s). Expect `ok:false` for most positions at 18+ unless the budget is raised well beyond 40M (table: 800 MB holds about 48M positions; the table is NOT cleared between lines, but a table that fills up is emptied and that line fails). A cheaper, still unbiased option for 17+ would be to sample the next TWO levels and accept a larger `se`; not implemented (would need a variance estimate for the nested max).

## Validation (MEASURED)
* `validate.js` (positions from `gen_positions.js` seeds 3000100001 with `--bust-eps 0.1`; `validation_positions.jsonl`): 50 positions with 1-9 cards left (1:5, 2:2, 3:7, 4:7, 5:4, 6:6, 7:7, 8:6, 9:6; 32 with at least one bust, 15 with a running streak) against `brute_raw` (an independent brute force over INDIVIDUAL cards with explicit column card lists, rules coded from RULES.md; `brute_raw.c` reuses the brute-force kernel of experiments/exact-endgame-deeper/ref/brute.c): **50/50 match, max |difference| 1.2e-4** (float32 storage; tolerance 0.01). Result file `validate_result.txt`. A first run that also contained 10-card positions matched on the 25 positions the brute force finished (max diff 1.1e-4) before it ran out of its 2^24-slot memo on the 26th; so the 50 reported are <= 9 cards.
* Positions with exactly 10 cards left are only covered by that partial first run (the brute force needs more memory than its 2^24-slot memo for many of them); the labeler's solver is exact2 itself, whose own cross-checks against a brute force are in section 3 of ideas/exact-endgame-deeper.md.

## Time per position (MEASURED; loaded box; CPU ms of one solve from an EMPTY table, `--cold 1`; champion-play positions, seeds 3000300001, 8 positions per row; `timing_positions.jsonl` / `timing_out.jsonl`)
| cards left | finished | positions (min / median / max), M | CPU s (min / median / max) |
|---|---|---|---|
| 12 | (one position) | 0.31 | 0.19 |
| 13 | 8/8 | 1.0 / 5.1 / 12.3 | 0.7 / 4.6 / 14.4 |
| 14 | 8/8 | 2.2 / 9.4 / 49.8 | 1.7 / 10.0 / 81.9 |
| 16 | 3/8 (800 MB table, budget 60M) | 11.3 / 13.7 / 24.7 | 11.5 / 15.4 / 35.2 (5 positions filled the table: 74-89 s CPU wasted each) |
Cost varies 10-50x between positions of the same size (Stays left and the column mix decide). Throughput 0.7-1.1M positions per CPU-s (lower for the bigger tables). With table reuse inside a game, later lines of the same game are almost free. Wall time was 1.1-2.5x CPU on this loaded box.
Training positions: `gen_positions.js` writes only positions from seeds >= 3,000,000,000 (refused otherwise), checks every shuffle against set1000/set5000/dev200 (read-only; 0 collisions in the generator run whose summary I looked at: 6 games) and uses the champion's network search (no exact endgame) as policy.


## Rollout mode for 17-20 cards (cheaper than the full expansion; added 2026-11-18 14:xx)
`--deep 20 --deep-mode rollout [--rollout S]`: S simulated continuations from the position: the next cards are drawn at random from the unseen multiset (seeded by the id; simulated draws, NOT the real future order), the champion's network search (shipped52 without its exact endgame) picks every action until exactly 16 cards are left, and the label is the mean over the S paths of (points collected on the path + EXACT value of the 16-card position reached). Output `exact:false, mode:"rollout", depth, frontier:16, paths, se (S >= 2), n16, bias:"lower bound (champion policy above the frontier)"`. It is an unbiased estimate of the value of "champion policy for the first n-16 cards, then optimal", a lower bound of the optimal value (the gap is the champion's loss over those few cards). One path (S=1) = one exact 16-card solve: cheapest, noisy (no `se` with S=1; per-path sd is a few hundred points), good enough as a training label because the noise averages out over many positions. Check (frontier 7, 12 positions, S=60, validation positions): 11/12 below the exact value, mean 62 points below, the single +51 (se 16) is chance: the same position with 1500 paths gave 2163.1 +- 4.2 vs exact 2168.2. Agreement with the expectimax at 17 cards: 4657.6 (rollout, S=1) vs 4672.7 +- 149 (expectimax, 3 sampled cards) and 4689.4 vs 4697.4 +- 8.

## Throughput (MEASURED on the box while other agents ran: load 5-10 on 8 cores; CPU time of the labeler process; labels per CPU-hour = successful labels / total CPU incl. the failed lines)
Positions: 24 games played by the champion **deeper:16** (`gen_positions.js --policy deeper16 --games 24 --seed-base 3000500001 --max-left 20`, out-of-bench seeds, 0 collisions with set1000/set5000/dev200; `pos_deeper16.jsonl`, 480 positions, 19/24 games without a bust). Table 800 MB (`--mem-mb 800`, about 48M positions), budget 60M positions per line (<= 16 cards), 40M (17-20 cards).

**A. Whole games labeled in play order, 16 cards left down to 1 (table reuse; the recommended way): 24 games, 384 lines, 375 ok (97.7%), 1,181 CPU s -> 1,143 labels per CPU-hour = 73 games per CPU-hour.** Per game: median 30 s CPU, 75th percentile 95 s, max 172 s. Cost sits in the first (16-card) line: 16 of 24 games finished it (CPU s: 1, 2, 6, 8, 9, 10, 11, 11, 13, 16, 17, 22, 37, 41, 43, 44), 8 of 24 (33%) did not (800 MB table full after 62-74 s CPU) -> that line is `ok:false`, the table is emptied and the 15-card line then solves from scratch (23 of 24 succeeded; the other failed too) and everything below is almost free. Those 8 games used 891 of the 1,181 CPU s (75%). Levels 14 and below: 0 failures; a failed 16-line wastes about 70 s, a cap of `--max-positions 30000000` would waste about 45 s there but also lose 4 of the 16 successes (37-44 s CPU).
**B. Each position from an empty table (`--cold 1`), 6 random positions per level, 800 MB:**
| cards left | labels ok / lines | CPU s median / mean / max | new positions M (median) | labels per CPU-hour |
|---|---|---|---|---|
| 1-5 | 6/6 each | < 0.001 | 0 | > 10,000,000 |
| 6 | 6/6 | 0.000 / 0.002 / 0.0 | 0 | 1.9M |
| 7 | 6/6 | 0.001 / 0.002 / 0.0 | 0 | 2.3M |
| 8 | 6/6 | 0.002 / 0.003 / 0.0 | 0 | 1.4M |
| 9 | 6/6 | 0.018 / 0.047 / 0.2 | 0.04 | 76,000 |
| 10 | 6/6 | 0.048 / 0.058 / 0.1 | 0.10 | 62,000 |
| 11 | 6/6 | 0.078 / 0.265 / 0.7 | 0.16 | 13,600 |
| 12 | 6/6 | 0.33 / 0.92 / 3.2 | 0.58 | 3,900 |
| 13 | 6/6 | 1.2 / 3.2 / 8.1 | 1.8 | 1,140 |
| 14 | 6/6 | 3.9 / 5.4 / 14.2 | 4.4 | 670 |
| 15 | 6/6 | 9.2 / 10.2 / 26.7 | 9.9 | 350 |
| 16 | 5/5 (+8 failures in A) | 9.2 / 14.8 / 42.1 | 9.0 | 243 in this sample; **about 160 over A's 24 first lines** (16 ok of 24, 62-74 s wasted on each failure) |
(6 positions per level are a small sample; earlier shipped52-game positions gave 13: 0.7-14 s, 14: 1.7-82 s, 16: 3 of 8 finished, so the spread between samples is large.)
**C. 17-20 cards left (16 positions, 4 per level, each from an empty table, box load as above):**
| mode | table / budget | ok | CPU s per ok label | labels per CPU-hour |
|---|---|---|---|---|
| expectimax to 16 cards (all actions, top node 3 sampled cards) | 800 MB / 40M | **0 of 16** (all exceeded the budget after 43-64 s CPU) | - | 0 |
| expectimax, 17 cards only | 1.6 GB (`--mem-mb 1600`) / 90M | 2 of 3 | 85 and 124 | about 21 (342 CPU s for 3 lines) |
| **rollout, S = 1** | 800 MB / 60M | **12 of 16** (17: 4/4, 18: 3/4, 19: 2/4, 20: 3/4) | mean 31 (10-49); failures cost 68-78 | **66 overall** (17 cards: 99, 18: 64, 19: 38, 20: 71) |
| rollout, S = 2 | 800 MB / 40M | 1 of 13 (killed) | - | about 1 |
The exact 16-card values the 17-20-card targets need cost as much as a 16-card label each (10-40M positions), and a failed solve costs about 70 s. So at 17-20 cards expect about 65 labels per CPU-hour with rollout S=1 (about 25% ok:false) and next to nothing with the full expectimax unless the table is doubled (1.6 GB/worker). If the Learner needs many more targets at 17-20 cards, the cheapest honest option is S=1 rollouts, accepting a lower-bound bias and per-label noise.
**--flag-fallback cost:** about 0.6 s wall per position with <= 13 cards left (10 fresh solves of at most 100k positions); no cost above 13 cards (flag is true without a solve). It is off by default.
**Generator cost:** `--policy deeper16`: 24 games with 480 positions took about 3 minutes of wall time on the loaded box (the policy's own 16-card exact solves dominate; CPU not separately measured); the default shipped52 policy (no exact endgame) is much cheaper (6 games in 6 s of CPU).
