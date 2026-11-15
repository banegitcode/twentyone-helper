'use strict';
// node src/x_size.js '<cfg json>' logCap  -> exact optimum of a reduced game and number of states
const E = require('./engine.js'); const { createExact } = require('./exact.js');
const cfg = JSON.parse(process.argv[2]), r = E.compile(cfg), x = createExact(r, { logCap: +process.argv[3] || 24 }), t = Date.now();
try { const v = x.value(E.newGame(r)); console.log(process.argv[2], 'cards', r.deckSize, 'V*', v.toFixed(2), 'states', x.states(), ((Date.now() - t) / 1000).toFixed(1) + 's'); }
catch (e) { console.log(process.argv[2], e.message, ((Date.now() - t) / 1000).toFixed(1) + 's'); }
