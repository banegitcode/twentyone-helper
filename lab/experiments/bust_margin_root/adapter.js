#!/usr/bin/env node
'use strict';
// root-only variant of the life-margin idea (ideas/life-margin-schedule.md): re-rank the champion's root actions, adding back part of the over-penalty
// for the action that makes the 2nd bust (busts_before == 1).  Cheap alternative to experiments/life_margin (which patches the leaf).
//   node experiments/bust_margin_root/adapter.js [--config shipped52] [--scale 1]
const argv = process.argv.slice(2); const si = argv.indexOf('--scale'); const sc = si >= 0 ? +argv[si + 1] : 1;
const T = [[19, 88], [26, 176], [32, 237], [99, 485]].map(([r, v]) => [r, -sc * v]);   // negative margin = less aversion to the 2nd bust
if (!argv.includes('--cfg')) process.argv.push('--cfg', JSON.stringify({ bust: { '1': T } }));
require('../theory_sim/js/hooked_adapter.js');
