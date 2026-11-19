# ntuple-column-evaluator — afterstate n-tuple table evaluator (2048 / Poker-Squares style) as a fast leaf
Owner suggestion: 21 Learner (+ Search for the speed use). Priority MEDIUM-LOW; **gain unknown, mostly a speed/representation bet**.

## Hypothesis
Replace/augment the 56-128-48 MLP leaf by lookup tables over *column-state tuples* (afterstate value V(s'), TD-trained). Tables are ~100× cheaper per evaluation, so the same 2.5 s buys deeper/wider search or an exact solve from earlier; and tuples over *pairs of columns* capture interactions an additive evaluator cannot.

## Why
- Literature (verified, see `literature-survey.md`): Szubert & Jaśkowski 2014 (afterstate TD with n-tuples, 1-ply play, >97% 2048 wins); Jaśkowski 2018 / Yeh et al. (multi-stage weights, carousel shaping, redundant tuples); Poker Squares winner (Neller et al. 2016): board value = sum of independent learned line values + depth-2 expectimax.
- **Own measurement (negative for the pure-additive version):** my additive per-column tables (A[cards-left][col-state] + B[tens-density][col-state] + global[left,busts,stays,streak]; 6M TD(0) self-play games, `experiments/theory_sim/src/td.rs`) play **5,857 ± 16 (0-ply)** and **6,777 ± 14 (1-ply expectimax)** on 10,000 of Landon's shuffles (seeds 2,600,000+; bench greedy 4,977 ± 55, bench expect1 6,462 ± 51, champion 8,872 ± 38). So pure additivity is far from enough; the evaluator needs interactions (two columns waiting for the same rank, shared tens, a bust-prone board).
- Landon's earlier result (UNVERIFIED): a 256×96 MLP (vs 128×48) gave −16 ± 35 (4,000 val games) and one card deeper search everywhere +27 ± 56 (1,000 games), README → capacity/depth look saturated, which is why a *representation* change (not size) is the open lever.

## Expected gain
Guess only: −100 … +60; I have no calculation. Treat as an exploratory bet: the useful *measurable* milestone is "n-tuple 1-ply ≥ 8,000 on set1000" (MLP-0-ply reference to be measured by the Learner); only then does speed convert into points.

## Exact design (to implement in JS for the bench, `experiments/ntuple/adapter.js`)
Afterstate = position after placement/Stay, before next card. Features (all lookups, f32):
1. 4 single-column tables T1[stage][col_state] (col_state = (cards, hard total, ace flag, all-sevens flag); ≈ 81 reachable states).
2. 6 column-pair tables T2[stage][sorted(col_state_i, col_state_j)] (≈ 3.3k entries ×stage).
3. 4 column-triple tables over the *need-profile* (set of ranks that clear/5-card each column, 10-bit mask) to keep size small.
4. Deck tables: tens-density bucket (13) × cards-left, and counts of each of the 3 scarcest-needed ranks.
5. Global: busts(3) × stays(3) × streak(5) × stage. Stage = cards-left bucket (0–6, 7–14, 15–24, 25–38, 39–52); exact-endgame positions seed the last stage ("carousel").
Training: TD(0) on afterstates, α≈0.0025/sqrt(#tuples) (2048 value), self-play with the current best policy (1-ply expectimax) mixed with the bust-state carousel (`bust-state-carousel.md`); 5–20M games; labels optionally replaced by exact values for ≤14 cards.
Policy: 1-ply expectimax over the next card using the table sum (as engine `depth:1`), then selective 2-deeper, exact endgame unchanged.

## Cost
Training: my Rust additive TD loop (`experiments/theory_sim/src/bin/train.rs`) is cheap enough to run 6M games in a background job on the shared box (not timed carefully); n-tuple tables are the same loop with more lookups. Inference: a few dozen lookups per leaf vs ~13k multiply-adds for the 56-128-48 MLP (arithmetic, not timed).

## Test plan for 21 Referee
1. Learner supplies `experiments/ntuple/adapter.js` (JSON-lines protocol modelled on `bench/champion/champion_adapter.js`) and a mean on dev200 as a smoke test.
2. `python3 compare.py --a "cmd:node champion/champion_adapter.js --config shipped52" --b "cmd:node ../experiments/ntuple/adapter.js" --set set1000 --workers 4 --cache`; accept only if paired diff > 2 SE with n ≥ 1,000 and `audit.py --static ../experiments/ntuple/` clean.
3. Secondary (speed claim): same table with `--config nn5`-style search depth raised only as far as the per-move time of the champion; report ms/move.
