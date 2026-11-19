#!/usr/bin/env node
'use strict';
// Rebuild rem=16,15,14,13 states of dev200 games from the already-recorded deeper16g move log.
// No new search; no future card order (we only apply logged moves to the shuffle prefix).
const fs = require('fs'), path = require('path');
const C = require('../js/common.js'), E = C.E, R = C.R;
const logPath = process.argv[2] || '/workspace/21lab/experiments/deeper16-guard/results/parity_guard_0_19.jsonl';
const outPath = process.argv[3] || path.join(__dirname, '..', 'positions', 'dev200_0_19_rem13_16.json');
const lines = fs.readFileSync(path.join(__dirname, '../../../bench/shuffles/dev200.txt'), 'utf8').trim().split('\n');
const games = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const out = [];
for (const g of games) {
  const vals = lines[g.game].trim().split(/\s+/).map(Number).map((c) => { const r = c % 13; return r === 0 ? 1 : r >= 9 ? 10 : r + 1; });
  const st = E.newGame(R);
  for (const mv of g.moves) {
    const v = vals[mv.move - 1];
    if (mv.rem >= 13 && mv.rem <= 16) {
      out.push({
        game: g.game, seed: g.seed, rem: st.rem, card: v,
        cols: [st.cols[0], st.cols[1], st.cols[2], st.cols[3]],
        deck: Array.from(st.deck), busts: st.busts, stays: st.stays, prev: st.prev, score: st.score,
        logged: { stay: mv.stay, col: mv.col, exact: mv.exact, visits: mv.visits, aborted: mv.aborted, reason: mv.reason, cpuMs: mv.cpuMs },
      });
    }
    E.applyMove(R, st, v, { stay: mv.stay, col: mv.col });
  }
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));
const by = {};
for (const p of out) by[p.rem] = (by[p.rem] || 0) + 1;
console.log(JSON.stringify({ n: out.length, byRem: by, out: outPath, games: games.length }));
