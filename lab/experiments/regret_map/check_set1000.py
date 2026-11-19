#!/usr/bin/env python3
"""Expected exact regret (<=13 cards left, along shipped52's own path) vs the Referee's realized per-game paired diff (exact13 - shipped52), set1000 games."""
import json, glob, csv, math, collections, statistics as st, sys
logf = sys.argv[1]; exg = sys.argv[2]
rows = {int(r['game']): int(r['diff']) for r in csv.DictReader(open('../../bench/results/20261118_140459_cmd_shipped52_vs_cmd_exact13.csv'))}
dA = collections.defaultdict(dict)
for l in open(logf):
    d = json.loads(l)
    if d['t'] == 'dec': dA[d['g']][d['step']] = d
ex = {}
for f in glob.glob(exg):
    for l in open(f):
        r = json.loads(l); k = (r['g'], r['step'])
        if 'failed' in r and k not in ex: ex[k] = r
        elif 'failed' not in r: ex[k] = r
E = {}; miss = []
for g in sorted(dA):
    need = [(g, s) for s, a in dA[g].items() if a['rem'] <= 13]
    if all(k in ex and 'failed' not in ex[k] for k in need): E[g] = sum(ex[k]['regret'] for k in need)
    else: miss.append(g)
H = sorted(E); n = len(H)
e = [E[g] for g in H]; d = [rows[g] for g in H]
se = lambda x: st.stdev(x) / len(x) ** .5
print('games in log %d, complete %d, missing (solver failed/not yet done) %d' % (len(dA), n, len(miss)))
print('mean expected regret %.1f +- %.1f | mean realized diff %.1f +- %.1f | diff-regret %.1f +- %.1f' % (st.mean(e), se(e), st.mean(d), se(d), st.mean(d) - st.mean(e), se([b - a for a, b in zip(e, d)])))
mx, my = st.mean(e), st.mean(d); sxx = sum((x - mx) ** 2 for x in e); sxy = sum((x - mx) * (y - my) for x, y in zip(e, d))
print('slope %.2f corr %.2f' % (sxy / sxx, sxy / math.sqrt(sxx * sum((y - my) ** 2 for y in d))))
zero = [g for g in H if E[g] < .01]
print('zero-regret games: %d, their realized diffs: nonzero count %d' % (len(zero), sum(1 for g in zero if rows[g] != 0)))
order = sorted(H, key=lambda g: E[g])
print('| group | games | expected | realized | SE |')
for name, grp in [('zero regret', zero)] + [('positive quartile %d' % (i + 1), None) for i in range(4)]:
    if grp is None:
        pos = [g for g in order if E[g] >= .01]; i = int(name[-1]) - 1; grp = pos[i * len(pos) // 4:(i + 1) * len(pos) // 4]
    ee = [E[g] for g in grp]; dd = [rows[g] for g in grp]
    print('| %s | %d | %.1f | %.1f | %.1f |' % (name, len(grp), st.mean(ee), st.mean(dd), se(dd) if len(dd) > 1 else 0))
print('missing games realized diff mean %.1f (n=%d)' % (st.mean([rows[g] for g in miss]) if miss else 0, len(miss)))
allg = sorted(dA); print('all games in log, realized diff mean %.1f +- %.1f' % (st.mean([rows[g] for g in allg]), se([rows[g] for g in allg])))
