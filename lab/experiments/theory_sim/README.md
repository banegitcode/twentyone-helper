# theory_sim — independent Rust implementation of RULES.md + strategy-quantification tools (21 Theorist)

Written from RULES.md only, then **cross-checked against Landon's JS engine** (`engine/twentyone-solver/src/engine.js`).

## Build / test
```
cargo build --release
cargo test --release                      # 21 hand-built scoring tests (tests/rules.rs)
node js/dump_decks.js 1 6000 js/decks_1_6k.txt
node js/crosscheck_gen.js 1 6000 js/xcheck_trace.txt   # 6000 games of mixed random/builder play on Landon's engine
./target/release/crosscheck js/decks_1_6k.txt js/xcheck_trace.txt
   -> replayed 6000 games, mismatches 0 (per-move points, per-move bust flag, final score incl. Perfect Bonus, bust count);
      the traces contain 32,255 plain-21 clears, 63 three-7s, 1,923 five-card 800s, 2,056 five-card-21 1000s.
```
## Files
- `src/game.rs`  rules (column-state tables, `St`, `act`, `actions`), `src/rng.rs` shuffle, `src/solver.rs` exact expectimax (memoised on deck counts + sorted columns + busts/stays/streak; chance-node = next card; **no future-order peeking**), `src/policy.rs` Greedy baseline + TD policy + parallel evaluator, `src/td.rs` linear afterstate evaluator, `src/bin/{train,eval,endgame,crosscheck}.rs`.
- `js/` Node helpers that use Landon's engine as the base policy (positions, rollouts, implied values). `py/` analysis scripts. `data/` raw outputs.
- RNG (ours): SplitMix64, Fisher-Yates from i=51..1 with j=((u64>>32)*(i+1))>>32, canonical deck A×4,2..9×4,10×16 (values). **Landon's shuffles** (mulberry32, `E.shuffledDeck(seed)`) are loaded from `js/dump_decks.js` output for all paired comparisons (`eval <decks.txt> ...`).

## Rule readings (ambiguities resolved; all agree with Landon's engine on the 6000-game cross-check)
1. **Soft totals**: column total = hard sum (Ace=1); if the column holds an Ace and hard+10 ≤ 21 the total is hard+10. Bust iff hard > 21 (an Ace "11 unless that busts, else 1" is re-evaluated every card, so a soft column never busts on its next card unless hard+card > 21).
2. **Soft 21**: A+10, A+A+9, A+5+5 … all total 21 exactly -> +400 (or 1000 on the 5th card).
3. **Three 7s**: exactly the first three cards of a column are 7,7,7 (=21) -> +600 *instead of* +400. A 4th card can never create a "three 7s" clear: any three 7s already total 21 and clear at once; any column containing three 7s plus another card exceeds 21. Therefore state needed: one flag "all cards so far are 7s" (only meaningful for 1–2 card columns). Order of arrival is irrelevant (it is not "7,7,7 in sequence among other cards"). A 3-card column 10+4+7 is a plain 21 (+400).
4. **5-card rules**: 5th card no bust & total≠21 -> 800; total==21 (soft allowed) -> 1000 (replaces 400/800); 5th card bust -> bust.
5. **Streak**: a "scoring card" is a placement that clears with points. n-th consecutive scoring card pays 2:+250, 3:+500, 4:+1000, ≥5:+2000. Max reachable streak with 4 columns is 4 (each scoring card clears a different column and an empty column cannot score with one card), so the ≥5 value is never used (the Stay does not refill a column). Non-scoring placement or bust -> 0. Stay leaves the streak unchanged.
6. **Stay**: before placing the current card, empty any one column (including one that will receive the card). No penalty, no bust count, 2 per game. Stays on empty columns are legal no-ops (we drop them from the action set).
7. **Perfect Bonus**: +1000 iff game ends with 0 busts (52 cards placed). Third bust ends game at once (no PB possible).
8. A card can always be placed: a 5th card clears the column, so no column is ever "full".
