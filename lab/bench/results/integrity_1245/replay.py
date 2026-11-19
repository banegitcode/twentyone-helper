#!/usr/bin/env python3
"""Replay official deeper:15 / deeper:16 games from the frozen snapshot.
Compares score, busts, perfect, ncards against the official cache.
For deeper:16, also tallies exact-solve give-ups by engine rem (16..1).
Each job plays a prefix of an official chunk in one engine process, matching
the official table-carry behavior (hybrid.reset does not clear the exact table).
"""
import argparse, csv, json, os, sys, time, collections, multiprocessing as mp

BENCH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, BENCH)
import harness as H
import refsim

FROZEN = os.path.join(BENCH, 'frozen', 'exact-endgame-deeper@90c2d73f938b')
ADAPTER = os.path.join(os.path.dirname(__file__), 'trace_adapter.js')
OUT = os.path.dirname(__file__)

# Official chunk bounds for set1000, workers=3 (nchunks=12).
CHUNKS = [(i * 1000 // 12, (i + 1) * 1000 // 12) for i in range(12)]

def cache_rows(config):
    spec = f"cmd:node ../experiments/exact-endgame-deeper/adapter.js --config {config}"
    cp, _ = H._cache_path(spec, 'set1000', 1, 1, None)
    c = json.load(open(cp))
    return {int(r[0]): tuple(r) for r in c['rows']}, c

def play_range(args):
    config, start, count, trace_path = args
    decks = H.load_set('set1000')
    os.makedirs(os.path.dirname(trace_path), exist_ok=True)
    if os.path.exists(trace_path):
        os.remove(trace_path)
    cmd = (f"cmd:node {ADAPTER} --config {config} --trace {trace_path}")
    # Force the wrapper to the explicit sha path, not the symlink.
    env_prefix = f"cmd:env FROZEN_ROOT={FROZEN} "
    # harness CmdEngine doesn't support env in a nice way unless we bake it in
    spec = f"cmd:env FROZEN_ROOT={FROZEN} node {ADAPTER} --config {config} --trace {trace_path}"
    eng = H.make_engine(spec)
    rows = []
    t0 = time.time()
    try:
        for k in range(count):
            idx = start + k
            deck = decks[idx]
            sc, b, p, n = refsim.play(deck, eng, seed=1 * 1000003 + idx, max_stays_per_card=1)
            if hasattr(eng, 'game_over'):
                eng.game_over(sc)
            rows.append((idx, sc, b, p, n))
    finally:
        if hasattr(eng, 'close'):
            eng.close()
    return {'config': config, 'start': start, 'count': count, 'trace': trace_path,
            'rows': rows, 'wall': time.time() - t0}

def load_trace(path):
    decisions, games = [], []
    if not os.path.exists(path):
        return decisions, games
    for line in open(path):
        if not line.strip():
            continue
        o = json.loads(line)
        if o.get('type') == 'decision':
            decisions.append(o)
        elif o.get('type') == 'game':
            games.append(o)
    return decisions, games

def summarize_giveups(decisions, xk=16):
    """By engine rem (including current card), 16 down to 1."""
    buckets = {}
    for rem in range(xk, 0, -1):
        buckets[rem] = {'rem': rem, 'decisions': 0, 'attempted': 0, 'exact': 0, 'giveup': 0, 'no_attempt': 0}
    for d in decisions:
        rem = d['rem']
        if rem < 1 or rem > xk:
            # still count if in range of interest only; skip rem>xk for the 16..1 table
            continue
        b = buckets[rem]
        b['decisions'] += 1
        if d.get('exact'):
            b['attempted'] += 1
            b['exact'] += 1
        elif d.get('giveup'):
            b['attempted'] += 1
            b['giveup'] += 1
        else:
            b['no_attempt'] += 1
    rows = []
    for rem in range(xk, 0, -1):
        b = buckets[rem]
        b['giveup_rate_of_attempts'] = (b['giveup'] / b['attempted']) if b['attempted'] else None
        b['giveup_rate_of_decisions'] = (b['giveup'] / b['decisions']) if b['decisions'] else None
        rows.append(b)
    tot_d = sum(b['decisions'] for b in rows)
    tot_a = sum(b['attempted'] for b in rows)
    tot_g = sum(b['giveup'] for b in rows)
    tot_e = sum(b['exact'] for b in rows)
    # highlight 9-13 as Theorist asked
    band = [buckets[r] for r in range(9, 14)]
    return {
        'buckets': rows,
        'totals': {
            'decisions_rem_1_to_16': tot_d,
            'attempts': tot_a,
            'exact': tot_e,
            'giveup': tot_g,
            'giveup_rate_of_attempts': (tot_g / tot_a) if tot_a else None,
            'giveup_rate_of_decisions': (tot_g / tot_d) if tot_d else None,
        },
        'band_9_to_13': {
            'decisions': sum(b['decisions'] for b in band),
            'attempts': sum(b['attempted'] for b in band),
            'exact': sum(b['exact'] for b in band),
            'giveup': sum(b['giveup'] for b in band),
            'giveup_rate_of_attempts': (sum(b['giveup'] for b in band) / sum(b['attempted'] for b in band))
                if sum(b['attempted'] for b in band) else None,
        },
    }

def main():
    # Integrity samples: prefixes of official chunks so table-carry matches the bench.
    # deeper:16 pre-12:45 = waves 1-3, games 0-749; post = wave 4, games 750-999.
    # deeper:15 pre-12:45 = waves 1-2, games 0-499; post = waves 3-4, games 500-999.
    jobs = [
        # 10 pre + 30 post = 40 deeper:16 games (give-up tally + integrity)
        ('deeper:16', 0, 10, os.path.join(OUT, 'traces', 'd16_pre_0_9.jsonl')),
        ('deeper:16', 750, 30, os.path.join(OUT, 'traces', 'd16_post_750_779.jsonl')),
        # 10 pre + 20 post for deeper:15 integrity
        ('deeper:15', 0, 10, os.path.join(OUT, 'traces', 'd15_pre_0_9.jsonl')),
        ('deeper:15', 500, 20, os.path.join(OUT, 'traces', 'd15_post_500_519.jsonl')),
    ]
    t0 = time.time()
    with mp.Pool(2) as pool:
        out = pool.map(play_range, jobs, chunksize=1)
    official = {cfg: cache_rows(cfg)[0] for cfg in ('deeper:15', 'deeper:16')}
    comparisons = []
    traces_by_cfg = collections.defaultdict(list)
    for rec in out:
        cfg = rec['config']
        for idx, sc, b, p, n in rec['rows']:
            off = official[cfg][idx]
            # cache row: idx, score, busts, perfect, ncards
            ok = (sc == off[1] and b == off[2] and p == off[3] and n == off[4])
            wave = 'pre-12:45' if (cfg == 'deeper:16' and idx < 750) or (cfg == 'deeper:15' and idx < 500) else 'post-12:45'
            comparisons.append({
                'config': cfg, 'game': idx, 'wave': wave, 'match': ok,
                'replay': {'score': sc, 'busts': b, 'perfect': p, 'ncards': n},
                'official': {'score': off[1], 'busts': off[2], 'perfect': off[3], 'ncards': off[4]},
            })
        dec, _ = load_trace(rec['trace'])
        traces_by_cfg[cfg].extend(dec)
        rec['rows'] = [list(r) for r in rec['rows']]
    # summary
    def wave_stats(cfg, wave):
        xs = [c for c in comparisons if c['config'] == cfg and c['wave'] == wave]
        return {'n': len(xs), 'matched': sum(c['match'] for c in xs),
                'mismatched': [c['game'] for c in xs if not c['match']]}
    report = {
        'frozen': FROZEN,
        'shortsha': '90c2d73f938b',
        'note': 'Logs had no move sequences; compared score, busts, perfect, ncards. Games replayed as official chunk prefixes (fresh process at chunk start) so exact-table carry matches the bench.',
        'wall_s': time.time() - t0,
        'deeper:16': {
            'pre-12:45': wave_stats('deeper:16', 'pre-12:45'),
            'post-12:45': wave_stats('deeper:16', 'post-12:45'),
            'giveups_by_rem': summarize_giveups(traces_by_cfg['deeper:16'], 16),
            'n_traced_decisions': len(traces_by_cfg['deeper:16']),
        },
        'deeper:15': {
            'pre-12:45': wave_stats('deeper:15', 'pre-12:45'),
            'post-12:45': wave_stats('deeper:15', 'post-12:45'),
            'n_traced_decisions': len(traces_by_cfg['deeper:15']),
        },
        'jobs': out,
        'comparisons': comparisons,
    }
    path = os.path.join(OUT, 'replay_report.json')
    json.dump(report, open(path, 'w'), indent=2)
    # also a short text table for give-ups
    g = report['deeper:16']['giveups_by_rem']
    lines = ['rem  decisions  attempted  exact  giveup  giveup/attempts  giveup/decisions']
    for b in g['buckets']:
        ra = '   n/a' if b['giveup_rate_of_attempts'] is None else f"{100*b['giveup_rate_of_attempts']:6.1f}%"
        rd = '   n/a' if b['giveup_rate_of_decisions'] is None else f"{100*b['giveup_rate_of_decisions']:6.1f}%"
        lines.append(f"{b['rem']:3d}  {b['decisions']:9d}  {b['attempted']:9d}  {b['exact']:5d}  {b['giveup']:6d}  {ra}  {rd}")
    t = g['totals']
    lines.append(f"tot  {t['decisions_rem_1_to_16']:9d}  {t['attempts']:9d}  {t['exact']:5d}  {t['giveup']:6d}  "
                 f"{(100*t['giveup_rate_of_attempts'] if t['giveup_rate_of_attempts'] is not None else -1):6.1f}%  "
                 f"{(100*t['giveup_rate_of_decisions'] if t['giveup_rate_of_decisions'] is not None else -1):6.1f}%")
    band = g['band_9_to_13']
    lines.append(f"9-13 decisions={band['decisions']} attempts={band['attempts']} exact={band['exact']} "
                 f"giveup={band['giveup']} rate_of_attempts="
                 f"{(100*band['giveup_rate_of_attempts'] if band['giveup_rate_of_attempts'] is not None else float('nan')):.1f}%")
    open(os.path.join(OUT, 'deeper16_giveups.txt'), 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    for cfg in ('deeper:16', 'deeper:15'):
        for wave in ('pre-12:45', 'post-12:45'):
            s = report[cfg][wave]
            print(f"{cfg} {wave}: {s['matched']}/{s['n']} match, mismatches={s['mismatched']}")
    print('wrote', path, 'wall', round(report['wall_s'], 1), 's')

if __name__ == '__main__':
    main()
