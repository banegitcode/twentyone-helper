#!/usr/bin/env node
'use strict';
// Validate label.js against the independent brute force (brute_raw, individual cards, explicit column lists, rules from RULES.md).
//   node validate.js --in positions.jsonl [--n 50] [--max-left 10] [--tol 0.01]
// Picks up to n positions with left <= max-left (spread evenly over the file), runs brute_raw and label.js, prints max |diff|.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const inF = arg('in'), n = +arg('n', 50), maxLeft = +arg('max-left', 10), tol = +arg('tol', 0.01), nice = arg('nice', '10');
let ps = fs.readFileSync(inF, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((p) => p.deck.reduce((a, b) => a + b, 0) <= maxLeft);
const step = Math.max(1, ps.length / n); ps = Array.from({ length: Math.min(n, ps.length) }, (_, i) => ps[Math.floor(i * step)]);
ps.forEach((p, i) => { p._i = i; });
const toBrute = (p) => { const cnt = new Array(10).fill(0); p.deck.forEach((c, i) => { cnt[Math.min(i + 1, 10) - 1] += c; });
  return [p._i, p.busts, p.stays, p.streak, ...p.cols.flatMap((c) => [c.length, ...c]), ...cnt].join(' '); };
// brute force can take minutes on a loaded box: run it once, streaming into a cache file (resume-able), then compare
const BF = arg('brute-out', '/tmp/brute_raw_out.txt'), BI = BF + '.in';
fs.writeFileSync(BI, ps.map(toBrute).join('\n') + '\n');
if (!fs.existsSync(BF) || arg('rerun-brute', '0') === '1') { console.log('running brute_raw (this is slow) ->', BF); cp.spawnSync('sh', ['-c', `nice -n ${nice} ${path.join(__dirname, 'brute_raw')} < ${BI} > ${BF}`]); }
const bv = {}; for (const l of fs.readFileSync(BF, 'utf8').split('\n')) { const f = l.split(' '); if (f[0] === 'V') bv[+f[1]] = +f[2]; }
const lb = cp.spawnSync('nice', ['-n', nice, 'node', path.join(__dirname, 'label.js')], { input: ps.map((p) => JSON.stringify(p)).join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 26 });
const lv = lb.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
let maxd = 0, bad = 0, byLeft = {}; 
lv.forEach((o, i) => { const p = ps[i], d = Math.abs(o.v - bv[p._i]); byLeft[o.n] = (byLeft[o.n] || 0) + 1; if (!o.ok || !(d <= tol)) { bad++; console.log('MISMATCH', p.id, o.v, bv[p._i], o.err || ''); } if (d > maxd) maxd = d; });
console.log(JSON.stringify({ positions: ps.length, compared: lv.length, bruteAnswers: Object.keys(bv).length, mismatches: bad, maxAbsDiff: maxd, tol, positionsByCardsLeft: byLeft,
  withBust: ps.filter((p) => p.busts > 0).length, withStay: ps.filter((p) => p.stays < 2).length, withStreak: ps.filter((p) => p.streak > 0).length }));
