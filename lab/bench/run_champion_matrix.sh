#!/bin/sh
# Background measurement of the shipped champion configs on the fixed sets (see README "Champion").
cd "$(dirname "$0")"
A="cmd:node champion/champion_adapter.js --config"
L=results/logs
python3 compare.py --a "$A shipped52" --b "$A exact14" --set set1000 --workers 3 --cache > $L/shipped52_vs_exact14_set1000.log 2>&1
python3 run_one.py --engine "$A shipped52" --set set5000 --workers 4 --cache > $L/shipped52_set5000.log 2>&1
python3 compare.py --a "$A shipped52" --b "$A computer" --set set1000 --workers 4 --cache > $L/shipped52_vs_computer_set1000.log 2>&1
python3 compare.py --a "$A shipped52" --b "$A nn5" --set set1000 --workers 4 --cache > $L/shipped52_vs_nn5_set1000.log 2>&1
echo done > $L/matrix.done
