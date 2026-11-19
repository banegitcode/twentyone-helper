#!/usr/bin/env python3
"""Differential value-bias analysis from existing logs. No new games."""
import json, glob, math, os, sys
from collections import defaultdict
from statistics import mean, pstdev

ROOT = "/workspace/21lab/experiments"
OUT = os.path.join(ROOT, "early-value-bias")

def se_mean(xs):
    n = len(xs)
    if n <= 1:
        return float("nan"), n
    m = sum(xs) / n
    var = sum((x - m) ** 2 for x in xs) / (n - 1)
    return math.sqrt(var / n), n

def mean_se(xs):
    if not xs:
        return None
    se, n = se_mean(xs)
    return sum(xs) / n, se, n

def fmt(ms):
    if not ms:
        return "n/a"
    m, se, n = ms
    if se != se:
        return f"{m:.1f} (n={n}, SE n/a)"
    return f"{m:.1f} ± {se:.1f} (n={n})"

# ---------- load ends ----------
ends = {}
with open(os.path.join(OUT, "s1k_ends.jsonl")) as f:
    for line in f:
        r = json.loads(line)
        ends[r["g"]] = r["final"]
print(f"ends: {len(ends)} games, mean final {sum(ends.values())/len(ends):.1f}")

# ---------- load after-state decisions (stream) ----------
# Keep rem>=13; analysis filters.
# For memory, store compact chosen-move rows and, for rem>16, compact candidate arrays.

chosen = []  # list of dicts
# decisions above 16 for flip-under-model: list of (g, rem, nets, bhats_will_be_filled_later, feats)
decisions_gt16 = []
decisions_ge16 = []

def cand_feat_tuple(c):
    return (
        c["staysA"], c["bustsA"], c["nEmptyA"], c["prevA"], c["maxN"],
        c["n1"], c["n2"], c["n3"], c["n4"], c["nSoft"], c["maxSoft"],
        c["stay"] >= 0, c["bust"], c["cleared"], c["pts"],
        c["p"], c["q"], c["chosen"],
    )

n_dec_gt16 = n_dec_ge16 = 0
n_games_seen = set()
with open(os.path.join(OUT, "s1k_after_rem13plus.jsonl")) as f:
    for line in f:
        d = json.loads(line)
        final = ends[d["g"]]
        n_games_seen.add(d["g"])
        ch = None
        for c in d["cands"]:
            if c["chosen"]:
                ch = c
                break
        if ch is None:
            continue
        sa = d["score"] + ch["pts"]
        G = final - sa          # points still to come AFTER placement (leaf target)
        Gb = final - d["score"] # points from this move onward (search-value target)
        bias_p = G - ch["p"] if ch["p"] is not None else None
        bias_q = Gb - ch["q"] if ch["q"] is not None else None
        rec = dict(g=d["g"], rem=d["rem"], step=d["step"],
                   staysA=ch["staysA"], bustsA=ch["bustsA"], nEmptyA=ch["nEmptyA"],
                   prevA=ch["prevA"], maxN=ch["maxN"], n1=ch["n1"], n2=ch["n2"],
                   n3=ch["n3"], n4=ch["n4"], nSoft=ch["nSoft"], maxSoft=ch["maxSoft"],
                   sumSoft=ch["sumSoft"], stay=1 if ch["stay"] >= 0 else 0,
                   bust=ch["bust"], cleared=ch["cleared"], pts=ch["pts"],
                   p=ch["p"], q=ch["q"], G=G, Gb=Gb, bias_p=bias_p, bias_q=bias_q,
                   nCand=d["nCand"], nEmpty=d["nEmpty"], stays=d["stays"], busts=d["busts"], prev=d["prev"])
        chosen.append(rec)

        if d["rem"] >= 16:
            compact = []
            for c in d["cands"]:
                compact.append({
                    "staysA": c["staysA"], "bustsA": c["bustsA"], "nEmptyA": c["nEmptyA"],
                    "prevA": c["prevA"], "maxN": c["maxN"], "n2": c["n2"], "n4": c["n4"],
                    "nSoft": c["nSoft"], "maxSoft": c["maxSoft"],
                    "stay": 1 if c["stay"] >= 0 else 0, "bust": c["bust"], "cleared": c["cleared"],
                    "p": c["p"], "q": c["q"], "chosen": c["chosen"], "pts": c["pts"],
                })
            item = (d["g"], d["rem"], compact)
            decisions_ge16.append(item)
            n_dec_ge16 += 1
            if d["rem"] > 16:
                decisions_gt16.append(item)
                n_dec_gt16 += 1

print(f"chosen rows {len(chosen)} games {len(n_games_seen)} dec rem>16 {n_dec_gt16} rem>=16 {n_dec_ge16}")

# ---------- helper: cluster mean of a field in a filter ----------
def cluster_mean(rows, pred, field="bias_p"):
    by = defaultdict(list)
    for r in rows:
        if pred(r) and r[field] is not None:
            by[r["g"]].append(r[field])
    if not by:
        return None
    avgs = [sum(v) / len(v) for v in by.values()]
    return mean_se(avgs)

def rem_bin(rem):
    # rem = cards left including current
    if rem >= 41: return "52-41"
    if rem >= 33: return "40-33"
    if rem >= 25: return "32-25"
    if rem >= 17: return "24-17"
    if rem >= 13: return "16-13"
    return "<=12"

# ========== 1. Absolute bias by rem (chosen moves, s1k shipped52) ==========
print("\n======== 1. ABSOLUTE BIAS (chosen move; shipped52 set1000; cluster by game) ========")
rows_all = chosen
for field, label in (("bias_p", "leaf p vs points-after (G-p)"), ("bias_q", "search q vs points-from-here (Gb-q)")):
    print(f"\n-- {label} --")
    for name, pred in [
        ("all rem>=13", lambda r: r["rem"] >= 13),
        ("rem>16 (first ~36 cards)", lambda r: r["rem"] > 16),
        ("rem>=17 and dealt first half (~rem>=27)", lambda r: r["rem"] >= 27),
    ]:
        print(f"  {name}: {fmt(cluster_mean(rows_all, pred, field))}")
    print("  by rem bin:")
    for b in ["52-41", "40-33", "32-25", "24-17", "16-13"]:
        print(f"    {b}: {fmt(cluster_mean(rows_all, lambda r, bb=b: rem_bin(r['rem'])==bb, field))}")

# phase means by integer rem, cluster-corrected, for residualizing
phase_p = {}
phase_q = {}
for rem in range(13, 53):
    mp = cluster_mean(rows_all, lambda r, rr=rem: r["rem"] == rr, "bias_p")
    mq = cluster_mean(rows_all, lambda r, rr=rem: r["rem"] == rr, "bias_q")
    phase_p[rem] = mp[0] if mp else 0.0
    phase_q[rem] = mq[0] if mq else 0.0

for r in rows_all:
    r["res_p"] = (r["bias_p"] - phase_p[r["rem"]]) if r["bias_p"] is not None else None
    r["res_q"] = (r["bias_q"] - phase_q[r["rem"]]) if r["bias_q"] is not None else None

print("\n======== 1b. PHASE-RESIDUAL (bias minus same-rem mean) by AFTER-STATE features, rem>16 ========")
print("These are the only terms that can differ across candidate moves of one decision.")

def table_feature(field, values, resfield="res_p", subset=lambda r: r["rem"] > 16):
    print(f"  residual {resfield} by {field}:")
    out = {}
    for v in values:
        ms = cluster_mean(rows_all, lambda r, vv=v: subset(r) and r[field] == vv, resfield)
        out[v] = ms
        print(f"    {field}={v}: {fmt(ms)}")
    return out

# feature tables
for resfield, lab in (("res_p", "leaf residual"), ("res_q", "search residual")):
    print(f"\n--- {lab} rem>16 ---")
    table_feature("staysA", [0, 1, 2], resfield)
    table_feature("bustsA", [0, 1, 2], resfield)
    table_feature("nEmptyA", [0, 1, 2, 3, 4], resfield)
    table_feature("prevA", [0, 1, 2, 3, 4], resfield)
    table_feature("maxN", [0, 1, 2, 3, 4], resfield)
    table_feature("stay", [0, 1], resfield)
    table_feature("cleared", [0, 1], resfield)
    table_feature("bust", [0, 1], resfield)
    # maxSoft buckets
    print(f"  residual {resfield} by maxSoft bucket:")
    def soft_bucket(x):
        if x <= 10: return "<=10"
        if x <= 16: return "11-16"
        if x <= 19: return "17-19"
        return "20-21"
    for b in ["<=10", "11-16", "17-19", "20-21"]:
        ms = cluster_mean(rows_all, lambda r, bb=b: r["rem"] > 16 and soft_bucket(r["maxSoft"]) == bb, resfield)
        print(f"    maxSoft {b}: {fmt(ms)}")
    print(f"  residual {resfield} by n2 (number of 2-card columns after):")
    for v in range(0, 5):
        ms = cluster_mean(rows_all, lambda r, vv=v: r["rem"] > 16 and r["n2"] == vv, resfield)
        print(f"    n2={v}: {fmt(ms)}")

# Pairwise contrasts of interest (unpaired between games? No - same game can have both, but cells are after-states of chosen moves, typically one stays-left per early game stretch).
# Better: paired contrast when a game has both levels? For stays, a game often has staysA=2 then 1. We can do within-game difference of means.
print("\n--- Within-game contrasts of leaf residual (rem>16), games that have both levels ---")

def paired_contrast(field, va, vb, resfield="res_p", subset=lambda r: r["rem"] > 16):
    by_a, by_b = defaultdict(list), defaultdict(list)
    for r in rows_all:
        if not subset(r) or r[resfield] is None:
            continue
        if r[field] == va:
            by_a[r["g"]].append(r[resfield])
        elif r[field] == vb:
            by_b[r["g"]].append(r[resfield])
    diffs = []
    for g in set(by_a) & set(by_b):
        diffs.append(sum(by_a[g]) / len(by_a[g]) - sum(by_b[g]) / len(by_b[g]))
    ms = mean_se(diffs)
    print(f"  {resfield} {field}={va} minus {field}={vb}: {fmt(ms)}")
    return ms

for resfield in ("res_p", "res_q"):
    print(f" {resfield}:")
    paired_contrast("staysA", 2, 1, resfield)
    paired_contrast("staysA", 1, 0, resfield)
    paired_contrast("stay", 1, 0, resfield)
    paired_contrast("nEmptyA", 0, 1, resfield)
    paired_contrast("nEmptyA", 1, 2, resfield)
    paired_contrast("prevA", 1, 0, resfield)
    paired_contrast("prevA", 2, 0, resfield)
    paired_contrast("cleared", 1, 0, resfield)
    paired_contrast("bustsA", 1, 0, resfield)
    paired_contrast("maxN", 2, 1, resfield)
    paired_contrast("maxN", 3, 2, resfield)

# ========== 2. Additive model of residual, 5-fold by game, apply to all candidates ==========
print("\n======== 2. ADDITIVE RESIDUAL MODEL and within-decision SPREAD (rem>16) ========")

# Features as one-hot groups. Fit with ridge-ish normal equations via simple group means
# (equivalent to unweighted ANOVA-style additive fit if we use IRLS... we'll do OLS with numpy if available)

try:
    import numpy as np
    HAVE_NP = True
except ImportError:
    HAVE_NP = False
    print("NO NUMPY")

def feat_vec(c, rem=None):
    # residual model features (NO rem / phase — that is common-mode)
    # staysA 0,1,2; bustsA 0,1,2; nEmptyA 0-4; prevA 0-4 (clip); maxN 0-4;
    # stay, bust, cleared; maxSoft buckets
    def oh(val, levels):
        v = val if val in levels else levels[-1]
        return [1.0 if v == lv else 0.0 for lv in levels[1:]]  # drop first for identifiability
    ms = c["maxSoft"]
    if ms <= 10: sb = 0
    elif ms <= 16: sb = 1
    elif ms <= 19: sb = 2
    else: sb = 3
    prev = c["prevA"] if c["prevA"] <= 4 else 4
    stays = c["staysA"] if c["staysA"] <= 2 else 2
    busts = c["bustsA"] if c["bustsA"] <= 2 else 2
    ne = c["nEmptyA"] if c["nEmptyA"] <= 4 else 4
    mn = c["maxN"] if c["maxN"] <= 4 else 4
    return (
        oh(stays, [0, 1, 2])
        + oh(busts, [0, 1, 2])
        + oh(ne, [0, 1, 2, 3, 4])
        + oh(prev, [0, 1, 2, 3, 4])
        + oh(mn, [0, 1, 2, 3, 4])
        + oh(sb, [0, 1, 2, 3])
        + [float(c["stay"]), float(c["bust"]), float(c["cleared"])]
    )

# Fit residual_p on chosen rem>16, 5-fold by game
rows_fit = [r for r in rows_all if r["rem"] > 16 and r["res_p"] is not None]
games = sorted({r["g"] for r in rows_fit})
# 5 folds
folds = [games[i::5] for i in range(5)]
# map game -> fold
gfold = {}
for i, fl in enumerate(folds):
    for g in fl:
        gfold[g] = i

# holdout predictions for chosen rows
oof_pred = {}  # (g,step) or index -> pred residual
# also store last full-fit coeffs for applying to all cands: we'll do OOF per fold for flips too

def ols_fit(X, y):
    # add intercept
    Xa = np.column_stack([np.ones(len(X)), X])
    # ridge small for stability
    lam = 1e-6
    A = Xa.T @ Xa + lam * np.eye(Xa.shape[1])
    b = Xa.T @ y
    w = np.linalg.solve(A, b)
    return w

def ols_pred(w, X):
    Xa = np.column_stack([np.ones(len(X)), X])
    return Xa @ w

# OOF fit
X_all, y_all, meta = [], [], []
for r in rows_fit:
    X_all.append(feat_vec(r))
    y_all.append(r["res_p"])
    meta.append((r["g"], r["step"]))
X_all = np.array(X_all, dtype=float)
y_all = np.array(y_all, dtype=float)

oof = np.zeros(len(y_all))
for i in range(5):
    test_idx = np.array([gfold[m[0]] == i for m in meta])
    train_idx = ~test_idx
    w = ols_fit(X_all[train_idx], y_all[train_idx])
    oof[test_idx] = ols_pred(w, X_all[test_idx])

# OOF quality
resid = y_all - oof
rmse = float(np.sqrt(np.mean(resid ** 2)))
# cluster R^2
# compare to predicting 0 residual
ss_tot = float(np.sum(y_all ** 2))  # already phase-residual, mean ~0
ss_res = float(np.sum(resid ** 2))
r2 = 1 - ss_res / ss_tot if ss_tot else 0
print(f"OLS additive model for leaf residual (rem>16), 5-fold OOF by game:")
print(f"  n={len(y_all)} positions, {len(games)} games")
print(f"  OOF RMSE {rmse:.1f}, OOF R^2 (vs 0 residual) {r2:.4f}")
print(f"  OOF residual mean {resid.mean():.2f}, sd {resid.std():.1f}")
# How large is the predicted residual itself?
print(f"  OOF predicted residual: mean {oof.mean():.2f}, sd {oof.std():.1f}, p10/p50/p90 {np.percentile(oof,10):.1f}/{np.percentile(oof,50):.1f}/{np.percentile(oof,90):.1f}")
print(f"  actual residual:        mean {y_all.mean():.2f}, sd {y_all.std():.1f}, p10/p50/p90 {np.percentile(y_all,10):.1f}/{np.percentile(y_all,50):.1f}/{np.percentile(y_all,90):.1f}")

# Full fit on all games for coefficients inspection
w_full = ols_fit(X_all, y_all)
# names
names = (
    ["staysA=1","staysA=2","bustsA=1","bustsA=2",
     "nEmptyA=1","nEmptyA=2","nEmptyA=3","nEmptyA=4",
     "prevA=1","prevA=2","prevA=3","prevA=4",
     "maxN=1","maxN=2","maxN=3","maxN=4",
     "maxSoft=11-16","maxSoft=17-19","maxSoft=20-21",
     "usedStay","justBust","justCleared"]
)
print("  full-fit coefficients (relative to staysA=0,bustsA=0,nEmptyA=0,prevA=0,maxN=0,maxSoft<=10, no stay/bust/clear):")
print(f"    intercept {w_full[0]:.1f}")
for name, val in zip(names, w_full[1:]):
    print(f"    {name:20s} {val:+7.1f}")

# Per-fold weights for OOF application to all candidates
fold_w = []
for i in range(5):
    train_idx = np.array([gfold[m[0]] != i for m in meta])
    # games not in rows_fit? shouldn't happen for rem>16 with bias
    fold_w.append(ols_fit(X_all[train_idx], y_all[train_idx]))

# Apply to all candidates in rem>16 decisions; use OOF weights by game
# For games in fit (all set1000 should be), use that fold's w.

def pred_res(c, w):
    x = np.array([feat_vec(c)], dtype=float)
    return float(ols_pred(w, x)[0])

# within-decision stats and model-implied flip gain (OOF)
# gain formula: for each decision, corrected_i = q_i + bhat_i  (or p_i + pts_i + bhat_i?)
# The policy compares q (search values). A leaf-bias correction should be added to leaves,
# which would shift q by approximately the after-state correction (for a 0-ply / leaf),
# or a diluted version for 1-2 ply. We report the 0-ply-style correction on q as an
# UPPER calculated bound (full after-state correction applied to the root action value).
#
# Two variants: correct q by bhat(after), and correct p by bhat (then action score = pts + p + bhat).

flip_stats = []  # per game sums

def analyze_flips(decs, label):
    by_game_gain_q = defaultdict(float)
    by_game_gain_p = defaultdict(float)
    by_game_nflip_q = defaultdict(int)
    by_game_nflip_p = defaultdict(int)
    by_game_spread = defaultdict(list)
    n_dec = 0
    n_multi = 0
    spreads = []  # range of bhat within decision
    spreads_std = []
    feature_diff_stay = 0  # decisions where some cand uses stay and some don't
    n_with_stay_mix = 0
    q_gaps = []  # q_champ - q_second
    for g, rem, cands in decs:
        if rem <= 16 and label.endswith("gt16"):
            continue
        fold = gfold.get(g, 0)
        w = fold_w[fold]
        n_dec += 1
        bhats, qs, ps, pts, chos = [], [], [], [], []
        stays_used = []
        for c in cands:
            bhats.append(pred_res(c, w))
            qs.append(c["q"])
            ps.append(c["p"])
            pts.append(c["pts"])
            chos.append(c["chosen"])
            stays_used.append(c["stay"])
        if len(cands) < 2:
            continue
        n_multi += 1
        rng = max(bhats) - min(bhats)
        std = float(np.std(bhats, ddof=0))
        spreads.append(rng)
        spreads_std.append(std)
        by_game_spread[g].append(rng)
        if len(set(stays_used)) > 1:
            n_with_stay_mix += 1
        # chosen index
        try:
            ic = chos.index(1)
        except ValueError:
            continue
        # q-correction
        corr_q = [qs[i] + bhats[i] for i in range(len(cands))]
        ibest = max(range(len(cands)), key=lambda i: corr_q[i])
        gain_q = corr_q[ibest] - corr_q[ic]
        if ibest != ic and gain_q > 1e-9:
            by_game_gain_q[g] += gain_q
            by_game_nflip_q[g] += 1
        # p-correction on action score pts+p
        act = [pts[i] + ps[i] + bhats[i] for i in range(len(cands))]
        # compare to chosen under same metric? The champ picked by q, not pts+p.
        # Estimated true action value ≈ pts + p + residual ≈ pts + p + bhat
        # Champ's estimated true = pts[ic]+p[ic]+bhat[ic]
        ibestp = max(range(len(cands)), key=lambda i: act[i])
        gain_p = act[ibestp] - act[ic]
        if ibestp != ic and gain_p > 1e-9:
            by_game_gain_p[g] += gain_p
            by_game_nflip_p[g] += 1
        # gap
        others = [qs[i] for i in range(len(cands)) if i != ic]
        if others:
            q_gaps.append(qs[ic] - max(others))

    all_g = sorted({g for g, rem, c in decs})
    def game_mean(dic, games, count=False):
        vals = [dic.get(g, 0.0) for g in games]
        return mean_se(vals)

    print(f"\n[{label}] n_dec={n_dec} n_multi={n_multi} n_games={len(all_g)}")
    print(f"  within-decision bhat range: mean {mean(spreads):.1f}, median {float(np.median(spreads)):.1f}, p90 {float(np.percentile(spreads,90)):.1f}, p99 {float(np.percentile(spreads,99)):.1f}")
    print(f"  within-decision bhat std:   mean {mean(spreads_std):.1f}, median {float(np.median(spreads_std)):.1f}")
    # cluster mean of per-decision range? also per-game mean range
    g_rng = [sum(v)/len(v) for v in by_game_spread.values()]
    print(f"  per-game mean bhat range: {fmt(mean_se(g_rng))}")
    print(f"  decisions with Stay and no-Stay both legal among scored cands: {n_with_stay_mix}/{n_multi}")
    print(f"  model-implied gain applying bhat to q (OOF, calculated under the model): {fmt(game_mean(by_game_gain_q, all_g))}")
    print(f"  flips/game (q-correction): {fmt(game_mean(by_game_nflip_q, all_g))}")
    print(f"  model-implied gain applying bhat to pts+p (OOF): {fmt(game_mean(by_game_gain_p, all_g))}")
    print(f"  flips/game (p-correction): {fmt(game_mean(by_game_nflip_p, all_g))}")
    if q_gaps:
        print(f"  champ q-gap to 2nd (multi): mean {mean(q_gaps):.1f}, median {float(np.median(q_gaps)):.1f}, p10 {float(np.percentile(q_gaps,10)):.1f}")
    return {
        "gain_q": game_mean(by_game_gain_q, all_g),
        "gain_p": game_mean(by_game_gain_p, all_g),
        "nflip_q": game_mean(by_game_nflip_q, all_g),
        "spread_mean": mean(spreads),
        "spread_median": float(np.median(spreads)),
    }

r_gt16 = analyze_flips(decisions_gt16, "rem>16")
r_ge16 = analyze_flips(decisions_ge16, "rem>=16")

# Also: raw within-decision spread of AFTER-STATE FEATURES (how often do cands even differ?)
print("\n-- How different are after-states of candidates at the same decision? (rem>16, multi) --")
n_same_stays = n_same_empty = n_same_prev = n_same_busts = n_multi = 0
n_stay_mix = n_empty_diff = n_prev_diff = n_busts_diff = n_maxn_diff = 0
stay_bhat_gaps = []  # |mean bhat(stay cands) - mean bhat(nostay)| per mixed decision, using full model
for g, rem, cands in decisions_gt16:
    if len(cands) < 2:
        continue
    n_multi += 1
    sa = {c["staysA"] for c in cands}
    ne = {c["nEmptyA"] for c in cands}
    pr = {c["prevA"] for c in cands}
    bu = {c["bustsA"] for c in cands}
    mn = {c["maxN"] for c in cands}
    if len(sa) == 1: n_same_stays += 1
    else: n_stay_mix += 1
    if len(ne) == 1: n_same_empty += 1
    else: n_empty_diff += 1
    if len(pr) == 1: n_same_prev += 1
    else: n_prev_diff += 1
    if len(bu) == 1: n_same_busts += 1
    else: n_busts_diff += 1
    if len(mn) > 1: n_maxn_diff += 1
print(f"  multi={n_multi}: same staysA {n_same_stays} ({100*n_same_stays/n_multi:.1f}%), staysA differs {n_stay_mix}")
print(f"    nEmptyA differs {n_empty_diff} ({100*n_empty_diff/n_multi:.1f}%)")
print(f"    prevA (streak) differs {n_prev_diff} ({100*n_prev_diff/n_multi:.1f}%)")
print(f"    bustsA differs {n_busts_diff} ({100*n_busts_diff/n_multi:.1f}%)")
print(f"    maxN differs {n_maxn_diff} ({100*n_maxn_diff/n_multi:.1f}%)")

# ========== 3. Sampled / strong / conf reference: within-decision error spread ==========
print("\n======== 3. REFERENCE-A / STRONG / CONF  (dev200; existing labels) ========")

samp = []
for p in sorted(glob.glob(os.path.join(ROOT, "regret_map", "samp_*.jsonl"))):
    with open(p) as f:
        for line in f:
            if line.strip():
                samp.append(json.loads(line))
conf = []
for p in sorted(glob.glob(os.path.join(ROOT, "regret_map", "conf_*.jsonl"))):
    with open(p) as f:
        for line in f:
            if line.strip():
                conf.append(json.loads(line))
strong = []
for p in sorted(glob.glob(os.path.join(ROOT, "streak-measure", "raw", "reeval_strong_*.jsonl"))):
    with open(p) as f:
        for line in f:
            if line.strip():
                strong.append(json.loads(line))
print(f"loaded samp {len(samp)} conf {len(conf)} strong {len(strong)}")

# How many games in samp?
samp_games = sorted({r["g"] for r in samp})
print(f"samp games {len(samp_games)} min {min(samp_games)} max {max(samp_games)}")
# conf games
conf_games = sorted({r["g"] for r in conf})
print(f"conf games {len(conf_games)}")

def pool_fresh(rows, pred, field="fresh", sefield=None):
    """Per-game sum of field, SE over games. Missing games counted as 0 if game_list provided later."""
    by = defaultdict(float)
    gs = set()
    for r in rows:
        if pred(r) and field in r and r[field] is not None:
            by[r["g"]] += r[field]
            gs.add(r["g"])
    return by, gs

# Conf net flip gain (unbiased) — reproduce 24.3 for rem>=16
# conf is only the flipped decisions (253). Games in the samp design: 195.
# Need the 195 game ids. samp has singles and multi; last game of each worker dropped.

# Infer 195 games from samp
print(f"conf rem>=16 n={sum(1 for r in conf if r['rem']>=16)} rem>16 n={sum(1 for r in conf if r['rem']>16)}")

def conf_gain(pred, game_ids):
    by = defaultdict(float)
    n_flips = 0
    for r in conf:
        if pred(r):
            by[r["g"]] += r["fresh"]
            n_flips += 1
    vals = [by.get(g, 0.0) for g in game_ids]
    return mean_se(vals), n_flips

# Use union of samp games as the denominator (195)
print(f"\nReference A net flip gain (conf fresh, unbiased), denominator = {len(samp_games)} samp games:")
for name, pred in [
    ("rem>=16", lambda r: r["rem"] >= 16),
    ("rem>16", lambda r: r["rem"] > 16),
    ("rem==16", lambda r: r["rem"] == 16),
    ("13<=rem<=16", lambda r: 13 <= r["rem"] <= 16),
    ("13<=rem<=15", lambda r: 13 <= r["rem"] <= 15),
]:
    ms, nf = conf_gain(pred, samp_games)
    print(f"  {name}: {fmt(ms)}  from {nf} conf decisions")

# Within-decision spread of (abs - cv) on samp multi, rem>16
print("\n-- Within-decision spread of (reference-A abs - network cv), samp multi --")

def samp_spread(pred):
    ranges, stds, mean_abs_d, n = [], [], [], 0
    # also residual of ranking: (abs_i - abs_c) - (cv_i - cv_c)
    rank_resid_abs = []
    # per-game: mean range, and mean |differential error champ vs best|
    by_range = defaultdict(list)
    for r in samp:
        if r.get("single") or "cands" not in r:
            continue
        if not pred(r):
            continue
        cands = r["cands"]
        if len(cands) < 2:
            continue
        errs = []
        champ_err = None
        for c in cands:
            if c.get("abs") is None or c.get("cv") is None:
                continue
            e = c["abs"] - c["cv"]
            errs.append(e)
            if c.get("m", 99) == 0 or (r.get("champIdx") is not None and cands.index(c) == r["champIdx"]):
                champ_err = e
        if len(errs) < 2:
            continue
        n += 1
        ranges.append(max(errs) - min(errs))
        stds.append(float(np.std(errs, ddof=0)))
        by_range[r["g"]].append(max(errs) - min(errs))
        if champ_err is not None:
            for e in errs:
                rank_resid_abs.append(abs(e - champ_err))
    gmeans = [sum(v)/len(v) for v in by_range.values()]
    print(f"  n_dec={n} games={len(by_range)}")
    if not ranges:
        return
    print(f"  within-dec error range: mean {mean(ranges):.1f}, median {float(np.median(ranges)):.1f}, p90 {float(np.percentile(ranges,90)):.1f}")
    print(f"  within-dec error std:   mean {mean(stds):.1f}, median {float(np.median(stds)):.1f}")
    print(f"  per-game mean range: {fmt(mean_se(gmeans))}")
    if rank_resid_abs:
        print(f"  |err_i - err_champ| mean {mean(rank_resid_abs):.1f}, median {float(np.median(rank_resid_abs)):.1f}")

print("rem>16:")
samp_spread(lambda r: r["rem"] > 16)
print("rem>=16:")
samp_spread(lambda r: r["rem"] >= 16)
print("13<=rem<=16:")
samp_spread(lambda r: 13 <= r["rem"] <= 16)

# Does (abs-cv) differ systematically by move type (Stay vs not) within a decision?
print("\n-- Within-decision (abs-cv) Stay vs no-Stay (samp multi rem>16) --")
diffs = []  # mean err(stay cands) - mean err(nostay cands), only mixed decisions
# Need champ/alt stay flags. cands have stay field.
by_game = defaultdict(list)
n_mix = 0
for r in samp:
    if r.get("single") or "cands" not in r or r["rem"] <= 16:
        continue
    stay_e, nostay_e = [], []
    for c in r["cands"]:
        if c.get("abs") is None or c.get("cv") is None:
            continue
        e = c["abs"] - c["cv"]
        if c.get("stay", -1) >= 0:
            stay_e.append(e)
        else:
            nostay_e.append(e)
    if stay_e and nostay_e:
        n_mix += 1
        d = mean(stay_e) - mean(nostay_e)
        diffs.append(d)
        by_game[r["g"]].append(d)
print(f"  mixed Stay/no-Stay decisions: {n_mix}")
if diffs:
    gmeans = [sum(v)/len(v) for v in by_game.values()]
    print(f"  err(Stay cands)-err(no-Stay), per decision mean {mean(diffs):.1f}, per-game {fmt(mean_se(gmeans))}")
    # This is: does reference A think Stay moves are more under/over-estimated than no-Stay?

# Feature-diff residuals using champ vs alt in samp (alt is the best or the compared one)
print("\n-- champ vs alt residual (abs_alt-cv_alt)-(abs_champ-cv_champ) by feature contrast, samp rem>16 --")

def contrast_resid(pred_row, pred_contrast, label):
    by = defaultdict(list)
    n = 0
    for r in samp:
        if r.get("single") or "cands" not in r or not pred_row(r):
            continue
        if not pred_contrast(r):
            continue
        # champ is cands[champIdx], alt is best?
        cands = r["cands"]
        ci = r.get("champIdx", 0)
        if ci >= len(cands):
            continue
        # use alt = the one described in r['alt'] — match stay/col if present; else best
        champ = cands[ci]
        # pick cand with max abs among non-champ, or the recorded best
        bi = r.get("best", None)
        if bi is None or bi == ci or bi >= len(cands):
            others = [i for i in range(len(cands)) if i != ci]
            if not others:
                continue
            bi = max(others, key=lambda i: cands[i].get("abs") or -1e99)
        alt = cands[bi]
        if champ.get("abs") is None or alt.get("abs") is None:
            continue
        d = (alt["abs"] - alt["cv"]) - (champ["abs"] - champ["cv"])
        by[r["g"]].append(d)
        n += 1
    gmeans = [sum(v)/len(v) for v in by.values()]
    print(f"  {label}: n_dec={n} {fmt(mean_se(gmeans)) if gmeans else 'n/a'}")

def is_stay(c):
    # champ/alt objects have 'stay' bool; cands have stay int
    return False

# Use r['champ'] and r['alt'] feature objects
def champ_alt_resid(pred_row, pred_pair, label):
    by = defaultdict(list)
    n = 0
    for r in samp:
        if r.get("single") or "cands" not in r or not pred_row(r):
            continue
        if "champ" not in r or "alt" not in r:
            continue
        if not pred_pair(r["champ"], r["alt"], r):
            continue
        cands = r["cands"]
        ci = r.get("champIdx", 0)
        if ci >= len(cands):
            continue
        champ = cands[ci]
        bi = r.get("best", None)
        if bi is None or bi == ci or bi >= len(cands):
            others = [i for i in range(len(cands)) if i != ci]
            if not others:
                continue
            bi = max(others, key=lambda i: cands[i].get("abs") or -1e99)
        altc = cands[bi]
        if champ.get("abs") is None or altc.get("abs") is None:
            continue
        d = (altc["abs"] - altc["cv"]) - (champ["abs"] - champ["cv"])
        by[r["g"]].append(d)
        n += 1
    gmeans = [sum(v)/len(v) for v in by.values()]
    print(f"  {label}: n_dec={n} {fmt(mean_se(gmeans)) if gmeans else 'n/a'}")

pred16 = lambda r: r["rem"] > 16
champ_alt_resid(pred16, lambda c,a,r: True, "all multi rem>16")
champ_alt_resid(pred16, lambda c,a,r: c.get("stay") and not a.get("stay"), "champ Stay, alt no-Stay")
champ_alt_resid(pred16, lambda c,a,r: a.get("stay") and not c.get("stay"), "champ no-Stay, alt Stay")
champ_alt_resid(pred16, lambda c,a,r: (c.get("n") or 0) != (a.get("n") or 0), "different after-count n")
champ_alt_resid(pred16, lambda c,a,r: bool(c.get("intoEmpty")) != bool(a.get("intoEmpty")), "intoEmpty differs")
champ_alt_resid(pred16, lambda c,a,r: (c.get("pts") or 0) > 0 and (a.get("pts") or 0) == 0, "champ scores, alt doesn't")
champ_alt_resid(pred16, lambda c,a,r: (a.get("pts") or 0) > 0 and (c.get("pts") or 0) == 0, "alt scores, champ doesn't")

# Conf + strong comparison for shrinkage
print("\n-- Strong reeval vs reference A (theoristFresh) on 71 decisions --")
# strong has theoristFresh and strong, rem, g, step
# denominator: 195 games? Streak used dev200. Check unique games.
sg = sorted({r["g"] for r in strong})
print(f"  strong games touched {len(sg)}, n={len(strong)}")

def strong_pool(field, pred, game_ids):
    by = defaultdict(float)
    n = 0
    for r in strong:
        if pred(r) and r.get(field) is not None:
            by[r["g"]] += r[field]
            n += 1
    vals = [by.get(g, 0.0) for g in game_ids]
    return mean_se(vals), n

# Streak used 195? or 200? "71 flips in 195 dev200 games"
for name, pred in [
    ("all 71 (rem>16 by construction?)", lambda r: True),
    ("rem>16", lambda r: r["rem"] > 16),
    ("17-32", lambda r: 17 <= r["rem"] <= 32),
    (">=33", lambda r: r["rem"] >= 33),
]:
    a, na = strong_pool("theoristFresh", pred, samp_games)
    b, nb = strong_pool("strong", pred, samp_games)
    print(f"  {name}: refA/theoristFresh {fmt(a)}  STRONG {fmt(b)}  n_dec={na}")

# Stay over-use subset
def is_stay_over(r):
    # champ stay, alt not, stayWasteful maybe
    return r.get("champ", {}).get("stay") and not r.get("alt", {}).get("stay")

def is_noempty_nostay(r):
    pf = r.get("pf") or {}
    return (pf.get("nEmpty") == 0) and not r.get("champ", {}).get("stay") and not r.get("alt", {}).get("stay")

for name, pred in [
    ("Stay over-use (champ Stay, alt not)", is_stay_over),
    ("no-empty, neither Stay", is_noempty_nostay),
]:
    a, na = strong_pool("theoristFresh", pred, samp_games)
    b, nb = strong_pool("strong", pred, samp_games)
    print(f"  {name}: refA {fmt(a)}  STRONG {fmt(b)}  n_dec={na}")

# What part of the 24.3 / rem>16 conf pool is in the 71, vs the rest?
strong_keys = {(r["g"], r["step"]) for r in strong}
print("\n-- Conf pool split: in strong-recheck vs not (rem>16 and rem>=16) --")
for tag, pred0 in [("rem>16", lambda r: r["rem"] > 16), ("rem>=16", lambda r: r["rem"] >= 16)]:
    in_s = [r for r in conf if pred0(r) and (r["g"], r["step"]) in strong_keys]
    out_s = [r for r in conf if pred0(r) and (r["g"], r["step"]) not in strong_keys]
    def sum_fresh(rows, game_ids):
        by = defaultdict(float)
        for r in rows:
            by[r["g"]] += r["fresh"]
        return mean_se([by.get(g, 0.0) for g in game_ids]), len(rows)
    a, na = sum_fresh(in_s, samp_games)
    b, nb = sum_fresh(out_s, samp_games)
    c, nc = sum_fresh(in_s + out_s, samp_games)
    print(f"  {tag} TOTAL {fmt(c)} n={nc}")
    print(f"    of which in strong-recheck set: {fmt(a)} n={na}")
    print(f"    of which NOT rechecked:         {fmt(b)} n={nb}")

# Shrinkage estimator: replace in-set with strong values, leave out-set at refA (or shrink out-set by same ratio)
print("\n-- Composite pool: strong values on rechecked + refA on the rest --")
# Need per (g,step) strong value
strong_map = {(r["g"], r["step"]): r for r in strong}

def composite(pred, game_ids, shrink_out=False, ratio=None):
    by_strong = defaultdict(float)
    by_refa_out = defaultdict(float)
    n_in = n_out = 0
    for r in conf:
        if not pred(r):
            continue
        key = (r["g"], r["step"])
        if key in strong_map:
            by_strong[r["g"]] += strong_map[key]["strong"]
            n_in += 1
        else:
            v = r["fresh"]
            if shrink_out and ratio is not None:
                v = v * ratio
            by_refa_out[r["g"]] += v
            n_out += 1
    vals = [by_strong.get(g, 0.0) + by_refa_out.get(g, 0.0) for g in game_ids]
    return mean_se(vals), n_in, n_out

# ratio from rechecked: strong/theoristFresh totals
# compute sum of strong and theoristFresh on the 71
s_sum = sum(r["strong"] for r in strong)
t_sum = sum(r["theoristFresh"] for r in strong)
ratio = s_sum / t_sum if t_sum else 1
print(f"  shrinkage ratio on 71 (sum strong / sum theoristFresh) = {ratio:.3f}  (sums {s_sum:.1f}/{t_sum:.1f})")
# Also cluster ratio of per-game means? The 71 are a selected set (first-pass flips), ratio may not apply to the rest.

for tag, pred in [("rem>16", lambda r: r["rem"] > 16), ("rem>=16", lambda r: r["rem"] >= 16)]:
    ms, ni, no = composite(pred, samp_games, False)
    print(f"  {tag} strong-on-rechecked + raw refA on rest: {fmt(ms)}  (n_in={ni}, n_out={no})")
    ms2, ni2, no2 = composite(pred, samp_games, True, ratio)
    print(f"  {tag} strong-on-rechecked + ratio-shrunk rest (GUESS): {fmt(ms2)}")

# ========== 4. Unevaluated mass: decisions excluded from the sampler ==========
print("\n======== 4. UNEVALUATED DECISIONS (possible missed regret) ========")
# From samp: singles + we need all decisions on those games from dev200 log to see window exclusions.
# Load just rem and nCls / scores from dev200 all log — or from samp which includes singles with nCls.

# samp includes singles (nCls=1) and multi. Does it include ALL decisions?
# 7988 samp rows / 195 games ≈ 41 per game, which is about rem>=13 (40 cards? rem 52 down to 13 is 40 decisions). Yes, roughly the mid+early with some early busts.

n_single = sum(1 for r in samp if r.get("single") and r["rem"] > 16)
n_multi = sum(1 for r in samp if (not r.get("single")) and r["rem"] > 16)
n_all = sum(1 for r in samp if r["rem"] > 16)
print(f"samp rem>16: {n_all} decisions, single-class {n_single} ({100*n_single/n_all:.1f}%), evaluated multi {n_multi}")

# Among multi, how close are the candidates (network cv gap)?
gaps = []
outside = 0  # if we can detect cands vs all legal... samp only has the windowed cands
for r in samp:
    if r.get("single") or "cands" not in r or r["rem"] <= 16:
        continue
    cvs = [c["cv"] for c in r["cands"] if "cv" in c]
    if len(cvs) >= 2:
        cvs.sort(reverse=True)
        gaps.append(cvs[0] - cvs[-1])  # window width
print(f"  evaluated multi: mean cv window {mean(gaps):.1f}, median {float(np.median(gaps)):.1f}")

# From s1k (more complete): among rem>16 multi-cand decisions, what fraction have 2nd within 100 of best,
# and what is the mass of q-gaps 100-200, 200-400, etc. This bounds missed close calls.
print("\n-- s1k shipped52 rem>16: distribution of q-gap (champ/best minus 2nd) --")
# Use decisions_gt16
gap_bins = defaultdict(list)  # per game counts or... we'll do per-game sums of 1's and also list
# Also "would be excluded": gap > 100

def s1k_gaps(decs, label):
    by_le100 = defaultdict(int)
    by_100_200 = defaultdict(int)
    by_200_400 = defaultdict(int)
    by_all_multi = defaultdict(int)
    # second-best q relative to best (not necessarily chosen — use max q)
    # also gap from CHOSEN q to best other
    gaps_all = []
    n_single = 0
    n = 0
    for g, rem, cands in decs:
        n += 1
        if len(cands) < 2:
            n_single += 1
            continue
        qs = [c["q"] for c in cands]
        qs_sorted = sorted(qs, reverse=True)
        gap = qs_sorted[0] - qs_sorted[1]
        gaps_all.append(gap)
        by_all_multi[g] += 1
        if gap <= 100:
            by_le100[g] += 1
        elif gap <= 200:
            by_100_200[g] += 1
        elif gap <= 400:
            by_200_400[g] += 1
    games = sorted({g for g,_,_ in decs})
    print(f"  [{label}] n_dec={n} single {n_single} ({100*n_single/n:.1f}%) multi {n-n_single}")
    if gaps_all:
        print(f"    q-gap best-to-2nd: mean {mean(gaps_all):.1f}, median {float(np.median(gaps_all)):.1f}, p10 {float(np.percentile(gaps_all,10)):.1f}, p25 {float(np.percentile(gaps_all,25)):.1f}")
        print(f"    share gap<=50: {100*sum(1 for x in gaps_all if x<=50)/len(gaps_all):.1f}%  <=100: {100*sum(1 for x in gaps_all if x<=100)/len(gaps_all):.1f}%  <=200: {100*sum(1 for x in gaps_all if x<=200)/len(gaps_all):.1f}%")
    print(f"    per-game count gap<=100: {fmt(mean_se([by_le100.get(g,0) for g in games]))}")
    print(f"    per-game count 100<gap<=200: {fmt(mean_se([by_100_200.get(g,0) for g in games]))}")
    print(f"    per-game count 200<gap<=400: {fmt(mean_se([by_200_400.get(g,0) for g in games]))}")

s1k_gaps(decisions_gt16, "rem>16")

# If unevaluated 100-200 gap decisions had a similar regret rate as the evaluated ones,
# we can bound. This is a GUESS. Calculated: evaluated flips were selected from the close window.
# The conf/samp method only evaluates within 100 and top 3 classes.
# At 11-12 cards, unevaluated held 12-14% of exact regret.
# Report that figure as the only measured miss rate, and do not inflate mid-game by it without a label.

# ========== 5. First-half absolute bias reminder vs differential ==========
print("\n======== 5. SCALE COMPARISON ========")
# mean |within-dec bhat range| vs mean absolute phase bias
bp = cluster_mean(rows_all, lambda r: r["rem"] > 16, "bias_p")
bq = cluster_mean(rows_all, lambda r: r["rem"] > 16, "bias_q")
print(f"absolute leaf bias rem>16: {fmt(bp)}")
print(f"absolute search bias rem>16: {fmt(bq)}")
# first half rem>=27 (cards dealt <=25)
bp2 = cluster_mean(rows_all, lambda r: r["rem"] >= 27, "bias_p")
print(f"absolute leaf bias rem>=27 (first half-ish): {fmt(bp2)}")

# sd of residual vs sd of phase
res = [r["res_p"] for r in rows_all if r["rem"] > 16 and r["res_p"] is not None]
ph = [r["bias_p"] for r in rows_all if r["rem"] > 16 and r["bias_p"] is not None]
print(f"sd of absolute bias rem>16: {float(np.std(ph,ddof=1)):.1f}")
print(f"sd of phase-residual rem>16: {float(np.std(res,ddof=1)):.1f}")
# Note within-game, phase is almost a game-level offset plus rem trend; residual still has a lot of outcome noise (the realized return is one sample of the expectation).
# That's why we shouldn't treat residual sd as differential error — most of it is outcome variance.
# The MODEL of residual (bhat) is the systematic part. Its within-decision range is the key number.

print("\nDONE")
