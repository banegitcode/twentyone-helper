# python3 js/ub_diag.py results/t_*.json  : tightness of the best "resource" upper bound (LP dual) against exact values.
# Resource bound: every clear of a column is a multiset of cards worth p points (no streak). Give each card value v a price y_v>=0
# with sum(y over the clear) >= p for every possible clear; then base points <= sum_v y_v * (cards of value v in columns+deck).
# Minimising over y gives the tightest such bound (LP).  UB_total = LP + (1000 if busts==0) + streak allowance.
import sys, json, itertools
import numpy as np
from scipy.optimize import linprog
def clears():
    best = {}
    def rec(seq, hard, ace):
        n = len(seq)
        if n >= 1:
            total = hard + 10 if ace and hard + 10 <= 21 else hard
            if hard > 21: return
            p = 0
            if total == 21: p = 1000 if n == 5 else (600 if n == 3 and all(x == 7 for x in seq) else 400)
            elif n == 5: p = 800
            if p:
                key = tuple(sorted(seq)); best[key] = max(best.get(key, 0), p); return
        if n == 5: return
        for v in range(1, 11): rec(seq + [v], hard + v, ace or v == 1)
    rec([], 0, False); return best
CL = clears()
A = np.zeros((len(CL), 10)); b = np.zeros(len(CL))
for i, (k, p) in enumerate(CL.items()):
    for v in k: A[i, v - 1] += 1
    b[i] = p
def rebuild(col):
    n, hard, ace, a7 = col
    if not n: return []
    if a7: return [7] * n
    out = []; rest = hard
    if ace: out.append(1); rest -= 1
    left = n - len(out)
    for i in range(left):
        s = rest // (left - i); s = max(s, 2) if rest >= 2 * (left - i) else s; out.append(s); rest -= s
    return out
pos = {}
for l in open('positions/dev200_expect1.txt'):
    t = list(map(int, l.split())); pos[(t[0], t[1])] = t
rows = []
for f in sys.argv[1:]:
    for r in json.load(open(f))['rows']:
        if r.get('value') is None: continue
        t = pos[(r['id'], r['N'])]; N = t[1]; busts = t[2]; cur = t[5]
        avail = np.array(t[22:32], float); avail[cur - 1] += 1
        for j in range(4):
            for v in rebuild(t[6 + 4 * j: 10 + 4 * j]): avail[v - 1] += 1
        res = linprog(avail, A_ub=-A, b_ub=-b, bounds=[(0, None)] * 10, method='highs')
        ub = res.fun * (1 + 437.5 / 400) + (1000 if busts == 0 else 0)   # sound: streak bonus <= 437.5 per clear (a run of 4 pays 1750), clears <= LP/400
        rows.append((N, r['value'], res.fun, ub))
print('N  n  median V   median LP(base only)  median sound UB   median ratio UB/V')
for N in sorted(set(x[0] for x in rows)):
    s = [x for x in rows if x[0] == N]
    print(N, len(s), round(np.median([x[1] for x in s])), round(np.median([x[2] for x in s])), round(np.median([x[3] for x in s])), round(np.median([x[3] / max(x[1], 1) for x in s]), 2), 'min ratio', round(min(x[3] / max(x[1], 1) for x in s), 2))

# ---- root action pruning: how many root actions have p + UB(child) <= best exact Q (i.e. could be skipped without search)?
import os
if os.path.exists('results/q_dump.json'):
    SBt = [0, 0, 250, 500, 1000, 2000]
    def play(cols, x, stay, j, streak):
        cols = [list(c) for c in cols]
        if stay >= 0: cols[stay] = []
        cols[j].append(x); hard = sum(cols[j]); ace = 1 in cols[j]; n = len(cols[j])
        tot = hard + 10 if ace and hard + 10 <= 21 else hard; p = 0; scored = False
        if hard > 21: cols[j] = []; return cols, 0, 0, True
        if tot == 21: p = 1000 if n == 5 else (600 if n == 3 and all(c == 7 for c in cols[j]) else 400); scored = True
        elif n == 5: p = 800; scored = True
        if scored: cols[j] = []; streak += 1; return cols, p + SBt[min(streak, 5)], streak, False
        return cols, 0, 0, False
    tot = pr = 0; ratios = []
    for e in json.load(open('results/q_dump.json')):
        t = pos[(e['id'], e['N'])]; cur = t[5]; busts = t[2]; streak0 = t[4]
        cols = [rebuild(t[6 + 4 * j: 10 + 4 * j]) for j in range(4)]
        deck = np.array(t[22:32], float)
        bestq = max(a['value'] for a in e['q'])
        for a in e['q']:
            cc, p, st, bust = play(cols, cur, a['stay'], a['col'], streak0)
            av = deck.copy()
            for c in cc:
                for v in c: av[v - 1] += 1
            res = linprog(av, A_ub=-A, b_ub=-b, bounds=[(0, None)] * 10, method='highs')
            ub = p + res.fun * (1 + 437.5 / 400) + (1000 if busts + (1 if bust else 0) == 0 else 0)
            tot += 1; pr += ub <= bestq; ratios.append(ub / max(a['value'], 1))
    print('root actions', tot, 'prunable by p+UB(child) <= best Q:', pr, 'median UB(child)+p over true Q', round(float(np.median(ratios)), 2))
