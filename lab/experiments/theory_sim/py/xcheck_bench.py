"""Replay theory_sim/Landon-engine traces (js/xcheck_trace.txt + js/decks_1_6k.txt) in the BENCH reference simulator (bench/refsim.py)
and compare per-move points and the final score.  python3 py/xcheck_bench.py [maxgames]"""
import sys; sys.path.insert(0, '/workspace/21lab/bench')
from refsim import Game
decks = {}
for l in open('js/decks_1_6k.txt'):
    v = list(map(int, l.split())); decks[v[0]] = v[1:]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
bad = n = 0
for l in open('js/xcheck_trace.txt'):
    head, moves = l.split(' | '); h = list(map(int, head.split())); seed = h[0]
    g = Game(decks[seed]); ok = True
    for i, m in enumerate(moves.split()):
        stay, col, pts, bust = map(int, m.split(','))
        b0 = g.busts
        p = g.step(stay if stay >= 0 else None, col)
        if p != pts or int(g.busts > b0) != bust: ok = False; print('seed', seed, 'move', i, 'mismatch', p, pts); break
    if ok and g.final_score != h[1]: ok = False; print('seed', seed, 'final mismatch', g.final_score, h[1])
    bad += (not ok); n += 1
    if n >= N: break
print(f'replayed {n} games in bench refsim: mismatches {bad}')
