#!/usr/bin/env python3
"""Single-engine runner: mean +- SE, bust/perfect rate, speed.   python3 run_one.py --engine native:expect1 --set set1000"""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
from compare import fmt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True)
    ap.add_argument("--set", default="set1000")
    ap.add_argument("--workers", type=int, default=H.default_workers())
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--spc", type=int, default=1)
    ap.add_argument("--cache", action="store_true", help="reuse/store per-game rows in results/cache (deterministic engines only)")
    ap.add_argument("--limit", type=int, default=None)
    a = ap.parse_args()
    H.verify_set(a.set)
    r = H.run_engine(a.engine, a.set, a.workers, a.seed, a.spc, limit=a.limit, cache=a.cache)
    s = H.summarize(r)
    print(f"{a.engine} on {a.set}: n={s['n']}\n  {fmt(s)}")


if __name__ == "__main__":
    main()
