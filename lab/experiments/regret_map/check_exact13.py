#!/usr/bin/env python3
"""Expected regret (sum of exact regrets at <=13 cards left, along the shipped52 path) vs the realized paired diff exact13 - shipped52, same 200 dev200 games."""
import json, glob, math, collections, statistics as st
def load(files):
    dec = collections.defaultdict(dict); end = {}
    for f in files:
        for l in open(f):
            d = json.loads(l)
            if d['t'] == 'dec': dec[d['g']][d['step']] = d
            else: end[d['g']] = d
    return dec, end
dA, eA = load(['data_dev200_champion_all.jsonl'])
dB, eB = load(glob.glob('data_dev200_exact13_*.jsonl'))
G = sorted(g for g in eB if g in eA)
print('games with both runs:', len(G))
diff = {g: eB[g]['score'] - eA[g]['score'] for g in G}
v = list(diff.values()); print('realized paired diff exact13 - shipped52 on dev200: mean %.1f  SE %.1f  (sd %.0f, n=%d); games with nonzero diff: %d' % (st.mean(v), st.stdev(v) / len(v) ** .5, st.stdev(v), len(v), sum(1 for x in v if x != 0)))
# determinism: identical decisions while rem > 13
mism = 0; first_diff_rem = []
for g in G:
    for s, a in dA[g].items():
        b = dB[g].get(s)
        if b is None: continue
        if a['rem'] > 13 and (a['stay'], a['col']) != (b['stay'], b['col']): mism += 1
print('decisions with rem>13 that differ between the two runs (should be 0):', mism)
# fallbacks in exact13 at <=13 cards
fb = collections.Counter(); tot = collections.Counter()
for g in G:
    for s, b in dB[g].items():
        if b['rem'] <= 13: tot[b['rem']] += 1; fb[b['rem']] += (not b['exact'])
print('exact13 run: decisions at <=13 cards where the exact solver did NOT answer (give-up/overflow):', {r: '%d/%d' % (fb[r], tot[r]) for r in sorted(tot, reverse=True) if fb[r]} or 'none', '| total decisions', sum(tot.values()))
# expected regret per game
ex = {}
for f in glob.glob('ex_[0-9].jsonl') + glob.glob('ex12_[0-9].jsonl') + glob.glob('exR_[0-9].jsonl') + glob.glob('ex13all_[0-9].jsonl') + glob.glob('ex16_[0-9].jsonl') + glob.glob('ex13_[0-9].jsonl'):
    for l in open(f):
        r = json.loads(l); k = (r['g'], r['step'])
        if 'failed' in r: ex.setdefault(k, r); continue
        if k not in ex or 'failed' in ex[k]: ex[k] = r
# games where every <=13 decision of the champion has an exact regret
E = {}; miss = []
for g in G:
    need = [(g, s) for s, a in dA[g].items() if a['rem'] <= 13]
    if all(k in ex and 'failed' not in ex[k] for k in need): E[g] = sum(ex[k]['regret'] for k in need)
    else: miss.append(g)
H = [g for g in G if g in E]
print('games with complete exact regret at <=13 cards:', len(H), '(missing %d)' % len(miss))
e = [E[g] for g in H]; d = [diff[g] for g in H]
print('mean expected regret (<=13) %.1f +- %.1f | mean realized diff %.1f +- %.1f | mean (diff - regret) %.1f +- %.1f' % (st.mean(e), st.stdev(e) / len(e) ** .5, st.mean(d), st.stdev(d) / len(d) ** .5, st.mean([b - a for a, b in zip(e, d)]), st.stdev([b - a for a, b in zip(e, d)]) / len(e) ** .5))
mx = st.mean(e); my = st.mean(d); sxx = sum((x - mx) ** 2 for x in e); sxy = sum((x - mx) * (y - my) for x, y in zip(e, d))
print('per-game regression of realized diff on expected regret: slope %.2f (expect 1 if regrets are exact expectations)' % (sxy / sxx), 'corr %.2f' % (sxy / math.sqrt(sxx * sum((y - my) ** 2 for y in d))))
# grouped
order = sorted(H, key=lambda g: E[g]); q = 4
print('\n| group (by expected regret) | games | mean expected regret | mean realized diff | SE of diff |')
for i in range(q):
    grp = order[i * len(order) // q:(i + 1) * len(order) // q]
    ee = [E[g] for g in grp]; dd = [diff[g] for g in grp]
    print('| Q%d | %d | %.1f | %.1f | %.1f |' % (i + 1, len(grp), st.mean(ee), st.mean(dd), st.stdev(dd) / len(dd) ** .5))
zero = [g for g in H if E[g] < 0.01]; nz = [g for g in H if E[g] >= 0.01]
print('games with zero expected regret: %d (mean realized diff %.1f); with positive: %d (expected %.1f, realized %.1f)' % (len(zero), st.mean([diff[g] for g in zero]) if zero else float('nan'), len(nz), st.mean([E[g] for g in nz]), st.mean([diff[g] for g in nz])))
# breakdown of expected regret by rem (those games)
by = collections.defaultdict(float)
for g in H:
    for s, a in dA[g].items():
        if a['rem'] <= 13: by[a['rem']] += ex[(g, s)]['regret']
print('expected regret per game by cards left:', {r: round(by[r] / len(H), 1) for r in sorted(by, reverse=True) if by[r] > 0})
print('\nmissing games (exact solve failed at some <=13 decision):', [(g, diff[g]) for g in miss])
