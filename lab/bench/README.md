# 21 Lab benchmark (owner: Referee)

Everything here is ours: simulator, shuffle sets, harness. Numbers copied from `engine/twentyone-solver` (README, results/, brief) are
**unverified (from repo)** until re-measured here (CHARTER, 2026-11-18).

```
bench/
  README.md                 this file
  RESULTS.md                measured results log (champion baseline etc.)
  engine_api.py             Obs / Engine / action format (in-process API)
  refsim.py                 pure-Python reference simulator of RULES.md (also used for py:/cmd: engines)
  native/                   C hot loop: sim.h (rules), engines.h (baselines), bench21.c (CLI), xcheck.c, build.sh
  harness.py                shuffle-set verification, engine specs, parallel runners, statistics
  compare.py                paired comparison  --a SPEC --b SPEC --set set1000   (diff = B - A)
  run_one.py                single-engine mean +- SE
  audit.py                  future-order audit (dynamic replay + static grep)
  gen_shuffles.py           deterministic generator of shuffles/*.txt (documented seeds)
  shuffles/                 set1000.txt set5000.txt dev200.txt  + MANIFEST.sha256 (verified on every run, files are chmod a-w)
  baselines/                greedy_py.py (python port), greedy_proto.py (subprocess example), cheater_py.py (TEST ONLY, must fail audit)
  champion/                 champion_adapter.js (Node subprocess for Landon's JS/WASM policy), parity.js (engine.js scoring parity)
  tests/                    test_rules.py, test_parity_enginejs.py
  freeze.sh                 snapshot a candidate into bench/frozen/<name>@<shortsha>/
  frozen/                   read-only candidate snapshots used by queued compares
  results/                  <timestamp>_<a>_vs_<b>.csv/.json, logs/, cache/
  run_champion_matrix.sh    background measurement of the champion configs
```

## Commands

```
cd /workspace/21lab/bench
python3 -m unittest discover -s tests -v                      # 44 tests
native/build.sh                                               # (auto-run by harness if the binary is stale)

# paired comparison on identical shuffles (A = reference, B = candidate; diff = B - A)
python3 compare.py --a native:random --b native:expect1 --set set1000 --workers 8
python3 compare.py --a "cmd:node champion/champion_adapter.js --config shipped52" \
                   --b "cmd:node experiments/foo/adapter.js" --set set1000 --workers 4 --cache
python3 compare.py --a py:baselines/greedy_py.py:GreedyPy --b native:greedy --set set5000
python3 run_one.py --engine native:expect1 --set set5000      # single engine mean +- SE

# future-order audit (do this before accepting anything)
python3 audit.py --engine py:baselines/greedy_py.py:GreedyPy --games 20 --perms 3
python3 audit.py --engine "cmd:node champion/champion_adapter.js --config nn5" --games 2 --stride 6 --perms 2 \
                 --static champion/champion_adapter.js
python3 audit.py --static experiments/foo/                    # grep check on sources
```

Engine specs: `native:random|greedy|expect1` (C), `py:<file.py|module>:<Class>` (in-process), `cmd:<command line>` (subprocess protocol).
`--seed N` seeds stochastic engines (per-game seed = N*1000003 + game index, passed to `new_game`). `--spc 2` allows two Stays per card
(default 1, see assumptions). `--cache` reuses per-game rows from results/cache (deterministic engines only; delete the cache after changing an engine).
Verdict: **ACCEPTED only if n >= 1000 and paired diff > 2 SE**; diff <= 0 -> REJECTED; otherwise NOISE; `dev200` is never eligible.
Compare prints a reminder: ACCEPTED also needs a clean audit.
SE of the paired diff = sample sd (n-1) of per-game diffs / sqrt(n); z = diff/SE. "bust rate" is reported as busts/game, share of games with >= 1 bust, and share ended by the 3rd bust.


## Frozen candidates

Every queued `compare.py` run must use a frozen snapshot of the candidate, so a later edit of `experiments/` cannot change a test that is already running or queued (CHARTER, bench integrity rule).

```
# snapshot a candidate directory (and the engine files it loads) into a read-only tree
./freeze.sh exact-endgame-deeper ../experiments/exact-endgame-deeper
# writes bench/frozen/exact-endgame-deeper@<shortsha>/ plus MANIFEST.json
# and updates the symlink bench/frozen/exact-endgame-deeper -> that snapshot

python3 compare.py \
  --a "cmd:node champion/champion_adapter.js --config shipped52" \
  --b "cmd:node frozen/exact-endgame-deeper@<shortsha>/experiments/exact-endgame-deeper/adapter.js --config deeper:13" \
  --set set1000 --workers 3 --cache
```

`freeze.sh <name> <path>` copies `<path>` and, when the candidate loads it, `engine/twentyone-solver` (minus bulky generated dirs such as `scratch/`) into `bench/frozen/<name>@<shortsha>/` using the same layout as the lab root, so relative `require` paths keep working. The snapshot is then `chmod a-w`. The short sha is the first 12 hex characters of the sha256 of the sorted per-file sha256 list (the full tree hash is in `MANIFEST.json`). `compare.py` records `frozen_sha` / `frozen_name` in the result JSON when the spec path contains `frozen/<name>@<sha>/` (or when you pass `--frozen`). `append_experiments.py` copies that sha into the EXPERIMENTS.md row. A new version of a candidate is a new `freeze.sh` invocation, not an edit of an existing snapshot. Already-running compares that were started from `experiments/` are not rewritten; void or rerun them if their code may have changed mid-run.

## Shuffle sets
One shuffle per line, 52 card codes (0..51, `code % 13`: 0=A, 1..9 = 2..10, 10..12 = J,Q,K; first number = first card dealt).
Generated by `gen_shuffles.py` (splitmix64 + Fisher-Yates, pure integer arithmetic): `set1000` seed 2101000, `set5000` seed 2105000, `dev200` seed 2100200.
`MANIFEST.sha256` holds the hashes; `compare.py`/`run_one.py`/`audit.py` refuse to run on a changed or unknown set. The files are read-only on disk.
**dev200 is for debugging/tuning only and is never used for acceptance** (the expect1 baseline's constants were glanced at on dev200 only).
set1000 and set5000 are independent draws (set1000 is not a prefix of set5000).

## Engine interface (the engine never sees the future order)
The harness owns the deck. The engine receives only the observable state, returns an action:

`Obs` / JSON `state`: `columns` (4 lists of card values, J/Q/K = 10, Ace = 1; engine does soft/hard itself), `current` (1..10),
`remaining` (10 ints, `remaining[v-1]` = unseen cards of value v, current card already removed; tens = 16 at start),
`busts`, `stays_left`, `streak` (consecutive scoring placements just before this card), `score` (excluding Perfect Bonus),
`cards_dealt` (incl. current), `cards_left` (unseen, excl. current).
Action: `stay` (null | column 0..3; a list of two only with `--spc 2`) emptied BEFORE placing, then `place` (0..3, may be the emptied column).

(a) **In-process Python**: subclass `engine_api.Engine`; `new_game(seed)` then `decide(obs) -> (stay, place)`. `Obs` is an immutable NamedTuple
rebuilt per decision (no way to mutate harness state; it has no deck field). Honest limit: Python cannot stop a determined engine from
introspecting memory (`gc`) — that is what `audit.py` (dynamic + static) is for; the subprocess mode is the hard guarantee.

(b) **Subprocess, line-delimited JSON on stdin/stdout** (any language: C/C++/Rust/NN/**JS/WASM via Node**). Harness -> engine, one JSON object per line:
```
{"type":"new_game","game":0,"seed":1000003}        # no reply. stochastic engines MUST derive all randomness from seed
{"type":"decide","state":{"columns":[[10],[],[],[]],"current":1,"remaining":[3,4,4,4,4,4,4,4,4,15],"busts":0,"stays_left":2,"streak":0,"score":0,"cards_dealt":2,"cards_left":50}}
{"type":"game_over","score":9250}                   # no reply
{"type":"quit"}
```
Engine -> harness, exactly one line per `decide`: `{"stay":null,"place":2}` (flush stdout!). stderr is inherited. One engine process per worker, reused across games.
No timeouts are enforced (a hung engine hangs the run) — wrap slow engines yourself. A WASM/JS engine plugs in through a tiny Node wrapper like `champion/champion_adapter.js`.
Illegal actions (bad column, Stay with none left, too many Stays) abort the run (never silently fixed).

Native C baselines are built in (`native:*`): they get a copy of the `St` struct, no deck array is in their scope.

## Rule interpretations and assumptions (FLAGGED)
Implemented exactly from RULES.md. Where RULES.md is silent or marks an assumption, the choice is stated; **[A] = assumption, unconfirmed in the real game**.

1. Ace = 11 unless the *column total* would bust, else 1; re-evaluated for the whole column whenever a card is added (soft/hard). Bust iff hard total (aces = 1) > 21.
2. "Exactly 21" uses the best total; any column reaching 21 clears at once (it is not optional). 21 with 2 cards (A+10) scores 400.
3. Three 7s = column of exactly three cards, all 7s -> **600 instead of 400** [A: RULES.md lists "instead of vs on top" as unconfirmed]. A column with three 7s plus other cards cannot total 21, so no ambiguity otherwise.
4. 5 cards without bust -> 800; 5 cards totalling exactly 21 -> **1000 instead of** 400/800; bust on the 5th card is a bust (0). A column can never hold 5 cards after a clear.
5. Bust: 0 points, column cleared, bust counted, streak ends. 3rd bust ends the game immediately (rest of deck unplayed, no Perfect Bonus).
6. Stay: empties one column, no points, no penalty; at most 2 per game; used right before placing the current card, may target the column the card then goes into.
   - **[A] at most one Stay per card** (action = optional Stay, then placement). `--spc 2` allows two. (Note: `21sol/dp.c` allows up to 2 Stays per card by default; engine.js moves carry a single `stay`.)
   - A Stay on an **empty** column is legal and just burns the Stay (matches engine.js; dominated, never useful). Baselines never do it.
   - Stay on a column does not score even if the column held 21-minus-something.
7. Streak: counted over consecutive *scoring placements* (any of the four scoring rows, incl. the 5-card 800). On a scoring card whose predecessor also scored: 2nd +250, 3rd +500, 4th +1000, 5th and later +2000 [A for 5th+]. The bonus is added to the clear's points (also on the 600/1000 rows).
   - **[A] a Stay does not break the streak.** A non-scoring card (including a bust) does.
   - The 5th+ streak value is unreachable in play: every scoring card clears a different column and an emptied column cannot score with one card, so a streak is at most 4 with 4 columns (also noted in engine README). It is only unit-tested via the table.
8. Perfect Bonus +1000 iff the game ends with zero busts (i.e. all 52 cards played). **[A] "paid if the clock ends the game"** is not modelled (no clock; every game is played to 52 cards or 3 busts).
9. Game ends after the 52nd card or the 3rd bust. No thinking-time limit is enforced by the harness (RULES.md: ~2.5 s/card) — engine time per move is reported only by the engine's own logs, not enforced. **[A]**
10. Card identity: J/Q/K are all value 10 (16 tens); engines see values, not ranks/suits (the real game treats them the same).
11. Observation `streak` is the raw consecutive-score count (not capped).

## Parity with the champion's scoring (engine.js) — differences found
`champion/parity.js` + `tests/test_parity_enginejs.py` (engine.js is only `require`d, never modified):
* Exhaustive: all **44,640** single-column card sequences (up to the first clear/bust) give identical outcome (bust / clear+points / keep) in engine.js and refsim: ace handling, three 7s, 5-card, 5-card-21, bust on 5th.
* Replay: identical shuffles + identical action sequences (random, greedy, expect1 on set1000 and set5000; up to 251k steps per run) -> 0 disagreeing games in final score, per-step points and busts, vs engine.js `applyMove`, vs `/workspace/21sol/game.h` (via `native/xcheck`), vs refsim.
* Differences (none change a score):
  1. engine.js allows Stay on an empty column (burns a Stay); RULES.md silent. Sim changed to allow it (was disallowed in my first draft).
  2. engine.js moves have a single `stay` (one Stay per card) = our default; `21sol/dp.c` allows two Stays per card (`maxst` default 2) — relevant if its clairvoyant bound is reused.
  3. engine.js `deck`/`rem` in the search state include the current card; the adapter converts. Perfect Bonus in engine.js is also paid when its optional `timerCards` horizon ends the game (default Infinity, unused here).
  4. engine.js streak counter `prev` is capped at 4 (table length); same payouts as RULES.md for any reachable streak.
* engine.js vs RULES.md: no disagreement found in point values, streak table (250/500/1000/2000, last entry repeats), `stayBreaksStreak:false`, three-7s 600-instead, 5-card-21 1000-instead, bust-on-5th, 3rd-bust end, Perfect Bonus.

## Champion adapter (champion/champion_adapter.js)
`cmd:node champion/champion_adapter.js --config <name>` loads engine.js + x_policies.js (+ exact2.js and the embedded WASM kernel `exact2_kernel.wasm.js`, JS fallback if WASM fails)
from `engine/twentyone-solver/src` (override with `CHAMPION_DIR`), rebuilds the engine's own search state from the observable state only, and calls `policy.choose(st, current)`.
* Configs: `nn5` (README "network v3": NN + 1/2-ply expectimax, selective deeper look, exact last 4 cards), `shipped52` (`results/shipped_policies.json["52"]`: same + exact2 endgame from 13 cards, 100k-position budget per move), `computer` (shipped52 with the web page's computer override xK 14, logCap 25, budget 400k), `exact12|13|14|15` (`results/x_specs_early.json` complete solves, logCap 26, unlimited budget). `file:<spec.json>` for any spec.
* `deepen.budgetMs` (a wall-clock guard in the shipped spec) is forced to 0 so results do not depend on machine speed/load (`--keep-budget` restores it). This is a deviation from the literal shipped spec; the guard "never triggered" on his desktop per his README (unverified).
* **No dependence on the missing .bin files**: the network weights (128x48, 56 inputs) are embedded in `shipped_policies.json` / `specs_nn5_final.json`; the `.bin` files are training data only. Nothing falls back at inference time. WASM is used if available, JS kernel otherwise (same answers per his gate logs, unverified).
* **No access to future order**: the adapter only receives the JSON state; the deck order is not in the process. Source read: policy code (`createSearcher`, `exact2`, `x_policies`) takes `st` (counts, columns, busts, stays, prev, score) and the current card; `shuffledDeck/playGame` exist in engine.js but are the harness helpers, not called by the policy. The exact solver caches across moves of one game keyed by the observed remaining multiset (state-derived). Static scan + dynamic audit results: see RESULTS.md.

## Audit note: stateful engines need `--fresh`
Engines that keep solver tables across games (the champion's exact2 / exact-endgame-deeper) can look "future-dependent" in a plain audit: the replays share their prefix, so
a table left by an earlier replay lets a later replay finish a position-budgeted solve that the original could not (seen on `deeper:16`, decision 36 = the first exact move; it vanishes with a fresh engine).
Use `audit.py --fresh` (new engine process per replayed game) for such engines. In `compare.py` runs a table is reset whenever a new game's unseen deck is not a sub-deck of the old one, which for independent shuffles is effectively always.
A replay that reaches a different observable state is now reported as DIVERGED (and counts as a failure) instead of aborting.

## Per-game progress (2026-11-18)
compare.py writes every finished game (py:/cmd: engines) to results/progress/<ts>_<A>_vs_<B>.{a,b}.csv as `game,score,busts,perfect,ncards`, append-only and unordered. A cached side writes nothing (its scores are already in results/cache). Pairing a stopped run: join the a and b files on `game`.
