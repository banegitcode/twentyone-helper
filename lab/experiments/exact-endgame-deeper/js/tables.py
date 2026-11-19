# python3 js/tables.py : final tables from the timing logs (works on partial logs too)
import re
def parse(files):
    R = {}
    for f in files:
        for l in open(f):
            m = re.match(r'(\d+) (\d+) solve (?:(\d+) (\d+)ms|DNF) \| choose (?:(\d+) (\d+)ms|DNF)', l)
            if m:
                N = int(m[1]); R.setdefault(N, []).append(tuple(float(x) if x else float('inf') for x in m.groups()[2:]))
    return R
def q(a, f):
    a = sorted(a); return a[min(len(a) - 1, int(f * (len(a) - 1) + 1e-9))]
BUD = 3.2e6
for name, files in (('mine (Referee expect1 baseline policy, dev200)', ['results/t_exact2_mine_10_14.log', 'results/t_exact2_mine_15_16.log']), ("his (champion's shipped policy positions, results/z_positions.json)", ['results/t_exact2_his_12_14.log'])):
    print('##', name); print('N | n | solve states med/p90/max | solve CPU-ms med/p90/max | choose states med/p90/max | choose CPU-ms med/p90/max | share whose choose() fits 3.2M positions')
    for N, rows in sorted(parse(files).items()):
        ss = [r[0] for r in rows]; sm = [r[1] for r in rows]; cs = [r[2] for r in rows]; cm = [r[3] for r in rows]
        f = lambda a: '%d/%d/%d' % (q(a, .5), q(a, .9), max(a))
        print(N, len(rows), f(ss), f(sm), f(cs), f(cm), '%d/%d' % (sum(c <= BUD for c in cs), len(cs)))
