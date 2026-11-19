# Best deeper:16 game on set1000: 12,450

Replay of official set1000 game **943**, the unique high score of the current champion
(`deeper:16`, frozen at `bench/frozen/exact-endgame-deeper@90c2d73f938b`).
Logged with the bench reference simulator (`bench/refsim.py`) and the frozen
trace adapter already used in `bench/results/integrity_1245/`. The engine never
saw the future card order.

## Identity

| Item | Value |
|:-----|:------|
| Shuffle set | `set1000` (sha256 `b7cf79437960cc…`, verified against `shuffles/MANIFEST.sha256`) |
| Game index | **943** (0-based; official CSV row `943,12450,12450,0,0,0,1,1`) |
| Official file | `bench/results/20261118_134014_cmd_shipped52_vs_cmd_deeper_16.csv` |
| Per-game seed | `1 * 1000003 + 943` = **1000946** (harness formula; engines are deterministic anyway) |
| Champion | `deeper:16` via frozen `exact-endgame-deeper@90c2d73f938b` + `integrity_1245/trace_adapter.js` |
| Official champion score | 12,450 (0 busts, Perfect Bonus paid) |
| Replay score | **12,450 — exact match** (0 busts, Perfect Bonus +1,000, 52 cards played, board empty at the end) |
| shipped52 on the same shuffle | **12,450** as well (official CSV and this replay both agree) |

Deal order (display suits C/D/H/S = `code // 13` in 0..3; cosmetic only, play uses values):

`6D 8C 2C 8S AS 9S 10C 7D QH 3D QD 9D JS 10H 8H 7S JH 5H 9C 7H 3H KH 5D 5S KD 6H JD 6S AH 4S 2D QC 10S 9H KC 10D 2H 3C 7C AD KS AC 6C 5C 3S 4C 8D 4D JC 2S 4H QS`

Values: `6 8 2 8 1 9 10 7 10 3 10 9 10 10 8 7 10 5 9 7 3 10 5 5 10 6 10 6 1 4 2 10 10 9 10 10 2 3 7 1 10 1 6 5 3 4 8 4 10 2 4 10`

## Score breakdown (calculated from the replay)

Final score = base clears + streak bonuses + Perfect Bonus:

| Source | Points | Share of 12,450 |
|:-------|------:|----------------:|
| Base clears | 7,200 | 57.8% |
| Streak bonuses | 4,250 | 34.1% |
| Perfect Bonus (zero busts) | 1,000 | 8.0% |
| **Total** | **12,450** | 100% |

Base clears by type:

| Clear type | Count | Points each | Total |
|:-----------|------:|------------:|------:|
| Plain 21 (400) | 16 | 400 | 6,400 |
| Three 7s (600) | 0 | 600 | 0 |
| 5-card, not 21 (800) | 1 | 800 | 800 |
| 5-card 21 (1,000) | 0 | 1,000 | 0 |
| Busts | 0 | 0 | 0 |
| **Clears** | **17** |  | **7,200** |

Streak bonuses by length (bonus is paid on the 2nd / 3rd / 4th scoring card of a run):

| Streak length realized | How many runs | Bonus paid in those runs | Detail |
|-----------------------:|--------------:|-------------------------:|:-------|
| 1 (isolated clear) | 6 | 0 | no bonus |
| 2 | 0 | 0 | — |
| 3 | 1 | 750 | +250 +500 |
| 4 | 2 | 1,750 × 2 = 3,500 | +250 +500 +1,000 each |
| **All runs** | **9 runs, 17 clears** | **4,250** | 3×250 + 3×500 + 2×1,000 |

Run lengths in play order: **3, 1, 1, 1, 4, 1, 1, 1, 4**.

Cards accounted for: 49 cards went into the 17 clears, 3 cards were discarded by the two Stays (a dead 9+10 and a lone 10), 0 cards left on the board. The game used the whole deck and ended with every column empty.

## Versus champion averages on set1000

**Calculated** from the official deeper:16 vs shipped52 CSV (same 1,000 shuffles), unless noted.

| Stat | This game | deeper:16 set1000 | shipped52 set1000 (streak-measure on official-equivalent logs) |
|:-----|----------:|------------------:|----------------------------------------------------------------:|
| Final score | 12,450 | mean 8,926 ± 38 (SE); sd 1,197; median 9,000; 90th 10,300; 99th 11,500 | mean 8,872 ± 38 |
| Rank | unique best (1 of 1,000); 36 games ≥ 11,000; 5 games ≥ 12,000 | — | shipped52 also scored 12,450 here |
| Busts | 0 | 0.379 / game; **75.7%** bust-free | 0.363 / game; 76.3% bust-free |
| Perfect Bonus | 1,000 | 757 / 1,000 games, so 757 pts/game | 763 pts/game |
| Clears | 17 | not logged on set1000 for deeper:16 | **14.622** / game |
| Base-clear points | 7,200 | not logged for deeper:16 | **6,623** |
| Streak bonus | 4,250 | not logged for deeper:16 | **1,485** |
| 3-streaks / game | 1 | not logged for deeper:16 | **0.823** |
| 4-streaks / game | 2 | not logged for deeper:16 | **0.152** (14.2% of games have a max streak of 4 at all) |

deeper:16's mean is only +55 vs shipped52, so the shipped52 clear / streak averages are a close stand-in; they are not a substitute for a deeper:16 set1000 breakdown, which was not in the existing data. A 77-game deeper:16 sample on other seeds (`streak-measure/out_d16_partial.txt`) is similar: 14.46 clears, 1,461 streak bonus, 0.18 four-streaks/game.

Excess vs the shipped52 set1000 averages (calculated arithmetic, not a paired deeper:16 breakdown):

- base clears: 7,200 − 6,623 = **+577**
- streak bonus: 4,250 − 1,485 = **+2,765**
- Perfect Bonus: 1,000 − 763 = **+237**
- total: **+3,579**, which is in line with 12,450 − 8,872 = +3,578

Almost four-fifths of the excess is streak bonus, and almost all of that is the two 4-streaks (3,500 of the 4,250). Seventeen clears is also high (structural maximum is 18). Zero busts is common (~76% of games) and only explains a small part of the gap.

## Key moments

### Opening 3-streak (cards 7–9) — +1,950 after 9 cards

- Card 7, 10C, onto 2+9 → 21 (400), streak 1.
- Card 8, 7D, onto 6+8 → 21 (400+250), streak 2.
- Card 9, QH, onto Ace → 21 (400+500), streak 3.

A clean start. The next card (3D) went onto the leftover 8, breaking the streak, and the first 4-streak was not yet available.

### Mid-game patience, then Stay 1 (cards 11–16)

The engine repeatedly declined an immediate 21: a 10 would have completed column 1 (8+3=11) at cards 11 (QD), 13 (JS), and 14 (10H). It parked those tens elsewhere instead. This is a mid-game search decision (33–42 cards still to come, including the current card); it is **not** an exact solve, so we cannot certify it was highest expected value. On this shuffle it did not cash a 4-streak immediately; the 8+3 was later completed by JH at card 17 for an isolated 400.

**Stay 1**, card 16 (7S), 37 cards remaining including the current card: emptied a dead column 2 that held 9+10=19 (only an Ace stays under 21, and that still does not score), and placed the 7 onto a 10, making 17. Good use of a Stay on a column that could almost never score.

### First 4-streak (cards 27–30) — the biggest mid-game swing, +3,350

At card 26 (6H, rem=27) the engine **declined** putting 6 onto 5+10=15 for an immediate 21. It placed the 6 onto a lone 5, making a second 11, and left the 15 standing. Then:

| Card | Play | Result |
|-----:|:-----|:-------|
| 27 JD | 10 onto 5+6=11 | 21, streak 1, +400, score 3,550 |
| 28 6S | 6 onto 5+10=15 | 21, streak 2, +650, score 4,200 |
| 29 AH | Ace onto a lone 10 | 21, streak 3, +900, score 5,100 |
| 30 4S | 4 onto 10+7=17 | 21, streak 4, +1,400, score **6,500** |

That one run added 400+650+900+1,400 = **3,350** (1,600 base + 1,750 streak). After card 30 every column was empty. Again, card 26 was before the exact window, so the decline is not certified as EV-optimal; both deeper:16 and shipped52 made the same choice, and on this shuffle it set up the 4-streak.

### Exact endgame and Stay 2 (cards 37–52) — finishing 4-streak, 11,450 + Perfect = 12,450

Exact solves were attempted from rem 16. The first four (cards 37–40, rem 16–13) **gave up** on a cold table and fell back to network search, which is typical for deeper:16 at 14–16 (see the 40-game give-up tally). From rem 12 through 1 (cards 41–52) every decision was an **exact** remaining-multiset solve, so those twelve moves are the solver's moves.

- Card 40, AD: Ace onto a 10 → isolated 21, +400, score 7,300 (give-up / fallback).
- Card 42, AC: Ace onto the new 10 → 21, +400, score 7,700 (**exact**).
- **Stay 2**, card 45 (3S, rem=8, **exact**): emptied a lone 10 in column 2 and started a new 3 there. The 10 was a loose ten that the solver preferred to throw away rather than keep.
- Cards 46 and 48 (4C, 4D): the exact solver **declined** completing 10+7=17 for 21, and instead built column 3 toward a five-card clear (2+3+4+4). At rem=7 the remaining unseen values (after placing the current 4) still included two more 4s, a 2, an 8, and two 10s, so both the 17 and a five-card finish were live under the remaining multiset — this is exact play, not a peek at the upcoming order.

Then the finishing 4-streak, all exact:

| Card | Play | Result | Running score |
|-----:|:-----|:-------|--------------:|
| 49 JC | 10 onto 6+5=11 | 21, streak 1, +400 | 8,100 |
| 50 2S | 2 onto 2+3+4+4=13 (5 cards, total 15) | 5-card 800 + 250, streak 2, +1,050 | 9,150 |
| 51 4H | 4 onto 10+7=17 | 21, streak 3, +900 | 10,050 |
| 52 QS | 10 onto 3+8=11 | 21, streak 4, +1,400 | **11,450** |

Plus the Perfect Bonus +1,000 → **12,450**. The board was empty.

## shipped52 on the same shuffle

shipped52 also scored **12,450**, 0 busts, 17 clears, the same 7,200 / 4,250 / 1,000 split, and the same run lengths 3, 1, 1, 1, 4, 1, 1, 1, 4.

The two engines played **identically through card 41**. They diverged on four consecutive cards (42–45) and then reconverged on the same finishing sequence from card 46 on (same placements and the same scores from 7,700 onward):

| # | Rem | Card | shipped52 Stay / place / event | deeper:16 Stay / place / event |
|--:|----:|:----:|:-------------------------------|:-------------------------------|
| 40 | 13 | AD | —; place 1; 21 = 400; streak 1; score 7300 | —; place 1; 21 = 400; streak 1; score 7300 |
| 41 | 12 | KS | —; place 1; keep; score 7300 | —; place 1; keep; score 7300 |
| 42 | 11 | AC | Stay col 1 (was 10 = 10); place 1; keep; score 7300 **DIFF** | —; place 1; 21 = 400; streak 1; score 7700 **DIFF** |
| 43 | 10 | 6C | —; place 2; keep; score 7300 **DIFF** | —; place 1; keep; score 7700 **DIFF** |
| 44 | 9 | 5C | —; place 2; 21 = 400; streak 1; score 7700 **DIFF** | —; place 1; keep; score 7700 **DIFF** |
| 45 | 8 | 3S | —; place 2; keep; score 7700 **DIFF** | Stay col 2 (was 10 = 10); place 2; keep; score 7700 **DIFF** |
| 46 | 7 | 4C | —; place 3; keep; score 7700 | —; place 3; keep; score 7700 |
| 47 | 6 | 8D | —; place 2; keep; score 7700 | —; place 2; keep; score 7700 |
| 48 | 5 | 4D | —; place 3; keep; score 7700 | —; place 3; keep; score 7700 |
| 49 | 4 | JC | —; place 1; 21 = 400; streak 1; score 8100 | —; place 1; 21 = 400; streak 1; score 8100 |
| 50 | 3 | 2S | —; place 3; 5-card = 800; streak 2 +250; score 9150 | —; place 3; 5-card = 800; streak 2 +250; score 9150 |
| 51 | 2 | 4H | —; place 0; 21 = 400; streak 3 +500; score 10050 | —; place 0; 21 = 400; streak 3 +500; score 10050 |
| 52 | 1 | QS | —; place 2; 21 = 400; streak 4 +1000; score 11450 | —; place 2; 21 = 400; streak 4 +1000; score 11450 |

The fork is two different ways to spend the second Stay and still reach the same endgame board shape (a 17, an 11, a 3, and a 2+3) in time for the exact-looking finish. deeper:16, already in its exact window, scored the Ace on the 10 at card 42 and used Stay later to dump a leftover 10. shipped52 used Stay at card 42 to dump that 10, parked the Ace as a soft 11, and scored 10+6+5=21 two cards later. After card 49 both have an empty column 1 and the same remaining three columns; cards 50–52 are identical.

So this 12,450 is **not** a deeper:16-only result. The mid-game 3-streak, Stay 1, and first 4-streak are shared with the previous champion, and the late 4-streak is reachable by both exact-ish endgames.

## Solver comparison

Policy never used the future card order. "Higher value" here means expected remaining score under the remaining *multiset*, not the realized next cards.

- **Cards 1–36 (rem 52–17):** before the exact window. `exact-labeler` cannot score alternatives cheaply at 17+ cards left (measured: most 17–20 card labels exceed a 40M-position budget in 40–67 s CPU; 18+ almost always fail). No regret-map labels exist for this shuffle's mid-game positions either. **Early and mid-game decisions cannot be exactly checked.** Notable un-certified choices: declining the 8+3=11 twenty-ones at cards 11/13/14, and declining 6-onto-15 at card 26, which on this shuffle set up the first 4-streak.
- **Cards 37–40 (rem 16–13):** exact solve attempted (budget 3.2M new positions, logCap 25) and **gave up**; network-search fallback was used. These four moves are therefore not certified exact. Checking them with the labeler would be a 16-card-class solve (often 10–40 s, sometimes a table fill). Not run, per the lean-compute request.
- **Cards 41–52 (rem 12–1):** every move was an exact hit. For those twelve decisions the move played *is* the solver's choice, so no alternative had a higher remaining-multiset value (ties possible; we did not dump the per-move exact values, only the chosen action). That includes Stay 2, the two declined 21s while building the five-card column, and the finishing 4-streak.

## Full hand-by-hand log (deeper:16)

Running score in the table is **without** the Perfect Bonus. After card 52 it is 11,450; the final total is 12,450.

| # | Rem | Card | Val | Stay | Place | Column after | Event | Streak bonus | Pts | Running score | Busts | Solver |
|--:|----:|:----:|----:|:-----|:-----:|:-------------|:------|------------:|----:|--------------:|------:|:-------|
| 1 | 52 | 6D | 6 | — | 0 | 6  total 6 | keep | — | 0 | 0 | 0 | search (before exact window) |
| 2 | 51 | 8C | 8 | — | 1 | 8  total 8 | keep | — | 0 | 0 | 0 | search (before exact window) |
| 3 | 50 | 2C | 2 | — | 2 | 2  total 2 | keep | — | 0 | 0 | 0 | search (before exact window) |
| 4 | 49 | 8S | 8 | — | 0 | 6 8  total 14 | keep | — | 0 | 0 | 0 | search (before exact window) |
| 5 | 48 | AS | 1 | — | 3 | A  total 11 (soft, hard 1) | keep | — | 0 | 0 | 0 | search (before exact window) |
| 6 | 47 | 9S | 9 | — | 2 | 2 9  total 11 | keep | — | 0 | 0 | 0 | search (before exact window) |
| 7 | 46 | 10C | 10 | — | 2 | 2 9 10  total 21 → cleared | 21 = 400; streak 1 | — | 400 | 400 | 0 | search (before exact window) |
| 8 | 45 | 7D | 7 | — | 0 | 6 8 7  total 21 → cleared | 21 = 400; streak 2 +250 | 250 | 650 | 1050 | 0 | search (before exact window) |
| 9 | 44 | QH | 10 | — | 3 | A 10  total 21 (soft, hard 11) → cleared | 21 = 400; streak 3 +500 | 500 | 900 | 1950 | 0 | search (before exact window) |
| 10 | 43 | 3D | 3 | — | 1 | 8 3  total 11 | keep | — | 0 | 1950 | 0 | search (before exact window) |
| 11 | 42 | QD | 10 | — | 0 | 10  total 10 | keep | — | 0 | 1950 | 0 | search (before exact window) |
| 12 | 41 | 9D | 9 | — | 2 | 9  total 9 | keep | — | 0 | 1950 | 0 | search (before exact window) |
| 13 | 40 | JS | 10 | — | 3 | 10  total 10 | keep | — | 0 | 1950 | 0 | search (before exact window) |
| 14 | 39 | 10H | 10 | — | 2 | 9 10  total 19 | keep | — | 0 | 1950 | 0 | search (before exact window) |
| 15 | 38 | 8H | 8 | — | 0 | 10 8  total 18 | keep | — | 0 | 1950 | 0 | search (before exact window) |
| 16 | 37 | 7S | 7 | Stay col 2 (was 9 10 = 19) | 3 | 10 7  total 17 | keep | — | 0 | 1950 | 0 | search (before exact window) |
| 17 | 36 | JH | 10 | — | 1 | 8 3 10  total 21 → cleared | 21 = 400; streak 1 | — | 400 | 2350 | 0 | search (before exact window) |
| 18 | 35 | 5H | 5 | — | 1 | 5  total 5 | keep | — | 0 | 2350 | 0 | search (before exact window) |
| 19 | 34 | 9C | 9 | — | 2 | 9  total 9 | keep | — | 0 | 2350 | 0 | search (before exact window) |
| 20 | 33 | 7H | 7 | — | 2 | 9 7  total 16 | keep | — | 0 | 2350 | 0 | search (before exact window) |
| 21 | 32 | 3H | 3 | — | 0 | 10 8 3  total 21 → cleared | 21 = 400; streak 1 | — | 400 | 2750 | 0 | search (before exact window) |
| 22 | 31 | KH | 10 | — | 1 | 5 10  total 15 | keep | — | 0 | 2750 | 0 | search (before exact window) |
| 23 | 30 | 5D | 5 | — | 2 | 9 7 5  total 21 → cleared | 21 = 400; streak 1 | — | 400 | 3150 | 0 | search (before exact window) |
| 24 | 29 | 5S | 5 | — | 0 | 5  total 5 | keep | — | 0 | 3150 | 0 | search (before exact window) |
| 25 | 28 | KD | 10 | — | 2 | 10  total 10 | keep | — | 0 | 3150 | 0 | search (before exact window) |
| 26 | 27 | 6H | 6 | — | 0 | 5 6  total 11 | keep | — | 0 | 3150 | 0 | search (before exact window) |
| 27 | 26 | JD | 10 | — | 0 | 5 6 10  total 21 → cleared | 21 = 400; streak 1 | — | 400 | 3550 | 0 | search (before exact window) |
| 28 | 25 | 6S | 6 | — | 1 | 5 10 6  total 21 → cleared | 21 = 400; streak 2 +250 | 250 | 650 | 4200 | 0 | search (before exact window) |
| 29 | 24 | AH | 1 | — | 2 | 10 A  total 21 (soft, hard 11) → cleared | 21 = 400; streak 3 +500 | 500 | 900 | 5100 | 0 | search (before exact window) |
| 30 | 23 | 4S | 4 | — | 3 | 10 7 4  total 21 → cleared | 21 = 400; streak 4 +1000 | 1000 | 1400 | 6500 | 0 | search (before exact window) |
| 31 | 22 | 2D | 2 | — | 0 | 2  total 2 | keep | — | 0 | 6500 | 0 | search (before exact window) |
| 32 | 21 | QC | 10 | — | 1 | 10  total 10 | keep | — | 0 | 6500 | 0 | search (before exact window) |
| 33 | 20 | 10S | 10 | — | 0 | 2 10  total 12 | keep | — | 0 | 6500 | 0 | search (before exact window) |
| 34 | 19 | 9H | 9 | — | 0 | 2 10 9  total 21 → cleared | 21 = 400; streak 1 | — | 400 | 6900 | 0 | search (before exact window) |
| 35 | 18 | KC | 10 | — | 0 | 10  total 10 | keep | — | 0 | 6900 | 0 | search (before exact window) |
| 36 | 17 | 10D | 10 | — | 2 | 10  total 10 | keep | — | 0 | 6900 | 0 | search (before exact window) |
| 37 | 16 | 2H | 2 | — | 3 | 2  total 2 | keep | — | 0 | 6900 | 0 | give-up → search fallback |
| 38 | 15 | 3C | 3 | — | 3 | 2 3  total 5 | keep | — | 0 | 6900 | 0 | give-up → search fallback |
| 39 | 14 | 7C | 7 | — | 0 | 10 7  total 17 | keep | — | 0 | 6900 | 0 | give-up → search fallback |
| 40 | 13 | AD | 1 | — | 1 | 10 A  total 21 (soft, hard 11) → cleared | 21 = 400; streak 1 | — | 400 | 7300 | 0 | give-up → search fallback |
| 41 | 12 | KS | 10 | — | 1 | 10  total 10 | keep | — | 0 | 7300 | 0 | exact |
| 42 | 11 | AC | 1 | — | 1 | 10 A  total 21 (soft, hard 11) → cleared | 21 = 400; streak 1 | — | 400 | 7700 | 0 | exact |
| 43 | 10 | 6C | 6 | — | 1 | 6  total 6 | keep | — | 0 | 7700 | 0 | exact |
| 44 | 9 | 5C | 5 | — | 1 | 6 5  total 11 | keep | — | 0 | 7700 | 0 | exact |
| 45 | 8 | 3S | 3 | Stay col 2 (was 10 = 10) | 2 | 3  total 3 | keep | — | 0 | 7700 | 0 | exact |
| 46 | 7 | 4C | 4 | — | 3 | 2 3 4  total 9 | keep | — | 0 | 7700 | 0 | exact |
| 47 | 6 | 8D | 8 | — | 2 | 3 8  total 11 | keep | — | 0 | 7700 | 0 | exact |
| 48 | 5 | 4D | 4 | — | 3 | 2 3 4 4  total 13 | keep | — | 0 | 7700 | 0 | exact |
| 49 | 4 | JC | 10 | — | 1 | 6 5 10  total 21 → cleared | 21 = 400; streak 1 | — | 400 | 8100 | 0 | exact |
| 50 | 3 | 2S | 2 | — | 3 | 2 3 4 4 2  total 15 → cleared | 5-card = 800; streak 2 +250 | 250 | 1050 | 9150 | 0 | exact |
| 51 | 2 | 4H | 4 | — | 0 | 10 7 4  total 21 → cleared | 21 = 400; streak 3 +500 | 500 | 900 | 10050 | 0 | exact |
| 52 | 1 | QS | 10 | — | 2 | 3 8 10  total 21 → cleared | 21 = 400; streak 4 +1000 | 1000 | 1400 | 11450 | 0 | exact |

Board after each scoring card or Stay:

| After card | Running score | Board (col 0–3) |
|:-----------|--------------:|:----------------|
| #7 10C | 400 | 0:6 8=14; 1:8=8; 2:—; 3:A=11 (soft, hard 1) |
| #8 7D | 1050 | 0:—; 1:8=8; 2:—; 3:A=11 (soft, hard 1) |
| #9 QH | 1950 | 0:—; 1:8=8; 2:—; 3:— |
| #16 7S | 1950 | 0:10 8=18; 1:8 3=11; 2:—; 3:10 7=17 |
| #17 JH | 2350 | 0:10 8=18; 1:—; 2:—; 3:10 7=17 |
| #21 3H | 2750 | 0:—; 1:5=5; 2:9 7=16; 3:10 7=17 |
| #23 5D | 3150 | 0:—; 1:5 10=15; 2:—; 3:10 7=17 |
| #27 JD | 3550 | 0:—; 1:5 10=15; 2:10=10; 3:10 7=17 |
| #28 6S | 4200 | 0:—; 1:—; 2:10=10; 3:10 7=17 |
| #29 AH | 5100 | 0:—; 1:—; 2:—; 3:10 7=17 |
| #30 4S | 6500 | 0:—; 1:—; 2:—; 3:— |
| #34 9H | 6900 | 0:—; 1:10=10; 2:—; 3:— |
| #40 AD | 7300 | 0:10 7=17; 1:—; 2:10=10; 3:2 3=5 |
| #42 AC | 7700 | 0:10 7=17; 1:—; 2:10=10; 3:2 3=5 |
| #45 3S | 7700 | 0:10 7=17; 1:6 5=11; 2:3=3; 3:2 3=5 |
| #49 JC | 8100 | 0:10 7=17; 1:—; 2:3 8=11; 3:2 3 4 4=13 |
| #50 2S | 9150 | 0:10 7=17; 1:—; 2:3 8=11; 3:— |
| #51 4H | 10050 | 0:—; 1:—; 2:3 8=11; 3:— |
| #52 QS | 11450 | 0:—; 1:—; 2:—; 3:— |

## Verdict

**Calculated:** this is the unique best deeper:16 game on set1000 (12,450 vs a mean of 8,926, a 99th percentile of 11,500, and only five games at 12,000 or more). The replay matches the official score. The 3,500-odd points above the champion average come mostly from streak bonus (+2,765 vs the shipped52 set1000 average of 1,485), driven by two 4-streaks (rare: shipped52 averages only 0.152 four-streaks per game) plus a 3-streak, together with 17 clears (vs ~14.6) and a bust-free Perfect Bonus. There were no three-7s and no 5-card 21; the single five-card 800 was the second card of the finishing 4-streak. shipped52 scored the same 12,450 on this shuffle and played the same game until card 41.

**Guessed, not measured:** the main reason the score is this high is the shuffle, not a special deeper:16 decision. Both champions found the opening 3-streak, dumped the same dead 19, and (by declining a mid-game 21 at card 26) lined up the first 4-streak; two late paths then reached the same finishing 4-streak and an empty board. That is what a very friendly deal looks like under this policy — lots of 11s and 17s that complete in consecutive cards — rather than a different strategy. We cannot prove the mid-game declines were the highest-EV moves, only that they were the moves both engines made and that they paid off on this order. The late 4-streak, from rem 12 down, *is* exact play on the remaining multiset.
