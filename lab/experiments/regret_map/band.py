#!/usr/bin/env python3
"""Exact regret in the 14-16 cards-left band (and 13 as a sanity row), from ex16_*.jsonl (exact2, one Stay per card)."""
import json, glob, math, collections
rows = {}
for f in glob.glob('ex16_[0-9].jsonl'):
    for l in open(f):
        r = json.loads(l)
        if 'failed' in r: print('failed', r); continue
        rows[(r['g'], r['step'])] = r
by = collections.defaultdict(dict)
for (g, s), r in rows.items(): by[g][r['rem']] = r
need = collections.defaultdict(set)
for l in open('data_dev200_champion_all.jsonl'):
    d = json.loads(l)
    if d['t'] == 'dec' and 13 <= d['rem'] <= 16 and d['g'] % 3 == 0: need[d['g']].add(d['rem'])
allg = [g for g in range(200) if g % 3 == 0]
games = [g for g in allg if all(k in by.get(g, {}) for k in need.get(g, set()))]   # processed (games with no band decision count as 0)
print('games in the g%3==0 subsample with no decision in the band (game ended earlier):', sum(1 for g in allg if not need.get(g)))
def stat(rems):
    v = [sum(by[g][k]['regret'] for k in rems if k in by.get(g, {})) for g in games]
    n = len(v); 
    if n < 2: return n, float('nan'), float('nan'), 0
    m = sum(v) / n; se = math.sqrt(sum((x - m) ** 2 for x in v) / (n - 1) / n); return n, m, se, sum(1 for x in v if x > 0.01)
print('games processed:', len(games), 'of', len(allg))
for name, rems in (('rem 16', [16]), ('rem 15', [15]), ('rem 14', [14]), ('BAND 14-16', [14, 15, 16]), ('rem 13 (sanity: shipped52 claimed exact)', [13])):
    n, m, se, npos = stat(rems); print('%s: n=%d games, regret/game = %.1f +- %.1f, games with regret>0.01: %d' % (name, n, m, se, npos))
vals = [r['regret'] for r in rows.values() if r['rem'] in (14, 15, 16)]
print('decisions in band', len(vals), 'with regret>0.01:', sum(1 for x in vals if x > 0.01), 'mean regret when >0.01: %.0f' % (sum(x for x in vals if x > 0.01) / max(1, sum(1 for x in vals if x > 0.01))))
