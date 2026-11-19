#!/bin/bash
# usage: run_sampled.sh <K workers>  -- reference A: horizon-8 hybrid rollouts (network-0ply rollout policy, shipped-network value at the horizon, exact tail from 8 cards)
cd /workspace/21lab/experiments/regret_map
K=${1:-5}
for k in $(seq 0 $((K-1))); do
  HORIZON=8 REXMAX=12 ROLLDEPTH=0 PSAMP=1 WINDOW=100 MAXCAND=3 N0=16 STEP=16 NMAX=64 KX=8 nohup nice -n 5 node regret_sampled.js data_dev200_champion_all.jsonl samp_$k.jsonl $k $K > samp_$k.log 2>&1 &
done
