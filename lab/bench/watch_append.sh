#!/bin/sh
cd /workspace/21lab/bench
i=0
while [ $i -lt 1200 ]; do
  sleep 60
  python3 append_experiments.py >> results/logs/append_experiments.log 2>&1
  if [ -f results/logs/deeper_matrix.done ] && grep -q "measured on bench, set5000" ../EXPERIMENTS.md && grep -q "exact endgame 14 cards (complete solve)" ../EXPERIMENTS.md; then break; fi
  i=$((i+1))
done
