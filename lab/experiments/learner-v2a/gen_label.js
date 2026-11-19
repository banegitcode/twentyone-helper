#!/usr/bin/env node
'use strict';
// v2a data: champion deeper:16 plays out-of-bench shuffles (seeds >= 3e9, same RNG/shuffle code as experiments/exact-labeler/gen_positions.js, copied not edited);
// every position after a placement with <= 16 cards left (P rows, play order 16 -> 1) is labeled EXACTLY with experiments/exact-labeler/label.js (persistent child process, table reuse).
// For P rows with 12..16 cards left whose label is ok, ALL children of the next decision are labeled too (for every card value still in the deck x every distinct legal action):
// "C rows" = post-placement positions with k-1 cards left = exactly the positions a leaf evaluator is asked about.  Children are table lookups after the parent solve (no new solving).
// Only the observable state is used by the policy (never the future order).  Outputs <out>.pos.jsonl (P and C rows incl. exact v) and <out>.dec.jsonl (decision structure).
//   node gen_label.js --games 500 --seed-base 3400000000 --out data/run1 [--bust-eps 0.02] [--bust-seek 0.03] [--mem-mb 800] [--kdec-min 12] [--kdec-max 16] [--start-game 0]
const fs = require('fs'), path = require('path'), cp = require('child_process'), readline = require('readline');
const LAB = path.join(__dirname, '../exact-labeler');
const SRC = path.join(__dirname, '../../engine/twentyone-solver/src');
const E = require(path.join(SRC, 'engine.js')), R = E.DEFAULT_RULES;
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const games = +arg('games', 100), seedBase = +arg('seed-base', 3400000000), out = arg('out', 'data/run'), bustEps = +arg('bust-eps', 0.02), bustSeek = +arg('bust-seek', 0.03);
const memMB = arg('mem-mb', '800'), KDMIN = +arg('kdec-min', 12), KDMAX = +arg('kdec-max', 16), startGame = +arg('start-game', 0), maxPos = arg('max-positions', '60000000');
if (seedBase < 3e9) { console.error('refusing seed-base < 3e9'); process.exit(2); }
const benchKeys = new Set();
for (const f of ['set1000.txt', 'set5000.txt', 'dev200.txt']) { try { for (const l of fs.readFileSync(path.join(__dirname, '../../bench/shuffles', f), 'utf8').split('\n')) if (l.trim()) benchKeys.add(l.trim().split(/\s+/).map((c) => Math.min((+c) % 13 + 1, 10)).join(',')); } catch (e) { console.error('warning: no ' + f); } }
const spec = JSON.parse(fs.readFileSync(path.join(SRC, '../results/shipped_policies.json')))['52']; delete spec.exact; if (spec.deepen) spec.deepen.budgetMs = 0;
spec.exact3 = { xK: 16, budget: 3200000, logCap: 25 };
const pol = require(path.join(LAB, '../exact-endgame-deeper/js/policy_exact3.js')).createPolicy(R, spec);

// ---- persistent labeler
const lab = cp.spawn('node', [path.join(LAB, 'label.js'), '--mem-mb', memMB, '--max-positions', maxPos], { stdio: ['pipe', 'pipe', 'inherit'] });
const waiters = []; const rl = readline.createInterface({ input: lab.stdout, terminal: false });
rl.on('line', (l) => { const w = waiters.shift(); if (w) w(JSON.parse(l)); });
const label = (p) => new Promise((res) => { waiters.push(res); lab.stdin.write(JSON.stringify(p) + '\n'); });

const posFd = fs.openSync(out + '.pos.jsonl', 'a'), decFd = fs.openSync(out + '.dec.jsonl', 'a');
const w = (fd, o) => fs.writeSync(fd, JSON.stringify(o) + '\n');
const key = (s) => Array.from(s.cols).sort((a, b) => a - b).join(',') + '|' + s.busts + s.stays + s.prev + '|' + Array.from(s.deck).join(',');
function moves(st) {
  const ms = [], seen = new Set();
  for (let c = 0; c < 4; c++) { if (seen.has(st.cols[c])) continue; seen.add(st.cols[c]); ms.push({ stay: -1, col: c }); }
  if (st.stays > 0) { let empty = false; for (let c = 0; c < 4; c++) if (st.cols[c] === 0) empty = true;
    if (!empty) { const sn = new Set(); for (let s = 0; s < 4; s++) { if (sn.has(st.cols[s])) continue; sn.add(st.cols[s]); ms.push({ stay: s, col: s }); } } }
  return ms;
}
const rowOf = (id, kind, game, cols, st) => ({ id, kind, game, left: st.rem, cols: cols.map((c) => c.slice()), deck: Array.from(st.deck).slice(1), busts: st.busts, stays: st.stays, streak: st.prev });

(async () => {
  let nP = 0, nC = 0, nPok = 0, nDec = 0, skipped = 0, t0 = Date.now(), cpu0 = process.cpuUsage();
  for (let g = startGame; g < startGame + games; g++) {
    const gseed = seedBase + g * 7919;
    const rng = E.mulberry32((gseed >>> 0) ^ 0x5bd1e995), ranks = Array.from({ length: 52 }, (_, i) => i % 13);
    for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ranks[i], ranks[j]] = [ranks[j], ranks[i]]; }
    const vals = ranks.map((r) => Math.min(r + 1, 10));
    if (benchKeys.has(vals.join(','))) { skipped++; continue; }
    const prng = E.mulberry32((gseed >>> 0) ^ 0x1b873593);
    const st = E.newGame(R), cols = [[], [], [], []]; pol.reset();
    const snaps = []; const nextMove = {};   // by cards left after the placement
    for (let i = 0; i < 52 && !st.over; i++) {
      const v = vals[i]; let m = pol.choose(st, v), forced = false;
      if (bustEps > 0 && prng() < bustEps) { m = { stay: -1, col: Math.floor(prng() * 4) }; forced = true; }
      else if (bustSeek > 0 && prng() < bustSeek) { const b = []; for (let j = 0; j < 4; j++) if (R.pts[st.cols[j] * 11 + v] < 0) b.push(j); if (b.length) { m = { stay: -1, col: b[Math.floor(prng() * b.length)] }; forced = true; } }
      nextMove[51 - i + 1] = { v, mv: [m.stay, m.col], forced };    // decision made with `rem = 52 - i` cards left (incl. this one) = left of the previous position
      if (m.stay >= 0) cols[m.stay] = [];
      const ev = E.applyMove(R, st, v, m);
      if (ev.cleared) cols[m.col] = []; else cols[m.col].push(v);
      if (!st.over && st.rem <= 16) snaps.push({ cols: cols.map((c) => c.slice()), st: E.cloneGame(st), i });
    }
    let busted = st.busts;
    for (const sn of snaps) {
      const k = sn.st.rem, pid = gseed + ':' + sn.i, row = rowOf(pid, 'P', gseed, sn.cols, sn.st);
      const r = await label({ id: pid, cols: row.cols, deck: row.deck, busts: row.busts, stays: row.stays, streak: row.streak, score: 0 });
      nP++; row.v = r.ok ? r.v : null; row.ok = r.ok; row.cpu_ms = r.cpu_ms; row.pos = r.pos; if (!r.ok) row.err = r.err; row.final_busts = busted; w(posFd, row);
      if (!r.ok) continue; nPok++;
      if (k < KDMIN || k > KDMAX) continue;
      // children of the decision for every next card value and every distinct action
      const ck = new Map(), dec = { game: gseed, pid, k, deck: row.deck, vals: [], actual: nextMove[k] || null };
      const childFor = async (v, m) => {
        const s2 = E.cloneGame(sn.st), ev = E.applyMove(R, s2, v, m);
        const c2 = sn.cols.map((c) => c.slice()); if (m.stay >= 0) c2[m.stay] = []; if (ev.cleared) c2[m.col] = []; else c2[m.col].push(v);
        const dpts = s2.score - sn.st.score;
        if (s2.over) return { mv: [m.stay, m.col], dpts, cid: null, term: true };
        const kk = key(s2); let cid = ck.get(kk);
        if (!cid) {
          cid = pid + ':c' + ck.size; ck.set(kk, cid); const crow = rowOf(cid, 'C', gseed, c2, s2); crow.parent = pid;
          const rc = await label({ id: cid, cols: crow.cols, deck: crow.deck, busts: crow.busts, stays: crow.stays, streak: crow.streak, score: 0 });
          nC++; crow.v = rc.ok ? rc.v : null; crow.ok = rc.ok; crow.cpu_ms = rc.cpu_ms; crow.pos = rc.pos; if (!rc.ok) crow.err = rc.err; w(posFd, crow);
        }
        return { mv: [m.stay, m.col], dpts, cid };
      };
      for (let v = 1; v <= 10; v++) {
        const cnt = sn.st.deck[v]; if (!cnt) continue; const acts = [];
        for (const m of moves(sn.st)) acts.push(await childFor(v, m));
        dec.vals.push({ v, n: cnt, acts });
        if (dec.actual && dec.actual.v === v) { const m = { stay: dec.actual.mv[0], col: dec.actual.mv[1] }; try { const ac = await childFor(v, m); dec.actual.cid = ac.cid; dec.actual.dpts = ac.dpts; dec.actual.term = !!ac.term; } catch (e) { dec.actual.err = String(e); } }
      }
      w(decFd, dec); nDec++;
    }
    if ((g + 1 - startGame) % 5 === 0 || g + 1 === startGame + games) console.error(JSON.stringify({ games_done: g + 1 - startGame, P: nP, Pok: nPok, C: nC, dec: nDec, skipped, wall_s: Math.round((Date.now() - t0) / 1000), my_cpu_s: Math.round(process.cpuUsage(cpu0).user / 1e6) }));
  }
  lab.stdin.end(); console.error('done');
})();
