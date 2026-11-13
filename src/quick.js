'use strict';
// quick.js '<json spec>' [count] [seedStart] [horizon]
const P = require('./pool.js');
(async () => {
  const spec = JSON.parse(process.argv[2]); const n = +process.argv[3] || 1000, s0 = +process.argv[4] || 3200000, hz = +process.argv[5] || 0;
  const t = Date.now(); const g = await P.evaluate(spec, s0, n, { horizon: hz });
  const st = P.stats(g); console.log(JSON.stringify(st), ((Date.now() - t) / 1000).toFixed(1) + 's'); P.close();
})();
