#!/bin/bash
# merge run files (snapshot of what exists now; the last line of a file may be mid-write -> drop it) and featurize
cd "$(dirname "$0")/data"
for r in pos dec; do cat run1.$r.jsonl run2.$r.jsonl | python3 -c "
import sys,json
out=[]
for l in sys.stdin:
    try: json.loads(l); out.append(l)
    except Exception: pass
sys.stdout.write(''.join(out))" > all.$r.jsonl; done
node ../featurize_rows.js all.pos.jsonl all.feat.f32
wc -l all.pos.jsonl all.dec.jsonl
