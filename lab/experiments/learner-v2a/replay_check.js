#!/usr/bin/env node
'use strict';
// Move-for-move check: spawns adapter A (reference, e.g. the FROZEN deeper:16) and adapter B (candidate); A plays dev200 games; at every decision both get the identical `decide` message; compares the actions.
//   node replay_check.js --a "node <frozen>/adapter.js --config deeper:16" --b "node adapter.js --v2a champ" --games 20 [--shuffles ../../bench/shuffles/dev200.txt] [--start 0]
const fs = require('fs'), path = require('path'), cp = require('child_process'), readline = require('readline');
const E = require('../../engine/twentyone-solver/src/engine.js'), R = E.DEFAULT_RULES;
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const games = +arg('games', 20), start = +arg('start', 0), shuf = arg('shuffles', path.join(__dirname, '../../bench/shuffles/dev200.txt'));
const lines = fs.readFileSync(shuf, 'utf8').split('\n').filter((l) => l.trim()).slice(start, start + games).map((l) => l.trim().split(/\s+/).map(Number));
function spawn(cmd) { const [c, ...a] = cmd.split(' '); const p = cp.spawn(c, a, { stdio: ['pipe', 'pipe', 'inherit'] }); const q = []; readline.createInterface({ input: p.stdout }).on('line', (l) => { const w = q.shift(); if (w) w(JSON.parse(l)); }); return { p, ask: (m) => new Promise((r) => { q.push(r); p.stdin.write(JSON.stringify(m) + '\n'); }), send: (m) => p.stdin.write(JSON.stringify(m) + '\n') }; }
(async () => {
  const A = spawn(arg('a')), B = spawn(arg('b')); let dec = 0, diff = 0, scoreA = [];
  for (let g = 0; g < lines.length; g++) {
    const codes = lines[g], vals = codes.map((c) => Math.min(c % 13 + 1, 10)); A.send({ type: 'new_game', game: g, seed: g }); B.send({ type: 'new_game', game: g, seed: g });
    const st = E.newGame(R), cols = [[], [], [], []]; let gd = 0;
    for (let i = 0; i < 52 && !st.over; i++) {
      const v = vals[i], rem = Array.from(st.deck).slice(1); rem[v - 1]--;
      const msg = { type: 'decide', state: { columns: cols.map((c) => c.slice()), current: v, remaining: rem, busts: st.busts, stays_left: st.stays, streak: st.prev, score: st.score, cards_dealt: i + 1, cards_left: 51 - i } };
      const ra = await A.ask(msg), rb = await B.ask(msg); dec++;
      if (ra.stay !== rb.stay || ra.place !== rb.place) { diff++; gd++; console.log('DIFF game', g, 'decision', i, JSON.stringify(ra), JSON.stringify(rb)); }
      const m = { stay: ra.stay == null ? -1 : ra.stay, col: ra.place }; if (m.stay >= 0) cols[m.stay] = [];
      const ev = E.applyMove(R, st, v, m); if (ev.cleared) cols[m.col] = []; else cols[m.col].push(v);
    }
    scoreA.push(st.score); A.send({ type: 'game_over', score: st.score }); B.send({ type: 'game_over', score: st.score });
    console.log('game', g, 'score(A path)', st.score, 'decisions differing so far', diff, '/', dec);
  }
  A.send({ type: 'quit' }); B.send({ type: 'quit' }); console.log('TOTAL decisions', dec, 'differences', diff, 'mean score', (scoreA.reduce((x, y) => x + y, 0) / scoreA.length).toFixed(1)); process.exit(diff ? 1 : 0);
})();
