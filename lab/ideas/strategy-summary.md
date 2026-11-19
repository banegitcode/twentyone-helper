# Strategy summary — 21 Theorist (index + key numbers)
Labels: **[exact]** exact expectimax over the unseen-card multiset; **[measured]** simulation/rollouts (SE given); **[calc]** arithmetic from measured rates; **[guess]**. Landon's repo numbers are "(unverified)" and never mixed with mine. The clairvoyant ceiling/relaxation work was dropped at the lead's request. Reference: champion shipped52 = **8,871.7 ± 38.0** on bench set1000 (Referee).

## Idea index (all untested by the Referee; none ACCEPTED)
| file | one line | expected gain | priority |
|---|---|---|---|
| `life-margin-schedule.md` | network over-prices the 2nd bust by 88/176/237/485 points at 16/24/28/40 cards left | **[measured]** flip analysis ≈ +0.3 ± 0.7 /game (0.8% of b=1 decisions change) → ≈ 0 | LOW (log as negative) |
| `stay-margin-schedule.md` | Stay margins; Stay values are calibrated (±25) | ≈ 0 [guess], falsifier | LOW |
| `bust-state-carousel.md` | train on synthetic b=1/2 early states (root cause of the bias above; carousel idea from 2048) | 0…+10 [guess] | LOW-MED, bundle with a retrain |
| `ntuple-column-evaluator.md` | afterstate n-tuple tables with column-pair interactions; speed → deeper search | unknown (−100…+60 [guess]); my additive version only 5,857/6,777 | MED-LOW, exploratory |
| `literature-survey.md` | sources and transfer notes (Poker Squares, 2048, Yahtzee, Pig, Can't Stop, relaxation, blackjack-solitaire apps) | n/a | – |
Other files by other agents in this folder (`evaluator-v2.md`, `exact-endgame-deeper.md`) overlap the evaluator/endgame topics; not edited.

## Simulator validation
`experiments/theory_sim` (Rust): scoring checked on 6,000 games of mixed random/builder play against Landon's `engine.js` (**0 mismatches**: per-move points, bust flags, final score incl. Perfect Bonus, bust count) and the same traces replayed in the bench `refsim.py` (0 mismatches, `py/xcheck_bench.py`); 21 hand-built scoring unit tests pass. Rule readings used: Ace soft rule; three 7s = first three cards 7,7,7 → 600 instead of 400; 5 cards ≤21 = 800, =21 → 1000; streak bonus 250/500/1000/2000 (max streak reachable 4); Stay empties a column before placing (Stay on an empty column is a no-op); bench allows 1 Stay/card.
Anchors on bench set1000 [measured]: greedy (mine, `--bust_cost/--stay_cost` tuned lightly on Landon's shuffles) **6,206.2 ± 48.5**; bench native greedy 4,977.0 ± 54.8; expect1 6,461.8 ± 51.4. On 10,000 of Landon's shuffles: greedy 6,154 ± 16, additive TD evaluator 5,857 ± 16 (0-ply) / 6,777 ± 14 (1-ply).

## What a game of the champion-like policy looks like [measured, 3,200 games, fast policy 8,661 ± 22, 76% zero-bust]
~13.1 plain 21s, 0.735 five-card clears at 800 + 0.679 at 1,000 per game (1.41/game ≈ 1,270 points), 0.03 three-7s clears, 0.38 busts. Score by busts: 0 → 9,123 ± 17 (76%), 1 → 7,663 ± 41, 2 → 7,037 ± 35, 3 → 4,283 ± 375. 1.8 Stays/game (first at ~30 cards left, second ~20); 17% of games finish with a Stay unused.

## A. Stay value by cards left [exact for ≤6; measured above]
See `stay-margin-schedule.md`: 2nd Stay in hand 357/220/97 and last Stay 465/378/264 points at 36/24/16 cards left [measured, ±20–35]; 76 ± 12 [exact] at 6 cards, ≈0 at ≤2. Network's own Stay values match within ±25. Stay decisions are triggered mainly when ≥3 of 4 placements bust and nothing scores (23% of such decisions, 100% when all 4 bust).

## B. 5-card builds and three 7s vs a plain 21 [exact single-column DP, `py/column_dp.py`; policy rates measured]
- A 4-card column with hard total ≤ 11 is a guaranteed ≥ 800 (any next card ≤10 stays ≤21; ace counts 1 or 11) — soft/low columns are worth hundreds more than hard ones at equal card count; the champion already finishes 1.41 five-card clears per game.
- Three 7s: premium +200 over a plain 21; the champion hits it 0.03 times per game ⇒ **[calc] ≈ 6 points/game**; even tripling its rate would be < +25/game before costs → not pursued.
- Declining a completing 21 only beats taking it for 3-card soft columns with hard ≤ 7 (about 0.02 situations per game, champion already declines 91%) ⇒ **[calc] ≤ ~4 points/game** available.

## C. Perfect Bonus risk by cards left and busts [exact ≤6; measured 16–40]
Value of the first bust (0→1): 998/985/956 at 2/4/6 cards left [exact] (≈ the full 1,000 bonus); 977/911/935 at 16/24/36 [measured]. The network is calibrated here (±20). A *flat* extra bust penalty cannot help at b=0.

## D. Play after 1 or 2 busts
Value of the 2nd life (1→2) [measured]: 37 ± 17 (16), 204 ± 34 (24), 297 ± 47 (28), 445 ± 60 (36), 796 ± 57 (40); [exact] 0.9/14/51 at 2/4/6. Network overestimates its cost by 88/176/237/485 at 16/24/28/40 — real but decision-irrelevant (0.8% flips, ≈ +0.3/game; `life-margin-schedule.md`). Only 14% of games have a bust early enough (≥16 cards left) to matter.

## Bottom line
Within my measurements the champion's *pricing* of Stays, Perfect Bonus and the 2nd bust is not where the missing ~600 points to 9,500 are. The audit found exactly one calibration error, with ≈ zero decision impact. Remaining levers are elsewhere (search depth/exact solve horizon, evaluator representation), outside what small exact calculations could settle. Not done: exact data only to 6 cards left (8- and 10-card runs killed unfinished: box overloaded); clairvoyant/relaxation bounds (dropped by the lead); decision-level regret of *close* Stay calls (needs thousands of paired rollouts).

## Data/code index
`experiments/theory_sim/{src,tests,js,py,data}`, `experiments/life_margin/`, `experiments/bust_margin_root/`, `experiments/stay_margin/`; key data: `data/roll_summary.json`, `rollB_*`, `implied*.csv`, `eg_le6.csv`, `flip_{0,1,2}.json`, `stay_stats.out.txt`.
