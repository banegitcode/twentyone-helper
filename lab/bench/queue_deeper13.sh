#!/bin/bash
# Start exact-endgame-deeper deeper:13 vs shipped52 on set1000 from the frozen
# snapshot, once the exact13-unlimited compare has finished (and its workers
# have exited, to respect RAM). Runs behind exact13 and ahead of any later
# deeper:15 restart or pooled rerun. deeper:15 itself is already in flight.
set -euo pipefail
cd /workspace/21lab/bench
LOG=results/logs/queue_deeper13.log
RESULT_GLOB='results/*cmd_shipped52_vs_cmd_exact13.json'
SNAP=frozen/exact-endgame-deeper@90c2d73f938b
ADAPTER="$SNAP/experiments/exact-endgame-deeper/adapter.js"
mkdir -p results/logs
echo "$(date '+%F %T %Z') queue_deeper13 started; waiting for exact13 result and exit" >> "$LOG"

while true; do
  if ls $RESULT_GLOB >/dev/null 2>&1; then
    if ! pgrep -f 'champion_adapter.js --config exact13' >/dev/null 2>&1 \
       && ! pgrep -af 'compare.py .*exact13' | grep -v pgrep >/dev/null 2>&1; then
      break
    fi
  fi
  sleep 30
done

# RAM gate: need ~1.5 GiB available for 3 deeper:13 workers (~350-400 MB each) plus headroom.
avail_kb=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
echo "$(date '+%F %T %Z') exact13 done, MemAvailable ${avail_kb} kB" >> "$LOG"
while [ "$avail_kb" -lt 2000000 ]; do
  echo "$(date '+%F %T %Z') waiting for RAM (available ${avail_kb} kB < 2000000 kB)" >> "$LOG"
  sleep 30
  avail_kb=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
done

if [ -f results/logs/deeper13.started ]; then
  echo "$(date '+%F %T %Z') deeper13 already started, exiting" >> "$LOG"
  exit 0
fi

A='cmd:node champion/champion_adapter.js --config shipped52'
B="cmd:env TIMELOG=/workspace/21lab/bench/results/think_deeper13.jsonl node -r /workspace/21lab/bench/cpu_timelog_hook.js /workspace/21lab/bench/${ADAPTER} --config deeper:13"
echo "$(date '+%F %T %Z') launching deeper:13 from $SNAP" >> "$LOG"
touch results/logs/deeper13.started
# --cache is safe: deeper:13 is position-budgeted (deterministic). cache-a would also work; full --cache stores B too.
nohup python3 compare.py --a "$A" --b "$B" --set set1000 --workers 3 --cache --frozen 90c2d73f938b \
  > results/logs/shipped52_vs_deeper13.log 2>&1 &
echo $! > results/logs/deeper13.pid
echo "$(date '+%F %T %Z') launched pid $(cat results/logs/deeper13.pid)" >> "$LOG"
