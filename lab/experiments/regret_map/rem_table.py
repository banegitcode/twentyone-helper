import json, glob, math, collections
ex = {}
for f in glob.glob('ex_[0-9].jsonl') + glob.glob('ex12_[0-9].jsonl') + glob.glob('exR_[0-9].jsonl'):
    for l in open(f):
        r = json.loads(l); k = (r['g'], r['step'])
        if k not in ex or 'failed' in ex[k]: ex[k] = r
ok = {k: r for k, r in ex.items() if 'failed' not in r}
print('| cards left | decisions | decisions with regret>0.01 | regret/game | SE | max single regret |')
for rem in (12, 11, 10, 9):
    per = collections.defaultdict(float); n = 0; npos = 0; mx = 0
    for (g, s), r in ok.items():
        if r['rem'] == rem: per[g] += r['regret']; n += 1; npos += r['regret'] > 0.01; mx = max(mx, r['regret'])
    v = [per.get(g, 0) for g in range(200)]; m = sum(v) / 200; se = math.sqrt(sum((x - m) ** 2 for x in v) / 199 / 200)
    print('| %d | %d | %d | %.1f | %.1f | %.0f |' % (rem, n, npos, m, se, mx))
allr = sorted((r['regret'] for r in ok.values()), reverse=True)
tot = sum(allr); print('total exact regret (<=12 cards) per game %.1f; number of decisions with regret>0.01: %d; top 10 decisions share %.0f%%, top 25 %.0f%%, top 50 %.0f%%' % (tot / 200, sum(1 for x in allr if x > 0.01), 100 * sum(allr[:10]) / tot, 100 * sum(allr[:25]) / tot, 100 * sum(allr[:50]) / tot))
pos = [x for x in allr if x > 0.01]; print('median positive regret %.0f, mean %.0f' % (sorted(pos)[len(pos) // 2], sum(pos) / len(pos)))
# champion-exact flag vs regret
a = sum(r['regret'] for r in ok.values() if r['champExactFlag']); b = sum(r['regret'] for r in ok.values() if not r['champExactFlag'])
print('regret in decisions where champion used its exact solver: %.2f /game ; where it fell back: %.1f /game' % (a / 200, b / 200))
