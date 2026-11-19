import json, glob, math, sys, csv, collections
def ms(x):
    n=len(x); m=sum(x)/n
    if n<2: return m, float('nan')
    v=sum((a-m)**2 for a in x)/(n-1); return m, math.sqrt(v/n)
names=['(s2,b0)','(s1,b0)','(s0,b0)','(s2,b1)','(s2,b2)']
print("PAIRED ROLLOUTS (same random orders of the remaining deck), policy = Landon's fast network player (1-card lookahead, exact last 4).")
print("Positions: champion-like, stays=2, busts=0.  Values = mean future points. diffs = paired mean ± SE (SE clustered by position)")
tab={}
for rem in (36,24,16):
    fs=glob.glob(f'data/roll_{rem}_*.json')
    if not fs: continue
    res=[]
    for f in fs: res+=json.load(open(f))['results']
    # per-position mean over rollouts for each variant (cluster-robust SE across positions)
    P=len(res); 
    pm=[[sum(r['per'][v])/len(r['per'][v]) for v in range(5)] for r in res]
    mean=[sum(p[v] for p in pm)/P for v in range(5)]
    def diff(a,b):
        d=[p[a]-p[b] for p in pm]; return ms(d)
    # within-position paired SE using all rollouts (more efficient): treat positions as clusters
    out={}
    out['stay2->1']=diff(0,1); out['stay1->0']=diff(1,2); out['stay2->0']=diff(0,2); out['bust0->1']=diff(0,3); out['bust1->2']=diff(3,4)
    tab[rem]=out
    nroll=len(res[0]['per'][0])
    print(f"\nrem={rem} positions={P} rollouts/pos={nroll}: mean future pts "+", ".join(f"{n}={m:.0f}" for n,m in zip(names,mean)))
    for k,(m,s) in out.items(): print(f"   {k:10s} {m:8.1f} ± {s:5.1f}")
json.dump({str(k):v for k,v in tab.items()}, open('data/roll_summary.json','w'))
