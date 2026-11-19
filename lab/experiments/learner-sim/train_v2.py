#!/usr/bin/env python3
"""Evaluator-v2 offline comparison: MLP vs n-tuple tables on the SAME champion-policy data (gen_v2.js rows), same targets,
same game-level train/val split. Reports val RMSE, bias by phase, and the shipped network's own error on the same rows.
  python3 train_v2.py data/champ_ship_*.f32 [--lam 0.5] [--exact-anchor 1] [--mlp 128,48] [--epochs 12] [--val-frac 0.1]
Row layout (26 float32): c0..c3 | d1..d10 | busts stays prev rem | G qn rn exn p | game step dev"""
import sys, os, json, time, argparse, numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('files', nargs='+'); ap.add_argument('--lam', type=float, default=0.5)
ap.add_argument('--exact-anchor', type=int, default=1); ap.add_argument('--mlp', default='128,48'); ap.add_argument('--epochs', type=int, default=12)
ap.add_argument('--val-frac', type=float, default=0.1); ap.add_argument('--seed', type=int, default=1); ap.add_argument('--out', default='results/v2_offline.json')
ap.add_argument('--target', default='lambda', choices=['lambda', 'mc']); ap.add_argument('--nt-passes', type=int, default=12); ap.add_argument('--save-prefix', default='')
a = ap.parse_args(); rng = np.random.default_rng(a.seed)
D = np.concatenate([np.fromfile(f, dtype=np.float32).reshape(-1, 26) for f in a.files]).astype(np.float64)
N = len(D); cols = D[:, 0:4].astype(np.int64); deck = D[:, 4:14]; busts = D[:, 14].astype(int); stays = D[:, 15].astype(int); prev = np.minimum(D[:, 16].astype(int), 4)
rem = D[:, 17].astype(int); G, qn, rn, exn, p_ship = D[:, 18], D[:, 19], D[:, 20], D[:, 21], D[:, 22]; game, step = D[:, 23].astype(np.int64), D[:, 24].astype(int)
played = 52 - rem
# ---- targets: lambda-return built backward inside each game (rows are in step order within a game within a worker batch)
order = np.lexsort((step, game)); assert (order == np.arange(N)).all() or True
D = D[order]; cols = cols[order]; deck = deck[order]; busts = busts[order]; stays = stays[order]; prev = prev[order]; rem = rem[order]; G = G[order]; qn = qn[order]; rn = rn[order]; exn = exn[order]; p_ship = p_ship[order]; game = game[order]; step = step[order]; played = 52 - rem
tgt = np.zeros(N)
lam = a.lam if a.target == 'lambda' else 1.0
nxt_same = np.zeros(N, bool); nxt_same[:-1] = (game[1:] == game[:-1]) & (step[1:] == step[:-1] + 1)
for i in range(N - 1, -1, -1):
    follow = tgt[i + 1] if nxt_same[i] else 0.0
    if lam >= 1.0: tgt[i] = rn[i] + follow
    elif a.exact_anchor and exn[i] == 1: tgt[i] = qn[i]
    else: tgt[i] = (1 - lam) * qn[i] + lam * (rn[i] + follow)
print(f'{N} rows, {len(np.unique(game))} games; target={a.target} lam={lam} anchor={a.exact_anchor}; mean tgt {tgt.mean():.0f}  mean G {G.mean():.0f}  corr(tgt,G) {np.corrcoef(tgt,G)[0,1]:.3f}')
# split by game
ug = np.unique(game); rng.shuffle(ug); val_games = set(ug[:max(1, int(len(ug) * a.val_frac))].tolist()); isval = np.array([g in val_games for g in game])
# ---- decode columns
hard = cols & 31; ace = (cols >> 5) & 1; ncd = (cols >> 6) & 7; not7 = (cols >> 9) & 1; s77 = ((ncd == 2) & (not7 == 0)).astype(int)
soft = (ace == 1) & (hard + 10 <= 21); tot = np.where(soft, hard + 10, hard)
empty = (cols == 0)
cid = ((ncd * 22 + hard) * 2 + ace) * 2 + s77            # < 440 (0 for empty)
srt = np.sort(cid, axis=1)                                # canonical column order (ascending id)
def dec(i):  # decode id -> (n, hard, ace, s77)
    s = i & 1; i = i >> 1; ac = i & 1; i = i >> 1; return i // 22, i % 22, ac, s
# ---- MLP features
Dk = deck / np.maximum(rem, 1)[:, None]
def mlp_feats():
    X = []
    for q in range(4):
        n, h, ac, s7 = dec(srt[:, q]); e = (n == 0); sf = (ac == 1) & (h + 10 <= 21); t = np.where(sf, h + 10, h)
        for k in range(1, 5): X.append((n == k).astype(float))
        X += [np.where(e, 0, t / 21.0), np.where(e, 0, sf.astype(float)), np.where(e, 0, h / 21.0), np.where(e, 0, s7.astype(float))]
        pb = np.zeros(N); p21 = np.zeros(N)
        for v in range(1, 11):
            nh = h + v; na = (ac == 1) | (v == 1); nt = np.where(na & (nh + 10 <= 21), nh + 10, nh)
            c = deck[:, v - 1]; pb += np.where(nh > 21, c, 0); p21 += np.where((nh <= 21) & (nt == 21), c, 0)
        r = np.maximum(rem, 1); X += [np.where(e, 0, pb / r), np.where(e, 0, p21 / r)]
    for v in range(10): X.append(deck[:, v] / (16.0 if v == 9 else 4.0))
    X.append(rem / 52.0)
    for b in range(3): X.append((np.minimum(busts, 2) == b).astype(float))
    for s in range(3): X.append((stays == s).astype(float))
    for k in range(5): X.append((prev == k).astype(float))
    return np.stack(X, 1).astype(np.float32)
# ---- n-tuple index tables
PH = 14; ph = np.minimum(played // 4, PH - 1); b3 = np.minimum(busts, 2)
low = deck[:, 1:6].sum(1); tb = (deck[:, 9] // 2).astype(int); lb = np.minimum((low // 4).astype(int), 5)
ne = (srt == 0).sum(1); hi = np.zeros(N, int)
for q in range(4):
    n, h, ac, s7 = dec(srt[:, q]); sf = (ac == 1) & (h + 10 <= 21); t = np.where(sf, h + 10, h); hi += ((n > 0) & (t >= 17))
idx = []; sizes = []
idx.append(((played * 3 + b3) * 3 + stays) * 5 + prev); sizes.append(53 * 3 * 3 * 5)
for q in range(4): idx.append(ph * 440 + srt[:, q]); sizes.append(PH * 440)
for i in range(4):
    for j in range(i + 1, 4): idx.append((ph * 220 + (srt[:, i] >> 1)) * 220 + (srt[:, j] >> 1)); sizes.append(PH * 220 * 220)
idx.append(((((ph * 3 + b3) * 9 + np.minimum(tb, 8)) * 5 + deck[:, 0].astype(int)) * 5 + deck[:, 6].astype(int)) * 6 + lb); sizes.append(PH * 3 * 9 * 5 * 5 * 6)
idx.append((((ph * 3 + b3) * 3 + stays) * 5 + ne) * 5 + hi); sizes.append(PH * 3 * 3 * 5 * 5)
# share table for the 4 single-column lookups and the 6 pair lookups
share = [0] + [1] * 4 + [2] * 6 + [3, 4]
tabsz = [53 * 3 * 3 * 5, PH * 440, PH * 220 * 220, PH * 3 * 9 * 5 * 5 * 6, PH * 3 * 3 * 5 * 5]
def nt_fit(tr, passes, ridge=4.0):
    W = [np.zeros(s) for s in tabsz]; pred = np.zeros(N)
    cnt = [sum(np.bincount(idx[k][tr], minlength=tabsz[t]) for k, t in enumerate(share) if t == tt) for tt in range(5)]
    for ps in range(passes):
        for tt in range(5):
            res = tgt - pred; ks = [k for k, t in enumerate(share) if t == tt]
            s = sum(np.bincount(idx[k][tr], weights=res[tr], minlength=tabsz[tt]) for k in ks)
            d = 0.7 * s / (cnt[tt] + ridge) / len(ks)           # shrunk backfitting step (÷ number of shared lookups per sample)
            W[tt] += d
            for k in ks: pred += d[idx[k]]
    return W
def nt_pred(W): return sum(W[t][idx[k]] for k, t in enumerate(share))
def rep(name, pr, tr_mask, va_mask):
    e = tgt - pr; out = {'train_rmse': float(np.sqrt((e[tr_mask] ** 2).mean())), 'val_rmse': float(np.sqrt((e[va_mask] ** 2).mean())), 'val_bias': float(e[va_mask].mean())}
    bands = {}
    for lo, hi_ in [(1, 13), (14, 26), (27, 39), (40, 52)]:
        m = va_mask & (played >= lo) & (played <= hi_); bands[f'{lo}-{hi_}'] = [float(e[m].mean()), float(np.sqrt((e[m] ** 2).mean()))]
    out['val_bias_rmse_by_phase'] = bands
    eg = G - pr; out['val_rmse_vs_MCreturn'] = float(np.sqrt((eg[va_mask] ** 2).mean())); gb = {}
    for lo, hi_ in [(1, 13), (14, 26), (27, 39), (40, 52)]:
        m = va_mask & (played >= lo) & (played <= hi_); gb[f'{lo}-{hi_}'] = [float(eg[m].mean()), float(eg[m].std(ddof=1) / np.sqrt(m.sum()))]
    out['val_MCbias_se_by_phase'] = gb; print(name, json.dumps(out)); return out
tr = ~isval; va = isval; res = {'rows': N, 'games': int(len(ug)), 'lam': lam, 'target': a.target, 'anchor': a.exact_anchor}
res['shipped_nn'] = rep('shipped network (reference)', p_ship, tr, va)
res['mean_predictor_by_phase'] = rep('constant-per-cards-dealt', np.array([tgt[tr & (played == k)].mean() if (tr & (played == k)).any() else tgt[tr].mean() for k in range(53)])[played], tr, va)
t0 = time.time(); W = nt_fit(tr, a.nt_passes); res['ntuple'] = rep(f'n-tuple (backfit {a.nt_passes} passes, {time.time()-t0:.0f}s)', nt_pred(W), tr, va)
# ---- MLP (numpy, Adam)
X = mlp_feats(); y = (tgt / 1000.0).astype(np.float32); H1, H2 = map(int, a.mlp.split(',')); nin = X.shape[1]
r2 = np.random.default_rng(a.seed + 1)
P = {'W1': r2.normal(0, np.sqrt(2 / nin), (nin, H1)).astype(np.float32), 'b1': np.zeros(H1, np.float32), 'W2': r2.normal(0, np.sqrt(2 / H1), (H1, H2)).astype(np.float32), 'b2': np.zeros(H2, np.float32), 'W3': r2.normal(0, np.sqrt(1 / H2), (H2, 1)).astype(np.float32), 'b3': np.full(1, y[tr].mean(), np.float32)}
M = {k: np.zeros_like(v) for k, v in P.items()}; V = {k: np.zeros_like(v) for k, v in P.items()}; tstep = 0
def fwd(xb):
    h1 = np.maximum(xb @ P['W1'] + P['b1'], 0); h2 = np.maximum(h1 @ P['W2'] + P['b2'], 0); return h1, h2, (h2 @ P['W3'] + P['b3'])[:, 0]
tri = np.where(tr)[0]; B = 1024; t0 = time.time(); steps_total = a.epochs * (len(tri) // B + 1)
for ep in range(a.epochs):
    r2.shuffle(tri); lr = 1e-3 * (0.5 * (1 + np.cos(np.pi * ep / a.epochs))) + 2e-5
    for s in range(0, len(tri), B):
        bi = tri[s:s + B]; xb = X[bi]; yb = y[bi]; h1, h2, o = fwd(xb); d3 = ((o - yb) * (2.0 / len(bi)))[:, None]
        g = {'W3': h2.T @ d3, 'b3': d3.sum(0)}; d2 = (d3 @ P['W3'].T) * (h2 > 0); g['W2'] = h1.T @ d2; g['b2'] = d2.sum(0)
        d1 = (d2 @ P['W2'].T) * (h1 > 0); g['W1'] = xb.T @ d1; g['b1'] = d1.sum(0); tstep += 1
        for k in P:
            M[k] = 0.9 * M[k] + 0.1 * g[k]; V[k] = 0.999 * V[k] + 0.001 * g[k] ** 2
            P[k] -= (lr * (M[k] / (1 - 0.9 ** tstep)) / (np.sqrt(V[k] / (1 - 0.999 ** tstep)) + 1e-8)).astype(np.float32)
    _, _, ov = fwd(X[va]); print(f'  mlp epoch {ep+1}/{a.epochs} val rmse {np.sqrt(((ov * 1000 - tgt[va]) ** 2).mean()):.1f}  {time.time()-t0:.0f}s', flush=True)
_, _, o_all = fwd(X); pm = o_all.astype(np.float64) * 1000; res['mlp'] = rep(f'MLP {nin}-{H1}-{H2}-1', pm, tr, va)
pn = nt_pred(W); res['blend_mlp_ntuple_50_50'] = rep('0.5 MLP + 0.5 n-tuple', 0.5 * pm + 0.5 * pn, tr, va)
json.dump(res, open(a.out, 'w'), indent=1)
if a.save_prefix:
    np.savez(a.save_prefix + '_nt.npz', *W); np.savez(a.save_prefix + '_mlp.npz', **P)
