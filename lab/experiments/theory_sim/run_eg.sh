#!/bin/bash
cd /workspace/21lab/experiments/theory_sim
for spec in "8 8 4" "10 10 12" "12 12 40" "14 14 200"; do
  set -- $spec
  ./target/release/endgame data/all.jsonl $1 data/eg_rem$1.csv $2 $3 5 > data/eg_rem$1.log 2>&1
done
