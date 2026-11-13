# 21 Helper — move calculator for "21" solitaire

Live page: https://banegitcode.github.io/twentyone-helper/ (one self-contained file, works offline once loaded).

Tap the card you were dealt; the page shows which column to play in huge type and applies the move.
Tap a different column if you played it somewhere else. Undo and New Game are at the bottom.

**Best measured, not perfect.** The shipped policy averages **8,467** points per full-deck game on 10,000 fresh
shuffles, against **7,233** for the reference baseline on the same shuffles: **+1,234 ± 35** (95% CI, paired).

## Rules as implemented

All rules and point values live in one object, `CONFIG` in [src/engine.js](src/engine.js).

- 52 cards dealt one at a time into 4 columns. Number cards face value, J/Q/K = 10, Ace = 1 or 11.
- Exactly 21: +400. Exactly three 7s: +600. Five cards without busting: +800. Five cards totaling 21: +1,000.
- Over 21 is a bust: the column clears, no points; the third bust ends the game.
- Stay: empty a column with no penalty, at most 2 per game.
- Streak bonus for scoring on consecutive cards: **+250 for the 2nd in a row, +500 for the 3rd** (both seen in the real game).
- Zero busts at the end: +1,000 Perfect Bonus (counted in every number below). No time bonus.
- The game ends when the deck runs out, on the third bust, or at the card limit (short-game mode).

Assumptions I could not confirm — each is one line in `CONFIG`:

| Assumption | Setting |
|---|---|
| Streaks of 4+ keep growing by 250 (+750, +1,000, …) | `streakBonus: [250, 500, 750, 1000, 1250, 1500]` |
| Using a Stay does not break a streak | `stayBreaksStreak: false` |
| A Stay can be used right before placing the current card | built into the move format |
| Three 7s pays 600 instead of 400, not on top of it | `points.threeSevens` |
| A bust on the 5th card is a bust, not an 800 | built into the placement table |
| The Perfect Bonus is also paid when the timer ends the game | `perfectBonus` |

If the real game pays something different for a 4-streak, change the list and re-run the tuner and backtest.

## Results

Full deck, **fresh seeds 2,000,000–2,009,999** (never used for tuning or for choosing between policies).
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

Fresh seeds 2,100,000–2,109,999, game stops after N cards. Shipped policy vs baseline:

| Cards played | Baseline mean | Shipped mean | Zero-bust (shipped) | Gain (95% CI) |
|---|---|---|---|---|
| 25 | 3697 | 3988 | 93.1% | +291 ± 17 |
| 35 | 4951 | 5455 | 84.9% | +504 ± 23 |
| 45 | 6221 | 7015 | 77.2% | +795 ± 29 |
| 52 | 7233 | 8467 | 74.5% | +1234 ± 35 |

Weights tuned separately for 25 and 35 cards did not beat the full-deck weights (3,983 and 5,411), and the
45-card tune found no improvement, so the page uses the same weights for every game length. The search
itself knows the card limit, which is what matters.

## What was tried

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

The shipped policy averages 2.9 ms per move and peaks at 18 ms on a desktop core. Phones are a few times
slower, so the page also carries a time guard: if the extra 4-card look is predicted to take more than 40 ms
on the device, that move falls back to the plain 3-card search (2 ms on desktop). The backtests ran without
the guard. Move time on an actual phone was not measured.

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
node web/build.js
```

- [src/engine.js](src/engine.js) — rules, seeded simulator, search, exact endgame.
- [src/tune.js](src/tune.js) — weight tuner. [src/backtest.js](src/backtest.js) — paired backtest. [src/timing.js](src/timing.js) — per-move timing.
- [web/template.html](web/template.html) + [web/build.js](web/build.js) — the page; the build writes `dist/index.html` and `docs/index.html`.
- 24 unit tests cover every scoring rule, ace handling, busts, stays, streaks, the Perfect Bonus and the exact endgame.
