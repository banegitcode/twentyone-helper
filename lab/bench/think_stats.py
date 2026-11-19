#!/usr/bin/env python3
"""Per-game think-time and cap statistics from an exact-endgame-deeper --timelog (one JSON line per game).
  python3 think_stats.py results/think_pooled16.jsonl"""
import json, statistics, sys
rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
n = len(rows)
cpu = sorted(r["thinkMs"] / 1000 for r in rows)
wall = sorted(r["thinkWallMs"] / 1000 for r in rows)
def q(xs, p): return xs[min(len(xs) - 1, int(p * len(xs)))]
print(f"games logged: {n}")
for name, xs in (("CPU think s/game", cpu), ("wall think s/game (loaded box)", wall)):
    print(f"{name}: mean {statistics.mean(xs):.1f}  median {statistics.median(xs):.1f}  p95 {q(xs,.95):.1f}  max {xs[-1]:.1f}")
print(f"games with CPU think > 180 s: {sum(x > 180 for x in cpu)};  > 150 s: {sum(x > 150 for x in cpu)};  wall > 180 s (load artefact): {sum(x > 180 for x in wall)}")
mm = max(r["maxMoveMs"] for r in rows) / 1000
print(f"max single-decision CPU time: {mm:.1f} s  (median of per-game max {statistics.median(r['maxMoveMs'] for r in rows)/1000:.1f} s)")
gc = sum(r["giveUpClock"] > 0 for r in rows); gm = sum(r["giveUpMemory"] > 0 for r in rows)
capb = sum(r["solveMs"] >= 99000 for r in rows)
noex = sum(r["exactMoves"] == 0 for r in rows)
print(f"games with a CLOCK give-up: {gc} ({100*gc/n:.1f}%) | with a MEMORY give-up (table > 70%): {gm} ({100*gm/n:.1f}%) | solve time reached the 100 s cap: {capb} ({100*capb/n:.1f}%) | games with no exact move at all: {noex} ({100*noex/n:.1f}%)")
print(f"total give-ups: clock {sum(r['giveUpClock'] for r in rows)}, memory {sum(r['giveUpMemory'] for r in rows)}; exact moves/game mean {statistics.mean(r['exactMoves'] for r in rows):.1f}; "
      f"first exact positions median {statistics.median([r['firstExactPositions'] for r in rows if r['firstExactPositions']] or [0])/1e6:.1f}M; max RSS {max(r['rssMB'] for r in rows)} MB")
