'use strict';
// Defaults for the deeper16g bench config. VISIT_CAP is filled in after measuring
// max visits of normal deeper:16 moves on dev200 games 0-9 (see results/visits_dev200_0_9.json).
// CPU guard stays off unless the adapter is given an explicit cpu=... / --mac flag.
module.exports = {
  XK: 16,
  BUDGET: 3200000,
  LOGCAP: 25,
  VISIT_CAP: 80000000,   // MEASURED: max 63,320,660 visits on dev200 games 0-9 (max exact move 3.88 s). 3x would be 190M (~11 s) and overshoot the 5 s box-CPU target. 80M is 1.26x measured max, ~4.7 s at the median heavy rate 16.9M visits/s.
  CPU_MS_MAC: 5000,      // only used with --mac or :cpu=5000
};
