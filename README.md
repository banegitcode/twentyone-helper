# 21 Helper — move calculator for "21" solitaire

Live page: https://banegitcode.github.io/twentyone-helper/ (one self-contained file, works offline once loaded).

The page opens in a **lobby**: the suggested stake, an **Enter game** button, and profit and loss (total, today, a profit-by-game line), record and scores, with by-day, by-bet, more stats, games and settings folded away until tapped
(money, your record, scores, opponent record, whether opponents are getting tougher, results by bet amount,
recent games, settings). Enter game opens the calculator on its own, with no stats on screen. Recording Win or
Loss at the end returns to the lobby with everything updated.

In the calculator, tap the card you were dealt; the page shows which column to play in huge type and applies the move.

- **Columns show every card**, stacked like the game. If a card went somewhere else, **drag it to the right
  column** (any card, not only the last one) and everything after it is recalculated. A card that just cleared a
  column stays as a dashed outline so it can still be dragged.
- **At the end of a game** a sheet asks for Win or Loss, with optional opponent score, entry fee and prize.
- **Stats & settings** keeps wins, losses, win %, the opponent's record and average score, your average score and
  margin, current balance, average win and loss amounts, and the list of recent games (each can be deleted).
- **Bet calculator.** Before each game the page suggests a stake from the game's 18 fixed 1v1 stakes. Every stake
  costs 60% of its prize, so break-even is 60% wins and the Kelly stake is `2.5p - 1.5` of the balance for win
  chance `p`. The page estimates `p` from the last 50 recorded games (pulled toward 60% until there is data),
  lowered if results at similar or higher stakes are worse than the overall record,
  and lowered again if comparing your recent scores with the 15 most recent opponent scores gives a smaller figure,
  stakes **half of Kelly**, never more than 15% of the balance, moves up one stake at a time, and cuts the share
  while profit is more than 10% of the balance below its high (to half at 20% below, a quarter at 30%+).
  There is one mode and no risk setting. Streaks are not treated as predictive.
  The constants were picked with `web/simbet.js`, which drives the page's own calculator through simulated
  bankrolls ($50 start, 60 runs, same random draws for both rules; your score ~N(8755, 1100), opponent ~N(mean, 1300)).
  Median final balance, old rule (quarter Kelly, 10% cap, step down on losing runs) → new rule:

  | Scenario | Old | New | Typical worst drop, old → new |
  |---|---|---|---|
  | Opponent mean 7,300 (~80% wins), 300 games | $3,675 | $7,249 | 18% → 28% |
  | Same, first 60 games only | $90 | $136 | 10% → 20% |
  | Opponent mean 8,000 (~68% wins), 300 games | $60 | $65 | 12% → 21% |
  | Opponent mean 8,700 (~50% wins, no edge), 300 games | $46.80 | $46.55 | 7% → 8% |
  | Opponents 150 points tougher per stake step, 300 games | $108 | $104 | 14% → 23% |

  These are simulations with made-up opponents, not results from the real app.
- **Past games** can be added from Stats & settings (score, opponent score, stake, Win or Loss) without
  changing the current balance.
- The record and the game in progress are saved in the browser on that device only (no account, nothing uploaded).
  Clearing the browser's site data erases them.
- 10, J, Q and K share one **10** button (16 in the deck), since the game treats them the same.
- **Keyboard:** `1`–`9` enter that card (`1` or `A` is the ace), `0` enters any ten-value card, `Backspace` undoes,
  `N` starts a new game.
- Undo and New Game are at the bottom.

**Best measured, not perfect.** The shipped policy averages **8,755** points per full-deck game on 10,000 fresh
shuffles, against **7,275** for the reference baseline on the same shuffles: **+1,480 ± 34** (95% CI, paired).
It is a search that looks 2–3 cards ahead and judges the resulting positions with a small neural network
trained on 850,000 self-played games.

## Rules as implemented

All rules and point values live in one object, `CONFIG` in [src/engine.js](src/engine.js).

- 52 cards dealt one at a time into 4 columns. Number cards face value, J/Q/K = 10, Ace = 1 or 11.
- Exactly 21: +400. Exactly three 7s: +600. Five cards without busting: +800. Five cards totaling 21: +1,000.
- Over 21 is a bust: the column clears, no points; the third bust ends the game.
- Stay: empty a column with no penalty, at most 2 per game.
- Streak bonus for scoring on consecutive cards: **+250 for the 2nd in a row, +500 for the 3rd, +1,000 for the 4th**
  (all seen in the real game). A five-card 800 counts towards the streak (also seen).
- Zero busts at the end: +1,000 Perfect Bonus (counted in every number below). No time bonus.
- The game ends when the deck runs out, on the third bust, or at the card limit (short-game mode).

Assumptions I could not confirm — each is one line in `CONFIG`:

| Assumption | Setting |
|---|---|
| A 5th score in a row pays +2,000 (doubling once more), and so does every one after it. This comes up in fewer than 1 game in 100 | `streakBonus: [250, 500, 1000, 2000]` |
| Using a Stay does not break a streak | `stayBreaksStreak: false` |
| A Stay can be used right before placing the current card | built into the move format |
| Three 7s pays 600 instead of 400, not on top of it | `points.threeSevens` |
| A bust on the 5th card is a bust, not an 800 | built into the placement table |
| The Perfect Bonus is also paid when the timer ends the game | `perfectBonus` |

If the real game pays something different for a 5-streak, change the list and re-run the training and backtest.

## Results

### Shipped policy (network v3, current rules)

Full deck, **fresh seeds 2,500,000–2,509,999**, 10,000 games per row, same shuffles for every row, with the
4-streak paying +1,000:

| Policy | Mean | Median | 5th pct | 95th pct | Zero-bust | Ended by 3 busts | Gain vs baseline (95% CI) |
|---|---|---|---|---|---|---|---|
| Baseline (2 cards ahead, hand weights) | 7275 | 7600 | 4750 | 9300 | 61.9% | 6.3% | — |
| Network v2 (trained when a 4-streak was assumed to pay +750) | 8756 | 8850 | 6750 | 10500 | 77.4% | 1.2% | +1482 ± 34 |
| **Shipped:** network v3 (retrained for the +1,000 4-streak) | **8755** | 8850 | 6750 | 10500 | 76.8% | 1.2% | **+1480 ± 34** |

Retraining for the corrected rule made no measurable difference (v3 was +17 ± 24 on validation and level on
fresh shuffles). The search already applies the exact streak payout to the next 2–3 cards; only the network's
longer-range estimate was out of date. v3 is shipped because it was trained on the rules as now known.
Rows are in [results/final_nn5.log](results/final_nn5.log).

**Every table below this point was measured with the earlier assumption that a 4-streak pays +750**, and the
short-game tables were not re-run (the timer does not end real games early). They are kept as the record of
how each idea compared.

### Network v2 (old 4-streak assumption)

Full deck, **fresh seeds 2,400,000–2,409,999**, 10,000 games per row, same shuffles for every row:

| Policy | Mean | Median | 5th pct | 95th pct | Zero-bust | Ended by 3 busts | Gain (95% CI) |
|---|---|---|---|---|---|---|---|
| Baseline (2 cards ahead, hand weights) | 7250 | 7600 | 4600 | 9250 | 62.6% | 6.6% | — |
| Network v1 (the shipped row in the next table) | 8727 | 8850 | 6800 | 10400 | 77.6% | 0.8% | — |
| **Shipped:** network v2 + selective 3-card + exact last 4 | **8754** | 8900 | 6800 | 10400 | 77.7% | 0.8% | **+1504 ± 34** vs baseline, **+27 ± 19** vs v1 |

Network v2 has the same size and speed as v1; only its training changed (see "What was tried"). The v1 tables
below (timing, fallback row, short games) were not re-run for v2. Rows are in
[results/final_nn4.log](results/final_nn4.log) and [results/final_nn4_base.log](results/final_nn4_base.log).

### Network v1

Full deck, **fresh seeds 2,200,000–2,209,999** (never used for training, tuning or choosing between policies).
Every policy plays the same shuffles; the gain is the paired difference from the baseline. Timing is
single-threaded on a desktop core (Node 22).

| Policy | Mean | Median | 5th pct | 95th pct | Zero-bust | Ended by 3 busts | ms/move (mean / p99 / max) | Gain vs baseline (95% CI) |
|---|---|---|---|---|---|---|---|---|
| Baseline (2 cards ahead, hand weights) | 7267 | 7600 | 4650 | 9300 | 61.8% | 6.5% | 0.04 / 0.2 / 0.2 | — |
| Previous best (tuned weights, selective 4-card) | 8455 | 8650 | 6300 | 10300 | 73.7% | 1.8% | 3.0 / 11 / 17 | +1189 ± 34 |
| Network, 2 cards only (what a slow phone falls back to) | 8578 | 8700 | 6600 | 10250 | 74.7% | 1.3% | 2.4 / 7 / 7 | +1311 ± 34 |
| **Shipped:** network + selective 3-card + exact last 4 | **8702** | 8850 | 6800 | 10300 | 76.7% | 1.0% | 9.2 / 33 / 41 | **+1435 ± 33** |

10,000 games per row. Rows are in [results/final_nn.log](results/final_nn.log).

### Search-and-weights policies (before the network)

Full deck, fresh seeds 2,000,000–2,009,999. The "Shipped" row here is the "Previous best" row above.
Every policy plays the same shuffles; the gain is the paired difference from the baseline.
Timing is single-threaded on a desktop core (Node 22).

| Policy | Mean | Median | 5th pct | 95th pct | Zero-bust | Ended by 3 busts | ms/move (mean / max) | Gain vs baseline (95% CI) | Games |
|---|---|---|---|---|---|---|---|---|---|
| Baseline (2 cards ahead, hand weights) | 7233 | 7550 | 4650 | 9300 | 61.5% | 6.8% | 0.04 / 0.2 | — | 10000 |
| Baseline weights, 3 cards ahead | 7670 | 7950 | 5400 | 9500 | 68.8% | 4.5% | 2.41 / 16 | +437 ± 33 | 10000 |
| Tuned v1 (CEM), 2 cards | 7881 | 8150 | 5650 | 9650 | 72.5% | 3.5% | 0.04 / 0.2 | +648 ± 35 | 10000 |
| Tuned v2 (more features), 2 cards | 8069 | 8350 | 5700 | 9850 | 73.8% | 2.8% | 0.05 / 0.2 | +836 ± 35 | 10000 |
| Tuned v3 (fit under the old flat streak), 3 cards | 8276 | 8500 | 6100 | 10050 | 74.6% | 2.1% | 0.60 / 2 | +1043 ± 35 | 10000 |
| Tuned v4 (refit under the growing streak), 3 cards | 8340 | 8550 | 6100 | 10200 | 73.6% | 2.0% | 0.62 / 2 | +1107 ± 35 | 10000 |
| v4, 2nd bust costed like the 1st | 8339 | 8550 | 6100 | 10200 | 73.6% | 2.0% | 0.62 / 2 | +1106 ± 35 | 10000 |
| v4 + exact endgame (last 6 cards) | 8397 | 8600 | 6150 | 10250 | 73.8% | 2.2% | 1.08 / 191 | +1164 ± 35 | 10000 |
| v4 + selective 4-card lookahead | 8464 | 8650 | 6300 | 10250 | 74.5% | 1.7% | 2.89 / 17 | +1231 ± 35 | 10000 |
| **Shipped:** v4 + selective 4-card + exact last 4 | **8467** | 8650 | 6300 | 10250 | 74.5% | 1.8% | 2.92 / 18 | **+1234 ± 35** | 10000 |
| v4, full 4 cards ahead | 8464 | 8650 | 6350 | 10300 | 74.2% | 1.7% | 13.35 / 54 | +1231 ± 62 | 3000 |
| Monte Carlo rollouts (60 per candidate) | 8464 | 8650 | 6300 | 10300 | 70.6% | 1.6% | 65 / 471 | +1151 ± 110 | 1000 |

The shipped policy clears 13.9 twenty-ones per game on average (baseline 12.8).

The same policies on the **fixed set, seeds 1–10,000** (the set used to compare ideas during development):
baseline 7,255, shipped 8,470, gain +1,214 ± 34. Full rows are in [results/dev.log](results/dev.log); fresh-set rows in
[results/final.log](results/final.log).

The baseline lands at 61.5% zero-bust, close to the 63% reference. Its mean is not comparable to the ~7,360
reference figure because the streak rule here is the corrected, growing one.

### Short games (timer runs out early)

Fresh seeds 2,300,000–2,309,999, game stops after N cards (52 is the full-deck row from above):

| Cards played | Baseline mean | Previous best | Shipped mean | Zero-bust (shipped) | Gain vs baseline (95% CI) |
|---|---|---|---|---|---|
| 25 | 3701 | 3979 | 4010 | 94.8% | +309 ± 17 |
| 35 | 4958 | 5444 | 5524 | 87.7% | +566 ± 23 |
| 45 | 6212 | 7023 | 7145 | 80.7% | +933 ± 29 |
| 52 | 7267 | 8455 | 8702 | 76.7% | +1435 ± 33 |

The network was trained on full-deck games only and still wins at every length.

Before the network, weights tuned separately for 25 and 35 cards did not beat the full-deck weights, and the
45-card tune found no improvement, so the page uses one policy for every game length. The search
itself knows the card limit, which is what matters.

## What was tried

- **Learned evaluator (shipped).** A small neural network (56 inputs, 128 and 48 hidden units) predicts the points
  still to come from a position. It was trained in two rounds of self-play: 250,000 games by the tuned-weights
  player, then 200,000 by the first network. Half the games contain one random move so the network also sees
  positions the player would not choose. It replaces the hand-built evaluator and is worth about +250 per game.
  A third pass on all the data added +16 ± 36, so it has levelled off. Bigger networks scored higher than
  smaller ones (128x48 beat 64x32 by about 45) but cost more time per move.

- **Search-value training labels (shipped, network v2).** 200,000 more games in which each position is also
  labelled with the search's own value at the next card. That label is far less noisy than the final game
  result. Fine-tuning v1 on a blend (75% search value, 25% game result) gave +31 ± 30 on validation and
  **+27 ± 19** on fresh shuffles. Pure search value (+22 ± 30), a 50/50 blend (+12 ± 32) and training from scratch
  (+7 ± 33) were not clearly better than v1 on validation.

- **Playing for the win instead of the average score (not shipped).** In a 1v1 game what matters is beating the
  opponent, so I trained a network that predicts the whole spread of points still to come and let the search
  maximise the chance of beating an opponent of a given strength. On 3,000 validation shuffles it was worse than
  the score-maximising policy against every opponent tested: -0.2 ± 0.3 percentage points of win chance against
  weak opponents (average 5,000) up to -2.0 ± 0.9 against strong ones (average 8,000). The chance of winning
  rises almost in a straight line with score over the range that matters, so the highest average score is
  already the best way to win, and the spread network is a slightly weaker judge of positions (8,732 average
  against 8,781). Code: `params.util` in [src/engine.js](src/engine.js), [src/train_dist.js](src/train_dist.js),
  [src/winrate.js](src/winrate.js); results in [results/winrate_val.log](results/winrate_val.log).

- **Deeper search.** 3 cards ahead is a clear win over 2. Full 4 cards ahead adds about as much as selective
  deepening but costs 13 ms per move on a desktop, so the page only looks 4 ahead when the top moves are within
  150 points of each other (top 3 moves).
- **Tuned leaf evaluator.** 40 weights fit with the cross-entropy method: fresh tuning seeds every generation
  (1,000,000+), a separate validation set (1,500,000+) to pick the winner. This is the biggest single gain.
- **Stays inside the search.** Considering a Stay below the root only when every plain placement busts scores
  the same as always considering it and is about 5x faster.
- **Second bust nearly free once Perfect is lost.** The tuner already learned its own per-bust costs; forcing the
  2nd bust to cost the same as the 1st changes nothing measurable (8,339 vs 8,340).
- **Exact endgame.** Solving the last 6 cards exactly adds ~60 points alone but can take 190 ms on one move.
  With selective deepening in place, the last 4 cards solved exactly is all that is still worth having.
- **Monte Carlo rollouts.** No better than the shipped search within noise, and 20x slower. Not shipped.

## Speed

The shipped policy averages 9 ms per move on a desktop core; 99% of moves are under 33 ms and the slowest was
41 ms. The page also carries a time guard: if the extra 3-card look is predicted to take more than 60 ms on the
device, that move uses the 2-card network search instead (the 8,578 row). On the desktop the guard never
triggered and the score was unchanged (3,000-game check). Move time on an actual phone was not measured.

## Voice mode (optional, limited testing)

The Voice button listens for a small vocabulary (card names, "undo", "new game") and speaks the column using
pre-loaded clips. What was and was not tested:

- Measured in desktop Chrome: 31–51 ms from a recognised word to the start of the spoken answer. This excludes
  the speech recogniser's own delay.
- **Not tested:** real speech through a microphone in Chrome, and iPhone Safari. Treat voice as experimental.
- Open the page with `?debug` to see the full heard-to-spoken delay on your own device.

## Run it yourself

```bash
node --test test/engine.test.js
```

```bash
node src/make_specs.js
```

```bash
node src/backtest.js results/specs.json 2000000 10000 results/final.json
```

```bash
node src/gen_data.js results/gen_spec2.json 1250000 200000 scratch/d2.bin 13
```

```bash
node src/train_nn.js scratch/d2.bin,scratch/d1.bin results/nn3_128x48.json 128,48 14
```

```bash
node src/gen_data.js results/gen_spec3.json 1000000 200000 scratch/d3.bin 13 td
```

```bash
node src/blend.js scratch/d3.bin scratch/d3_l25.bin 0.25
```

```bash
node src/train_nn.js scratch/d3_l25.bin results/nn4_td25.json 128,48 12 results/nn3_128x48.json
```

```bash
node web/build.js
```

- [src/engine.js](src/engine.js) — rules, seeded simulator, search, exact endgame.
- [src/gen_data.js](src/gen_data.js) — self-play data. [src/train_nn.js](src/train_nn.js) — network trainer (plain JS).
- [src/tune.js](src/tune.js) — weight tuner. [src/backtest.js](src/backtest.js) — paired backtest. [src/timing.js](src/timing.js) — per-move timing.
- [web/template.html](web/template.html) + [web/build.js](web/build.js) — the page; the build writes `dist/index.html` and `docs/index.html`.
- 26 unit tests cover every scoring rule, ace handling, busts, stays, streaks, the Perfect Bonus, the exact endgame and the network hook.
