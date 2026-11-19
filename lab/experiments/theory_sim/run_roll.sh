#!/bin/bash
cd /workspace/21lab/experiments/theory_sim
for rem in 36 24 16; do
  for k in 0 1 2; do
    node js/rollout_variants.js data/all.jsonl $rem 36 24 data/roll_${rem}_$k.json $k 3 &
  done
  wait
done
