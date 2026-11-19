#!/usr/bin/env python3
"""v2a: improve the leaf evaluator where deeper:16 falls back to the network (leaves with ~10-15 cards left), trained on EXACT labels.
Models (same data, same split, held out by game):
  champ   : shipped52 / ship_nn network (56-128-48-1) as is
  ft      : warm-start from champ, all weights fine-tuned on exact v (MSE), L2 anchor to the initial weights, early stopping on a validation split of TRAIN games
  ntuple  : champ + additive n-tuple residual tables (shrunk backfitting) on exact v - champ
  ft+nt   : ft + n-tuple residual on its residual
Metrics on held-out games: value MAE/bias by cards-left (C rows = children / leaf positions, P rows = on-path positions); decision metrics on held-out decisions
(parent position P_k, k = 12..16 cards left, every next card value x every distinct action; Q_exact(a) = dpts + v_exact(child); 1-ply choice argmax dpts + model(child)):
wrong-move rate (regret > 0.5 pt), mean exact regret in points per decision, weighted by the true card probabilities (n_v/N).
usage: python3 v2a.py --pos data/all.pos.jsonl --dec data/all.dec.jsonl --feat data/all.feat.f32 [--lmin 10 --lmax 15] [--holdout 0.2]
"""
import sys, json, argparse, numpy as np, hashlib, os
ap = argparse.ArgumentParser()
ap.add_argument('--pos', required=True); ap.add_argument('--dec', required=True); ap.add_argument('--feat', required=True)
ap.add_argument('--lmin', type=int, default=10); ap.add_argument('--lmax', type=int, default=15)
ap.add_argument('--holdout', type=float, default=0.2); ap.add_argument('--seed', type=int, default=1)
ap.add_argument('--epochs', type=int, default=40); ap.add_argument('--lr', type=float, default=2e-4); ap.add_argument('--anchor', type=float, default=1e-3)
ap.add_argument('--nt-shrink', type=float, default=30.0); ap.add_argument('--out', default='results/v2a_result.json'); ap.add_argument('--save-model', default='')
ap.add_argument('--bootstrap', type=int, default=400); ap.add_argument('--sib-weight', type=float, default=1.0); ap.add_argument('--lvl-weight', type=float, default=0.1)
a = ap.parse_args(); a.sib_weight = a.__dict__['sib_weight']; a.lvl_weight = a.__dict__['lvl_weight']
NF = 56
rows = [json.loads(l) for l in open(a.pos) if l.strip()]
X = np.fromfile(a.feat, dtype=np.float32).reshape(-1, NF + 1); assert len(X) == len(rows), (len(X), len(rows))
champ = X[:, NF].astype(np.float64); F = X[:, :NF].astype(np.float64)
ok = np.array([bool(r.get('ok')) for r in rows]); v = np.array([r['v'] if r.get('ok') else np.nan for r in rows], float)
left = np.array([r['left'] for r in rows]); kind = np.array([r['kind'] for r in rows]); game = np.array([r['game'] for r in rows])
idx = {r['id']: i for i, r in enumerate(rows)}
decs = [json.loads(l) for l in open(a.dec) if l.strip()]
# ---- split by game (hash)
def h(g): return int(hashlib.md5(('%s/%d' % (g, a.seed)).encode()).hexdigest()[:8], 16) / 0xffffffff
games = sorted(set(game.tolist())); hold = {g for g in games if h(g) < a.holdout}
rest = [g for g in games if g not in hold]; val = {g for g in rest if h(str(g) + 'v') < 0.12}
is_hold = np.array([g in hold for g in game]); is_val = np.array([g in val for g in game]); is_tr = ~is_hold & ~is_val
use = ok & (left >= a.lmin) & (left <= a.lmax)
print('rows %d ok %d use %d | games %d train %d val %d heldout %d | decisions %d' % (len(rows), ok.sum(), use.sum(), len(games), len(rest) - len(val), len(val), len(hold), len(decs)))
# ---- MLP (numpy), warm start from the champion network
spec = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../engine/twentyone-solver/results/shipped_policies.json')))['52']['nn']
W0 = [np.array(l['W'], float).reshape(l['nOut'], l['nIn']) for l in spec['layers']]; B0 = [np.array(l['b'], float) for l in spec['layers']]; SC = spec.get('scale', 1000)
def fwd(Wl, Bl, x, keep=False):
    acts = [x]; h_ = x
    for i, (W, B) in enumerate(zip(Wl, Bl)):
        z = h_ @ W.T + B; h_ = z if i == len(Wl) - 1 else np.maximum(z, 0); acts.append(h_)
    return (h_[:, 0] * SC, acts) if keep else h_[:, 0] * SC
chk = fwd(W0, B0, F[:200]); print('champion net reproduced in numpy: max|diff| %.4f points' % np.abs(chk - champ[:200]).max())
class Adam:
    def __init__(s, Wl, Bl, lr): s.Wl, s.Bl, s.lr, s.t = Wl, Bl, lr, 0; s.mW = [np.zeros_like(w) for w in Wl]; s.vW = [np.zeros_like(w) for w in Wl]; s.mB = [np.zeros_like(b) for b in Bl]; s.vB = [np.zeros_like(b) for b in Bl]
    def step(s, xb, dout):
        """dout = dLoss/d(output in scaled units, i.e. points/SC) for each row of xb"""
        out, acts = fwd(s.Wl, s.Bl, xb, True); d = dout[:, None]; s.t += 1
        for li in range(len(s.Wl) - 1, -1, -1):
            gW = d.T @ acts[li] + a.anchor * (s.Wl[li] - W0[li]); gB = d.sum(0)
            if li > 0: d = (d @ s.Wl[li]) * (acts[li] > 0)
            for P, g, m, vv in ((s.Wl, gW, s.mW, s.vW), (s.Bl, gB, s.mB, s.vB)):
                m_ = m[li] = 0.9 * m[li] + 0.1 * g; v_ = vv[li] = 0.999 * vv[li] + 0.001 * g * g
                P[li] -= s.lr * (m_ / (1 - 0.9 ** s.t)) / (np.sqrt(v_ / (1 - 0.999 ** s.t)) + 1e-8)
def train_ft(tr, va):
    """level MSE on exact v (early stopping on validation MAE)"""
    Wl = [w.copy() for w in W0]; Bl = [b.copy() for b in B0]; opt = Adam(Wl, Bl, a.lr); rng = np.random.default_rng(a.seed); y = v / SC; best = (np.inf, None, 0)
    def vmae(): return np.abs(fwd(Wl, Bl, F[va]) - v[va]).mean()
    print('  ft: start val MAE %.2f' % vmae())
    for ep in range(a.epochs):
        perm = rng.permutation(tr)
        for s in range(0, len(perm), 256):
            b = perm[s:s + 256]; out = fwd(Wl, Bl, F[b]); opt.step(F[b], (out / SC - y[b]) * 2 / len(b))
        e = vmae()
        if e < best[0]: best = (e, ([w.copy() for w in Wl], [b.copy() for b in Bl]), ep)
        if ep % 5 == 0 or ep == a.epochs - 1: print('  ft epoch %d val MAE %.2f (best %.2f @%d)' % (ep, e, best[0], best[2]))
    return best[1]
def groups_of(gset):
    """sibling groups: (child row indexes, dpts, n_v weight, n terminal siblings, terminal dpts) per (decision, next card value)"""
    G = []
    for d in decs:
        if d['game'] not in gset: continue
        tot = sum(vg['n'] for vg in d['vals'])
        for vg in d['vals']:
            ids = [ac['cid'] for ac in vg['acts']]
            if any(c is not None and not rows[idx[c]].get('ok') for c in ids): continue
            seen = set(); ch = []; dp = []; tdp = []
            for ac in vg['acts']:
                if ac['cid'] is None: tdp.append(ac['dpts']); continue
                if (ac['cid'], ac['dpts']) in seen: continue
                seen.add((ac['cid'], ac['dpts'])); ch.append(idx[ac['cid']]); dp.append(ac['dpts'])
            if len(ch) == 0 or len(ch) + len(tdp) < 2: continue
            G.append((np.array(ch, dtype=int), np.array(dp, float), vg['n'] / tot, len(tdp)))
    return G
def reg1ply(Gs, predv):
    """mean 1-ply exact regret over sibling groups (weighted by n_v/N within a decision, then averaged over groups' decisions approx via weight sum)"""
    num = 0.0; den = 0.0
    for ch, dp, wt, nt in Gs:
        qe = dp + v[ch]; qm = dp + predv[ch]
        if nt: pass
        num += wt * (qe.max() - qe[int(np.argmax(qm))]); den += wt
    return num / max(den, 1e-9)
def train_sib(tr, va, Gtr, Gva):
    """decision-aware: loss = sibling-centered squared error of Q = dpts + net(child) vs exact Q (removes the level, keeps relative values) + lvl_w * level MSE; early stopping on VALIDATION 1-ply regret"""
    Wl = [w.copy() for w in W0]; Bl = [b.copy() for b in B0]; opt = Adam(Wl, Bl, a.lr); rng = np.random.default_rng(a.seed + 7); y = v / SC; best = (np.inf, None, 0)
    ch_all = np.unique(np.concatenate([g[0] for g in Gva]))
    def vr(): p = np.zeros(len(rows)); p[ch_all] = fwd(Wl, Bl, F[ch_all]); return reg1ply(Gva, p)
    print('  ftd: start val regret %.2f' % vr())
    for ep in range(a.epochs):
        order = rng.permutation(len(Gtr))
        for s in range(0, len(order), 48):
            gb = [Gtr[i] for i in order[s:s + 48]]; ch = np.concatenate([g[0] for g in gb]); xb = F[ch]; out = fwd(Wl, Bl, xb); dout = np.zeros(len(ch)); o = 0; wsum = sum(g[2] for g in gb)
            for g in gb:
                n = len(g[0]); e = out[o:o + n] / SC - y[g[0]]   # error of the child value (dpts cancels)
                N = n + g[3]; ebar = e.sum() / N; dout[o:o + n] = a.sib_weight * g[2] / wsum * 2 * (e - ebar); o += n
            lv = rng.choice(tr, 128, replace=False); ol = fwd(Wl, Bl, F[lv])
            opt.step(np.vstack([xb, F[lv]]), np.concatenate([dout, a.lvl_weight * 2 * (ol / SC - y[lv]) / 128]))
        e = vr()
        if e < best[0]: best = (e, ([w.copy() for w in Wl], [b.copy() for b in Bl]), ep)
        if ep % 5 == 0 or ep == a.epochs - 1: print('  ftd epoch %d val regret %.2f (best %.2f @%d)' % (ep, e, best[0], best[2]))
    return best[1]
# ---- n-tuple residual tables (canonical sorted columns), shrunk backfitting
def keys(rs):
    K = []
    for r in rs:
        cs = []
        for c in r['cols']:
            hard = sum(c); ace = 1 in c; soft = int(ace and hard <= 11); cs.append((min(hard + 10 * soft, 21) if c else 0, soft, len(c), int(any(x != 7 for x in c))))
        cs.sort(reverse=True); L = min(max(r['left'] - 8, 0), 9); b = min(r['busts'], 2); d = r['deck']
        tens = d[9]; aces = d[0]; small = sum(d[1:5]); mid = sum(d[5:8])
        cid = [hash(c) % (1 << 20) for c in cs]
        K.append([(0, L, b, r['stays'], min(r['streak'], 2)),                           # T0 global
                  (1, L, b, cs[0]), (1, L, b, cs[1]), (1, L, b, cs[2]), (1, L, b, cs[3]),   # T1 single column x phase
                  (2, cs[0], cs[1]), (2, cs[0], cs[2]), (2, cs[0], cs[3]), (2, cs[1], cs[2]), (2, cs[1], cs[3]), (2, cs[2], cs[3]),  # T2 pairs
                  (3, L, b, min(tens, 14), min(aces, 3), min(small // 2, 6)),           # T3 deck summary
                  (4, L, sum(1 for c in cs if c[2] == 0), sum(1 for c in cs if c[2] >= 3), sum(1 for c in cs if c[0] >= 17))])  # T4 column-count summary
    return K
class NTuple:
    """additive lookup tables over the key tuples of keys(); tables are groups of key columns sharing a table id (k[0]); damped shrunk backfitting."""
    def __init__(s, shrink): s.sh = shrink; s.theta = {}
    def fit(s, K, res, passes=8):
        nt = len(K[0]); s.theta = {}; cur = np.zeros(len(K)); groups = {}
        for j in range(nt): groups.setdefault(K[0][j][0], []).append(j)
        for p in range(passes):
            for gid, cols in groups.items():
                r = res - cur; sums = {}; cnt = {}
                for i in range(len(K)):
                    for j in cols: k = K[i][j]; sums[k] = sums.get(k, 0.0) + r[i]; cnt[k] = cnt.get(k, 0) + 1
                m = len(cols); delta = {k: sums[k] / (cnt[k] + s.sh) / m for k in sums}
                for k, d in delta.items(): s.theta[k] = s.theta.get(k, 0.0) + d
                for i in range(len(K)): cur[i] += sum(delta[K[i][j]] for j in cols)
        return s
    def predict(s, K): return np.array([sum(s.theta.get(k, 0.0) for k in kk) for kk in K])
# NOTE: tables share one dict keyed by tuples that start with the table id; backfit above is a damped sequential update (documented simplification)
tr = np.where(use & is_tr)[0]; va = np.where(use & is_val)[0]; te = np.where(use & is_hold)[0]
print('train rows %d val rows %d held-out rows %d' % (len(tr), len(va), len(te)))
if len(tr) < 50 or len(te) < 10: print('too little data'); sys.exit(0)
pred = {'champ': champ.copy()}
Wf, Bf = train_ft(tr, va); pred['ft'] = fwd(Wf, Bf, F)
Gtr = groups_of({g for g in games if g not in hold and g not in val}); Gva = groups_of(val); print('sibling groups train %d val %d' % (len(Gtr), len(Gva)))
Wd, Bd = train_sib(tr, va, Gtr, Gva); pred['ftd'] = fwd(Wd, Bd, F)
Kall = keys(rows)
best_sh = None
for sh in (a.nt_shrink,):
    nt = NTuple(sh).fit([Kall[i] for i in tr], (v - champ)[tr]); pred['ntuple'] = champ + nt.predict(Kall)
    nt2 = NTuple(sh).fit([Kall[i] for i in tr], (v - pred['ft'])[tr]); pred['ft+nt'] = pred['ft'] + nt2.predict(Kall)
# ---- value metrics (held-out games)
res = {'args': vars(a), 'rows': {'train': int(len(tr)), 'val': int(len(va)), 'heldout': int(len(te)), 'games_heldout': len(hold)}, 'value': {}, 'decision': {}}
def gse(sel, err):   # cluster-by-game mean and SE
    gg = game[sel]; ug = np.unique(gg); m = np.array([err[gg == u].mean() for u in ug]); return err.mean(), m.std(ddof=1) / np.sqrt(len(ug)) if len(ug) > 1 else float('nan')
print('\nHELD-OUT value error vs exact (points; bias = exact - model, + = model underestimates), by cards left')
for name in pred:
    res['value'][name] = {}
    for kd in ('C', 'P'):
        line = []
        for L in range(a.lmin, a.lmax + 1):
            sel = np.where(use & is_hold & (left == L) & (kind == kd))[0]
            if len(sel) < 5: continue
            e = v[sel] - pred[name][sel]; b, bs = gse(sel, e); mae = np.abs(e).mean()
            res['value'][name]['%s%d' % (kd, L)] = {'n': int(len(sel)), 'mae': float(mae), 'bias': float(b), 'bias_se': float(bs)}; line.append('%d: MAE %.0f bias %+.0f±%.0f (n=%d)' % (L, mae, b, bs, len(sel)))
        if line: print('%-7s %s rows | %s' % (name, kd, ' | '.join(line)))
    sel = np.where(te)[0]; sel = sel[kind[sel] == 'C']; e = v[sel] - pred[name][sel]; res['value'][name]['C_all'] = {'mae': float(np.abs(e).mean()), 'bias': float(e.mean())}
# ---- decision metrics
def decision_eval(gset, predv, boot=0):
    out = {}; per_game = {}
    for d in decs:
        if d['game'] not in gset: continue
        k = d['k']; reg = []; wrong = []; wts = []
        for vg in d['vals']:
            ids = [ac['cid'] for ac in vg['acts']]
            if any(c is not None and not rows[idx[c]].get('ok') for c in ids): continue
            qe = np.array([ac['dpts'] + (0.0 if ac['cid'] is None else rows[idx[ac['cid']]]['v']) for ac in vg['acts']])
            qm = np.array([ac['dpts'] + (0.0 if ac['cid'] is None else predv[idx[ac['cid']]]) for ac in vg['acts']])
            r = qe.max() - qe[int(np.argmax(qm))]; reg.append(r); wrong.append(float(r > 0.5)); wts.append(vg['n'])
        if not wts: continue
        wts = np.array(wts, float); wts /= wts.sum()
        per_game.setdefault((d['game'], k), []).append((float((wts * reg).sum()), float((wts * wrong).sum())))
    return per_game
def summarize(pg, ks):
    by = {}
    for (g, k), lst in pg.items():
        if k in ks: by.setdefault(g, []).extend(lst)
    return by
res['decision_nodes'] = len([d for d in decs if d['game'] in hold])
print('\nHELD-OUT decisions (parent position with k cards left, all next cards x all actions; 1-ply on child values): mean exact regret (pts) / wrong-move rate; n = decision positions')
ref = {}
for name in pred:
    pg = decision_eval(hold, pred[name]); res['decision'][name] = {}; line = []
    for k in range(12, 17):
        vals = [x for (g, kk), lst in pg.items() if kk == k for x in lst]
        if not vals: continue
        r = np.array([x[0] for x in vals]); wr = np.array([x[1] for x in vals]); res['decision'][name]['k%d' % k] = {'n': len(vals), 'regret': float(r.mean()), 'regret_se': float(r.std(ddof=1) / np.sqrt(len(vals))) if len(vals) > 1 else None, 'wrong': float(wr.mean())}
        line.append('k=%d: %.2f±%.2f / %.1f%% (n=%d)' % (k, r.mean(), r.std(ddof=1) / np.sqrt(len(vals)) if len(vals) > 1 else float('nan'), 100 * wr.mean(), len(vals)))
        ref.setdefault(name, {})[k] = r
    print('%-7s %s' % (name, ' | '.join(line)))
# paired regret difference vs champ per decision position, and expected points/game gain weighted by deeper16 give-up rate (bench/results/integrity_1245/deeper16_giveups.txt: calc)
GIVE = {16: 0.925, 15: 0.725, 14: 0.35, 13: 0.15, 12: 0.025}
print('\nPaired regret reduction vs champion net (points per decision position; positive = better) and expected gain per game = sum_k giveup_k * reduction_k (1-ply proxy, calc)')
pgs = {n: decision_eval(hold, pred[n]) for n in pred}
for name in pred:
    if name == 'champ': continue
    tot = 0.0; tot_var = 0.0; line = []
    for k in range(12, 17):
        keysk = [kk for kk in pgs['champ'] if kk[1] == k and kk in pgs[name]]
        if not keysk: continue
        dlt = np.array([pgs['champ'][kk][0][0] - pgs[name][kk][0][0] for kk in keysk]); m = dlt.mean(); se = dlt.std(ddof=1) / np.sqrt(len(dlt)) if len(dlt) > 1 else float('nan')
        tot += GIVE[k] * m; tot_var += (GIVE[k] * se) ** 2; line.append('k=%d %+.2f±%.2f' % (k, m, se)); res['decision'][name]['paired_k%d' % k] = {'reduction': float(m), 'se': float(se), 'n': len(dlt)}
    res['decision'][name]['expected_gain_per_game'] = float(tot); res['decision'][name]['expected_gain_se'] = float(np.sqrt(tot_var))
    print('%-7s %s | expected gain/game %+.2f ± %.2f' % (name, ' | '.join(line), tot, np.sqrt(tot_var)))
# actual deeper16 moves (on-path, not forced): exact regret of the move the champion really played at these decisions (it used exact whenever its solve finished, so this is a floor reference, not the net's regret)
act = []
for d in decs:
    if d['game'] not in hold or not d['actual'] or d['actual'].get('forced') or 'cid' not in d['actual'] and not d['actual'].get('term'): continue
    vg = next((x for x in d['vals'] if x['v'] == d['actual']['v']), None)
    if not vg: continue
    ids = [ac['cid'] for ac in vg['acts']]
    if any(c is not None and not rows[idx[c]].get('ok') for c in ids): continue
    qe = [ac['dpts'] + (0.0 if ac['cid'] is None else rows[idx[ac['cid']]]['v']) for ac in vg['acts']]
    ca = d['actual'].get('cid'); ra = rows[idx[ca]] if ca else None
    if ca and not ra.get('ok'): continue
    qa = d['actual']['dpts'] + (ra['v'] if ra else 0.0); act.append((d['k'], max(qe) - qa))
print('\nactual deeper:16 play on held-out games (non-forced moves): exact regret by k:', {k: (round(float(np.mean([r for kk, r in act if kk == k])), 2), sum(1 for kk, _ in act if kk == k)) for k in range(12, 17) if any(kk == k for kk, _ in act)})
res['actual_regret'] = {str(k): {'mean': float(np.mean([r for kk, r in act if kk == k])), 'n': sum(1 for kk, _ in act if kk == k)} for k in range(12, 17) if any(kk == k for kk, _ in act)}
# ---- Stay diagnostics (held-out games; 21 Streak add-on): does a model misprice an unused Stay?
stays_arr = np.array([r['stays'] for r in rows]); res['stay'] = {}
print('\nSTAY: bias (exact - model) of C rows with %d..%d cards left by stays_left of the position (held-out; model misprices a Stay if the bias differs between groups of otherwise similar positions)' % (a.lmin, a.lmax))
nets_by_name = {'champ': (W0, B0), 'ft': (Wf, Bf), 'ftd': (Wd, Bd)}
for name in pred:
    line = []; res['stay'][name] = {}
    for s_ in (2, 1, 0):
        sel = np.where(use & is_hold & (kind == 'C') & (stays_arr == s_))[0]
        if len(sel) < 20: continue
        e = v[sel] - pred[name][sel]; b, bs = gse(sel, e); res['stay'][name]['bias_stays%d' % s_] = {'n': int(len(sel)), 'bias': float(b), 'se': float(bs)}; line.append('stays=%d: %+.0f±%.0f (n=%d)' % (s_, b, bs, len(sel)))
    print('%-7s %s' % (name, ' | '.join(line)))
print('model-implied marginal value of one Stay (counterfactual: same position, only the stays-left input changed; held-out C rows %d..%d left, mean over rows):' % (a.lmin, a.lmax))
sel = np.where(use & is_hold & (kind == 'C'))[0]
for name, (Wl_, Bl_) in nets_by_name.items():
    out_ = {}
    for s_hi, s_lo in ((2, 1), (1, 0)):
        Fa = F[sel].copy(); Fb = F[sel].copy(); Fa[:, 5] = s_hi / 2; Fb[:, 5] = s_lo / 2
        m_ = fwd(Wl_, Bl_, Fa) - fwd(Wl_, Bl_, Fb); out_['%d_vs_%d' % (s_hi, s_lo)] = float(m_.mean())
    res['stay'].setdefault(name, {})['implied_value'] = out_; print('%-7s  stays 2 vs 1: %+.1f | 1 vs 0: %+.1f points' % (name, out_['2_vs_1'], out_['1_vs_0']))
print('Stay vs no-Stay decisions on held-out parents (12-16 cards left): for each (parent, next card) with both kinds of action: d = best Q(stay) - best Q(no stay); exact d vs model d; mispricing = model d - exact d (points); over-use = model prefers Stay by >0.5 but exact prefers no-Stay by >0.5 (share of such groups), under-use = reverse')
def stay_groups(predv):
    out = []
    for d in decs:
        if d['game'] not in hold: continue
        for vg in d['vals']:
            ids = [ac['cid'] for ac in vg['acts']]
            if any(c is not None and not rows[idx[c]].get('ok') for c in ids): continue
            st_ = [ac for ac in vg['acts'] if ac['mv'][0] >= 0]; no_ = [ac for ac in vg['acts'] if ac['mv'][0] < 0]
            if not st_ or not no_: continue
            q = lambda ac, pv: ac['dpts'] + (0.0 if ac['cid'] is None else pv[idx[ac['cid']]])
            ex = lambda ac: ac['dpts'] + (0.0 if ac['cid'] is None else rows[idx[ac['cid']]]['v'])
            dex = max(ex(x) for x in st_) - max(ex(x) for x in no_); dm = max(q(x, predv) for x in st_) - max(q(x, predv) for x in no_)
            out.append((d['game'], d['k'], vg['n'], dex, dm))
    return out
for name in pred:
    g_ = stay_groups(pred[name]); res['stay'][name]['decisions'] = {}
    if not g_: print(name, 'no stay groups'); continue
    arr = np.array([(x[1], x[2], x[3], x[4]) for x in g_]); games_ = np.array([x[0] for x in g_])
    mis = arr[:, 3] - arr[:, 2]; ug = np.unique(games_); gm = np.array([mis[games_ == u].mean() for u in ug]); se_ = gm.std(ddof=1) / np.sqrt(len(ug))
    over = ((arr[:, 3] > 0.5) & (arr[:, 2] < -0.5)).mean(); under = ((arr[:, 3] < -0.5) & (arr[:, 2] > 0.5)).mean(); exs = (arr[:, 2] > 0.5).mean()
    regret = np.where(arr[:, 3] > 0, np.maximum(-arr[:, 2], 0), np.maximum(arr[:, 2], 0)).mean()
    res['stay'][name]['decisions'] = {'n': int(len(g_)), 'mispricing': float(mis.mean()), 'se': float(se_), 'overuse': float(over), 'underuse': float(under), 'exact_prefers_stay': float(exs), 'stay_vs_nostay_regret': float(regret)}
    print('%-7s n=%d groups | exact prefers Stay in %.1f%% | mispricing (model d - exact d) %+.1f ± %.1f | over-use %.1f%% under-use %.1f%% | regret of the Stay-vs-no-Stay side choice %.2f pts' % (name, len(g_), 100 * exs, mis.mean(), se_, 100 * over, 100 * under, regret))
os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True); json.dump(res, open(a.out, 'w'), indent=1)
def champ_format(Wl, Bl): return {'scale': SC, 'layers': [{'nIn': int(w.shape[1]), 'nOut': int(w.shape[0]), 'W': [float(x) for x in w.reshape(-1)], 'b': [float(x) for x in b]} for w, b in zip(Wl, Bl)]}   # same layout as ship_nn.json's "nn" (row-major W[o*nIn+i])
if a.save_model:
    json.dump(champ_format(Wf, Bf), open(a.save_model + '_ft.json', 'w')); json.dump(champ_format(Wd, Bd), open(a.save_model + '_ftd.json', 'w'))
    json.dump(sorted(map(int, hold)), open(a.save_model + '_hold.json', 'w'))
