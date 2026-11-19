#!/bin/sh
# Builds native/bench21 (and native/xcheck if /workspace/21sol/game.h exists). No make required.
set -e
cd "$(dirname "$0")"
${CC:-gcc} -O2 -std=c11 -Wall -Wextra -o bench21 bench21.c
if [ -f /workspace/21sol/game.h ]; then ${CC:-gcc} -O2 -std=gnu11 -Wall -Wno-unused-function -I/workspace/21sol -o xcheck xcheck.c; fi
