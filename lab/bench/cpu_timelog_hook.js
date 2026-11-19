'use strict';
// Generic per-game CPU timelog for any JSON-lines adapter, without touching the adapter:  env TIMELOG=file node -r cpu_timelog_hook.js adapter.js ...
// One JSON line per game: seed, cpuMs = the adapter process's CPU time (user+system) between the game's new_game message and the next new_game/quit/exit,
// maxDecMs = largest single decision (CPU between receiving a decide request and writing its reply), wallMs, decisions, pid.
const fs = require('fs');
const FILE = process.env.TIMELOG, cpu = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };
let cur = null, recv = 0, buf = '';
function flush() {
  if (!cur || !FILE) return; const g = cur; cur = null;
  fs.appendFileSync(FILE, JSON.stringify({ pid: process.pid, seed: g.seed, game: g.game, cpuMs: +(cpu() - g.c0).toFixed(1), maxDecMs: +g.maxDec.toFixed(1), wallMs: +(performance.now() - g.w0).toFixed(1), decisions: g.n }) + '\n');
}
process.stdin.on('data', (chunk) => {
  recv = cpu(); buf += chunk;
  let i; while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1); let m; try { m = JSON.parse(line); } catch (e) { continue; }
    if (m.type === 'new_game') { flush(); cur = { seed: m.seed, game: m.game, c0: cpu(), w0: performance.now(), maxDec: 0, n: 0 }; }
    else if (m.type === 'quit') flush();
  }
});
const ow = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => { if (cur) { const d = cpu() - recv; cur.n++; if (d > cur.maxDec) cur.maxDec = d; } return ow(chunk, ...rest); };
process.on('exit', flush);
