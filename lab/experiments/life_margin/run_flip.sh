#!/bin/bash
cd /workspace/21lab/experiments
for k in 0 1 2; do nice -n 3 node life_margin/flip_ab.js theory_sim/data/all.jsonl 16 120 24 theory_sim/data/flip_$k.json $k 3 & done; wait
