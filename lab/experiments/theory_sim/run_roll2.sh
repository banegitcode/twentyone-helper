#!/bin/bash
cd /workspace/21lab/experiments/theory_sim
for rem in 40 28; do
  for k in 0 1 2; do
    VARS=3,4 nice -n 2 node js/rollout_variants.js data/all.jsonl $rem 36 24 data/rollB_${rem}_$k.json $k 3 &
  done
  wait
done
