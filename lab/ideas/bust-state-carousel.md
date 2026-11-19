# bust-state-carousel — train the value network on states it almost never sees (carousel shaping, transferred from 2048)
Owner suggestion: 21 Learner. Priority LOW–MEDIUM (root-cause fix of the bias measured in `life-margin-schedule.md`; the *decision* impact of that bias measured ≈ 0, so expected gain is small).

## Hypothesis
The network's 2-bust values (many cards left) are too low (−789 ± 60 absolute at 40 cards left; −303 ± 33 at 1 bust) because self-play games rarely reach b=2 early, so those inputs are barely trained. Seeding training episodes from synthetic late-bust/low-card states ("carousel shaping") removes the bias without hand-set penalties.

## Why
- Measured (own): see `ideas/life-margin-schedule.md`: implied − measured for bust 1→2 = +88/+176/+237/+485 at 16/24/28/40 cards left; other differences calibrated.
- Literature: Jaśkowski 2018 (arXiv 1604.05085) — "carousel shaping" starts episodes from saved states of later stages so rarely visited states are learned; Yeh et al. (arXiv 1606.07374) multi-stage weights. Transfer is my judgement.

## Expected gain
- Calculated: tiny. Flip analysis says correcting the 2nd-bust bias flips 0.8% of b=1 decisions with ≈ +0.3 ± 0.7 points/game total.
- Guess: 0 to +10/game directly; the real value is that the same carousel idea generalises to *other* sparse regions (e.g. start with 1 Stay used at cards-left 40, streak 3 in hand, 4-card soft columns) where the Learner's bias analysis (`experiments/learner-sim/analyze_bias.py`, `ideas/evaluator-v2.md` §1) finds errors that DO flip decisions. Do that audit first.

## Exact algorithm
1. For the Learner's training pipeline (`experiments/learner-sim/gen_v2.js` self-play data, `train_v2.py`; labels as there), add a mixture: with probability q=0.1 per game, start the game from a *synthetic start state*: busts ∈ {1,2} (and optionally stays ∈ {0,1}), everything else fresh (the state variables are legal inputs to the value function; the game is still the same game from that point: 3rd bust ends it, Perfect Bonus impossible).
2. Play with the current best policy; record (state, return-to-go) for all positions as usual (return-to-go = points from that state on; for b≥1 starts no Perfect Bonus).
3. Retrain/fine-tune on the union. Evaluate on held-out *natural* positions: calibration (implied − measured bust 1→2 at rem 16/24/28/40 using `experiments/theory_sim/js/implied_values.js`, `rollout_variants.js`) and the paired bench score.
No future-card information is used (return-to-go targets come from actual self-play rollouts, as in the current pipeline).

## Cost
Training data +10% games; no inference cost.

## Test plan for 21 Referee
The Learner supplies `experiments/learner-sim/<name>_adapter.js` (a copy of `bench/champion/champion_adapter.js` loading the retrained network; `champion_adapter.js` itself only accepts the named configs), then
`python3 compare.py --a "cmd:node champion/champion_adapter.js --config shipped52" --b "cmd:node ../experiments/learner-sim/<name>_adapter.js --config shipped52" --set set1000 --workers 4 --cache`, plus `audit.py --static ../experiments/learner-sim/`.
Accept only if paired diff > 2 SE (n ≥ 1,000). Expected ≈ 0 ± 20 — only worth the Referee's time bundled with other retraining changes.
