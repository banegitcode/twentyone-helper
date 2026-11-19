#!/bin/bash
# plumbing run (NOT evidence): dev200 games 0-39, 2 workers, nice 19; A = frozen deeper:16, B = the given midsearch config
cd /workspace/21lab/bench
A="cmd:node frozen/exact-endgame-deeper@90c2d73f938b/experiments/exact-endgame-deeper/adapter.js --config deeper:16"
name=$1; cfg=$2; R=../experiments/midgame-search/results
rm -f $R/dev40/think_$name.jsonl
nice -n 19 python3 compare.py --a "$A" --b "cmd:node ../experiments/midgame-search/adapter.js --config $cfg --timelog $R/dev40/think_$name.jsonl" --set dev200 --limit 40 --workers 2 --outdir $R/dev40 > $R/dev40/compare_$name.log 2>&1
