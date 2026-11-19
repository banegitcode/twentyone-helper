import json,glob,csv,collections
rows={int(r['game']):r for r in csv.DictReader(open('../../bench/results/20261118_140459_cmd_shipped52_vs_cmd_exact13.csv'))}
sc={};dec=collections.defaultdict(list)
for f in glob.glob('s1k_exact13_*.jsonl'):
    for l in open(f):
        d=json.loads(l)
        if d['t']=='end': sc[d['g']]=d['score']
        else: dec[d['g']].append(d)
mm=[g for g in sc if sc[g]!=int(rows[g]['b_score'])]
print('my exact13 vs Referee b_score: games %d, mismatches %d'%(len(sc),len(mm)),mm[:10])
fb=collections.Counter();tot=collections.Counter()
for g in sc:
    for d in dec[g]:
        if d['rem']<=13: tot[d['rem']]+=1; fb[d['rem']]+=(not d['exact'])
print('non-exact answers at <=13:',dict(fb),'of',sum(tot.values()))
