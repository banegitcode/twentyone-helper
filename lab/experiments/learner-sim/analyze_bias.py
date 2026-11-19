#!/usr/bin/env python3
"""Bias-by-phase tables from bias_diag.js output.  python3 analyze_bias.py results/bias_*.json [--md out.md]
bias = realized return-to-go - network prediction (positive = network UNDERestimates).  SE = sd/sqrt(n) per bin
(one position per game per bin => independent across games); band rows use per-game band means (cluster-correct)."""
import json, sys, numpy as np
def load(fn):
    if fn.endswith('.jsonl'):   # bench-protocol logs (bias_adapter.js): one file per process; fn may be a prefix glob
        import glob; g = []
        for f in sorted(glob.glob(fn.replace('.jsonl', '*.jsonl'))) if '*' not in fn else sorted(glob.glob(fn)):
            g += [json.loads(l) for l in open(f) if l.strip()]
        g.sort(key=lambda x: x['seed']); d = {'games': g, 'policy': fn, 'seedStart': 0, 'count': len(g)}
    else: d = json.load(open(fn)); g = d['games']
    N = len(g)
    P = np.full((N, 52), np.nan); G = P.copy(); Q = P.copy(); GB = P.copy(); EX = P.copy(); BU = P.copy(); ST = P.copy(); K = P.copy()
    for i, x in enumerate(g):
        n = x['n']
        for arr, key in ((P, 'p'), (G, 'G'), (Q, 'q'), (GB, 'Gb'), (EX, 'ex'), (BU, 'b'), (ST, 's'), (K, 'k')):
            v = np.array([np.nan if t is None else t for t in x[key]], float); arr[i, :n] = v
    fin = np.array([x['final'] for x in g], float)
    return d, P, G, Q, GB, EX, BU, ST, K, fin
def se(a): a = a[~np.isnan(a)]; return a.std(ddof=1) / np.sqrt(len(a)) if len(a) > 1 else float('nan')
def band(E, lo, hi):  # bins lo..hi inclusive (cards dealt, 1-based); per-game mean over available bins
    s = E[:, lo - 1:hi]; m = np.nanmean(np.where(np.isnan(s), np.nan, s), axis=1)
    m = m[~np.isnan(m)]; return m.mean(), m.std(ddof=1) / np.sqrt(len(m)), len(m)
def main():
    fns = [a for a in sys.argv[1:] if a.endswith('.json') or a.endswith('.jsonl') or '*' in a]; md = []
    for fn in fns:
        d, P, G, Q, GB, EX, BU, ST, K, fin = load(fn)
        N = len(fin); out = []
        out.append(f"### {fn}\npolicy `{d['policy']}` bench shuffle indices {min(x['seed'] for x in d['games'])}..{max(x['seed'] for x in d['games'])} (bench sim via harness), games {N}; "
                   f"champion mean score {fin.mean():.0f} ± {fin.std(ddof=1)/np.sqrt(N):.0f} (SE); 3-bust games {np.mean([x['busts']>=3 for x in d['games']])*100:.1f}%\n")
        B = G - P; BQ = GB - Q
        out.append("Network bias (realized points-to-come after the placement − network value of that position), by cards dealt:\n")
        out.append("| bins (cards dealt) | n games | mean predicted | mean realized | bias (realized−pred) | SE | search-value bias (realized from before move − q) | SE |\n|---|---|---|---|---|---|---|---|")
        for lo, hi in [(1, 5), (6, 13), (14, 26), (1, 26), (27, 39), (40, 52), (1, 52)]:
            b = band(B, lo, hi); bq = band(BQ, lo, hi); mp = band(P, lo, hi)[0]; mg = band(G, lo, hi)[0]
            out.append(f"| {lo}-{hi} | {b[2]} | {mp:.0f} | {mg:.0f} | **{b[0]:+.0f}** | {b[1]:.0f} | {bq[0]:+.0f} | {bq[1]:.0f} |")
        out.append("\nPer-bin curve (every 3rd bin; full curve in the .csv):\n\n| cards dealt | n | mean pred | mean realized | bias | SE |\n|---|---|---|---|---|---|")
        rows = []
        for t in range(1, 53):
            col = B[:, t - 1]; n = int((~np.isnan(col)).sum())
            if n < 2: continue
            rows.append((t, n, np.nanmean(P[:, t - 1]), np.nanmean(G[:, t - 1]), np.nanmean(col), se(col), np.nanmean(BQ[:, t - 1]), se(BQ[:, t - 1])))
            if t % 3 == 1 or t in (26, 27, 39, 40): out.append(f"| {t} | {n} | {rows[-1][2]:.0f} | {rows[-1][3]:.0f} | {rows[-1][4]:+.0f} | {rows[-1][5]:.0f} |")
        open(fn.replace('*','').replace('.jsonl','').replace('.json','') + '_curve.csv', 'w').write('cards_dealt,n,mean_pred,mean_realized,bias,se,qbias,qse\n' + '\n'.join(','.join(f'{v:.3f}' for v in r) for r in rows) + '\n')
        # subgroup: early half bias by busts so far / stays left / streak
        out.append("\nFirst half (1-26 cards dealt) bias by state (per-position pooled mean, SE ignores within-game correlation, so is a lower bound):\n\n| group | n positions | bias | SE(naive) |\n|---|---|---|---|")
        sl = slice(0, 26)
        for name, arr, vals in (('busts', BU, [0, 1, 2]), ('stays left', ST, [2, 1, 0]), ('streak', K, [0, 1, 2, 3])):
            for v in vals:
                m = (arr[:, sl] == v) & ~np.isnan(B[:, sl]); x = B[:, sl][m]
                if len(x) > 30: out.append(f"| {name}={v} | {len(x)} | {x.mean():+.0f} | {x.std(ddof=1)/np.sqrt(len(x)):.0f} |")
        # exact moves: how many positions came from exact solver moves
        out.append(f"\nShare of moves made by the exact endgame solver: {np.nansum(EX)/np.sum(~np.isnan(EX))*100:.1f}% of all moves (these are in the last ≤13 cards).\n")
        md.append('\n'.join(out))
    txt = '\n\n'.join(md); print(txt)
    if '--md' in sys.argv: open(sys.argv[sys.argv.index('--md') + 1], 'w').write(txt + '\n')
main()
