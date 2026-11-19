import json, collections, sys
mv=[]; ends={}
for l in open('data/all.jsonl'):
    if l.startswith('{"t":"mv"'): mv.append(json.loads(l))
    elif l.startswith('{"t":"end"'):
        d=json.loads(l); ends[d['seed']]=d
G=len(ends)
print("games",G)
# stay usage by cards-left bucket
bk=lambda rem: '52-41' if rem>41 else '40-31' if rem>31 else '30-21' if rem>21 else '20-13' if rem>13 else '12-7' if rem>6 else '6-1'
use=collections.Counter(); opp=collections.Counter()
ctx=collections.Counter(); ctxuse=collections.Counter()
nostay_by_game=collections.Counter()
per_game=collections.defaultdict(list)
for m in mv:
    b=bk(m['rem'])
    used = m['stay']>=0
    if used: use[b]+=1; per_game[m['seed']].append(m)
    if m['stays']>0: opp[b]+=1
    # context: number of plain placements that bust vs scoring
    if m['stays']>0:
        key=(m['plainBust'], 'score' if m['plainScore']>0 else 'noscore')
        ctx[key]+=1
        if used: ctxuse[key]+=1
print("Stay usage by cards-left bucket (events/game):", {k:round(use[k]/G,3) for k in ['52-41','40-31','30-21','20-13','12-7','6-1']})
print("stays used per game:", sum(use.values())/G, "; games using 0/1/2 stays:", collections.Counter(len(per_game[s]) for s in ends))
print("\nContext: (#columns where this card busts [of 4 plain placements], any plain placement scores?) -> P(stay used | stay available)")
for k in sorted(ctx):
    print(f"  bust-cols={k[0]} {k[1]:8s} n={ctx[k]:6d} P(use stay)={ctxuse[k]/ctx[k]:.3f}")
# when stays were used: rem distribution and busts at the time, plainBust
rems=[m['rem'] for s in per_game for m in per_game[s]]
import statistics as st
print("\nrem (cards left, incl. current) when a Stay was used: mean %.1f median %.1f; quartiles %s"%(st.mean(rems), st.median(rems), st.quantiles(rems,n=4)))
print("fraction of stay uses when ALL 4 plain placements bust:", sum(1 for s in per_game for m in per_game[s] if m['plainBust']==4)/len(rems))
print("fraction when >=3 plain placements bust:", sum(1 for s in per_game for m in per_game[s] if m['plainBust']>=3)/len(rems))
print("fraction when a plain placement scores:", sum(1 for s in per_game for m in per_game[s] if m['plainScore']>0)/len(rems))
# unused stays at game end (alive games)
unused=collections.Counter()
for s,e in ends.items():
    if e['busts']<3: unused[2-len(per_game[s])]+=1
print("unused stays at end among games finishing 52 cards:", {k:round(v/sum(unused.values()),3) for k,v in sorted(unused.items())})
# breakdown by first/second stay timing
t1=[ sorted(per_game[s],key=lambda m:-m['rem'])[0]['rem'] for s in per_game if len(per_game[s])>=1]
t2=[ sorted(per_game[s],key=lambda m:-m['rem'])[1]['rem'] for s in per_game if len(per_game[s])>=2]
print("first stay at rem mean %.1f; second at rem mean %.1f"%(st.mean(t1), st.mean(t2)))
