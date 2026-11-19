# Measured results (Referee). Everything below was produced by this bench unless marked "unverified (from repo)".
Environment note: the box was heavily shared while these ran (load average 25-40 on 8 cores), so wall times / games-per-second of slow engines are inflated roughly 3x.

## Baselines (native C core, 8 workers allowed, 4 used) - MEASURED
| set | engine | mean +- SE | busts/game | games >=1 bust | 3-bust end | perfect (0 busts) | games/s (wall, 4 workers) | games/s per core |
|---|---|---|---|---|---|---|---|---|
| set1000 | random-legal | 397.9 +- 15.4 | 3.000 | 100% | 100% | 0.0% | 13,365 | ~1.2M |
| set1000 | greedy (optional) | 4977.0 +- 54.8 | 1.729 | 82.8% | 31.9% | 17.2% | 12,922 | ~305k |
| set1000 | expect1 (1-ply expectimax + column heuristic) | 6461.8 +- 51.4 | 1.286 | 77.3% | 12.6% | 22.7% | 1,753 | ~542 |
| set5000 | random-legal | 394.7 +- 7.1 | 3.000 | 100% | 100% | 0.0% | 30,160 | ~640k |
| set5000 | greedy | 4912.6 +- 25.6 | 1.740 | 82.6% | 33.2% | 17.4% | 35,023 | ~189k |
| set5000 | expect1 | 6453.8 +- 24.0 | 1.299 | 75.9% | 14.3% | 24.1% | 1,841 | ~520 |

Paired diffs (B - A, same shuffles): expect1 - random = **+6063.9 +- 53.0** (set1000, z 114), **+6059.1 +- 24.8** (set5000, z 244);
greedy - random = +4579.1 +- 56.6 (set1000), +4518.0 +- 26.5 (set5000). (Per-game CSV/JSON in results/.)
random-legal = uniform over all legal (optional Stay of a non-empty column) x (4 placements) actions, so it burns both Stays early and busts out every game.
expect1: for each legal action (no Stay, or one Stay of a non-empty column, x 4 columns): points now - 300 per bust (- 2500 on the 3rd) + E over the unseen multiset of
max over the next placement of (points - bust penalties + H), H = sum over non-empty columns of V[cards] x P(next card does not bust it), V = 15/40/100/250 for 1..4 cards.
Constants were glanced at on dev200 only.
5,000-game paired runs of the native baselines take ~3 s (random vs greedy) to ~3-5 s (expect1).

## Scoring parity (see README for detail) - MEASURED
* 44,640 / 44,640 single-column card sequences identical between engine.js and refsim.
* 0 disagreements in 6 replays (random/greedy/expect1 x set1000/set5000; up to 251k steps) through engine.js `applyMove`, `/workspace/21sol/game.h` and refsim vs the native core.
* native greedy == python greedy (in-process API) == python greedy over the JSON subprocess protocol: identical per-game scores on dev200 (paired diff 0.0 +- 0.0).
* Unit tests: 44 tests, all pass (`python3 -m unittest discover -s tests`).

## Champion adapter - MEASURED
* Static scan (adapter + engine.js, exact2.js, exact2_kernel.wasm.js, x_policies.js, policies.js): 5 HIGH hits, all in engine.js lines 84-88 / 486-506 = `shuffledDeck` / `playGame`, the file's own
  harness helpers, never called by the policy (`createSearcher`/exact solver use only counts, columns, busts, stays, streak, score, current card). Wall clock appears only inside the `deepen.budgetMs` guard (forced to 0 by the adapter).
* Dynamic audit (re-shuffle the unseen cards after each audited decision, same observable state): nn5 - 52 (decision, reshuffle) pairs, 0 future-dependent, 0 nondeterministic;
  shipped52 - 34 pairs (stride 3, includes the exact-endgame stage), 0 future-dependent. These are SMALL samples (CPU-bound); extend with `audit.py --games/--stride/--perms` before accepting any change.
* Test engine `baselines/cheater_py.py` (peeks at the harness deck via gc) is caught by both the dynamic audit (4/294 pairs flagged in 5 games) and the static scan.

## Champion baseline (shipped config) - MEASURED on bench
Config `shipped52` = `results/shipped_policies.json["52"]` (network 56-128-48, depth-1 expectimax, selective 2-deeper on close calls, exact last 4 cards, exact2 endgame solve from 13 cards with a 100,000-position budget per move), `deepen.budgetMs` forced to 0.
| set | n | mean +- SE | busts/game | games >=1 bust | 3-bust end | perfect | cost |
|---|---|---|---|---|---|---|---|
| set1000 | 1000 | **8871.7 +- 38.0** | 0.363 | 23.7% | 1.5% | 76.3% | ~1.7 s/game unloaded (4-game sample); 3350 worker-seconds under load for 1000 games |
| set5000 | 5000 | running in background (see results/logs/shipped52_set5000*.log, row auto-appended to EXPERIMENTS.md) | | | | | est. 5 x set1000 CPU |

## Config reconciliation: where do the repo's numbers come from? (taken from his files = **unverified (from repo)**; the mapping itself is read from his logs/specs)
| figure (unverified, from repo) | source file | shuffles | policy config |
|---|---|---|---|
| 8,755 (+1,480 +- 34 vs baseline 7,275) | README, results/final_nn5.log | seeds 2,500,000+ x 10,000 | `specs_nn5_final.json` "Network v3": NN + depth 1 + selective 2-deeper, **exact only for last 4 cards (endgameK 4)**, no big exact solve |
| 8,777 shipped; 8,849 with budgeted exact (<=12 cards left, 100k) = +72 +- 8 | results/x_confirm.log | seeds 2,700,000+ x 6,000 | same net; budgetMs 60 guard; exact xK 12 |
| 8,832 (100k cap) vs 8,940 (full exact from 12) = +108 +- 38 | results/x_full12.log | seeds 3,200,000+ x 700 | exact xK 12, 100k vs 20M cap |
| 8,913 / 8,941 / 8,966 / 8,980 for complete solve from 12 / 13 / 14 / 15 cards; 6,579 s per 1,000 games at 14 | results/x_early.log | seeds 3,900,000+ x 1,000 | `x_specs_early.json`: exact2, logCap 26, unlimited budget, budgetMs 0 |
So the brief's "8,940-8,970 (13/14 cards)" are the x_early rows (complete exact solve) on a different 1,000 shuffles; "8,755" is the earlier no-big-solve policy on 10,000 other shuffles. They are different policies on different shuffle sets
(SE per 1,000 games ~ 35), so they are not directly comparable. The shipped web page uses the shipped_policies.json spec with exact xK 13 / 100k on phones and xK 14 / logCap 25 / 400k on computers (web/template.html, HEAD commit).
OUR measurement of the shipped config (shipped52) on set1000: 8871.7 +- 38.0 (above). Exact-14 and the other configs: see below / EXPERIMENTS.md as they finish.

## Pending in the background (started 2026-11-18 ~11:09 PST; `run_champion_matrix.sh`, results in results/logs/)
1. shipped52 vs exact14 (complete solve from 14 cards, logCap 26 ~0.8 GB per worker), set1000, paired
2. shipped52 on set5000
3. shipped52 vs computer config (xK14/400k) and vs nn5 (README policy), set1000, paired
Estimated cost (unloaded): exact14 ~6.6 s/game x 1000 (his log: 6,579 s for 1,000 games) / 3 workers ~ 40 min; set5000 shipped ~ 2 h CPU / 4 workers ~ 35 min; under the current load of the box several times that.
`watch_append.sh` appends the finished rows to ../EXPERIMENTS.md automatically (`append_experiments.py`, idempotent).

## exact-endgame-deeper (21 Search) - Referee checks
* Static scan (adapter.js, js/common.js, policy_exact3.js, exact3.js, hybrid.js): 0 HIGH hits. exact3.js has no clock/RNG; the exact-solve budget is a count of new table positions (deterministic). Reads only engine/ sources via env/path; no shuffle files.
* parity13 == shipped52: 60/60 set1000 games identical (score, busts, perfect, cards).
* Dynamic audit deeper:16, `--fresh`, 4 games, stride 4, 3 reshuffles: 154 (decision, reshuffle) pairs, 0 future-dependent, 0 nondeterministic. (Without --fresh: false alarm at the first exact decision caused by table reuse across replays, see README.)
* Paired runs vs shipped52 (set1000): deeper:16, :15, :14 running in the background (results/logs/shipped52_vs_deeper*.log); rows auto-appended to ../EXPERIMENTS.md by watch_append.sh.

## Bound check: clairvoyant beam 13,194 (21sol) — Referee, 2026-11-18 (verdict: unverifiable by replay; partial checks consistent)
Source: /workspace/21sol (read-only; the only writes were scratch outputs in /tmp/bc). REPORT.md §1a claims "clairvoyant mean on set1000, n=300 (shuffles 1-300): 13,194 +- 35".
* **Raw output:** `21sol/cv_set1000_st1.txt` (300 lines: seed, best, clears, streak bonus, perfect) = shards `out3/s1k_st1_{0..3}.out` (300/300 identical). Produced by `dp2.c` (value-guided beam, 60,000 states/layer, TD value `m1.bin`).
* **No action sequences were saved.** dp.c/dp2.c keep per state only (score, clears, streak bonus); the winning path is never reconstructed. So "replay through bench sim" is not possible without a rerun.
* **Arithmetic:** mean 13,193.7, SE 35.0 (sd 606, n-1), n 300, min 11,300, max 15,000; every score is a multiple of 50 (consistent with the rules).
* **Shuffles:** seeds 1..300 = first 300 lines of bench `set1000` (`21sol/set1000_vals.txt` equals bench set1000 mapped to card values on 1000/1000 lines, my own check). The output files do not record which deck file was used; re-running `dp2n` (read-only use of the 21sol binary, 3 seeds, nice 19) with DECKFILE=set1000_vals.txt BEAM=60000 reproduced seeds 1-3 exactly (13150 / 12800 / 14000, same clears/streak bonus/maxstates as the saved lines). `21sol/decks.txt` (engine.js seeds, used for the 7 exact checks) is a different file.
* **Stays per card:** the DP takes max-stays-per-card as an argument (`argv[3]`); total stays per game = 2 (RULES). `out3/s1k_st2_*` has 77 shuffles (seeds 1-188 interleaved shards) with 2 stays/card: recomputed **77/77 identical best values to the 1-stay run** (mean diff 0), as 21 says. Exact (unpruned) DP, seed 1 on decks.txt: 11,900 with 1 and with 2 stays/card (identical state counts). The older `out/dp_*.out` files (13,400 / 13,300 / 13,250 / 13,500 on seeds 1/76/151/226 vs `out/dp1_*` 11,900 / 14,000 / 12,750 / 12,550) conflict with that, but decks.txt was rewritten at 11:07 as they were produced and they come from an older build; my fresh exact run of seed 1 equals the dp1_ value, so I treat dp_* as stale (not used by the 13,194 claim).
* **What the number means:** the beam only explores legal-by-its-model plays, so 13,194 is a LOWER bound on the true clairvoyant optimum if the DP's rule tables (21sol `game.h`) equal the bench rules; the earlier bench-vs-game.h cross-check (my xcheck, 0 disagreeing games) covers the tables. Not verified end to end for these 300 paths.
* **Rerun that logs actions (not started):** copy dp2.c to a scratch dir (not 21sol), store a parent pointer per state per layer (about 210k states x 52 layers x ~12 B ~ 130 MB RAM per shuffle), output the winning action list. Cost: 2.1-2.7 CPU-s per shuffle (their log) -> about 11-14 CPU-min for 300 shuffles, roughly 20-40 min wall with 4 workers at the current box load; then replay through refsim/native sim (seconds).

## Mac timing kit, box run (bench/mac_timing, run 2026-11-18 ~13:15 PST, box CPU = shared Xeon x8, load ~27)
`node run_timing.js`; actions replayed through refsim: 6/6 scores identical. Times are 'bench box CPU, not MacBook wall'.
| engine | game (dev200 line) | score | think CPU s | think wall s (loaded box) | max decision CPU s |
|---|---|---|---|---|---|
| shipped52 | 1 | 9050 | 1.2 | 2.9 | 0.1 |
| shipped52 | 2 | 10350 | 0.8 | 1.8 | 0.1 |
| shipped52 | 3 | 8150 | 0.7 | 1.6 | 0.1 |
| pooled:16:26 (cpu clock) | 1 | 10050 | 29.6 | 67.5 | 28.7 |
| pooled:16:26 (cpu clock) | 2 | 10100 | 8.8 | 11.3 | 8.1 |
| pooled:16:26 (cpu clock) | 3 | 8150 | 12.9 | 31.4 | 12.4 |
Browser page: real headless Chrome 156 on the box ran shipped52 game 1 through the unmodified adapter shim: score 9050 (same as Node); wall 164 s only because that run was nice 19 on a starved box. Pooled was not run in the browser on the box.

### Mac timing kit: exact-solver rate for pooled:16:26 (box, 2026-11-18 ~13:30 PST; bench box CPU, not MacBook wall; load ~20-27)
Counter = solver's own `newPositions` (new table positions per game, from the adapter's `--timelog`), time = exact phase (moves with <= 16 cards left).
| game | new positions (M) | exact phase CPU s | exact phase wall s | M positions / CPU-s | M positions / wall-s |
|---|---|---|---|---|---|
| 1 | 21.95 | 28.0 | 57.0 | 0.78 | 0.39 |
| 2 | 7.25 | 8.3 | 18.9 | 0.87 | 0.38 |
| 3 | 10.88 | 11.8 | 26.5 | 0.92 | 0.41 |
| overall | 40.09 | 48.1 | 102.4 | **0.83** | **0.39** |
Browser (headless Chrome 156 on the box, game 1 only): 21.95 M positions (identical count and score 10050), exact phase 57.3 s wall = 0.38 M positions/wall-s, same as Node's wall rate. Per-game table sizes (22 M / 7 M / 11 M) are far below the 47 M memory limit (70% of 2^26).
Caveat: this box is shared (load 20-27), so CPU rates are likely lower than on an idle machine (cache/SMT contention) and wall rates much lower than CPU rates.

## Pre-registered predictions
- 2026-11-18 13:33 PST, 21 Theorist, before exact14 readout: exact14 (unlimited) vs shipped52 gain ~ +100 +- 17 pts/game (9-12 cards: 58+-9, 13: 36+-14, 14: 6+-5; from regret map on dev200; 13/14 from 19 games).
- 2026-11-18 15:51 PST, 21 Theorist, before deeper:16 vs shipped52 set5000 readout (run in progress, no partial results shared): predicted gain +87 +- 8 pts/game (71.5 at rem<=13 from corrected regret map on all set1000 games, plus ~16 at rem 14-16). Pre-stated rule: measured <= +55 (about 60% of prediction) means regret method biased upward; within 2 SE of +87 means the set1000 shortfall was sample fluctuation.
  - Outcome (16:35 PST): no set5000 readout; run stopped under the 1,000-game cap. Against set1000 (already known when the prediction was made, so not a blind test), deeper:16 measured +55 +- 15, which is 1.9 sigma under +87. Status: NOT CONFIRMED BLIND.
