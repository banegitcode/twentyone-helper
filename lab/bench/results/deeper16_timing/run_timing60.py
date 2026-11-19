#!/usr/bin/env python3
"""Play set1000 games 0-59 in one engine process (prefix of official chunk 0,
workers=3 / nchunks=12 => games 0-83) using the frozen deeper:16 adapter and
cpu_timelog_hook.js. 1 worker, so it can sit alongside deeper:13."""
import json, os, sys, time, statistics

BENCH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, BENCH)
import harness as H
import refsim

FROZEN = os.path.join(BENCH, 'frozen', 'exact-endgame-deeper@90c2d73f938b')
ADAPTER = os.path.join(FROZEN, 'experiments', 'exact-endgame-deeper', 'adapter.js')
HOOK = os.path.join(BENCH, 'cpu_timelog_hook.js')
TIMELOG = os.path.join(os.path.dirname(__file__), 'think_deeper16_games0_59.jsonl')
OUT = os.path.join(os.path.dirname(__file__), 'timing60.json')
START, COUNT = 0, 60  # official chunk-0 prefix

def summarize(rows):
    cpu = sorted(r['cpuMs'] / 1000 for r in rows)
    wall = sorted(r['wallMs'] / 1000 for r in rows)
    mxdec = [r['maxDecMs'] / 1000 for r in rows]
    n = len(cpu)
    def pct(xs, p):
        return xs[min(n - 1, int(p * n))]
    s = {
        'n': n,
        'start': START,
        'end_exclusive': START + COUNT,
        'frozen': 'exact-endgame-deeper@90c2d73f938b',
        'config': 'deeper:16',
        'cpu_s': {
            'mean': statistics.mean(cpu),
            'median': statistics.median(cpu),
            'p95': pct(cpu, 0.95),
            'max': cpu[-1],
        },
        'wall_s': {
            'mean': statistics.mean(wall),
            'median': statistics.median(wall),
            'p95': pct(wall, 0.95),
            'max': wall[-1],
        },
        'longest_decision_s': max(mxdec),
        'games_over_60s_cpu': sum(x > 60 for x in cpu),
        'games_over_90s_cpu': sum(x > 90 for x in cpu),
        'games_over_150s_cpu': sum(x > 150 for x in cpu),
        'mac_estimate_box_div_1.5_s': {
            'note': 'Node timing kit only (Mac ~1.5x faster than this box); not measured in a browser',
            'mean': statistics.mean(cpu) / 1.5,
            'median': statistics.median(cpu) / 1.5,
            'p95': pct(cpu, 0.95) / 1.5,
            'max': cpu[-1] / 1.5,
            'longest_decision': max(mxdec) / 1.5,
        },
        'timelog': TIMELOG,
    }
    return s, cpu, mxdec

def main():
    if os.path.exists(TIMELOG):
        os.remove(TIMELOG)
    spec = (f"cmd:env TIMELOG={TIMELOG} node -r {HOOK} {ADAPTER} --config deeper:16")
    decks = H.load_set('set1000')
    eng = H.make_engine(spec)
    t0 = time.time()
    played = []
    try:
        for idx in range(START, START + COUNT):
            sc, b, p, n = refsim.play(decks[idx], eng, seed=1 * 1000003 + idx, max_stays_per_card=1)
            if hasattr(eng, 'game_over'):
                eng.game_over(sc)
            played.append((idx, sc, b, p, n))
            print(f'game {idx} score {sc} busts {b} elapsed {time.time()-t0:.1f}s', flush=True)
    finally:
        if hasattr(eng, 'close'):
            eng.close()
    rows = [json.loads(l) for l in open(TIMELOG) if l.strip()]
    # hook flushes on next new_game and on quit; close() sends quit, so all COUNT should be present
    if len(rows) != COUNT:
        print(f'WARNING: expected {COUNT} timelog rows, got {len(rows)}', flush=True)
    s, cpu, mxdec = summarize(rows)
    s['play_wall_s'] = time.time() - t0
    s['scores'] = [{'game': i, 'score': sc, 'busts': b, 'perfect': p, 'ncards': n} for i, sc, b, p, n in played]
    json.dump(s, open(OUT, 'w'), indent=2)
    c = s['cpu_s']
    m = s['mac_estimate_box_div_1.5_s']
    print('---')
    print(f"n={s['n']} box CPU s: mean {c['mean']:.1f} median {c['median']:.1f} p95 {c['p95']:.1f} max {c['max']:.1f}")
    print(f"longest decision {s['longest_decision_s']:.1f}s; >60s {s['games_over_60s_cpu']}, >90s {s['games_over_90s_cpu']}, >150s {s['games_over_150s_cpu']}")
    print(f"Mac estimate box/1.5 (Node kit only): mean {m['mean']:.1f} median {m['median']:.1f} p95 {m['p95']:.1f} max {m['max']:.1f}; longest decision {m['longest_decision']:.1f}s")
    print('wrote', OUT)

if __name__ == '__main__':
    main()
