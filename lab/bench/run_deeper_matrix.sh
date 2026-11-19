#!/bin/sh
# Referee queue for experiments/exact-endgame-deeper (21 Search), then the deprioritised champion configs.
cd "$(dirname "$0")"
A="cmd:node champion/champion_adapter.js --config shipped52"
D="cmd:node ../experiments/exact-endgame-deeper/adapter.js --config"
L=results/logs
for N in 16 15 14; do
  python3 compare.py --a "$A" --b "$D deeper:$N" --set set1000 --workers 3 --cache > $L/shipped52_vs_deeper$N.log 2>&1
done
python3 compare.py --a "$A" --b "cmd:node champion/champion_adapter.js --config computer" --set set1000 --workers 3 --cache > $L/shipped52_vs_computer_set1000.log 2>&1
python3 compare.py --a "$A" --b "cmd:node champion/champion_adapter.js --config nn5" --set set1000 --workers 3 --cache > $L/shipped52_vs_nn5_set1000.log 2>&1
echo done > $L/deeper_matrix.done
