# Regret map of the champion (shipped52) — 21 Theorist, for 21 Search and 21 Learner
Rule used everywhere: **one Stay per card** (bench/refsim.py, engine.js, RULES.md). The 13,194 clairvoyant bound (/workspace/21sol/REPORT.md) is **unverified on the bench for the same Stay-rule reason** (dp.c-family code allowed two Stays per card); do not treat it as a bench ceiling until re-derived with one Stay per card.
Code and raw data: `experiments/regret_map/` (README at the end of this file). "Cards left" counts the current card (engine `st.rem`).

## CORRECTION (Nov 18, 3:30 PM PST): the "≈ +94 predicted" was an over-estimate; the ≤13-card exact regret is **71.5 ± 4.3 per game** (1,000 games), against +34.6 ± 13.7 measured
**Read this before the preliminary section below.** Files: `experiments/regret_map/{set1000_check.txt, set1000_summary.txt, mc_value_check.txt, martingale_*.txt, exact13_vs_V13.txt, check_*.py, mc_check.js}`.

**What changed.** I re-ran the exact regret on **all 1,000 set1000 games** (champion shipped52 replayed with my driver: 1,000/1,000 per-game scores equal the Referee's `a_score`) and on all 200 dev200 games, at 13 and fewer cards left (exact2, one Stay per card; logCap 25; 21 games have a 13- or 12-card solve that overflowed; those regrets are counted as 0, so the totals are slightly low).
| cards left | regret/game, set1000, 1,000 games (mean ± SE) | dev200 (200 games; earlier text) | first estimate in this file |
|---|---|---|---|
| 13 | **19.3 ± 2.2** | 19.4 | 35.8 ± 14.4 (19 games only) |
| 12 | 24.3 ± 2.3 | 20.3 | 19.7 ± 3.5 |
| 11 | 15.9 ± 2.0 | 22.7 | 22.3 ± 6.2 |
| 10 | 9.5 ± 1.5 | 8.2 | 10.6 ± 3.5 |
| 9 | 2.5 ± 0.7 | 3.4 | 5.6 ± 2.8 |
| ≤8 | 0.0 | 0.0 | 0.0 |
| **total ≤13** | **71.5 ± 4.3** (9–12 alone: 52.2) | 73.9 ± 10.3 (191 complete games) | 58.2 (9–12) + 35.8 (13) ≈ 94 |
- **Cause of the +94:** two small-sample errors added up. The 13-card number came from 19 games (every 3rd game, SE 14) and was 1.1σ high; the 9–12 number came from dev200 only and was a little high. With 1,000 games the prediction is about 71 (a slight under-estimate because of the 21 unsolved games).
- **What remains:** measured exact13 − shipped52 on set1000 = **+34.6 ± 13.7** (Referee), +32.9 ± 13.8 on the 979 games where I also have regret. Predicted 71.5 → **gap −36 ± 14 (2.6σ)**. On dev200 it goes the other way (realized +99.5 ± 35.2 vs 73.9; gap +21 ± 34, my own exact13 run). Pooled over 1,200 games: predicted ≈ 72 ± 4, realized ≈ 45 ± 13, gap ≈ −27 ± 13 (about 2σ). I did **not** find a mechanism; the evidence below says it is not a flaw in my regret calculation or in exact2.
- **Checks that pass (no bias found):**
  1. *Identity:* the 510 of 979 games with zero predicted regret all have a measured paired diff of exactly 0 (0 exceptions); my own exact13 run reproduces the Referee's `b_score` in 189 of 189 games, and every ≤13-card decision in my exact13 runs (2,310 on set1000, 2,587 on dev200) was answered by the exact solver: **no give-ups or overflows in exact13** (so "bias candidate b" is ruled out; the think log only has timings, so I checked with per-decision flags).
  2. *Value model vs the engine (Monte Carlo):* from logged positions at 8–13 cards left I played the exact policy on random orders of the unseen cards with the engine's own scoring (Perfect Bonus, streaks, busts included): mean(final − exact value) = −0.3 ± 2.7 (8 cards, 20,000 playouts), +0.7 ± 2.8 (9), −1.5 ± 2.7 (10), +0.3 ± 3.2 (11), −1.6 ± 3.4 (12), −3.5 ± 3.8 (13, 96 states, 19,200 playouts). So exact2's V matches the engine at ±4 points, and nothing is double counted or missing (Perfect Bonus and streak terms are right at these depths).
  3. *One decision per card:* a decision is one (Stay-or-not, column) action for one card; each logged step is counted once, and the 12,902 per-step martingale residuals (score now + Q*(move) vs score next + V*(next state)) average −2.2 ± 1.3 per step, with no category (stay vs build, bust, clears, busts-before, Stays left) off by more than noise (`martingale_by_kind.txt`).
- **Where the shortfall actually shows:** the realized scores after 13 cards left are below exact2's value on set1000 for both policies: exact13 −65 ± 18 (976 games), champion −78.6 ± 17 against −(its own later regrets). The Monte Carlo above says the expectation of that residual is ≈0 (−3.5 ± 3.8 at 13 cards), so the set1000 shuffles gave worse-than-expected endgames for this sample: a 3.5σ fluctuation of paired, correlated quantities, or something about set1000's shuffles I could not identify (dev200: exact13 −14.7 ± 38.9, consistent with 0). Single decisions are noisy (SD of a game's diff ≈ 430, regret SD ≈ 133), so per-game realized diffs correlate only 0.20 with expected regret (slope 0.66; grouped by regret quartile in `set1000_check.txt`: zero-regret games +0.0; positive quartiles predicted 15 / 56 / 130 / 370 vs realized −40 / −41 / +136 / +218).
- **Use these numbers:** gain from exact play at ≤13 cards = about **+35 measured (Referee, paired, 1,000 games), expected ≈ +70 from regret**; plan on the measured value and treat anything between 35 and 70 as possible.
- **Do the bounds still stand?**
  - **14–16 cap (15.9 ± 6.7 on 19 games):** still consistent with the Referee's deeper:16 − deeper:13 = +21 ± 9 (paired, same shuffles). But the 19-game subsample ran 1.1σ high at 13 cards and the same games feed this band, and four overflow games are excluded (which pushes the other way), so quote it as "roughly 10–25 per game" and use the measured +21 ± 9 as the figure.
  - **≥16 sampled gain (+24.3 ± 5.7) and 13–16 (+23.7 ± 5.8):** these were never exact bounds. They are net flip gains of 253 re-checked decisions as scored by sampled reference A (shipped-network rollouts, validated at 11–12 cards to recover ≈ 70–80% of exact regret). The ≤13 miss was a small-sample error in exact numbers (19 games), not a sampler flaw, so they are not invalidated, but they are not verified by a bench game: **treat "≥24" as "about +24 ± 6 under reference A, unconfirmed on the bench"**, not as a guaranteed gain or a bound, and expect the same 0.5–1.0× realization seen at ≤13 cards.
  - **Sanity test claim (≤13 not exact in shipped52):** stands, now confirmed by the Referee (exact13 beats shipped52 by +34.6 ± 13.7) and by 326 of 1,000 games having a nonzero paired diff (my regret is zero in 510 of 979 games, and in all of those the diff is 0).
- Note on the earlier "parity13 matches shipped52" claim: 326 of 1,000 set1000 games have a different score between shipped52 and the unlimited-budget exact13, so that parity claim does not hold for the budgeted shipped52 on these games.

**Set1000 leak breakdown at ≤13 cards (champion move class, regret > 0.01; 1,000 games; `set1000_summary.txt`):** plain placement (no Stay) 41.1 / game (57%); Stay-then-place 11.5 (16%); playing a 21-clear 7.5 (11%); placement after a bust already happened 7.4 (10%); the rest ≈ 3.
Per cards left (set1000, ±SE): 13: 19.3 ± 2.2 · 12: 24.3 ± 2.3 · 11: 15.9 ± 2.0 · 10: 9.5 ± 1.5 · 9: 2.5 ± 0.7. The dev200 leak tables below are unchanged and were computed on a different (smaller) sample; where they differ, prefer the set1000 numbers here.

## PRELIMINARY (read this first): exact regret in the 14–16 cards-left band, and a failed sanity test at ≤13
Champion = bench `shipped52` config played on the first 200 games of `bench/shuffles/dev200.txt` (an analysis set, never an acceptance set); score 8,738.8 ± 90.9; replayed through `bench/refsim.py`: **0 score mismatches in 200 games**. Regret of a decision = exact value of the best legal move − exact value of the champion's move, from the engine's `exact2` solver (one Stay per card). I checked `exact2` against my own independent Rust solver on 9,541 positions at ≤6 cards left (max |difference| 0.0005, one Stay per card in both). By the performance-difference lemma, "exact play from here" minus "champion play from here" equals the sum of the champion's per-decision exact regrets along its own games, so the numbers below are caps on what a deeper/longer exact solve can add, *as measured on these games*.

| cards left | games solved exactly | exact regret per game, mean ± SE across games |
|---|---|---|
| **14–16 band** | **19** (every 3rd dev200 game, g mod 3 = 0, of 67 planned; the run was stopped there because the box is overloaded) | **15.9 ± 6.7** (16: 2.1 ± 1.2 · 15: 8.1 ± 4.4 · 14: 5.8 ± 4.8); 9 of the 19 games have any regret in the band |
| 13 | same 19 games | **35.8 ± 14.4** (superseded: 19.3 ± 2.2 on 1,000 games, see CORRECTION) |
Caveats: (1) small n, SE ≈ 40% of the mean: read as "roughly 10–25 points per game", not as a precise value. (2) Four sampled games (6, 36, 42, 75) overflowed the 16-card exact table (logCap 26) and are excluded; they are probably the harder positions, so the band is, if anything, understated. (3) This is a single-engine cap: compare it with the **paired** SE from the Referee's 300-game screen, not with 38. (4) It is a cap only for the 14–16 band; it does not include what the budgeted champion still loses at ≤13 cards (next table).

### Sanity test "the champion is already exact at ≤13 cards left": **FAILED as the bench runs it**
| cards left | champion decisions | champion's own exact solver answered | exact regret per game ± SE (200 games) |
|---|---|---|---|
| 13 | 199 | 4 (2%) | 35.8 ± 14.4 (19 games only) |
| 12 | 199 | 28 (14%) | 19.7 ± 3.5 |
| 11 | 199 | 76 (38%) | 22.3 ± 6.2 |
| 10 | 199 | 148 (74%) | 10.6 ± 3.5 |
| 9 | 199 | 192 (96%) | 5.6 ± 2.8 |
| 8 … 1 | 199 | 199 (100%) | **0.00** in every decision |
The shipped spec is `exact: {xK: 13, logCap: 21, budget: 100000}` and `champion_adapter.js` only zeroes `deepen.budgetMs`: `withExactEnd` abandons a move's exact solve after 100,000 new positions and plays the network search instead, which happens in most decisions with 10–13 cards left. The exact regret at 9–12 cards left is **58.2 ± 9.1 points per game** (106 decisions with regret >0.01 of 346 fallback decisions; median regret 57, mean 110, top-10 decisions = 37% of the total; the total is slightly understated: 6 solves at 11–12 cards overflowed the table). In decisions where the champion's exact solver did answer, my regret is 0.00 (pipeline self-check). This contradicts "parity13 matches shipped52 game for game": please check whether that parity run used the unlimited-budget `exact13` config (`results/x_specs_early.json`) while shipped52 is the budgeted one. At ≥14 cards left the cap above applies on top of this.

## Method (what each number is)
- **Exact reference (≤12 cards left, all 200 games; 13–16 cards on the 19-game subsample above):** `experiments/regret_map/exact_regret.js` solves each logged champion position with `exact2` (WebAssembly kernel), lists the exact value of every legal action (symmetric duplicates merged) and takes best − champion. Per decision, the champion's move is whatever it played in the bench-config run (`play_log.js`, no peeking; the deck order only deals cards).
- **Sampled reference ("reference A", ≥13 cards left, 195 of 200 games):** for decisions where the champion's own root scores show ≥2 distinct afterstate classes within 100 points of its best (≤3 candidates, the champion's move always included), paired random orders of the unseen cards (common random numbers), 16–64 rollouts (stop early when every alternative is clearly worse): play 8 cards with a cheap policy (shipped network, 0-ply), then use the shipped network's value of the position (variance reduction), or the exact value once ≤8 cards are left. It is a deeper-lookahead reference with the *same* network, not truth; its value is relative to the champion's depth-1/2 search. Decisions with a single distinct class, or alternatives >100 points below the champion's best, count as regret 0 (unverified assumption, see "validation").
- **Why not plain full rollouts:** a first pass with full-game rollouts (network 0-ply policy, 48 rollouts, 25–50 games, files in `pass1_full_rollouts/`) had a paired SE of ~130 points per decision (about 2× larger than the horizon-8 version, and 12× slower); it could not resolve anything. Kept only as a record.
- **Three estimators for the sampled part** (decision-level noise ≈ 60 points, so selecting the "best" alternative on the same samples is biased upward; I report what is unbiased):
  1. *Net flip gain* (unbiased, the only actionable number): decisions where the first pass found an alternative that looked better (advantage ≥40 and z ≥1.5; 253 decisions) were re-evaluated with 64 fresh paired rollouts; the mean of the fresh differences is an unbiased estimate of what flipping those decisions to the alternative gains, as scored by reference A.
  2. *Empirical-Bayes regret* (model-based: a normal prior per phase, estimated from the same data): validated only at 11–12 cards (below); for ≥16 cards it is dominated by the prior (it assigns positive regret to nearly every decision), so **do not rank leak categories with it**; it is in `analysis_full*.txt`.
  3. *Naive max* (upward biased; ignore).

## Validation of the sampled reference against exact (11–12 cards left, same decisions)
| cards left | exact regret/game on the decisions the sampler evaluated | empirical-Bayes sampled estimate | not evaluated by the sampler (single class / outside the 100-point window), exact |
|---|---|---|---|
| 11 | 19.1 | 15.9 | 3.3 |
| 12 | 17.4 | 12.1 | 2.4 |
So reference A recovers roughly 70–80% of the exact regret at 11–12 cards, and the "unevaluated = 0" assumption loses ≈ 12–14% at these depths (`val_compare.py`). Treat sampled totals as conservative lower estimates of regret at those depths; further from the end the leaf values rely more on the network and the reference is weaker.

## Where the champion loses points, per game (dev200, 200 games)
### Exact part (≤12 cards left): 58.2 ± 9.1 points per game — a SEARCH/compute-budget leak
By phase: 12 cards 19.7 ± 3.5 · 11 cards 22.3 ± 6.2 · 10 cards 10.6 ± 3.5 · 9 cards 5.6 ± 2.8 · ≤8 cards 0.
By what the champion did (share of the 58.2): stacks a card on a live 1-card column (→2 cards) 22.6 ± 4.6 (39%) · uses a Stay 11.2 ± 3.6 (19%) · takes a clear 7.5 ± 3.6 (13%) · puts the card into an empty column 6.1 ± 1.9 (11%) · stacks to 3 cards 5.6 ± 3.8 (10%) · to 4 cards 4.5 ± 2.7 (8%) · busts on purpose/forced 0.6.
By what the better move was: another live column 17.0 ± 6.1 (29%) · empty column instead of stacking (or the reverse) 11.0 ± 2.9 (19%) · Stay over-use (a Stay was not needed) 8.8 ± 3.2 (15%) · Stay under-use (a Stay was better) 6.6 ± 3.8 (11%) · 4-card/5-card chase 4.4 ± 2.7 (8%) · took a clear but should have built 3.4 ± 1.6 (6%) · declined a clear but should have cleared 3.4 ± 1.6 (6%) · other Stay/placement choices 2.4 ± 1.7 (4%) · sacrificing a column on purpose 0.6.
By position: no busts so far 48.7 (84%) · exactly 1 Stay left 30.0 ± 7.6 (52%; 0 left 18.0, 2 left 10.2) · streak counter 0: 53.5 (92%) · no empty column 36.8 ± 8.0 (63%) · no 4-card column 55.0 (94%) · soft-ace column present 18.2 ± 7.2 (31%) · no column would bust on this card 33.8 ± 8.0 (58%).
Pattern: these are quiet mid-structure decisions (all columns 1–2 cards, nobody close to 21, a Stay still in hand), not bust/clear decisions; most are high-value single errors (a handful of decisions of 400–700 points).

Examples (exact; "h" = hard total, "s" = soft total; columns left to right = col0..col3; "-" = empty):
- *Which live column* — dev200 game 6, move 41, 11 cards left, 1 Stay: [1c/h7 1c/h10 1c/s11 2c/h13], card **2**: champion col3, better col2: exact regret **723**. Game 25, 10 cards left: [2c/h17 1c/h10 3c/h14 1c/h7], card 10: champion col3, better col1: 296. Game 6, 12 cards left: [1c/h7 1c/h10 1c/s11 1c/h3], card 10: champion col3, better col0: 286. Game 83, 9 cards left (the champion's exact solve ran out of budget): [1c/h5 1c/h8 2c/h13 1c/s11], card 7: champion col0, better col1: 239.
- *Empty column vs stacking* — game 78, 11 cards left: [1c/h10 1c/h7 1c/h9 -], card 10: champion col1 (stack on the 7), better: the empty col3: **466**. Game 17, 12 cards left: [1c/h8 - - 1c/h10], card 10: champion col0, better col1: 151. Game 42, 12 left: [2c/h13 1c/h10 1c/h7 -], card 3: champion col2, better empty col3: 142. Game 38, 12 left: [1c/h10 2c/h14 - 1c/h10], card 6: champion col0, better empty col2: 128.
- *Stay over-use* — game 42, 9 left: [2c/h13 2c/h19 2c/h10 1c/h9], card Ace: champion Stay col3 + col3, better col2 with no Stay: **411**. Game 31, 11 left: [2c/h15 2c/h19 2c/h8 1c/h10], card 10: champion Stay col3 + col3, better col3 with no Stay: 313. Game 95, 9 left: [2c/h19 1c/h10 2c/h17 1c/h10], card 5: Stay col1 + col1 vs plain col1: 230. Game 151, 12 left: [1c/s11 2c/h11 2c/h18 2c/h10], card 8: Stay col2 + col2 vs col3: 198.
- *Stay under-use* — game 59, 11 left, 2 Stays: [2c/h15 1c/h7 1c/h10 2c/s19], card 6: champion col0, better Stay col0 + col0: **650**. Game 60, 11 left: [1c/h4 2c/h12 1c/h3 2c/h15], card 2: champion col2, better Stay col1 + col1: 371. Game 189, 10 left: [1c/h10 1c/s11 1c/h10 2c/h7], card 10: champion col1, better Stay col0 + col0: 136.

### 13–16 cards left (exact on 19 games; sampled on 195 games)
Exact (19 games): 13 cards 35.8 ± 14.4; 14–16 band 15.9 ± 6.7 (preliminary section). Sampled net flip gain at 13–15 cards (195 games, 40 flipped decisions): **+23.7 ± 5.8 per game**; 20 of 40 are confirmed individually (z>2). Decision types (net fresh gain/game): empty column vs stacking 9.3 ± 3.3, another live column 6.5 ± 2.8, 4-card chase 3.7 ± 2.8, clear vs build 3.7 ± 1.9. Examples (fresh paired advantage ± SE, 64 rollouts): game 181, 14 left, 1 bust: [2c/h14 3c/h14 2c/h17 -], card 3: champion col1, better empty col3: **+515 ± 52**. Game 1, 14 left: [2c/h11 1c/h3 2c/h11 1c/h5], card 4: champion col3, better col1: +396 ± 51. Game 7, 13 left: [2c/h7 1c/h6 2c/h13 1c/h7], card 10: champion col3, better col1: +249 ± 43. Game 91, 13 left, 1 bust: [3c/h13 - - 2c/h16], card 2: champion col0, better col1: +232 ± 44.

### ≥16 cards left (sampled, reference A): net flip gain **+24.3 ± 5.7 per game** (213 decisions); not a regret total
| cards left | flipped decisions | net gain per game (fresh, unbiased) |
|---|---|---|
| 52–41 | 85 | 6.4 ± 3.0 |
| 40–31 | 53 | 2.5 ± 2.6 |
| 30–21 | 48 | 4.3 ± 2.1 |
| 20–16 | 27 | **11.2 ± 3.4** |
(For 13–15 cards left: 23.7 ± 5.8, above.) This is a lower bound for reference-A regret, and reference A shares the champion's network, so it mostly measures *lookahead* leaks, not evaluator leaks. Concentration (≥16 cards left, net gain/game): decisions with **no empty column 20.9 ± 4.4** (of 24.3; 1 empty: 1.8 ± 3.0; 2 empty: 1.7 ± 2.2) · **decisions where the champion uses a Stay 13.1 ± 3.3** (Stay over-use 9.2 ± 2.5) · champion stacks onto a 1-card column 6.1 ± 2.7 · by Stays left: 2 left 11.5 ± 3.9, 1 left 9.1 ± 3.5, 0 left 3.7 ± 1.8 · busts so far 0: 23.9 ± 5.6 (1 bust: 0.4 ± 0.9). Early "empty vs live column" decisions show no net gain (−0.5 ± 3.2): not a leak I can detect.
Examples (≥16 cards left, fresh advantage ± SE):
- *Stay decisions* — game 65, 16 left, 1 Stay: [2c/h17 2c/h11 2c/h20 3c/h12], card 8: champion Stay col2 + place col3, better Stay col2 + place col2: **+340 ± 74**. Game 79, 17 left: [2c/h14 2c/h13 2c/h15 2c/h12], card 10: champion Stay col0 + col0, better Stay col1 + col1: +275 ± 78. Game 174, 17 left: [2c/h13 1c/h7 2c/h11 2c/h16], card Ace: champion Stay col0 + col0, better no Stay col0: +271 ± 78. Game 35, 40 left: [2c/h18 2c/h17 2c/h20 1c/h5], card 6: champion Stay col2 + col3, better plain col3: +162 ± 45. Game 36, 16 left: [1c/h10 2c/h12 1c/h10 2c/h17], card 10: Stay col0 + col0 vs plain col0: +126 ± 30.
- *Full board (no empty column), plain placement* — game 147, 19 left: [2c/h15 1c/h4 2c/h15 1c/h9], card 5: champion col3, better col1: +186 ± 57. Game 91, 41 left, 2 Stays: [2c/h12 2c/h16 1c/h3 1c/h9], card 10: champion col3, better col2: +160 ± 51. Game 92, 44 left: [2c/h12 1c/h7 2c/s13 1c/h3], card 10: champion col1, better col3: +183 ± 67. Game 121, 17 left, 0 Stays: [2c/h20 2c/h14 2c/h19 3c/h16], card 10: champion col0, better col2: +137 ± 55.

## Search problem or evaluator problem?
- **≤12 cards left (58.2 ± 9.1/game): search/compute.** Every decision the champion's exact solver answers has 0 regret; all regret is in budget fallbacks (100,000-position cap). Fix = raise/pool the exact budget (Search's pooled-clock idea; `--config exact13/exact14` in the bench adapter; `experiments/exact-endgame-deeper`). Also an evaluator signature: at 10–12 cards the network's value for the move it chose is **262 ± 19 / 238 ± 21 / 256 ± 31 points below the exact value** (12 / 11 / 10 cards left; a roughly constant offset hurts nothing, but its ordering is wrong in 106 of 346 fallback decisions = 31%).
- **13–16 cards left (cap above): search**, same mechanism (exact solver exists, so a longer solve removes it).
- **≥16 cards left (+24 ± 6/game net, lower bound): mostly lookahead/evaluator-resolution.** The flaggable errors are close calls in 2-card-column "full board" positions and Stay decisions (the champion's value gap to the better move is ≤100 by construction of the candidate set). A deeper or sampled search at those nodes (Search) and training data with more such positions (Learner) are the two routes; I cannot separate them with a reference that uses the same network. A reference that does not use the network (full rollouts) needs ≳10× more samples than the box allowed (see "Why not plain full rollouts").
- **Evaluator (Learner):** the late-game value offset of −250 at ≤12 cards; Stay decisions in mid-game; 2-card full boards. Not found as separate leaks (exact part): deliberate bust/sacrifice decisions (≈1%), clear-vs-build calls (6% each way), 5-card chase (8%), streak ≥1 positions (8%, in line with their share of decisions), after-bust positions (16% of regret vs 24% of decisions).

## Not done / limits (honest list)
- Exact at 14–16 cards covers 19 of 67 planned games (a 16-card solve takes minutes on the loaded box and 4 games overflowed the table); exact at 13 on those 19; exact at ≤12 on all 200 games.
- Sampled stage: 195 of 200 games (the last game of each of 5 workers is dropped); candidates beyond the champion's top three, alternatives outside a 100-point window, and decisions with a single distinct move are assumed to have 0 regret (validation shows ≈ 12–14% is lost to this at 11–12 cards left).
- Early/mid-game regret totals are **not resolved**: only the net flip gains above (reference A, which is the champion's own network at depth ≈ 8 more cards). They were *not* verified by playing games; a flip rule built from them must go to the Referee (paired, same shuffles).
- Single analysis set (dev200, 200 games) and one champion run; per-game SEs treat games as independent.

## Reproduce (`experiments/regret_map/`)
`play_log.js` (champion on dev200 → `data_dev200_champion_all.jsonl`), `parity_bench.py` (score parity vs bench refsim), `validate_exact.js` (exact2 vs my Rust solver), `exact_regret.js` (exact regrets; env REXMIN, LOGCAP, GMOD, ONLY), `regret_sampled.js` (reference A; `run_sampled.sh`), `confirm.js` (fresh-sample confirmation), `analyze.py`, `band.py`, `exact_extras.py`, `rem_table.py`, `conf_analyze.py`, `val_compare.py`. Outputs: `ex*.jsonl`, `samp_*.jsonl`, `conf_*.jsonl`, `analysis_full*.txt`.

## PRE-REGISTERED PREDICTION: set5000, deeper:16 vs shipped52 (written 2026-11-18 15:25 PST, before the result)
- Regret-based prediction (calculated): +87 ± 8 per game.
  - The ≤13-card part is 71.5 ± 4.3 (exact regret of shipped52, set1000, 1,000 games).
  - The 14–16-card part is about +16 ± 7 (exact cap 15.9 ± 6.7). deeper:16 is assumed to be nearly exact in that band.
- Decision rule:
  - If the measured gain is ≤ about +55 (about 60% of the prediction or less, with paired SE about 6–7 at n=5000), I treat it as a systematic overestimate by the regret method, not noise.
  - If it lands within 2 SE of +87, I treat the set1000 shortfall as a sample fluctuation.
- For reference (measured, set1000): +55 ± 15.

### Update 2026-11-18 16:32 PST: set5000 stopped by Landon's 1,000-game cap
The pre-registered test can't run. Two existing set1000 results already test the prediction, with no new games:
- deeper:16 vs shipped52 measured +55 ± 15, against +87 ± 8 predicted. That's a gap of −32 ± 17 (about 1.9σ).
- exact13 vs shipped52 measured +34.6 ± 13.7, against +71.5 predicted. That's a gap of about −36 ± 14 (2.6σ).

The two use the same set1000 games, so they're correlated and not independent evidence. Working rule: treat regret-map gains as about 0.6× the predicted value (a guess, set1000 only) until a different 1,000-game set says otherwise.
