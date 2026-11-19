# Bench integrity report — 12:45 edit, freeze, exact13 / deeper:13

Times below are America/Los_Angeles on 2026-11-18.

## 1. What changed at 12:45

There is no git repository under `/workspace/21lab`. Pre- and post-12:45 copies were recovered from backups and a later revert:

| file | pre-12:45 | 12:45 version | how recovered |
|---|---|---|---|
| `experiments/exact-endgame-deeper/js/pooled.js` | 4596 bytes, md5 `68515a28…` | 6152 bytes, md5 `b3145405…` | `/tmp/pooled_backup.js` (mtime 12:45:47, the old file saved at the edit); `/tmp/pooled_new.js` and `bench/mac_timing/vendor/.../pooled.js` (the 12:45 file) |
| `experiments/exact-endgame-deeper/adapter.js` | 5884 bytes, md5 `c853fc33…` | 6868 bytes, md5 `0ca87e89…` | current tree after a 13:29:17 revert; `/tmp/adapter_modified.js` and the mac_timing vendor copy |

`exact3.js` (11:18), `policy_exact3.js` (11:44) and `hybrid.js` (11:20) were not touched at 12:45. Search was right: the adapter.js diff is only `pooledp:` config parsing (plus comments). The pooled.js diff adds deterministic `maxPositionsGame` / `wallGuardSec` caps and clears the table at game start in that mode. `policy_exact3.js` always `require`s `pooled.js`, but `withPooledExact` runs only for pooled configs. deeper:15 / deeper:16 use `withExactEndFallback` only.

At 13:29:17 both files were reverted to the pre-12:45 text. At 13:33 Search added a separate `adapter2.js` / `js/pooledp.js` / `js/policy_p.js` (official `adapter.js` left alone). Copies live in `versions/` next to this report.

## 2. Which running compares loaded which code

Node loads modules at process start. Official set1000 compares use 12 chunks of ~83 games, 3 workers, one new Node process per chunk.

**pooled:16:26 screen** (compare.py started 12:32:16, `--limit 300 --cache-a`). Voided in full (see §3). First-wave Node PIDs 290723/724/725 each finished 25 games with the *old* timelog schema (no `newPositions`). Later-wave PIDs 316132 (12:59:29), 332169 (13:17:01), 332290 (13:17:10) loaded the 12:45 code (schema includes `newPositions` / `giveUpPosCap` / `giveUpWall`). 119 games were logged in the think file before the stop.

**deeper:16** (compare.py 11:42:28, finished 13:40:14). Four waves of ~29 min. Waves 1–3 started before 12:45 (11:42, ~12:11, ~12:40) = games 0–749, old code. Wave 4 Node PIDs started 13:09:45 / 13:11:29 / 13:13:23 = games 750–999, 12:45 adapter. Result: **+54.7 ± 14.9** vs shipped52, mean 8926, **ACCEPTED**.

**deeper:15** (compare.py 12:11:44, finished 13:38:15). Waves 1–2 started before 12:45 (12:11, ~12:32) = games 0–499, old code. Waves 3–4 started after 12:45 (~12:53 and 13:15–13:17) = games 500–999, 12:45 adapter. Worker 271156 was idle at the end because its last chunk had already finished, not because it had crashed. Result: **+47.6 ± 14.3** vs shipped52, mean 8919, **ACCEPTED**.

**exact14** uses `champion/champion_adapter.js`, not `experiments/` code. Not in the 12:45 contamination set.

## 3. pooled:16:26 — voided

Lead rule: void anything that cannot be shown identical. Pooled is clock-capped, so the 12:45 edit can change decisions. The whole screen was stopped (SIGTERM on parent 290715 and its tree only) at 13:35:06. Partial results moved to `bench/results/void/` (`think_pooled16.jsonl`, empty log, `NOTE_pooled16_screen_20261118_133506.md`). It will be rerun later from a *frozen snapshot of the intended pooled candidate*, behind exact13 and deeper:13. The snapshot `exact-endgame-deeper@90c2d73f938b` is the reverted adapter (no `pooledp`); Search's new `adapter2.js` / `pooledp.js` would need its own freeze before that rerun.

## 4. deeper:15 / deeper:16 — kept (verified identical)

The official CSVs have score/busts/perfect, not move sequences. Official cache rows also have `ncards`. Games were replayed from frozen `exact-endgame-deeper@90c2d73f938b` as **prefixes of official chunks** (one fresh process at the chunk start) so exact-table carry matches the bench. `hybrid.reset()` does not clear the exact3 table.

| config | pre-12:45 games | post-12:45 games | compared fields | result |
|---|---|---|---|---|
| deeper:16 | 0–9 (10) | 750–779 (30) | score, busts, perfect, ncards | **40/40 identical** |
| deeper:15 | 0–9 (10) | 500–519 (20) | score, busts, perfect, ncards | **30/30 identical** |

Recommendation: **keep both runs.** EXPERIMENTS addenda note `post-12:45 chunks verified identical on N games`. Script and traces: `replay.py`, `trace_adapter.js` (outside the frozen tree), `replay_report.json`.

## 5. deeper:16 give-up tally (40 frozen replay games)

Adapter `--timelog` only writes if `policy.game` exists, which is pooled-only. Frozen sources were not edited. An outside wrapper (`trace_adapter.js`) read `policy.stats` (`exact` vs `fallbackBase`) after each `choose`. Bucket is engine `rem` (cards remaining **including** the current card), the same quantity `xK` compares against. 40 games (0–9 and 750–779), 640 decisions at rem 16..1, every one attempted the exact solver.

```
rem  decisions  attempted  exact  giveup  giveup/attempts  giveup/decisions
 16         40         40      3      37            92.5%            92.5%
 15         40         40     11      29            72.5%            72.5%
 14         40         40     26      14            35.0%            35.0%
 13         40         40     34       6            15.0%            15.0%
 12         40         40     39       1             2.5%             2.5%
 11         40         40     39       1             2.5%             2.5%
 10         40         40     40       0             0.0%             0.0%
  9         40         40     40       0             0.0%             0.0%
  8 … 1     40 each    40     40       0             0.0%             0.0%
tot        640        640    552      88            13.8%            13.8%
9–13: 8 give-ups / 200 decisions (4.0%)
```

Give-ups are concentrated at **14–16 cards** (the first exact moves of a game, on a cold or nearly-cold table). Rem 10 through 1 never gave up in this sample. The 9–13 band is only 4%, almost all of it at rem 13 (6/40). If the predicted +100 vs measured +55 is from residual give-ups, the leak is at 14–16 (and some at 13), not 9–12. Table: `deeper16_giveups.txt`.

## 6. Freeze going forward

`bench/freeze.sh <name> <path>` copies the candidate directory and the engine files it loads into a read-only `bench/frozen/<name>@<shortsha>/` (21lab-relative layout so relative `require`s work), writes `MANIFEST.json`, and points `bench/frozen/<name>` at the snapshot. `compare.py` records `frozen_sha` / `frozen_name` in the result JSON (auto-detected from the path, or `--frozen`). `append_experiments.py` copies the sha into the EXPERIMENTS row. Documented in `bench/README.md` and in CHARTER.

Applied snapshots:

- `exact-endgame-deeper@90c2d73f938b` (tree sha256 `90c2d73f938bc299…`)
- `champion@76a84987c25c`

Content writes to a frozen file get `EACCES`. (`touch` can still update mtime on this host; content is protected.)

## 7. exact13 and deeper:13

**exact13 unlimited** was already launched at 13:29:57 by another task, before `freeze.sh` existed, as:

`cmd:env TIMELOG=.../think_exact13.jsonl node -r .../cpu_timelog_hook.js champion/champion_adapter.js --config exact13`

It was **not** restarted (already running). Not a frozen snapshot. `--cache-a`, 3 workers, set1000. As of ~13:54: ~777/1000 games, mean CPU think **4.7 s**, median 1.9 s, p95 15.3 s, **worst so far 118.6 s**, longest single decision 89.3 s, **0 games >150 s**. ETA around **14:02 America/Los_Angeles**. EXPERIMENTS row name: `exact13 unlimited budget` (owner 21 Theorist). The lesson notes that deeper:16 minus deeper:13 is the extra-depth gain.

**deeper:13** is queued in `bench/queue_deeper13.sh` (started 13:38:01), waiting for the exact13 result JSON and for those workers to exit (RAM gate: 2 GiB available). Then it launches from the frozen snapshot:

`node frozen/exact-endgame-deeper@90c2d73f938b/experiments/exact-endgame-deeper/adapter.js --config deeper:13`

(3.2M per move, logCap 25, defaults), plus `cpu_timelog_hook.js` → `results/think_deeper13.jsonl`, 3 workers, `--cache --frozen 90c2d73f938b`, ahead of any later pooled rerun. EXPERIMENTS row name: `exact-endgame-deeper deeper:13` (owner 21 Search). Same extra-depth lesson.

ETA once launched: deeper:15 averaged 15.2 worker-s/game on the official 1000 (wall ~86 min with 3 workers). deeper:13 should be similar or a bit faster (same budget, one card less of exact). Expect roughly **70–90 min** of box wall after exact13 exits, worst-case per-game CPU to be reported from the hook when it finishes. (Mac conversion is 1.5× from the Node timing kit only; the browser is still untimed.)

RAM: the pooled void freed ~2.4 GiB. exact13 + exact14 are still running; deeper:13 waits for exact13 to leave.
