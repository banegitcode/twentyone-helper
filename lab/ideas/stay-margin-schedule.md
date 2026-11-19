# stay-margin-schedule — when to spend each Stay (threshold / reserve rule)
Status: **calibration says no mispricing found**; falsification test only. Priority LOW.

## Hypothesis
A Stay is an option with a known decaying value; the champion might spend it too early or too late. If its search values misprice a Stay by X points at some cards-left, adding a margin M(rem)=X to every Stay-using action fixes it.

## Why — own measurements
**Value of a Stay** (paired rollouts, champion-like fast policy, 36 positions × 24 random orders; "measured" columns of `py/analyze_roll.py`; exact column from `py/analyze_eg.py` = exact expectimax over the unseen multiset, same positions logged by `js/gen_positions.js`):

| cards left | value of the 2nd Stay in hand (2→1) | value of the last Stay (1→0) | both (2→0) | source |
|---|---|---|---|---|
| 36 | 357 ± 35 | 465 ± 34 | 822 ± 48 | rollouts |
| 24 | 220 ± 25 | 378 ± 30 | 598 ± 36 | rollouts |
| 16 | 97 ± 20 | 264 ± 28 | 361 ± 39 | rollouts |
| 6 | 1.9 ± 1.2 | 71 ± 5 (stays=1 pos.), 76 ± 12 (stays=2 pos.) | 78 ± 12 | **exact** (n=3,182 positions) |
| 4 | 0.0 | 3.1 ± 1.3 | 7.9 ± 5.5 | exact |
| 2 | 0 | 0 | 0 | exact |
A Stay is worth more than one 21-clear (400) early; the 2nd Stay is worth ≈0 in the last 6 cards (so ~76% of games spend both before then; 17% of 52-card games end with ≥1 Stay unused, which costs nothing at that point).

**Calibration of the network's Stay values:** implied − measured = +2 ± 17, −16 ± 21 (rem 16) and −14 ± 22, +1 ± 28 (rem 24) → **no detectable mispricing** (see `life-margin-schedule.md` table).

**How the champion-like policy spends Stays** (3,200 games, `py/stay_stats.py`): 1.80 Stays/game; first at ~29.9 cards left, second at ~20.3. P(use a Stay | one available) by how many of the 4 plain placements bust and whether any plain placement scores: no-score & 0/1/2/3/4 busting columns → 1.6% / 4.3% / 9.3% / **23.2%** / **100%**; if some plain placement scores: 1.8–3.1% (a Stay can be combined with a scoring placement: 12% of all Stay uses did that). 22% of Stays are used when all four placements bust, 44% when ≥3 do. A threshold reading: "Stay when ≥3 of 4 columns bust and nothing scores; always when all 4 bust".

## Expected gain
- Calculated: ≈ 0 (the mispricing that would justify a margin is not there at rem 16–24; at rem ≥ 36 the Stay values were not compared — not measured).
- Guess: |gain| < 10/game for any margin in ±40. Present only as a cheap falsifier.

## Landon's earlier results (UNVERIFIED claims)
"Stays inside the search … only when every plain placement busts scores the same as always considering it" and "removing Stays that are provably never best +9 ± 23" (README); I did not retest. My exact analysis agrees that late Stays are nearly worthless (≤ 8 points in the last 4 cards).

## Exact algorithm
`experiments/stay_margin/adapter.js` (champion + root re-ranking via `experiments/theory_sim/js/hooked_adapter.js`): score(a) = (a.deep ?? a.value) − M if a uses a Stay, else unchanged; the exact endgame answers (m.exact) are never altered. Table form: `--cfg '{"stay":[[20,m1],[99,m2]]}'` (first row with rem ≤ remMax).

## Cost
Zero.

## Test plan for 21 Referee
```
cd /workspace/21lab/bench
for M in 40 -40; do python3 compare.py --a "cmd:node champion/champion_adapter.js --config shipped52" \
   --b "cmd:node ../experiments/stay_margin/adapter.js --config shipped52 --margin $M" --set set1000 --workers 4 --cache; done
```
Accept only if paired diff > 2 SE (n ≥ 1,000). Expect NOISE/REJECTED. If one sign shows > +1.5 SE, repeat on set5000 before anything else.
