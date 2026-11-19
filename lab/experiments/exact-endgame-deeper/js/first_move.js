'use strict';
// node js/first_move.js --file positions/champion_dev200_K16_18.json --K 16,17,18 --n 6 --logCap 26 --out results/first_move.json
// Cost of the FIRST exact move (X.choose for the dealt card, empty table) on champion-like positions, solved in 1M-position slices like js/pooled.js.
// DNF = table positions exceeded 0.70 * 2^logCap before the move was answered.  CPU ms = process.cpuUsage; wall ms also recorded (box loaded).
const fs = require('fs'), path = require('path'); const C = require('./common.js');
const args = {}; for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const P = JSON.parse(fs.readFileSync(args.file)), Ks = args.K.split(',').map(Number), n = +(args.n || 6), logCap = +(args.logCap || 26), maxPos = Math.floor(0.70 * 2 ** logCap);
const X = require(path.join(C.ENGINE_SRC, 'exact2.js')).createExact(C.R, { logCap });
const cpu = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };
const rows = []; console.log('kernel', X.kernel(), 'logCap', logCap, 'position cap', maxPos);
for (const K of Ks) for (const p of C.fromEnginePositions(P[K]).slice(+(args.from || 0), +(args.from || 0) + n)) {
  X.clear(); const c0 = cpu(), w0 = performance.now(); let m = null, dnf = false;
  for (;;) { m = X.choose(p.st, p.cur, 1e6); if (m) break; if (X.states() > maxPos) { dnf = true; break; } }
  const row = { K, id: p.id, busts: p.busts, stays: p.stays, positions: X.states(), cpuMs: cpu() - c0, wallMs: performance.now() - w0, dnf, rssMB: Math.round(process.memoryUsage().rss / 1048576), value: m ? m.value : null };
  rows.push(row); console.log(JSON.stringify(row)); fs.writeFileSync(args.out, JSON.stringify(rows, null, 1));
}
