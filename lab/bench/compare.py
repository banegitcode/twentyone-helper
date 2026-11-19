#!/usr/bin/env python3
"""Paired comparison on identical shuffles.
  python3 compare.py --a native:random --b native:expect1 --set set1000 [--workers 8] [--seed 1] [--spc 1]
Engine specs: see harness.py docstring / README.md.  diff = B - A.  ACCEPTED only if n>=1000 and diff > 2 SE."""
import argparse, csv, datetime, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H



def frozen_info(*specs):
    """If a cmd: spec points at bench/frozen/<name>@<sha>/, return that name and sha."""
    out = {}
    for spec in specs:
        if not spec:
            continue
        m = re.search(r"frozen/([^/@]+)@([0-9a-fA-F]+)/", spec)
        if m:
            out = {"frozen_name": m.group(1), "frozen_sha": m.group(2), "frozen_path": None}
            m2 = re.search(r"(\S*frozen/%s@%s/\S+)" % (re.escape(m.group(1)), re.escape(m.group(2))), spec)
            if m2:
                out["frozen_path"] = m2.group(1)
            break
    return out


def fmt(s):
    return (f"mean {s['mean']:9.1f} +- {s['se']:5.1f} (SE)  sd {s['sd']:6.0f} | busts/game {s['busts_per_game']:.3f}  "
            f"games>=1 bust {s['bust_game_rate']*100:5.1f}%  3-bust {s['three_bust_rate']*100:5.1f}%  "
            f"perfect {s['perfect_rate']*100:5.2f}% | {s['games_per_sec_wall']:,.0f} games/s wall, "
            f"{s['games_per_sec_per_core']:,.0f} games/s/core")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", required=True)
    ap.add_argument("--b", required=True)
    ap.add_argument("--set", default="set1000")
    ap.add_argument("--workers", type=int, default=H.default_workers())
    ap.add_argument("--seed", type=int, default=1, help="seed for stochastic engines (per-game seed derived from it)")
    ap.add_argument("--spc", type=int, default=1, help="max Stays per card (default 1; see README)")
    ap.add_argument("--cache", action="store_true", help="reuse/store per-game rows in results/cache (deterministic engines only)")
    ap.add_argument("--cache-a", action="store_true", help="cache/reuse only the A side (use when B is time/clock dependent)")
    ap.add_argument("--limit", type=int, default=None, help="only first N games (verdict forced non-ACCEPTED if <1000)")
    ap.add_argument("--frozen", default=None, help="short sha of bench/frozen/<name>@<sha> (recorded in the result JSON; also auto-detected from the spec path)")
    ap.add_argument("--outdir", default=os.path.join(H.BENCH, "results"))
    a = ap.parse_args()
    sha = H.verify_set(a.set)
    ts0 = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    pdir = os.path.join(a.outdir, "progress"); os.makedirs(pdir, exist_ok=True)
    pbase = os.path.join(pdir, f"{ts0}_{re.sub(r'[^A-Za-z0-9_.-]', '_', H.spec_label(a.a))}_vs_{re.sub(r'[^A-Za-z0-9_.-]', '_', H.spec_label(a.b))}")
    print("per-game progress:", pbase + ".{a,b}.csv (game,score,busts,perfect,ncards; append-only, unordered)")
    os.environ["BENCH_PROGRESS"] = pbase + ".a.csv"
    ra = H.run_engine(a.a, a.set, a.workers, a.seed, a.spc, limit=a.limit, cache=a.cache or a.cache_a)
    os.environ["BENCH_PROGRESS"] = pbase + ".b.csv"
    rb = H.run_engine(a.b, a.set, a.workers, a.seed, a.spc, limit=a.limit, cache=a.cache)
    os.environ.pop("BENCH_PROGRESS", None)
    sa, sb = H.summarize(ra), H.summarize(rb)
    n = sa["n"]
    d = [rb["rows"][i][1] - ra["rows"][i][1] for i in range(n)]
    dm, dse, dsd = H.mean_se(d)
    z = dm / dse if dse else float("nan")
    v = H.verdict(n, dm, dse, a.set)
    la, lb = H.spec_label(a.a), H.spec_label(a.b)
    print(f"set {a.set} (sha256 {sha[:12]}..) n={n}  workers={a.workers}")
    print(f"A = {a.a}\n    {fmt(sa)}")
    print(f"B = {a.b}\n    {fmt(sb)}")
    print(f"paired diff (B-A) = {dm:+.1f} +- {dse:.1f} (SE = sd_diff {dsd:.0f} / sqrt({n}))   z = {z:+.2f}")
    print(f"VERDICT: {v}   (rule: n>=1000 and diff > 2 SE)")
    print("NOTE: ACCEPTED also requires a clean future-order audit (python3 audit.py ...) before the champion changes.")
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    base = os.path.join(a.outdir, f"{ts}_{re.sub(r'[^A-Za-z0-9_.-]', '_', la)}_vs_{re.sub(r'[^A-Za-z0-9_.-]', '_', lb)}")
    os.makedirs(a.outdir, exist_ok=True)
    with open(base + ".csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["game", "a_score", "b_score", "diff", "a_busts", "b_busts", "a_perfect", "b_perfect"])
        for i in range(n):
            x, y = ra["rows"][i], rb["rows"][i]
            w.writerow([i, x[1], y[1], y[1] - x[1], x[2], y[2], x[3], y[3]])
    ia, ib = frozen_info(a.a), frozen_info(a.b)
    info = dict(ib) if ib else {}
    if ia:
        info["frozen_name_a"] = ia.get("frozen_name")
        info["frozen_sha_a"] = ia.get("frozen_sha")
        info["frozen_path_a"] = ia.get("frozen_path")
    if getattr(a, "frozen", None):
        info["frozen_sha"] = a.frozen
    summ = {"set": a.set, "set_sha256": sha, "n": n, "a": a.a, "b": a.b, "seed": a.seed, "spc": a.spc,
            "A": sa, "B": sb, "paired_diff_B_minus_A": dm, "paired_se": dse, "z": z, "sd_diff": dsd,
            "verdict": v, "timestamp": ts, **info}
    with open(base + ".json", "w") as f:
        json.dump(summ, f, indent=2)
    print("saved", base + ".csv/.json")


if __name__ == "__main__":
    main()
