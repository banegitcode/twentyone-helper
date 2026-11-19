#!/usr/bin/env python3
"""Exact-region extras: how often the champion's own exact solve fires, regret when it does not, and the champion's value error vs exact."""
import json, glob, math, collections
log = {}
for l in open('data_dev200_champion_all.jsonl'):
    d = json.loads(l)
    if d['t'] == 'dec': log[(d['g'], d['step'])] = d
ex = {}; allr = {}
for f in glob.glob('ex_[0-9].jsonl') + glob.glob('ex12_[0-9].jsonl') + glob.glob('exR_[0-9].jsonl'):
    for l in open(f):
        r = json.loads(l); k = (r['g'], r['step'])
        if k not in allr or 'failed' in allr[k]: allr[k] = r
ex = {k: r for k, r in allr.items() if 'failed' not in r}
fails = sum(1 for r in allr.values() if 'failed' in r)
by = collections.defaultdict(list)
for k, d in log.items(): by[d['rem']].append(d)
print('failed exact solves (table full, skipped):', fails)
print('| cards left | champion decisions | champion used its exact solver | exact regret/game | decisions with regret>0.01 | mean regret when >0.01 | mean regret in non-exact decisions | champion value - exact value of its move (non-exact) |')
for rem in range(13, 0, -1):
    ds = by.get(rem, []); n = len(ds)
    if not n: continue
    nex = sum(1 for d in ds if d['exact'])
    rs = [(d, ex[(d['g'], d['step'])]) for d in ds if (d['g'], d['step']) in ex]
    if not rs: print('| %d | %d | %d (%.0f%%) | not solved | | | | |' % (rem, n, nex, 100 * nex / n)); continue
    tot = sum(r['regret'] for d, r in rs) / 200.0; pos = [r['regret'] for d, r in rs if r['regret'] > 0.01]
    ne = [(d, r) for d, r in rs if not d['exact']]
    mean_ne = sum(r['regret'] for d, r in ne) / len(ne) if ne else float('nan')
    bias = [d['mval'] - (r['best'] - r['regret']) for d, r in ne]
    if len(bias) > 1:
        m = sum(bias) / len(bias); se = math.sqrt(sum((x - m) ** 2 for x in bias) / (len(bias) - 1) / len(bias)); bs = '%.0f +- %.0f (n=%d)' % (m, se, len(bias))
    else: bs = ''
    print('| %d | %d | %d (%.0f%%) | %.2f | %d | %.0f | %.0f | %s |' % (rem, n, nex, 100 * nex / n, tot, len(pos), (sum(pos) / len(pos)) if pos else 0, mean_ne, bs))
