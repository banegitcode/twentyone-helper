import sys, json
sys.path.insert(0,'/workspace/21lab/bench')
import harness as H
N=int(sys.argv[1]); spec=sys.argv[2]
cp,_=H._cache_path("cmd:node champion/champion_adapter.js --config shipped52","set1000",1,1,None)
ref=json.load(open(cp))["rows"][:N]
r=H.run_engine(spec,"set1000",int(sys.argv[3]) if len(sys.argv)>3 else 3,limit=N)
rows=[list(x) for x in r["rows"]]
same=sum(1 for a,b in zip(rows,ref) if a[1:]==b[1:])
print(f"{spec}: {same}/{N} games identical (score,busts,perfect,ncards) to cached shipped52; wall {r['wall']:.0f}s")
for a,b in zip(rows,ref):
    if a[1:]!=b[1:]: print("DIFF",a,b)
