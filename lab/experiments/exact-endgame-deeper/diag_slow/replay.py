#!/usr/bin/env python3
"""Replay selected set5000 shuffles with the instrumented deeper:16 adapter.

This is a 3-game diagnostic, not a scored test. The policy receives only the
observable state (the deck order never crosses the pipe).

  python3 replay.py --seeds 1001694,1002103,1001292
  python3 replay.py --seeds 1001694 --prefix   # also play earlier games in the same worker chunk first

Seeds follow the harness rule: seed = 1 * 1000003 + game_index on set5000.
"""
import argparse, json, os, sys, time

BENCH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "bench"))
sys.path.insert(0, BENCH)
import harness as H
import refsim

HERE = os.path.dirname(os.path.abspath(__file__))
ADAPTER = os.path.join(HERE, "diag_adapter.js")
FROZEN = "/workspace/21lab/bench/frozen/exact-endgame-deeper@90c2d73f938b/experiments/exact-endgame-deeper/adapter.js"
HARNESS_SEED = 1
DEFAULT_SEEDS = [1001694, 1002103, 1001292]
LOGGED = {
    1001694: {"cpuMs": 69056.5, "maxDecMs": 43372.8, "wallMs": 70167.3, "decisions": 52, "game_in_chunk": 25, "pid": 445639, "chunk_start_idx": 1666},
    1002103: {"cpuMs": 46111.2, "maxDecMs": 43025.0, "wallMs": 46259.0, "decisions": 52, "game_in_chunk": 17, "pid": 446316, "chunk_start_idx": 2083},
    1001292: {"cpuMs": 51246.2, "maxDecMs": 42395.4, "wallMs": 51618.1, "decisions": 52, "game_in_chunk": 39, "pid": 444491, "chunk_start_idx": 1250},
}


def idx_of(seed):
    return seed - HARNESS_SEED * 1000003


def engine_cmd(diag_path, config):
    return f"cmd:node {ADAPTER} --config {config} --diag {diag_path}"


def play_one_process(indices, diag_path, config, label):
    """Play the listed set5000 game indices in one engine process, in order."""
    H.verify_set("set5000")
    decks = H.load_set("set5000")
    os.makedirs(os.path.dirname(diag_path) or ".", exist_ok=True)
    eng = H.make_engine(engine_cmd(diag_path, config))
    rows = []
    t0 = time.time()
    try:
        for idx in indices:
            d = decks[idx]
            seed = HARNESS_SEED * 1000003 + idx
            sc, b, p, n = refsim.play(d, eng, seed=seed, max_stays_per_card=1)
            if hasattr(eng, "game_over"):
                eng.game_over(sc)
            rows.append({"idx": idx, "seed": seed, "score": sc, "busts": b, "perfect": p, "ncards": n})
            print(f"  finished {label} idx={idx} seed={seed} score={sc} busts={b} perfect={p} ncards={n}", flush=True)
    finally:
        if hasattr(eng, "close"):
            eng.close()
    return rows, time.time() - t0


def summarize_game(diag_path, seed):
    recs = []
    with open(diag_path) as f:
        for line in f:
            o = json.loads(line)
            if o.get("seed") == seed:
                recs.append(o)
    decisions = [r for r in recs if r.get("type") == "decision"]
    games = [r for r in recs if r.get("type") == "game"]
    news = [r for r in recs if r.get("type") == "new_game"]
    slow = sorted(decisions, key=lambda r: -r.get("cpuMs", 0))
    outcomes = {}
    for r in decisions:
        outcomes[r["outcome"]] = outcomes.get(r["outcome"], 0) + 1
    exacts = [r for r in decisions if r.get("exactAttempted")]
    return {
        "n_records": len(recs),
        "n_decisions": len(decisions),
        "n_exact": len(exacts),
        "outcomes": outcomes,
        "game": games[-1] if games else None,
        "new_game": news[-1] if news else None,
        "slowest": slow[:8],
        "decisions": decisions,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default=",".join(map(str, DEFAULT_SEEDS)))
    ap.add_argument("--config", default="deeper:16")
    ap.add_argument("--prefix", action="store_true",
                    help="In the same process, first play the earlier games of the original worker chunk")
    ap.add_argument("--outdir", default=HERE)
    ap.add_argument("--tag", default=None)
    args = ap.parse_args()
    seeds = [int(s) for s in args.seeds.split(",") if s.strip()]
    tag = args.tag or ("prefix" if args.prefix else "isolated")
    outdir = os.path.join(args.outdir, tag)
    os.makedirs(outdir, exist_ok=True)

    summary = {"tag": tag, "config": args.config, "started": time.strftime("%Y-%m-%d %H:%M:%S %Z"), "games": []}
    for seed in seeds:
        idx = idx_of(seed)
        logged = LOGGED.get(seed, {})
        if args.prefix:
            start = logged.get("chunk_start_idx")
            if start is None:
                raise SystemExit(f"no chunk_start_idx known for seed {seed}; cannot --prefix")
            indices = list(range(start, idx + 1))
        else:
            indices = [idx]
        diag_path = os.path.join(outdir, f"diag_seed{seed}.jsonl")
        if os.path.exists(diag_path):
            os.remove(diag_path)
        print(f"=== {tag} seed={seed} idx={idx} n_in_process={len(indices)} first_idx={indices[0]} ===", flush=True)
        rows, wall = play_one_process(indices, diag_path, args.config, tag)
        target = next(r for r in rows if r["seed"] == seed)
        info = summarize_game(diag_path, seed)
        g = info["game"] or {}
        entry = {
            "seed": seed,
            "idx": idx,
            "n_played_in_process": len(indices),
            "first_idx": indices[0],
            "score": target["score"],
            "busts": target["busts"],
            "perfect": target["perfect"],
            "ncards": target["ncards"],
            "replay_wall_s": round(wall, 2),
            "logged": logged,
            "replay_cpuMs": g.get("cpuMs"),
            "replay_maxDecMs": g.get("maxDecMs"),
            "replay_wallMs": g.get("wallMs"),
            "replay_decisions": g.get("decisions"),
            "kernel": g.get("kernel"),
            "cap": g.get("cap"),
            "tableEnd": g.get("tableEnd"),
            "rssMB": g.get("rssMB"),
            "outcomes": info["outcomes"],
            "n_exact": info["n_exact"],
            "tableAtStart": (info["new_game"] or {}).get("tableAtStart"),
            "bytesAtStart": (info["new_game"] or {}).get("bytesAtStart"),
            "slowest": [
                {k: d.get(k) for k in (
                    "ply", "rem", "outcome", "fallback", "exactAttempted",
                    "exactMs", "baseMs", "cpuMs", "wallMs", "freshEst",
                    "statesBefore", "statesAfter", "bytesBefore", "bytesAfter",
                    "cap", "occupancyBefore", "occupancyAfter", "statesFracBefore",
                    "statesFracAfter", "cleared", "clearStates", "clearBytes",
                    "busts", "stays", "prev", "rssMB", "kernel",
                )}
                for d in info["slowest"]
            ],
        }
        summary["games"].append(entry)
        # write a compact per-game decisions extract of exact/slow moves
        extract = os.path.join(outdir, f"exact_seed{seed}.json")
        exacts = [d for d in info["decisions"] if d.get("exactAttempted") or d.get("cpuMs", 0) >= 1000]
        with open(extract, "w") as f:
            json.dump({"seed": seed, "score": target, "game": g, "exact_or_slow": exacts}, f, indent=2)
        print(json.dumps({k: entry[k] for k in entry if k != "slowest"}, indent=2), flush=True)
        print("slowest:", json.dumps(entry["slowest"][:3], indent=2), flush=True)

    summary_path = os.path.join(outdir, "summary.json")
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print("wrote", summary_path, flush=True)


if __name__ == "__main__":
    main()
