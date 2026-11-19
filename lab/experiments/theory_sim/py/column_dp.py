"""Single-column 'aspiration' DP (labeled APPROXIMATION, not the real game).
One column in isolation; cards are i.i.d. with the given composition; each card can be ADDED to the column or DUMPED
(dumped = placed on one of the other three columns; opportunity cost d points, a parameter).
Clearing the column pays 400 (21) / 600 (three 7s) / 800 (5 cards) / 1000 (5 cards = 21) plus `bonus` (stand-in for the
average streak bonus per clear). Busts are never chosen (dumping is always possible) -> no bust term.
f_n(state) = expected points from this column over the n cards still to come, net of dump costs.
"""
import sys, itertools, functools, json
P_FULL = {r: 4/52 for r in range(1, 10)}; P_FULL[10] = 16/52

def step(state, r):
    """state=(n,hard,ace,s7) -> ('clear',pts) | ('bust',) | ('go',newstate)"""
    n, h, a, s7 = state
    h2 = h + r; n2 = n + 1; a2 = a or r == 1
    all7 = (n == 0 or s7) and r == 7
    if h2 > 21: return ('bust',)
    t = h2 + 10 if (a2 and h2 + 10 <= 21) else h2
    if t == 21: return ('clear', 600 if (n2 == 3 and all7) else (1000 if n2 == 5 else 400))
    if n2 == 5: return ('clear', 800)
    a3 = a2 if h2 <= 11 else False
    s73 = all7 and h2 == 7 * n2 and not a3
    return ('go', (n2, h2, a3, s73))

def solve(N, d, bonus=0.0, p=P_FULL, p777_bonus=600):
    # states reachable
    states = set(); frontier = [(0, 0, False, False)]
    while frontier:
        s = frontier.pop()
        if s in states: continue
        states.add(s)
        for r in range(1, 11):
            o = step(s, r)
            if o[0] == 'go': frontier.append(o[1])
    f = [{s: 0.0 for s in states}]
    empty = (0, 0, False, False)
    pol = [{}]
    for n in range(1, N + 1):
        prev = f[-1]; cur = {}; pl = {}
        for s in states:
            tot = 0.0
            for r in range(1, 11):
                o = step(s, r)
                dump = -d + prev[s]
                if o[0] == 'bust': add = -1e9
                elif o[0] == 'clear':
                    pts = o[1] if not (o[1] == 600) else p777_bonus
                    add = pts + bonus + prev[empty]
                else: add = prev[o[1]]
                tot += p[r] * max(add, dump)
            cur[s] = tot
        f.append(cur)
    return f, states

def pretty(s):
    n, h, a, s7 = s
    tot = h + 10 if (a and h + 10 <= 21) else h
    return f"{n}c/{tot}{'s' if a and h+10<=21 else ''}"

if __name__ == '__main__':
    out = {}
    N = 40
    for d in (25, 75, 150):
        for bonus in (0, 100):
            f, states = solve(N, d, bonus)
            out[(d, bonus)] = f
    # --- Table 1: value of key column states (d=75, bonus=100, horizon 30 cards)
    f, states = solve(30, 75, 100)
    F = f[30]
    print("== T1: f_30(state) in points, d=75, bonus=100 (value of holding this column state, 30 cards to go)")
    print("empty column:", round(F[(0,0,False,False)]))
    for n in (1, 2, 3, 4):
        row = []
        for t in range(2, 21):
            for a in (False, True):
                s = [x for x in states if x[0] == n and not x[3] and ((x[2] == a and x[1] == t) if not a else (x[2] and x[1] + 10 == t))]
                if s: row.append(f"{t}{'s' if a else ''}:{round(F[s[0]])}")
        print(f"{n} cards:", " ".join(row))
    # --- Table 2: hold-vs-take.  card completes 21 (400+bonus) vs decline and keep column
    print("\n== T2: decline-vs-take a completing card.  advantage of declining = (-d + f_{k-1}(s)) - (400+bonus+f_{k-1}(empty))  [k cards left incl. this one]")
    for (d, bonus) in ((75, 100), (150, 100), (25, 100)):
        f, states = solve(30, d, bonus)
        print(f"d={d} bonus={bonus}")
        for k in (30, 15, 8, 4):
            res = []
            for s in sorted(states):
                n, h, a, s7 = s
                if n == 0 or n == 4: continue   # 4-card completing card = 1000 (handled below)
                for r in range(1, 11):
                    o = step(s, r)
                    if o[0] == 'clear' and o[1] == 400:
                        adv = (-d + f[k-1][s]) - (400 + bonus + f[k-1][(0,0,False,False)])
                        res.append((adv, pretty(s), r))
            res.sort(reverse=True)
            best = res[0]
            npos = sum(1 for x in res if x[0] > 0)
            print(f"  k={k:2d}: states where declining a 400-completion beats taking it: {npos}/{len(res)}; best advantage {best[0]:+.0f} at {best[1]} + card {best[2]}")
        print()
    # --- Table 3: 5-card column potential
    print("== T3: P(5th card is a safe 800+) etc for 4-card states, and f for 4-card states (d=75,bonus=100,k=30 vs k=6)")
    f, states = solve(30, 75, 100)
    for s in sorted(states):
        n, h, a, s7 = s
        if n != 4: continue
        t = h + 10 if (a and h + 10 <= 21) else h
        safe = sum(P_FULL[r] for r in range(1, 11) if step(s, r)[0] != 'bust')
        print(f"  4c total {pretty(s)}: P(5th card does not bust)={safe:.2f}  f30={f[30][s]:.0f} f6={f[6][s]:.0f}")
    # --- Table 4: 777
    print("\n== T4: three-7s: value of the +200 premium (600 vs 400), column states (7) and (7,7), d=75,bonus=100")
    for k in (30, 15, 8):
        fa, _ = solve(k, 75, 100); fb, _ = solve(k, 75, 100, p777_bonus=400)
        s1 = (1, 7, False, True); s2 = (2, 14, False, True); s2b = (2, 14, False, False)
        print(f"  k={k}: f(7)  with600={fa[k][s1]:.1f} with400={fb[k][s1]:.1f} premium={fa[k][s1]-fb[k][s1]:.1f}; f(7,7) with600={fa[k][s2]:.1f} with400={fb[k][s2]:.1f} premium={fa[k][s2]-fb[k][s2]:.1f}; f(10+4 style 2c/14)={fa[k][s2b]:.1f}")
    # 777 with realistic depletion: 3 sevens left among 51 -> p7 = 3/51 for first card; use p7=3/46 (cards ~46 left)
    p = dict(P_FULL); 
    print("  card-count note: value of premium depends on p7; P(7,7,7 in a given column in order from a fresh column)= tiny. See T4b")

def list_decline_states(d, bonus, k):
    f, states = solve(30, d, bonus)
    out = []
    for s in sorted(states):
        n, h, a, s7 = s
        if n == 0 or n == 4: continue
        for r in range(1, 11):
            o = step(s, r)
            if o[0] == 'clear' and o[1] == 400:
                adv = (-d + f[k-1][s]) - (400 + bonus + f[k-1][(0,0,False,False)])
                if adv > 0: out.append((round(adv), pretty(s), (h, a), r))
    return out
