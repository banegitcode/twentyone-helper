'use strict';
// Preloaded into the adapter child process (node -r cpu_hook.js adapter.js ...). It adds the child's own CPU clock to every reply line
// so the driver can report per-decision CPU think time. It changes nothing else (decisions, protocol and timing are the adapter's own).
const cpuMs = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };
let recv = cpuMs();
process.stdin.on('data', () => { recv = cpuMs(); });
const ow = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => {
  try { const o = JSON.parse(String(chunk)); o._cpuRecv = recv; o._cpu = cpuMs(); chunk = JSON.stringify(o) + '\n'; } catch (e) { /* not a reply line */ }
  return ow(chunk, ...rest);
};
