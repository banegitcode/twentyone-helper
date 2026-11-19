import sys, csv, math, collections
def load(fn):
    rows=[]
    for r in csv.DictReader(open(fn)):
        rows.append({k:float(v) for k,v in r.items()})
    return rows
def ms(x):
    n=len(x)
    if n<2: return (x[0] if x else float('nan'), float('nan'))
    m=sum(x)/n; v=sum((a-m)**2 for a in x)/(n-1); return m, math.sqrt(v/n)
def fmt(x): m,s=ms(x); return f"{m:7.1f}±{s:4.1f}"
files=sys.argv[1:]
rows=[]
for f in files: rows+=load(f)
by=collections.defaultdict(list)
for r in rows: by[int(r['rem'])].append(r)
print("EXACT values at champion-like positions (positions from js/gen_positions.js, seeds 3,000,000+). mean±SE over positions; n=positions")
print("\n[STAY] marginal value of a Stay = V(stays=s)-V(stays=s-1) at the same position (all else equal), exact expectimax")
print(" rem |   n  | stays=2 pos: V2-V1 | stays=2: V1-V0 | stays=1 pos: V1-V0 | stays=2: V2-V0 | share of pos with V1-V0>=1 (stays=1)")
for rem in sorted(by):
    R=by[rem]
    s2=[r for r in R if r['stays']==2]; s1=[r for r in R if r['stays']==1]
    d21=[r['Vs2']-r['Vs1'] for r in s2]; d10b=[r['Vs1']-r['Vs0'] for r in s2]; d20=[r['Vs2']-r['Vs0'] for r in s2]
    d10=[r['Vs1']-r['Vs0'] for r in s1]
    sh=sum(1 for x in d10 if x>=1)/max(1,len(d10))
    print(f" {rem:3d} | {len(R):4d} | {fmt(d21) if d21 else '   n/a':>18} | {fmt(d10b) if d10b else 'n/a':>14} | {fmt(d10) if d10 else 'n/a':>18} | {fmt(d20) if d20 else 'n/a':>14} | {sh:.2f}  (n2={len(s2)}, n1={len(s1)})")
print("\n[BUSTS] value of a 'life': positions with 0 busts, stays as played.  V(b)-V(b+1) at the same position")
print(" rem |  n0  | V0-V1 (with PB)  | V1-V2 (with PB) | V0-V1 NO-PB game | V1-V2 NO-PB | => PB part of V0-V1 | V0-V2 | P-ish: PB part/1000")
for rem in sorted(by):
    R=[r for r in by[rem] if r['busts']==0]
    if not R: continue
    a=[r['Vb0']-r['Vb1'] for r in R]; b=[r['Vb1']-r['Vb2'] for r in R]
    c=[r['Wb0']-r['Wb1'] for r in R]; d=[r['Wb1']-r['Wb2'] for r in R]
    pb=[(r['Vb0']-r['Vb1'])-(r['Wb0']-r['Wb1']) for r in R]; e=[r['Vb0']-r['Vb2'] for r in R]
    print(f" {rem:3d} | {len(R):4d} | {fmt(a):>16} | {fmt(b):>15} | {fmt(c):>16} | {fmt(d):>11} | {fmt(pb):>19} | {fmt(e):>7}| {ms(pb)[0]/1000:.2f}")
print("\n[VALUE LEFT] mean expected points still to come V (actual busts/stays), by actual busts")
print(" rem | b=0 (n)       | b=1 (n)       | b=2 (n)")
for rem in sorted(by):
    out=[]
    for b in (0,1,2):
        R=[r['Vb%d'%b] for r in by[rem] if r['busts']==b]
        out.append(f"{fmt(R) if R else 'n/a':>13} ({len(R):4d})")
    print(f" {rem:3d} | "+" | ".join(out))
