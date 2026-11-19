#!/usr/bin/env node
'use strict';
// stay_margin adapter (21 Theorist): champion + root re-ranking with a Stay margin schedule (falsification test, see ideas/stay-margin-schedule.md).
//   node experiments/stay_margin/adapter.js [--config shipped52] [--margin M]   M = flat extra "reluctance" in points for any action that uses a Stay
//   (default schedule: M for rem<=99).  --margin 0 == champion.   Use e.g. --margin 40 and --margin -40; a rem-dependent table: --cfg '{"stay":[[20,m1],[99,m2]]}'
const argv = process.argv.slice(2);
if (!argv.includes('--cfg') && !argv.includes('--cfgfile')) { const mi = argv.indexOf('--margin'); const m = mi >= 0 ? +argv[mi + 1] : 40; process.argv.push('--cfg', JSON.stringify({ stay: [[99, m]] })); }
require('../theory_sim/js/hooked_adapter.js');
