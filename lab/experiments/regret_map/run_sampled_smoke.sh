cd /workspace/21lab/experiments/regret_map; rm -f smoke.jsonl
NMAX=48 N0=16 STEP=16 PSAMP=1 GAMES=0,1 nice -n 5 node regret_sampled.js data_dev200_champion.jsonl smoke.jsonl 0 1
