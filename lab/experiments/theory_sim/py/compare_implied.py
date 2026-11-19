import csv, math, collections, json, sys
def ms(x):
    n=len(x); m=sum(x)/n
    return m, (math.sqrt(sum((a-m)**2 for a in x)/(n-1)/n) if n>1 else float('nan'))
R=collections.defaultdict(list)
for r in csv.DictReader(open('data/implied.csv')): R[int(r['rem'])].append({k:float(v) for k,v in r.items()})
roll=json.load(open('data/roll_summary.json'))
print("NETWORK-IMPLIED (champion fast policy's own search value, mean over next card) vs MEASURED differences at the same kind of position (stays=2,busts=0)")
print("rem | n  | implied: stay2->1 | stay1->0 | bust0->1 | bust1->2 || measured(rollout): stay2->1 | stay1->0 | bust0->1 | bust1->2")
for rem in sorted(R):
    X=R[rem]
    d=lambda a,b:ms([x[a]-x[b] for x in X])
    imp=[d('V20','V10'),d('V10','V00'),d('V20','V21'),d('V21','V22')]
    row=f"{rem:3d} | {len(X):3d} | "+" | ".join(f"{m:6.0f}±{s:3.0f}" for m,s in imp)
    if str(rem) in roll:
        t=roll[str(rem)]; ks=['stay2->1','stay1->0','bust0->1','bust1->2']
        row+=" || "+" | ".join(f"{t[k][0]:6.0f}±{t[k][1]:3.0f}" for k in ks)
    print(row)
