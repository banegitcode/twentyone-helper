# python3 js/pooled_tables.py : tables for the pooled-clock section
import json, glob, statistics as S
def q(a, f): a = sorted(a); return a[min(len(a) - 1, int(f * (len(a) - 1) + 1e-9))]
rows = json.load(open('results/first_move_K16_18.json'))
print('## first exact move, champion-like positions, logCap 26 (cap 47.0M positions), CPU ms (loaded box)')
print('K | n | finished | positions of finished (min/med/max) | CPU s of finished (min/med/max) | DNF (>47M positions, CPU s spent)')
for K in (16, 17, 18):
    r = [x for x in rows if x['K'] == K]; ok = [x for x in r if not x['dnf']]; bad = [x for x in r if x['dnf']]
    f = lambda a, d=1: '%.1f/%.1f/%.1f' % (min(a) / d, S.median(a) / d, max(a) / d) if a else '-'
    print(K, len(r), '%d/%d' % (len(ok), len(r)), f([x['positions'] for x in ok], 1e6) + ' M', f([x['cpuMs'] for x in ok], 1000), '%d (%s)' % (len(bad), ', '.join('%.0f' % (x['cpuMs'] / 1000) for x in bad)))
try:
    r2 = json.load(open('results/first_move_K17_logCap27.json'))
    print('## K=17 positions 3-5 at logCap 27 (cap 94M positions):'); [print(' ', x['id'], 'dnf' if x['dnf'] else 'ok', x['positions'], '%.0f s CPU' % (x['cpuMs'] / 1000), 'rss', x['rssMB']) for x in r2]
except Exception as e: print('no logCap27 file', e)
print('## per-game think time of pooled configs (4 set1000 games each unless noted)')
for f in sorted(glob.glob('results/think_pooled*.jsonl')):
    g = [json.loads(l) for l in open(f)]
    print(f.split('/')[-1], 'games', len(g), 'CPU think s', [round(x['thinkMs'] / 1000) for x in g], 'wall think s', [round(x['thinkWallMs'] / 1000) for x in g], 'first exact positions M', [round((x['firstExactPositions'] or 0) / 1e6, 1) for x in g], 'give-ups mem/clock', [(x['giveUpMemory'], x['giveUpClock']) for x in g], 'max RSS MB', max(x['rssMB'] for x in g))
