#!/usr/bin/env python3
# Aggregate label.js outputs (tp/*.out) into labels per CPU-hour per cards-left level.  usage: aggregate_throughput.py tp/cold.out tp/seq0.out tp/seq1.out tp/deep_a.out ...
import json,sys,collections,statistics as S
def rows(f): return [json.loads(l) for l in open(f) if l.strip()]
def table(files,title):
    by=collections.defaultdict(list)
    for f in files:
        for r in rows(f): by[r['n']].append(r)
    print('###',title)
    print('| cards left | lines | labels ok | CPU s per line (median / mean / max) | new positions M per line (median) | labels per CPU-hour (ok labels / all CPU incl. failed lines) |')
    print('|---|---|---|---|---|---|')
    for n in sorted(by):
        rs=by[n]; ok=[r for r in rs if r['ok']]; cpu=[r['cpu_ms']/1000 for r in rs]; pos=[(r.get('pos') or 0)/1e6 for r in rs]
        tot=sum(cpu); lph=(len(ok)/tot*3600) if tot>0 else float('inf')
        print(f"| {n} | {len(rs)} | {len(ok)} | {S.median(cpu):.3f} / {S.mean(cpu):.3f} / {max(cpu):.1f} | {S.median(pos):.2f} | {lph:,.0f} |")
if __name__=='__main__':
    mode=sys.argv[1]; table(sys.argv[2:],mode)
