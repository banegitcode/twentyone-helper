#!/usr/bin/env node
'use strict';
// Scoring parity: replay bench21 traces (identical shuffles + identical actions) through engine.js applyMove,
// and dump the exhaustive single-column outcome table. Read-only use of engine/.
//   node parity.js replay <shuffles.txt> <trace.txt>
//   node parity.js columns            -> JSON {seq: outcome} for every card-value sequence up to the first clear/bust
const fs = require('fs'), path = require('path');
const DIR = process.env.CHAMPION_DIR || path.join(__dirname, '..', '..', 'engine', 'twentyone-solver');
const E = require(path.join(DIR, 'src', 'engine.js'));
const R = E.DEFAULT_RULES;
const val = (c) => Math.min(c % 13 + 1, 10);
const mode = process.argv[2];
if (mode === 'replay') {
  const decks = fs.readFileSync(process.argv[3], 'utf8').trim().split('\n').map((l) => l.split(' ').map(Number));
  const lines = fs.readFileSync(process.argv[4], 'utf8').trim().split('\n');
  let games = 0, bad = 0, steps = 0;
  for (const ln of lines) {
    const t = ln.split(' ').map(Number); const [idx, fscore, fbusts, nc] = t;
    const st = E.newGame(R, {});
    let mism = false;
    for (let i = 0; i < nc; i++) {
      const [nst, s0, s1, pl, pts] = t.slice(4 + 5 * i, 9 + 5 * i);
      const before = st.score;
      E.applyMove(R, st, val(decks[idx][i]), { stay: nst ? s0 : -1, col: pl });
      steps++;
      // while the game is not over the score delta is the step's points; on the last step the Perfect Bonus may be included
      const delta = st.score - before - ((st.over && st.busts === 0) ? 1000 : 0);
      if (delta !== pts) { mism = true; if (bad < 10) console.log(`MISMATCH game ${idx} step ${i}: bench=${pts} engine.js=${delta}`); }
    }
    if (st.score !== fscore || st.busts !== fbusts || !st.over) { mism = true; if (bad < 10) console.log(`MISMATCH game ${idx} final: bench=${fscore}/${fbusts} engine.js=${st.score}/${st.busts} over=${st.over}`); }
    bad += mism; games++;
  }
  console.log(`engine.js replay: ${games} games, ${steps} steps, ${bad} disagreeing games`);
  process.exit(bad ? 1 : 0);
} else if (mode === 'columns') {
  const out = {};
  (function dfs(code, seq) {
    for (let v = 1; v <= 10; v++) {
      const k = code * 11 + v, p = R.pts[k], s = seq.concat(v), key = s.join(',');
      if (p < 0) out[key] = 'bust:0'; else if (p > 0) out[key] = 'clear:' + p; else { out[key] = 'keep:0'; dfs(R.next[k], s); }
    }
  })(0, []);
  console.log(JSON.stringify(out));
} else { console.error('usage: parity.js replay|columns'); process.exit(2); }
