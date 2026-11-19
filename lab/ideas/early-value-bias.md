# early-value-bias — is the 200–300 early underestimate a real lever? (21 Theorist)

Status: MEASUREMENT / recommendation. Nothing here is a bench candidate. Provenance: numbers are **[measured]**, **[calc]** (arithmetic from measured quantities), or **[guess]**. No new full games. No future card order is used in any policy; existing labels use only the observable state plus random orders of the unseen multiset (the same rule as the regret map).

Question: the champion network underestimates points still to come by about 200–300 in the first half of the game. Is the *differential* part of that error a lever worth more than **+30** on set1000 (the current acceptance bar)?

## Key principle

A constant offset in the value, including any function of cards left alone, does not change the argmax among the candidate moves of one decision. Only an error that *varies between those candidates* can cost points. The 200–300 figure is a mean over positions; it is not a score gain.

This was already the right reading of Learner's bias study (`ideas/evaluator-v2.md` §1 and §3; EXPERIMENTS.md 2026-11-18): first-half bias +265 ± 49 on 457 `ship_nn` games, "mostly a phase-level shift that cancels between candidate moves." The E1 phase correction (add 387.4 − 7.58·cardsDealt at leaves) changed **0 of 240** smoke-test moves. The E1 b2 (2nd-bust table) correction, run on set1000, was **+10 ± 8 (z 1.2, NOISE)**. This file does not repeat E1. It asks a narrower question with the decision logs and reference labels that now exist: how large is the *within-decision* error, and is there a pool above 16 cards left bigger than the flip gains already reported (~24 sampled, ~10.6 strong)?

## Data (all already on disk; 0 full games)

- `experiments/regret_map/s1k_champ_all.jsonl`: shipped52 on all 1,000 set1000 games, every root action score. After-state features and the shipped leaf network `p` for every candidate were recomputed with `experiments/regret_map/lib.js` (engine `applyMove` + `makeNNValue`) into `experiments/early-value-bias/`. Mean score of these 1,000 games is 8,871.6, matching the Referee's shipped52 baseline.
- Sampled reference A and fresh confirmation: `experiments/regret_map/samp_*.jsonl`, `conf_*.jsonl` (dev200, 200 games with samp rows; 253 confirmed flips).
- Stronger labels: `experiments/streak-measure/raw/reeval_strong_*.jsonl` (71 decisions, rem 17–48, 64 paired orders, champion-search tail to horizon 16, exact from 8 cards).
- Learner bias logs (`experiments/learner-sim/results/biaslog_shipnn_set1000_*.jsonl`) and v2a exact rows (13–16 only) were inspected; v2a has no labels above 16 cards and is not used below.

Code: `experiments/early-value-bias/{extract_afterstates.js,analyze.py,report.txt}`.

Cards left (`rem`) includes the current card, as in the regret map. "Above 16 cards" means `rem > 16`, where deeper:16 is not yet in the exact solver. The published "≥16" flip gain of 24.3 includes `rem == 16` (10 confirmed flips); both cuts are reported.

---

## 1. How the error depends on features, and its spread inside a decision

### 1a. The mean error is still a phase shift  [measured]

On shipped52, set1000, 1,000 games, cluster SE over games, chosen move only:

| band (cards left) | leaf bias `G − p` | search bias `Gb − q` |
|---|---|---|
| 52–41 | +390.6 ± 37.0 | +385.1 ± 37.0 |
| 40–33 | +329.9 ± 32.8 | +320.2 ± 32.9 |
| 32–25 | +299.3 ± 28.5 | +289.8 ± 28.5 |
| 24–17 | +251.8 ± 23.3 | +243.4 ± 23.1 |
| 16–13 | +208.7 ± 19.6 | +199.6 ± 18.7 |
| **all rem > 16** | **+325.4 ± 29.5** | **+317.2 ± 29.5** |
| rem ≥ 27 (first half) | +352.2 ± 32.7 | +344.5 ± 32.8 |

`G` is realized points still to come *after* the placement; `p` is the shipped leaf on that after-state. `Gb` / `q` are the same from the decision onward (search value). Positive = underestimate. These sit about 80–90 points above Learner's `ship_nn` curve, which is expected: `ship_nn` is the same network without exact-13, and scored 8,784 on its 457-game sample versus 8,872 for shipped52, so realized remaining is higher here by about the endgame gap. The *shape* is the same almost-linear decline with cards left.

All of this mean is common-mode at a decision (`rem` is the same for every candidate). It cannot change a move. E1 already demonstrated that.

### 1b. After-state residuals, between decisions — large, but confounded  [measured, not a within-decision effect]

Subtracting the same-`rem` mean leaves a residual. Tabulated on *chosen* moves at rem > 16, **within-game** contrasts (games that have both levels) are far from flat:

| contrast (after-state of the chosen move) | leaf residual | n games |
|---|---|---|
| used a Stay minus did not | +196.4 ± 11.8 | 823 |
| stays left 2 minus 1 | −113.0 ± 13.9 | 823 |
| stays left 1 minus 0 | −303.0 ± 23.7 | 459 |
| 0 empty columns minus 1 | +105.2 ± 4.9 | 999 |
| 1 empty minus 2 | +108.1 ± 5.7 | 1,000 |
| streak 2 minus 0 | −161.1 ± 9.3 | 928 |
| just-cleared minus not | −66.3 ± 5.2 | 1,000 |
| busts=1 minus busts=0 | +1,146.7 ± 34.6 | 127 |

These are **different decisions in the same game**, not alternative moves at one decision. A Stay is used when the board is already cramped; a 1-bust residual is taken from positions *after* the bust has happened, compared with earlier 0-bust positions of that game. The +1,147 busts contrast in particular is path confounding, not a 1,000-point leaf bug on "bust this move vs not."

An additive model of the rem-residual from after-state features (stays left, busts, empty columns, streak, max column count, max soft total, used-Stay / just-bust / just-clear), 5-fold out-of-fold by game, has **OOF R² = −0.005** and OOF RMSE 1,021 (the realized remaining is one noisy sample of a high-variance tail; residual sd is ~1,019, of which the model explains essentially none). Predicted-residual sd is only 52. I therefore **do not** treat that model's "implied flip gain" (~145 points if you naively add its correction to every root `q`) as a real pool. It would flip ~4.8 close moves/game on a signal that does not out-of-fold. That number is a failed identification, not a ceiling.

### 1c. Within-decision spread, from labels that score more than one move  [measured]

This is the quantity that can actually cost points.

**Reference A** (paired short rollouts + the same network at the leaf; samp, 3,379 multi-candidate decisions, rem > 16, 200 games). Error = `abs − cv` (reference absolute minus the champion's own root value) for each scored candidate:

- Within-decision range of that error: mean 72.0, median 56.2, 90th percentile 149.6.
- Within-decision std: mean 34.0, median 26.5.
- `|err_i − err_champ|`: mean 34.5, **median 8.9**.

So at a typical close decision the network's *relative* error versus this reference is about 9 points; a heavy tail of ~70–150 point disagreements is what feeds the flip pool in §2. Caveat, already in `ideas/regret-map.md`: reference A shares the champion network, so this spread is mostly leftover lookahead, not an independent measure of evaluator error.

The one clean feature contrast *inside* a decision: on the 490 rem > 16 decisions that scored both a Stay and a no-Stay candidate, `err(Stay) − err(no-Stay)` is **−33.3 ± 5.3 per game** (177 games that have at least one such decision). In words: relative to reference A, the network **over-values Stay moves by about 33 points** versus no-Stay. That is the same leak as Streak's Stay over-use, not a new one. When the champion Stayed and the alternative did not (66 decisions), the ranking residual `(abs_alt − cv_alt) − (abs_champ − cv_champ)` is +91.5 ± 6.4 — again, already inside the Stay-over-use pool.

After-states of candidates at the same rem > 16 decision *do* differ often (nEmpty in 98% of multi-candidate decisions, Stay vs not in 84%, streak in 32%, a busting vs non-busting option in 49%). The *measured* within-decision error attached to those differences is tens of points, not hundreds, and is already what the flip pools below price.

---

## 2. Points per game lost to that differential error  [measured / calc]

Regret pools already on the table, reproduced here on the same conf / strong files (cluster SE over 200 samp games; a game with no flip in the slice contributes 0):

| pool | per game | decisions | label |
|---|---|---|---|
| Reference A net flip gain, rem ≥ 16 | **24.3 ± 5.7** | 213 | [measured], matches `ideas/regret-map.md` |
| same, rem > 16 (excludes the 16-card band) | **20.2 ± 5.0** | 203 | [measured] |
| of which rem == 16 | 4.2 ± 2.2 | 10 | [measured] |
| Reference A on the 71 decisions Streak rechecked | 17.9 ± 3.9 | 71 | [measured] |
| **Strong labels on those same 71** | **10.3 ± 4.4** | 71 | [measured] (Streak's 10.6 ± 3.5 is the same sum over 195 games instead of 200) |
| Stay over-use only, strong | 6.2 ± 2.4 | 18 | [measured] (Streak 6.3 ± 1.4; different SE convention) |
| no-empty-column, neither side a Stay, strong | 2.5 ± 3.0 | 47 | [measured], not distinguishable from 0 |
| Conf flips *not* in the 71, rem > 16 | 2.2 ± 3.5 | 132 | [measured], not distinguishable from 0 |

**Calculated composite** (strong value on the 71, raw reference A on the remaining rem > 16 conf flips): **12.5 ± 5.5 per game**. If the 0.575 shrinkage seen on the 71 (sum of strong / sum of reference A) is applied to the un-rechecked rest as well, 11.6 ± 4.8 — that second step is a **[guess]**.

Is there meaningfully *more* than about 10–25 points per game above 16 cards?

- The 10–25 window already covers the measured raw reference-A gain (20.2, or 24.3 if rem = 16 is kept) and the strong / composite figures (10.3 to 12.5).
- Additional *evaluated* mass is 2.2 ± 3.5, consistent with zero.
- Unevaluated decisions: 53% of samp rem > 16 rows are a single after-state class (symmetric placements). The sampler also dropped alternatives more than 100 points under the champion's best, and candidates beyond the top three classes. At 11–12 cards left, that exclusion missed about 12–14% of *exact* regret (`ideas/regret-map.md`). Applying that late-game miss rate to a mid-game pool of ~12–20 would add a few points **[guess]**, not another 20. On set1000, half of rem > 16 multi-candidate decisions already have a best-to-second `q` gap ≤ 100 (17.3 ± 0.1 such decisions per game); that is the window the sampler was built for.
- A hidden long-horizon evaluator leak that short, network-tailed references cannot see is possible in principle. The realized-return feature model in §1b does not find a usable one (OOF R² ≈ 0), and E1 already killed the obvious phase and 2nd-bust corrections. I am not willing to budget a large unmeasured extra pool on that basis.

**Answer:** no. The calculated above-16 flip gain is **12.5 ± 5.5** using the strongest labels we have for the bulk of the pool, or **20.2 ± 5.0** if one sticks to raw reference A. Both sit inside (or at the low end of) the 10–25 range. There is no measured remainder big enough to push the total well past 25.

The 0.6× discount taken from the set1000 exact-regret vs realized-gain checks (`ideas/regret-map.md`) is a **[guess]**, kept separate: 0.6 × 12.5 ≈ 7.5, 0.6 × 20.2 ≈ 12, 0.6 × 24.3 ≈ 15.

---

## 3. Can an evaluator fix above 16 cards plausibly clear +30? Headroom

**No.** Even the optimistic raw reference-A number (20.2 above 16, 24.3 including rem = 16) is under the bar before the 0.6× discount. A perfect grab of the composite 12.5 would be about **+8 [guess, 0.6×]** on set1000, inside noise. Stay over-use, the only subset that held up under the strong labels (6.2 ± 2.4 raw), is smaller still, and 21 has already directed that into v2a's training rather than a second runtime trigger.

The 200–300 early underestimate is not a counter-argument: almost all of it is a function of cards left, and that part cannot move the argmax (E1, 0/240). The part that can move it is the differential pool just measured, and that pool is too small.

### Realistic remaining headroom for the whole engine

Current best measured: **8,926 ± 38** (deeper:16, set1000). The lab's working no-peeking band is 9,100–9,500 (charter target 9,500+; strategy summary's "missing ~600 to 9,500"). Those are not legal-policy measurements. The only computed peeking figure is the clairvoyant beam, 13,194 ± 35 on 300 set1000 shuffles, which is **not** a legal ceiling (full order known; also not bench-verified for the one-Stay-per-card rule).

Identified remaining leaks, raw, not to be added naively (they overlap, and several are ceilings rather than expected gains):

- Above 16 cards: **12.5 ± 5.5 [calc]** (this file), or ~20 if one uses raw reference A. At 0.6×: about +8 to +12 **[guess]**.
- 13–16 band: Learner's v2a ceiling 28.6 raw, about 17 at 0.6× **[guess, Learner's figure, not re-derived here]**; Search's give-up cut in the same band is a second bite at the same fruit.
- ≤13 cards: already mostly inside deeper:16 (measured +55 ± 15 vs shipped52, against a regret-map prediction of +87 ± 8). The shortfall is what produced the 0.6× working rule; I do not add the leftover 32 as still available.

A generous sum of the mid-game composite and the 13–16 ceiling, after 0.6×, is about +25 to +30 and would put a bundled candidate around **8,950–8,960** if everything landed — i.e. at the acceptance bar, not through it by a wide margin, and that is already the *bundle* 21 is holding for v2a's held-out results, not an evaluator-only idea. I do not have a measured pool that fills the 174 points from 8,926 to 9,100, let alone the 574 points to 9,500.

**Recommendation [guess, from the measured pools]:** treat the lower end of the 9,100–9,500 band as a stretch and the upper end as unsupported. A realistic no-peeking working ceiling, given only the leaks we have actually priced, is about **9,000–9,150**. Reaching even 9,100 still needs a new source of mid-game or representation gain that current references do not show. Fixing the 200–300 mean underestimate is not that source.

## What this is not

- Not a candidate and not a request for a set1000 slot.
- Not a reason to rerun E1 (`phase` or `b2`).
- Not a claim that the evaluator is "done": leaf RMSE is still large, v2a in the 13–16 band is still the right evaluator experiment, and Stay over-use is still worth a training-target fix (Learner, already assigned). Those are small, already-counted gains.

## Cost

0 full games (Landon's 1,000-game cap untouched). Log replay + existing labels only; extract took ~10 s, analysis ~12 s, nice 10, 1 process.
