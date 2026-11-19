#!/bin/sh
# second queue (runs concurrently with the deeper:16 compare already in flight): deeper:15, deeper:14, then deprioritised champion configs
cd "$(dirname "$0")"
A="cmd:node champion/champion_adapter.js --config shipped52"
D="cmd:node ../experiments/exact-endgame-deeper/adapter.js --config"
L=results/logs
for N in 15 14; do
  python3 compare.py --a "$A" --b "$D deeper:$N" --set set1000 --workers 3 --cache > $L/shipped52_vs_deeper$N.log 2>&1
done
# wait for the deeper:16 compare (started by run_deeper_matrix.sh) to finish before the low-priority jobs
while ! ls results/*shipped52_vs_cmd_deeper_16.json >/dev/null 2>&1; do sleep 60; done
python3 compare.py --a "$A" --b "cmd:node champion/champion_adapter.js --config computer" --set set1000 --workers 3 --cache > $L/shipped52_vs_computer_set1000.log 2>&1
python3 compare.py --a "$A" --b "cmd:node champion/champion_adapter.js --config nn5" --set set1000 --workers 3 --cache > $L/shipped52_vs_nn5_set1000.log 2>&1
echo done > $L/deeper_matrix.done
