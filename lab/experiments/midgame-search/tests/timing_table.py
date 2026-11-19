import json,sys,statistics as st
for f in sys.argv[1:]:
    r=[json.loads(l) for l in open(f)]
    t=sorted(x['thinkCpuMs']/1000 for x in r); n=len(t)
    p95=t[min(n-1,int(0.95*n))]
    mv=max(x['maxMoveMs'] for x in r)/1000; rss=max(x['rssMB'] for x in r)
    s=[x['search'] for x in r]
    ee=sum(x['extraEvals'] for x in s)/n; be=sum(x['baseEvals'] for x in s)/n
    ex=sum(x['extraMoves'] for x in s)/n; ab=sum(x['extraAborted'] for x in s)/n; ch=sum(x['changed'] for x in s)/n
    slow=max(r,key=lambda x:x['maxMoveMs'])
    print(f"{f.split('/')[-1]}: n={n} think cpu s mean {st.mean(t):.1f} median {st.median(t):.1f} p95 {p95:.1f} max {t[-1]:.1f} | slowest move {mv:.2f}s (rem {slow['slowRem']}) | rss max {rss}MB | per game: extra-pass moves {ex:.1f}, aborted {ab:.2f}, changed moves {ch:.2f}, extra evals {ee:,.0f}, champion-search evals {be:,.0f}")
