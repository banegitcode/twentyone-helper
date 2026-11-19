#!/usr/bin/env python3
"""Aggregate exact + sampled regrets into the regret map.  python3 analyze.py [--json out.json]"""
import json, glob, math, collections, sys
NG = 200
log = {}
for l in open('data_dev200_champion_all.jsonl'):
    d = json.loads(l)
    if d['t'] == 'dec': log[(d['g'], d['step'])] = d
ex, sa = [], []
exd = {}
for f in sorted(glob.glob('ex_[0-9].jsonl') + glob.glob('ex12_[0-9].jsonl') + glob.glob('exR_[0-9].jsonl')):
    for l in open(f):
        r = json.loads(l); k = (r['g'], r['step'])
        if k not in exd or 'failed' in exd[k]: exd[k] = r
ex = list(exd.values())
fileGames = {}
for f in sorted(glob.glob('samp_*.jsonl')):
    for l in open(f):
        r = json.loads(l); r['_f'] = f; sa.append(r)

# games whose sampled pass is complete: per worker (game index mod K) every game below the worker's last logged game
lastg = {}
for r in sa: lastg[r['_f']] = max(lastg.get(r['_f'], -1), r['g'])
seen_game = {}; GSs = set(); keep = []
for r in sa:
    if r['g'] >= lastg[r['_f']]: continue          # game still being processed in that file
    if seen_game.setdefault(r['g'], r['_f']) != r['_f']: continue   # already covered by another file
    GSs.add(r['g']); keep.append(r)
sa = keep; GS = sorted(GSs)
def se_games(per_game, games=None):           # per_game: dict g -> value ; mean over the games and SE across games
    games = list(range(NG)) if games is None else games; n = len(games)
    v = [per_game.get(g, 0.0) for g in games]; m = sum(v) / n; sd = math.sqrt(sum((x - m) ** 2 for x in v) / (n - 1)) if n > 1 else 0.0; return m, sd / math.sqrt(n)

def bucket_rem(r):
    for lo, hi, name in [(41, 52, '52-41'), (31, 40, '40-31'), (21, 30, '30-21'), (16, 20, '20-16'), (12, 15, '15-12'), (11, 11, '11'), (10, 10, '10'), (1, 9, '9-1')]:
        if lo <= r <= hi: return name
    return '?'
PH = ['52-41', '40-31', '30-21', '20-16', '15-12', '11', '10', '9-1']

def category(rec):
    c, a = rec['champ'], rec['alt']
    if c['stay'] and not a['stay']: return 'Stay used, best move uses no Stay (over-use)'
    if (not c['stay']) and a['stay']: return 'Stay not used, best move uses a Stay (under-use)'
    if c['stay'] and a['stay']: return 'Stay used, but different Stay/placement is better'
    if c['kind'] == 'bust' and a['kind'] != 'bust': return 'Champion busts on purpose, best move avoids bust'
    if c['kind'] != 'bust' and a['kind'] == 'bust': return 'Champion avoids bust, best move busts a column (sacrifice)'
    if c['kind'] == 'build' and a['kind'].startswith('c'): return 'Champion declines a clear, best move clears'
    if c['kind'].startswith('c') and a['kind'] == 'build': return 'Champion clears, best move builds instead'
    if c['kind'].startswith('c') and a['kind'].startswith('c'): return 'Both clear: different column/clear type'
    if c['kind'] == 'build' and a['kind'] == 'build':
        if c['n'] == 4 or a['n'] == 4: return 'Build: 4-card column (5-card chase) involved'
        if c['intoEmpty'] != a['intoEmpty']: return 'Build: empty column vs stacking on a live column'
        return 'Build: which live column (other)'
    return 'other'

def ccat(rec):
    c = rec['champ']
    if c['stay']: return 'champion uses a Stay'
    if c['kind'] == 'bust': return 'champion busts a column on purpose/forced'
    if c['kind'].startswith('c'): return 'champion takes a clear (21 / 777 / 5-card)'
    if c['intoEmpty']: return 'champion puts the card into an EMPTY column'
    return 'champion stacks on a live column -> %d cards' % c['n']
recs = []   # unified: dict(source, g, step, rem, regret (ss or exact), naive, w, ...)
for r in ex:
    if 'failed' in r: continue
    recs.append(dict(src='exact', g=r['g'], step=r['step'], rem=r['rem'], reg=r['regret'], naive=r['regret'], w=1.0, se=0.0, champ=r['champ'], alt=r['alt'], pf=r['pf'], r=r))
exfail = [r for r in ex if 'failed' in r]
nsingle = nnot = 0; samp_n = []
for r in sa:
    if r.get('single'): nsingle += 1; continue
    if r.get('notSampled'): nnot += 1; continue
    recs.append(dict(src='sampled', g=r['g'], step=r['step'], rem=r['rem'], reg=r['ss'], naive=r['naive'], w=r['w'], se=r['ssSe'], champ=r['champ'], alt=r['alt'], pf=r['pf'], r=r)); samp_n.append(r['n'])
# ---- empirical-Bayes regret for sampled decisions: shrink each alternative's noisy paired difference toward the pool of its phase, then
# regret = E[max(0, max_k d_k)] under the posterior (Monte Carlo).  Needed because max/select-on-noise is biased (naive) and the split-sample number is
# the net gain of a noisy flip rule (can be negative), not a regret.
import random
random.seed(7)
pool = collections.defaultdict(list)
for x in recs:
    if x['src'] != 'sampled': continue
    r = x['r']
    for k, c in enumerate(r['cands']):
        if k != r['champIdx']: pool[bucket_rem(x['rem'])].append((c['m'], max(c['se'], 1.0)))
prior = {}
for b, v in pool.items():
    mu = sum(m for m, s in v) / len(v); var = sum((m - mu) ** 2 for m, s in v) / len(v); noise = sum(s * s for m, s in v) / len(v); prior[b] = (mu, math.sqrt(max(var - noise, 1.0)), math.sqrt(noise))
for x in recs:
    if x['src'] != 'sampled': x['eb'] = x['reg']; continue
    r = x['r']; mu, tau, _ = prior[bucket_rem(x['rem'])]; post = []
    for k, c in enumerate(r['cands']):
        if k == r['champIdx']: continue
        s = max(c['se'], 1.0); prec = 1 / tau ** 2 + 1 / s ** 2; post.append(((mu / tau ** 2 + c['m'] / s ** 2) / prec, math.sqrt(1 / prec)))
    acc = 0.0
    for _ in range(100): acc += max(0.0, max(random.gauss(m, s) for m, s in post))
    x['eb'] = acc / 100; x['ss'] = x['reg']; x['reg'] = x['eb']
out = {}
def tot(sel, key, src='exact'):
    pg = collections.defaultdict(float)
    for x in recs:
        if sel(x): pg[x['g']] += x[key] * x['w']
    return se_games(pg, GS if src == 'sampled' else None)
print('# games (exact)', NG, '| games with completed sampled pass', len(GS), '| exact decisions', sum(1 for x in recs if x['src'] == 'exact'), '(failed solves %d)' % len(exfail), '| sampled decisions', sum(1 for x in recs if x['src'] == 'sampled'),
      '| not-sampled flagged', nnot, '| single-class', nsingle, '| mean rollouts/decision %.1f' % (sum(samp_n) / max(1, len(samp_n))))
m, s = tot(lambda x: x['src'] == 'exact', 'reg'); print('EXACT total regret/game (<=12 cards left): %.1f +- %.1f' % (m, s)); out['exact_total'] = (m, s)
m, s = tot(lambda x: x['src'] == 'sampled', 'reg', 'sampled'); print('SAMPLED empirical-Bayes regret/game (rem>=13): %.1f +- %.1f' % (m, s)); out['samp_ss'] = (m, s)
m, s = tot(lambda x: x['src'] == 'sampled', 'ss', 'sampled'); print('SAMPLED split-sample NET GAIN of flipping to the apparently-better alternative, per game: %.1f +- %.1f (can be negative)' % (m, s)); out['samp_flip'] = (m, s)
print('EB priors by phase (mean diff of alternatives vs champion, sd of true diffs tau, mean per-decision noise SE):', {b: tuple(round(z, 1) for z in v) for b, v in prior.items()})
m, s = tot(lambda x: x['src'] == 'sampled', 'naive', 'sampled'); print('SAMPLED naive-max regret/game (upward biased): %.1f +- %.1f' % (m, s)); out['samp_naive'] = (m, s)
print()
print('## by phase (cards left incl. current)'); print('| cards left | source | decisions evaluated | decisions with regret>0 | regret/game | SE | share of source total |')
for ph in PH:
    for src, key in (('exact', 'reg'), ('sampled', 'reg')):
        sel = lambda x: x['src'] == src and bucket_rem(x['rem']) == ph
        n = sum(1 for x in recs if sel(x)); 
        if not n: continue
        npos = sum(1 for x in recs if sel(x) and x['reg'] > 0.01); m, s = tot(sel, key, src); T = out['exact_total' if src == 'exact' else 'samp_ss'][0]
        print('| %s | %s | %d | %d | %.1f | %.1f | %.0f%% |' % (ph, src, n, npos, m, s, 100 * m / T if T else 0))
for src, key, label, cf in (('exact', 'reg', 'EXACT, by best alternative', category), ('exact', 'reg', 'EXACT, by champion move', ccat), ('sampled', 'reg', 'SAMPLED split-sample, by champion move', ccat)):
    T = out['exact_total' if src == 'exact' else 'samp_ss'][0]
    print('\n## by decision type -', label)
    cats = collections.defaultdict(list)
    for x in recs:
        if x['src'] == src: cats[cf(x)].append(x)
    rows = []
    for c, xs in cats.items():
        pg = collections.defaultdict(float)
        for x in xs: pg[x['g']] += x['reg'] * x['w']
        m, s = se_games(pg, GS if src == 'sampled' else None); rows.append((m, s, c, len(xs), sum(1 for x in xs if x['reg'] > 0.01)))
    rows.sort(reverse=True); print('| category (champion move -> best alternative) | decisions in category | regret/game | SE | share |'); 
    for m, s, c, n, npos in rows: print('| %s | %d | %.1f | %.1f | %.0f%% |' % (c, n, m, s, 100 * m / T if T else 0))
    out['cats_' + src + label] = rows
def marg(name, f, srcs=('exact', 'sampled')):
    for src in srcs:
        T = out['exact_total' if src == 'exact' else 'samp_ss'][0]; g = collections.defaultdict(list)
        for x in recs:
            if x['src'] == src: g[f(x)].append(x)
        print('\n## by %s - %s' % (name, src)); print('| %s | decisions | share of decisions | regret/game | SE | share of total |' % name)
        N = sum(len(v) for v in g.values())
        for k in sorted(g, key=lambda z: str(z)):
            pg = collections.defaultdict(float)
            for x in g[k]: pg[x['g']] += x['reg'] * x['w']
            m, s = se_games(pg, GS if src == 'sampled' else None); print('| %s | %d | %.0f%% | %.1f | %.1f | %.0f%% |' % (k, len(g[k]), 100 * len(g[k]) / N, m, s, 100 * m / T if T else 0))
cap = lambda v, k: min(v, k)
marg('busts so far', lambda x: x['pf']['busts']); marg('Stays left', lambda x: x['pf']['stays']); marg('streak counter', lambda x: cap(x['pf']['prev'], 3))
marg('empty columns', lambda x: cap(x['pf']['nEmpty'], 2)); marg('soft-ace columns', lambda x: cap(x['pf']['nSoft'], 2)); marg('4-card columns', lambda x: cap(x['pf']['n4'], 2))
marg('columns that would bust', lambda x: x['pf']['nBustCols']); marg('card value', lambda x: x['pf']['v'])
if len(sys.argv) > 2 and sys.argv[1] == '--json': json.dump(out, open(sys.argv[2], 'w'), default=str)

# ---------------- examples ----------------
def act_txt(stay, col): return ('Stay col%d + ' % stay if stay is not None and stay >= 0 else '') + 'place col%d' % col
def ex_line(x):
    d = log[(x['g'], x['step'])]; r = x['r']; pf = x['pf']
    ca = act_txt(d['stay'], d['col'])
    if x['src'] == 'exact': ba = act_txt(*r['bestAct']); reg = 'exact regret %.0f' % x['reg']
    else: c = r['cands'][r['best']]; ba = act_txt(c['stay'], c['col']); reg = 'sampled: best-alt advantage %.0f +- %.0f (n=%d; split-sample %.0f +- %.0f)' % (r['naive'], r['naiveSe'], r['n'], r['ss'], r['ssSe'])
    return '- dev200 game %d, move %d, %d cards left | busts %d, Stays %d, streak %d | columns [%s] (n cards / h=hard, s=soft total) | card **%d** | champion: %s | better: %s | %s' % (x['g'], x['step'], x['rem'], pf['busts'], pf['stays'], pf['prev'], pf['cols'], pf['v'], ca, ba, reg)
if '--examples' in sys.argv:
    for src in ('exact', 'sampled'):
        cats = collections.defaultdict(list)
        for x in recs:
            if x['src'] == src and x['reg'] > 0.01: cats[category(x)].append(x)
        ranked = sorted(cats.items(), key=lambda kv: -sum(x['reg'] * x['w'] for x in kv[1]))[:4]
        for c, xs in ranked:
            print('\n### examples (%s): %s' % (src, c))
            xs.sort(key=lambda x: -(x['reg'] if src == 'exact' else x['r']['naive']))
            for x in xs[:4]: print(ex_line(x))
