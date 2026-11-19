# evaluator-v2 — design doc (owner: 21 Learner)

Status: DRAFT / proposal. Nothing here is ACCEPTED (Referee only). Provenance rule (CHARTER, 2026-11-18): every number that comes from Landon's repo
(`engine/twentyone-solver` README, results/, research_notes/, the brief) is **claimed, unverified** unless a row says "measured here".
Calculated numbers, measured numbers and guesses are labelled **[measured]**, **[calc]**, **[guess]**, **[claimed]**.

Folds in what were going to be `learner-ntuple-eval.md` and `learner-early-bias-fix.md` (sections 5 and 6). Code: `experiments/learner-sim/`.

## 1. Fresh measurement: value-to-go bias by phase of the champion network (`ship_nn.json`)  [measured]

**Setup.** Policy = `engine/twentyone-solver/results/ship_nn.json` (the README's network-v3 policy: NN 56-128-48 + depth-1 expectimax + selective 2-deeper + exact last 4 cards; *no* exact-13 solve; identical weights to `shipped_policies.json["52"]`).
Played through the **bench harness** (`bench/run_one.py`, bench simulator, shuffles `bench/shuffles/set1000.txt`) via `experiments/learner-sim/bias_adapter.js`, a copy of `champion_adapter.js` that sees only the observable state and additionally logs, per decision,
`p` = network value of the position after the chosen move, `q` = the policy's search value for that move, and the realized score (harness `game_over` score, incl. Perfect Bonus).
**457 games** of set1000 (the run was stopped for box load, not on outcomes; the box is oversubscribed so the full 1,000 was not reachable; chunk-local game ids, so these are the first ≈150 games of each of the 3 worker chunks).
Bias = realized points still to come after that placement − network prediction (positive = network UNDERestimates). Binned by cards dealt (1..52). SE = sd/√n over games; band rows use per-game band means (cluster-correct).
Sanity: mean score of this policy on these 457 games = **8,784 ± 58 (SE)**, 3-bust endings 1.3% (the Referee's full-champion `shipped52` on all of set1000 = 8,872 ± 38; they differ by policy [exact-13] and sample, so this is a consistency check, not a pairing).


Network bias (realized points-to-come after the placement − network value of that position), by cards dealt:

| bins (cards dealt) | n games | mean predicted | mean realized | bias (realized−pred) | SE | search-value bias (realized from before move − q) | SE |
|---|---|---|---|---|---|---|---|
| 1-5 | 457 | 8450 | 8757 | **+307** | 57 | +305 | 57 |
| 6-13 | 457 | 7893 | 8178 | **+285** | 54 | +277 | 54 |
| 14-26 | 457 | 6377 | 6612 | **+236** | 46 | +226 | 46 |
| 1-26 | 457 | 7242 | 7506 | **+265** | 49 | +257 | 49 |
| 27-39 | 457 | 4398 | 4560 | **+162** | 33 | +151 | 33 |
| 40-52 | 456 | 2403 | 2267 | **+52** | 16 | +28 | 14 |
| 1-52 | 457 | 5385 | 5460 | **+182** | 37 | +167 | 36 |

Per-bin curve (every 3rd bin; full curve in the .csv):

| cards dealt | n | mean pred | mean realized | bias | SE |
|---|---|---|---|---|---|
| 1 | 457 | 8479 | 8784 | +305 | 58 |
| 4 | 457 | 8444 | 8752 | +308 | 57 |
| 7 | 457 | 8185 | 8490 | +305 | 57 |
| 10 | 457 | 7860 | 8140 | +280 | 55 |
| 13 | 457 | 7445 | 7710 | +265 | 53 |
| 16 | 457 | 7009 | 7262 | +253 | 51 |
| 19 | 457 | 6538 | 6790 | +252 | 49 |
| 22 | 457 | 6051 | 6277 | +226 | 46 |
| 25 | 457 | 5600 | 5806 | +206 | 44 |
| 26 | 457 | 5456 | 5654 | +198 | 43 |
| 27 | 457 | 5328 | 5508 | +180 | 42 |
| 28 | 457 | 5171 | 5368 | +196 | 40 |
| 31 | 456 | 4706 | 4902 | +195 | 37 |
| 34 | 456 | 4255 | 4406 | +151 | 34 |
| 37 | 456 | 3777 | 3921 | +144 | 31 |
| 39 | 456 | 3488 | 3603 | +115 | 29 |
| 40 | 456 | 3354 | 3468 | +114 | 28 |
| 43 | 455 | 2881 | 2973 | +91 | 24 |
| 46 | 455 | 2393 | 2438 | +45 | 20 |
| 49 | 454 | 1801 | 1805 | +8 | 11 |

First half (1-26 cards dealt) bias by state (per-position pooled mean, SE ignores within-game correlation, so is a lower bound):

| group | n positions | bias | SE(naive) |
|---|---|---|---|
| busts=0 | 11682 | +261 | 10 |
| busts=1 | 187 | +396 | 112 |
| stays left=2 | 8728 | +280 | 12 |
| stays left=1 | 2059 | +213 | 26 |
| stays left=0 | 1095 | +241 | 38 |
| streak=0 | 9076 | +272 | 12 |
| streak=1 | 2127 | +240 | 23 |
| streak=2 | 566 | +251 | 39 |
| streak=3 | 105 | +195 | 94 |

Share of moves made by the exact endgame solver: 7.6% of all moves (these are in the last ≤13 cards).



**Verdict on the claim (the brief's "estimate of points still to come is 200-300 too low in the first half") — HOLDS in our measurement:** first 26 cards **+265 ± 49** (≈ 5.4 SE), first 13 cards +285…+307 (≈ ±55), declining almost linearly to +162 ± 33 (cards 27-39), +52 ± 16 (40-52) and ≈ 0 by card 49. Per-bin curve (every bin) in `experiments/learner-sim/results/biaslog_shipnn_set1000_curve.csv`.
Caveats: n = 457 not 2,000 (SE ≈ 50 per band; bin-level SEs 55-60 early); one policy (ship_nn); the search-value row shows the same bias (+257 ± 49), i.e. the 1-2 ply search does not repair it.
Differential structure (first half, naive SE, lower bound): busts=0 +261, stays-left 2/1/0 = +280/+213/+241, streak 0/1/2/3 = +272/+240/+251/+195 — **flat within noise** (the stays-2 vs stays-1 gap, 67 ± 29 naive, is the only ≈ 2-sigma difference; busts=1 has only 187 positions). So the error looks like a mostly phase-level shift, not a feature-dependent one — see section 3 for why that matters.

### 1b. Bias split by busts used, matched cards-left bands  [measured; same 457 games; n(2-bust) is tiny]
Question (from 21 Theorist `life-margin-schedule.md`): does the network over-price the 2nd bust, i.e. is bias(b=2) − bias(b=1) positive by ≈ +88 / +176 / +237 / +485 at 16 / 24 / 28 / 40 cards left?
Method: `experiments/learner-sim/bias_by_busts.py` on the same biaslog; busts = busts used after the placement; each game contributes ONE mean per (cards-left band, busts) cell, SE over games (cluster-correct); the two groups come from different games (unpaired).

| cards left | busts | games | positions | mean pred | mean realized | bias (real-pred) | SE (cluster) |
|---|---|---|---|---|---|---|---|
| 1-8 | 0 | 369 | 2887 | 2223 | 2244 | +21 | 15 |
| 1-8 | 1 | 83 | 526 | 1447 | 1473 | +26 | 34 |
| 1-8 | 2 | 41 | 220 | 1025 | 1064 | +39 | 43 |
| 9-16 | 0 | 396 | 3071 | 3525 | 3617 | +92 | 29 |
| 9-16 | 1 | 73 | 442 | 2819 | 2988 | +169 | 68 |
| 9-16 | 2 | 20 | 133 | 2667 | 2739 | +72 | 177 |
| 17-24 | 0 | 418 | 3277 | 4701 | 4861 | +159 | 36 |
| 17-24 | 1 | 49 | 320 | 3998 | 4248 | +249 | 116 |
| 17-24 | 2 | 11 | 53 | 3659 | 3435 | -225 | 385 |
| 25-32 | 0 | 443 | 3455 | 5877 | 6071 | +195 | 43 |
| 25-32 | 1 | 34 | 186 | 5106 | 5476 | +370 | 270 |
| 25-32 | 2 | 3 | 15 | 3836 | 4202 | +366 | 2073 |
| 33-40 | 0 | 457 | 3622 | 7083 | 7332 | +249 | 50 |
| 33-40 | 1 | 10 | 33 | 6161 | 7071 | +910 | 368 |
| 33-40 | 2 | 1 | 1 | - | - | - | - |
| 41-51 | 0 | 457 | 5027 | 8214 | 8513 | +299 | 56 |
| 41-51 | 1 | 0 | 0 | - | - | - | - |
| 41-51 | 2 | 0 | 0 | - | - | - | - |

Difference of biases (unpaired, games differ): b=1 minus b=0, b=2 minus b=1; a positive b2-b1 = network UNDER-prices the 2-bust state relative to the 1-bust state (= over-prices the 2nd bust).

| cards left | b1-b0 | SE | b2-b1 | SE | n(b1) | n(b2) |
|---|---|---|---|---|---|---|
| 1-8 | +5 | 37 | +13 | 55 | 83 | 41 |
| 9-16 | +77 | 74 | -97 | 190 | 73 | 20 |
| 17-24 | +90 | 122 | -474 | 402 | 49 | 11 |
| 25-32 | +175 | 273 | -4 | 2091 | 34 | 3 |
| 33-40 | +661 | 372 | - | - | 10 | 1 |
| 41-51 | - | - | - | - | 0 | 0 |


Reading (honest):
* **Cannot confirm or refute the Theorist's number.** 2-bust positions with ≥ 17 cards left occur in only 11 / 3 / 1 of 457 games (bands 17-24 / 25-32 / 33-40); b2−b1 = −97 ± 190 (9-16), −474 ± 402 (17-24), −4 ± 2091 (25-32). The sign at 17-24 is opposite to the Theorist's +176 (at 24) but is only 1.6 SE from it (−474 vs +176: difference 650 ± 402), so it is also consistent with it. Only ≤ 8 cards left is well measured (+13 ± 55, i.e. ≈ 0, which matches their exact result there). Natural play reaches 2 busts with ≥ 16 cards left in ≈ 4% of games (20/457) — exactly why a *synthetic* b=2 carousel is the only affordable way to measure/fix it (section 6, E2).
* **New observation (weak): 1-bust vs 0-bust.** Positions with one bust used show a larger underestimate than 0-bust positions at matched cards left: b1−b0 = +77 ± 74 (9-16), +90 ± 122 (17-24), +175 ± 273 (25-32), +661 ± 372 (33-40: 10 games, 2.5 SE alone); inverse-variance pooled over 9-40 cards left **≈ +101 ± 61 (1.7 SE)**. Not significant, but it points the same direction as the Theorist's finding (states with busts used are under-valued relative to b=0 beyond the common drift) and the Theorist reports the 0→1 step as calibrated; with n(b=1) = 10-73 games per band we cannot tell.
* Decision relevance is unchanged by this: the Theorist's flip analysis (≈ 0.8% of b=1 decisions, ≈ +0.3 ± 0.7 /game, their number) says even a correct fix is worth ≈ 0 points; our data can neither enlarge nor shrink that.

## 2. What the logs say was already tried for the evaluator (ALL claimed, unverified — none reproduced by us)

Source: `engine/twentyone-solver` README "What was tried", results/*.log, scratch/engine_agent logs. Gains are the repo's own paired numbers (their games, their seeds, their sim).

| # | attempt (as described in repo) | claimed result | note |
|---|---|---|---|
| 1 | CEM-tuned 40-weight hand evaluator v1→v4 (+ search depth 2-3) | 8,340 for v4 vs 7,233 baseline [claimed] | pre-network |
| 2 | NN v1: 56-128-48-1 MLP, MC return-to-go labels, 250k games by tuned-weights player + 200k games by NN1, half the games with one random move | 8,702 vs 8,455 (+247) [claimed] | shipped lineage |
| 3 | 3rd retrain pass on all data (nn3) | +16 ± 36 [claimed] — the "self-play retraining rounds: noise" row in EXPERIMENTS.md | NOT reproduced |
| 4 | width/depth: 16, 32, 64x32, 128x48; 256x96 | 128x48 ≈ +45 over 64x32; 256x96 −16 ± 35 on 4,000 val games [claimed] | |
| 5 | NN v2 `nn4_*`: label = λ·MC + (1−λ)·search value at next card (TD(0)-like, 1-card bootstrap), fine-tuned from v1 | λ=0.25: +31 ± 30 val, +27 ± 19 fresh; λ=0 (pure search value): +22 ± 30; λ=0.5: +12 ± 32; from scratch λ=0.25: +7 ± 33 [claimed] | the only TD-style label tried: one-step bootstrap from the SAME net, no exact anchor |
| 6 | NN v3 `nn5_*` (retrained for the +1,000 4-streak rule) | λ=0.25 +17 ± 24, 0.5 +16 ± 26, 0.75 +4 ± 28 (4,000 val games) [claimed] | shipped = nn5_td25 |
| 7 | 88-input features (`featurize2`: chance next 2/3 cards sum to column need, exact-deck column potentials, …) | fine-tune −9 ± 30, scratch −6 ± 35 (3,000 games) [claimed]; 56-input scratch on the same data −45 ± 35 | richer card-count inputs did not help |
| 8 | distribution network (52-bin CE) for win-chance play | −0.2 … −2.0 pp win chance; mean 8,732 vs 8,781 [claimed] | |
| 9 | late-game network on 3.9 M exactly-solved positions (11 cards left, 150 exact-player rollouts/start) | −12 ± 27 [claimed] | exact solver already covers those cards, so little to gain |
| 10 | sampled/stochastic look-ahead variants (`srl`) | −112 ± 57 … 0 ± 51 [claimed] | search, not evaluator |
| 11 | streak scaling in the search (×0.75 … ×2) | +20 ± 30 … −22 ± 42 [claimed] | |
| 12 | exact endgame from 12/13/14/15 cards | 8,913 / 8,941 / 8,966 / 8,980, n=1000 [claimed] | Search team's area |
| 13 | bigger-search "ceiling checks": 3-ply everywhere +27 ± 56, +100 rollouts −37 ± 97, whole-deck-known (clairvoyant) 12,657 [claimed] | | |

Not found anywhere in the repo (so, not a repeat): n-tuple/lookup-table evaluators; stage-specific (phase) value functions; targets generated by the
*champion* (exact-13 search) policy; exact-anchored multi-step λ-returns; evaluating a leaf change by anything other than whole-game score.
Everything the repo calls "no gain" for the evaluator sits inside ±30 (≈ 1 SE) — i.e. the evaluation of small evaluator edits at n ≈ 3-4k games has
~±30 resolution; an evaluator idea needs either a bigger expected effect or paired runs with n ≥ 5,000 (set5000) to be seen.

Datasets referred to by those logs (all in Landon's gitignored `scratch/`, **not on this box**): `d1.bin`, `d2.bin` (MC labels, 57 floats/row), `d3.bin`
(2,461,308 rows × 58, MC+TD labels), `d4.bin` (2,464,415 rows, nn5 era), `w1.bin` (real play to 12 cards + exact value; small, ~130k rows), the exact-labelled
`ex11` file (3,864,922 rows × 89 floats ≈ 1.4 GB). We do **not** need them: they were generated by weaker policies (the exact reason the lab wants
champion-generated targets) and we can regenerate rows with `gen_v2.js` (section 4). If the lead wants them anyway for bit-exact offline reruns of rows 5/6/9,
ask for `d3.bin` and `d4.bin` (≈ 570 MB each) first, `w1.bin` second (tiny).

## 3. What the measurement implies (reasoning [calc]; the test is E1 below)

* The search compares candidate moves at the same state. Leaves reached by different candidates have the same number of cards dealt, so an error that depends
  only on cards dealt (a *level* bias per phase) adds the same constant to every candidate and **cannot change a move**. Only *differential* error — error that
  varies with busts / stays / streak / column shapes / remaining-deck composition — changes decisions. A +250 level bias is therefore NOT by itself a reason for lost
  points; it matters only through its variation across state features (table in section 1, "by state").
* A level bias of this sign is partly *expected by construction*: the net is a 0-ply predictor trained on returns of weaker players; the shipped policy is that net **plus**
  1-2 ply search **plus** exact endgame, so realized returns exceed the net's forecast. Part of "bias" is the value the search adds. (Check: the bias should grow when
  more search is added, e.g. exact-13; the champion policy `shipped52` would show it — not measured by us yet.)
* Therefore the useful questions are: (a) how much of the error is differential (section 1 table: first-half bias by busts/stays/streak is flat within noise so far), and
  (b) whether any evaluator family reduces the *differential* error (decision-relevant), measured by whole-game paired score, not RMSE.

## 4. evaluator-v2 design

### 4.1 Two families on identical data/targets/split (offline, `train_v2.py`; both work on the raw state)
Input = (4 column contents as (n, hard total, ace, "two 7s" flag), remaining-deck counts per value, busts, stays, streak, cards dealt).
* **MLP**: 62 inputs (per sorted column: n one-hot(1..4), soft total/21, soft flag, hard/21, two-7s flag, P(next card busts), P(next card makes 21) from exact counts; 10 deck fractions; cards left; busts/stays/streak one-hots) → 128 → 48 → 1 (same shape as shipped for a fair comparison), Adam, cosine lr, MSE on targets/1000.
* **n-tuple additive tables** (canonical sorted columns, so column symmetry is free; 5 tables, 13 lookups per position): T0 global (cards dealt 0-52 × busts × stays × streak = 2,385);
  T1 single column id (440 ids) × phase(14) — shared by the 4 sorted columns; T2 *pairs* of columns (220² reduced ids) × phase(14) — shared by the 6 pairs (677,600 entries);
  T3 card-count tuple (phase × busts × bucket(#tens 0-16/2) × #aces × #sevens × bucket(#2-6s/4) = 56,700); T4 summary (phase × busts × stays × #empty columns × #columns with total ≥ 17).
  Fit by shrunk backfitting (each table in turn gets 0.7 × the in-cell mean residual / (count + 4)); 12 passes; no gradient, no learning-rate tuning, ~seconds per million rows.
  Cost per evaluation ≈ 13 table reads vs ≈ 13 k multiply-adds for the MLP [calc] — roughly 100× cheaper, which is the only reason to prefer it if equal in score.
* Compare: val RMSE vs the Monte-Carlo return (always reported), val RMSE vs the λ-target, bias by phase, and the shipped network's own error on the same rows. Then the winner(s)
  go into the searcher through a leaf hook (copy of engine.js with `params.leafFn`, experiments/…; engine/ stays untouched) and are scored by the Referee on set1000/set5000.

### 4.2 Targets (what is new vs. section 2 — the "new reason")
Rows come from **champion-policy games** (`gen_v2.js`: shipped52 = NN + 1/2-ply + exact-13, `deepen.budgetMs` forced to 0, same convention as bench), not from weak policies;
half the games contain one random move (positions kept only from that move on) so off-policy states are covered (same trick as the repo, row 2).
Per position we store the raw state and: `G` (realized points to come), `qn`/`rn` (the policy's own search value and the points of its NEXT move on the card actually dealt; exact when the next
move was made by the exact solver, flag `exn`), `p` (shipped net's value).
Target = **exact-anchored λ-return**, built backward inside a game:
`T_t = qn_t` if the next move was exact (zero-variance beyond that card),
else `T_t = (1−λ)·qn_t + λ·(rn_t + T_{t+1})`.  λ=1 is pure Monte-Carlo (but with the exact tail replacing the sampled last ≲13 cards); λ=0 is one-step TD from the search value.
Why this is not row 3/5/9: row 5 bootstraps one step from the same net with no exact anchor and uses weak-policy games; row 9 trains a *separate* late-game net on exact labels
(where the search is already exact). Here the exact values act as the terminal condition of a multi-step λ-return that reaches back through the early game, from games played by the
policy we want to evaluate. Expected effect on the label: lower variance than MC (the std of a 52-card return is ≈ 1,100 [claimed: README sd of scores] vs the one-card spread of qn),
and no weak-policy lag.

### 4.3 What we explicitly do NOT do again
Bigger MLPs alone (row 4), the 88-feature set alone (row 7), another plain self-play retrain with MC labels (row 3), a separate late-game net (row 9), distribution heads (row 8), tuning streak weights in the search (row 11).

## 5. n-tuple evaluator — hypothesis / algorithm / cost  (was learner-ntuple-eval.md)
* Hypothesis [guess]: an additive lookup-table model over canonical (column, column-pair) states plus global/count tuples fits the *decision-relevant* structure of this game (columns are interchangeable
  and the state is small) at least as well as a 128-48 MLP and is ≈ 100× cheaper per leaf; the freed budget can go to deeper/wider search or exact solves from more cards.
  Expected gain on its own: **0 ± 30 [guess]** (repo shows MLP capacity is not the limiter, row 4/7); the value is cost, enabling Search-team ideas. Stage-specific tables with weight promotion gave +19% at 3-ply in 2048 [claimed in research_notes, 2048 paper — not our game].
* Algorithm: see 4.1 (indices in `train_v2.py: idx`, identical in C if/when needed); per position 13 lookups; training by backfitting; optional promotion across phase buckets (init bucket b from b−1).
* Cost: rows ≈ 50 per game; 20k games ≈ 1M rows; fit in seconds–minutes on one core; data gen dominates (section 7).

## 6. Early-bias fix plan (was learner-early-bias-fix.md)  — only worth doing if section 1 shows *differential* bias
1. **E1 (kill test)**: STATUS: packaged, NOT run (box load 30-39 on 8 cores; 2 × 1,000 games ≈ hours and would contend with the Referee). Adapter `experiments/learner-e1/adapter.js` (JSON-lines, patched COPY of the champion sources in `experiments/learner-e1/src`, engine/ untouched; `--config shipped52|ship_nn|nn5 --corr none|phase|b2|phase+b2`). `none` = control (must reproduce the champion game for game), `phase` = level correction 387.4 − 7.58·cardsDealt clipped at 0 (least-squares line through the measured 51-bin bias curve; in-sample on set1000 — a 2-parameter fit to 457 games, flagged), `b2` = the Theorist's 2nd-bust over-pricing table (6:0, 16:88, 24:176, 28:237, 40:485 cards left, flat beyond), `phase+b2` = both. The original plan (table from a SEPARATE training-seed run) is replaced by this smooth 2-parameter fit because a separate table needs thousands of champion games we cannot afford now; `smoke_patch.js` shows the patch is live.
   Original wording: take the measured bias b(cards dealt, busts, stays, streak), add it to the NN leaf (leaf hook), and compare with the champion on set1000 (paired, Referee).
   Prediction [calc, from section 3]: a pure phase-level correction changes **no** move (expected diff exactly 0 up to deepen margins); any non-zero effect comes from the differential part.
   If E1 ≈ 0 the "200–300 early underestimate" is closed as harmless, and evaluator work should target RMSE inside the search, not bias.
2. **E2**: MLP vs n-tuple offline on champion-policy games with exact-anchored λ-targets, λ ∈ {0.5, 0.9, 1.0} (train_v2.py, 3 runs), **with the bust-state carousel folded in**
   (`gen_v2.js --carousel q`, q = 0.15 per game: play k ~ U{0..28} champion moves, force busts := 1 or 2 (50/50), keep positions from there on, dev-column = 2; targets are true champion
   return-to-go and exact-anchored λ-returns, no future-order information). Extra E2 checks on the carousel rows: (a) val bias of each family for b=2 / b=1 at 16 / 24 / 28 / 40 cards left (the Theorist's cells, now with thousands of positions instead of 1-20 games),
   (b) bias on natural positions must not get worse; (c) the Theorist's `implied_values.js` calibration if they hand it over.
3. **E3**: best family inside the searcher → Referee paired on set1000, then set5000 if |z| > 1.
4. **E4 (backward fitted value iteration)**: label stage s (cards dealt 40…0) with 1-ply expectimax over the stage s+4 model, anchored at the exact-13/14 values; retrain stage by stage (weight promotion). Uses the same rows; cost = one expectimax per row per round (≈ the cost of generating them).

## 7. Cost [calc, from bench/RESULTS.md and repo timings — both unverified until re-measured unloaded]
* Data generation: shipped52 ≈ 1.7 s/game unloaded (Referee, 4-game sample) → 20k games ≈ 34,000 CPU-s ≈ 9.4 core-hours; `ship_nn` (no exact-13) ≈ 0.7 s/game (repo claim 13 ms/move × 52) → 20k games ≈ 3.9 core-hours.
  The box is oversubscribed (load 20-30 on 8 cores): at nice 10 we measured ≈ 6 games/min with 3 workers (ship_nn through the bench harness), i.e. 1,000 games ≈ 2.8 h wall. A 20k-game set is therefore a multi-day job on this box as-is; plan: 3,000 games first (≈ 2-5 core-hours depending on policy), which gives ≈ 150k rows.
* Training: n-tuple backfit on 150k–1M rows: seconds–minutes; MLP (numpy) 12 epochs: minutes on 1M rows.
* Evaluation of any candidate: 1,000 games ≈ 3,350 worker-seconds for shipped52 under load [Referee]; set5000 ≈ 5×.

## 8. Reproducibility
`experiments/learner-sim/`: `bias_adapter.js` (bench-protocol wrapper that logs predictions; run `cd bench && BIAS_LOG=<prefix> python3 run_one.py --engine "cmd:node ../experiments/learner-sim/bias_adapter.js --config ship_nn" --set set1000`),
`analyze_bias.py` (tables), `gen_v2.js` (champion-policy rows; smoke-tested on 40 games only, **no dataset generated yet** — box load), `train_v2.py` (MLP vs n-tuple, same data; smoke-tested on 1.7k rows only, **no comparison result exists yet**), (an earlier in-engine variant on champion seeds was started, killed for load and deleted; no number from it is used).
No own simulator is used for any reported number (retired by instruction); `gen_v2.js` uses the champion's engine.js only to *generate training rows*, never to report scores.

## 9. v2a — improve the leaf network only where deeper:16 uses it (13-16 cards left), trained on EXACT labels  (plan written 2026-11-18 14:5x PT; results below when they exist)
**Why (new reason vs. §2):** deeper:16 = shipped52 + exact solve from 16 cards; the solve gives up (3.2M new positions) in 37/40, 29/40, 14/40, 6/40 games at 16/15/14/13 cards left [Referee, bench/results/integrity_1245/deeper16_giveups.txt, claimed here until re-read], and then the champion NETWORK (leaves of a 1-ply expectimax + selective deeper look) picks the move. Targets there can now be EXACT (21 Search's labeler, experiments/exact-labeler; verified by them against brute force on ≤9 cards), not rollout returns of a weaker policy. The 3 failed earlier evaluator attempts (§2) used weaker targets and were judged on whole-game means; here the metric is decision regret against exact values in the band that matters.
**Data (experiments/learner-v2a/gen_label.js, copy of gen_positions' play loop, labeler untouched):**
* policy = deeper:16 (budget 3.2M, logCap 25) on out-of-bench shuffles (seed bases 3,400,000,000 and 3,450,000,000, 7919 spacing; checked against set1000/set5000/dev200: 0 collisions required), mild bust oversampling (`--bust-eps 0.02 --bust-seek 0.03`: 2%/3% of moves replaced by a random / a busting placement; recorded as `forced`).
* **P rows**: every position after a placement with ≤16 cards left, labeled in play order 16→1 (table reuse; label.js `--mem-mb 800`, default 60M-position budget; a failed line is kept with ok=false).
* **C rows (new vs. the labeler's cheap path)**: for every P row with 12..16 cards left whose label is ok, ALL children of the next decision — every card value still in the deck × every distinct legal action (columns, plus Stay-i-on-i when no column is empty, the labeler's own restriction) — are labeled exactly. They are table lookups after the parent solve (measured on 388 children: 2.8 ms CPU in total, 0 new positions) and are exactly the positions a leaf evaluator is asked about. `dec.jsonl` stores the decision structure: Q_exact(a) = dpts + v_exact(child) (0 for a game-ending child).
* Not used: rollout labels at 17-20 cards. Measured now: 1 ok of 7 lines in 10 CPU-min at `--deep-mode rollout --rollout 1` (6 × "budget exceeded", 60-86 CPU-s each; 1 ok, 59 CPU-s) — no calibration set is feasible at this rate on this box; job stopped, 1 label kept (`data/rollout/labels.jsonl`).
**Models (same rows, same split, held out by GAME, `v2a.py`):** champ (shipped52 net, reproduced in numpy to 2e-4 pts) / ft (warm start, all weights, MSE on exact v, L2 anchor to init, early stopping on a validation split of train games) / ntuple (champion net + additive residual tables: global, single column × phase, column pairs, deck summary, column-count summary; shrunk backfitting) / ft+nt. Training rows: ok rows with 10..15 cards left (P and C).
**Metrics (held out):** value MAE and bias vs exact by cards left; decision metric = for each held-out parent position with k=12..16 cards left, all next cards (weighted by n_v/N) × all actions: 1-ply choice argmax dpts + model(child), exact regret in points, wrong-move rate (regret > 0.5 pt). Paired regret reduction vs champion net per decision position (SE over decision positions), and **expected gain per game = Σ_k giveup_k × reduction_k** with the Referee's give-up rates (0.925/0.725/0.35/0.15/0.025 for k=16..12) — calc, 1-ply proxy (the real search looks deeper and uses exact where it finishes, so this is an upper-ish proxy for the net's effect, flagged).
