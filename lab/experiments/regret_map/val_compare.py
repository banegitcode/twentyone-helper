# Calibration of the sampled reference (A) against exact: decisions at 11-12 cards left evaluated by both.
import json, glob, math, random, collections
random.seed(3)
ex = {}
for f in glob.glob('ex_[0-9].jsonl') + glob.glob('ex12_[0-9].jsonl') + glob.glob('exR_[0-9].jsonl'):
    for l in open(f):
        r = json.loads(l)
        if 'failed' not in r: ex[(r['g'], r['step'])] = r
V = [json.loads(l) for l in open('val_1112.jsonl')]
S = [r for r in V if r.get('n')]
games = {r['g'] for r in V}; ng = len(games)
print('val decisions (flagged, sampled)', len(S), 'games covered', ng, '(last game may be partial)')
pool = [(c['m'], max(c['se'], 1.0)) for r in S for k, c in enumerate(r['cands']) if k != r['champIdx']]
mu = sum(m for m, s in pool) / len(pool); var = sum((m - mu) ** 2 for m, s in pool) / len(pool); noise = sum(s * s for m, s in pool) / len(pool); tau = math.sqrt(max(var - noise, 1))
print('prior mean %.1f tau %.1f noise %.1f' % (mu, tau, math.sqrt(noise)))
def eb(r):
    post = []
    for k, c in enumerate(r['cands']):
        if k == r['champIdx']: continue
        s = max(c['se'], 1.0); prec = 1 / tau ** 2 + 1 / s ** 2; post.append(((mu / tau ** 2 + c['m'] / s ** 2) / prec, math.sqrt(1 / prec)))
    return sum(max(0, max(random.gauss(m, s) for m, s in post)) for _ in range(100)) / 100
for rem in (11, 12):
    rows = [(r, ex.get((r['g'], r['step']))) for r in S if r['rem'] == rem]; rows = [(r, e) for r, e in rows if e]
    allex = [e['regret'] for (g, s), e in ex.items() if e['rem'] == rem and g in games]
    n = len(rows)
    print('rem', rem, 'decisions with both', n, '| exact regret/game over ALL decisions of these games %.1f' % (sum(allex) / ng),
          '| exact regret/game over the sampled-flagged ones %.1f' % (sum(e['regret'] for r, e in rows) / ng),
          '| EB estimate %.1f | split-sample %.1f | naive %.1f' % (sum(eb(r) for r, e in rows) / ng, sum(r['ss'] for r, e in rows) / ng, sum(r['naive'] for r, e in rows) / ng))
    # unflagged-by-window decisions' exact regret (missed by the candidate window / single class)
    flagged = {(r['g'], r['step']) for r, e in rows}
    miss = sum(e['regret'] for (g, s), e in ex.items() if e['rem'] == rem and g in games and (g, s) not in flagged)
    print('   exact regret/game in decisions NOT evaluated by sampling (single class or window) %.1f' % (miss / ng))
    xs = [r['ss'] for r, e in rows]; ys = [e['regret'] for r, e in rows]
