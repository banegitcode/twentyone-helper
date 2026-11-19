# life-margin-schedule — price the 2nd bust by (busts, cards left), not flat
Status: **measured null on decisions** (own flip analysis); kept as a documented audit + cheap optional Referee run. Priority LOW.

## Hypothesis
The champion network misprices *how much worse "two busts already" is than "one bust"* when many cards remain, so at b=1 it is more bust-averse than the game warrants. Pricing of the first bust (Perfect Bonus) and of Stays is fine.

## Why (own measurements, `experiments/theory_sim/data/`, scripts `js/implied_values.js`, `js/rollout_variants.js`, `py/compare_implied.py`)
Method: 400 champion-like positions per cards-left (play = Landon's shipped network, 1-card lookahead + exact last 4, Landon's shuffles seeds 3,000,000+; this *fast* policy scores 8,661 ± 22 on 3,200 games, no exact-13 stage). For each position, same position with hypothetical (Stays, busts) variants. (a) "implied" = the policy's own search value averaged over the next card; (b) "measured" = mean future points of that policy over 24 random orders of the unseen cards, paired across variants (36 positions per rem; SEs are across positions).

| rem (cards left) | Δ implied − measured: Stay 2→1 | Stay 1→0 | bust 0→1 (Perfect Bonus) | **bust 1→2** |
|---|---|---|---|---|
| 16 | +2 ± 17 | −16 ± 21 | −9 ± 17 | **+88 ± 18** |
| 24 | −14 ± 22 | +1 ± 28 | +9 ± 20 | **+176 ± 26** |
| 28 | | | | **+237 ± 36** (measured 297 ± 47) |
| 40 | | | | **+485 ± 49** (measured 796 ± 57, implied 1282 ± 63) |

So Stay values and the first-bust value are calibrated to within ±25, but the network values a 2-bust state far too low relative to a 1-bust state (it underestimates the absolute value at b=2 by 789 ± 60 and at b=1 by 303 ± 33 at rem 40). Likely cause (guess): 2-bust positions with many cards left are rare in self-play training data. Measured value of the second life itself (bust 1→2, policy value): 37 ± 17 (rem 16), 204 ± 34 (24), 297 ± 47 (28), 445 ± 60 (36), 796 ± 57 (40); exact at rem 2/4/6: 0.9/14/51.

## Expected gain
- **Calculated, decision level:** flip analysis (`experiments/life_margin/flip_ab.js`; 120 logged b=1 positions with ≥16 cards left, all 10 possible next cards = 1,055 decisions): the leaf correction changes the chosen move in **9 of 1,055 decisions (0.8%)**; paired rollouts (24 per flip, champion plays on) give mean gain **+0.27 ± 0.61 points per decision**. The champion has ~1.16 decisions per game at b=1 with ≥16 cards left (14.1% of games). ⇒ **≈ +0.3 ± 0.7 points per game: nothing.** (flip rows: gains −533…+283, mixed signs.)
- Guess: even the full-strength version cannot exceed +5/game; invisible at n=1,000 (paired SE ≈ 10).
Do not spend Referee time unless the lab has spare capacity; it is a *negative result worth logging*: "the network's 2nd-bust bias is large (88–485) but almost never changes a move".

## Landon's earlier results (UNVERIFIED claims from the repo)
Flat extra bust penalty +300 → −39 ± 22, +600 → −208 ± 43 (n=1,500, `s_strats.log`); "forcing the 2nd bust to cost the same as the 1st changes nothing" (8,339 vs 8,340, hand-weight evaluator). Consistent with mine for b=0 (calibrated → any flat extra penalty can only hurt). My new reason to look at b=1 specifically is the *sign* (the bias says reduce aversion, opposite to his tests) and that it is schedule-dependent.

## Exact algorithm (leaf version, `experiments/life_margin/`)
```
patched copy of engine/twentyone-solver/src (one line in engine.js nnLeaf):
   V_leaf = NN(state)*scale + [busts>=2] * corr(H)          # H = cards left at the leaf
corr(H) piecewise linear through (12,0),(16,88),(24,176),(28,237),(40,485),(52,600)   # 52+ extrapolated = guess
```
Root-only variant (no engine patch): `experiments/bust_margin_root/adapter.js` re-ranks the champion's root `scores` and adds back 88/176/237/485 points to the action that makes the 2nd bust (rem ≤19/26/32/else).

## Cost
Zero extra search time. No retraining.

## Test plan for 21 Referee (only if run)
```
cd /workspace/21lab/bench
python3 compare.py --a "cmd:node champion/champion_adapter.js --config shipped52" \
                   --b "cmd:node ../experiments/life_margin/adapter.js --config shipped52" --set set1000 --workers 4 --cache
# control (must be identical per game to the champion): ... --b "cmd:node ../experiments/life_margin/adapter.js --config shipped52 --scale 0"
# strength sweep if the first run is not negative: --scale 0.5 / 2 (scale multiplies corr)
python3 audit.py --static ../experiments/life_margin/   # grep check on sources (adapter reads only the harness state)
```
Accept only if paired diff > 2 SE on n ≥ 1,000 (expected ≈ 0). The patch is one line; diff is in `adapter.js` header and `src/engine.js` line 307.
