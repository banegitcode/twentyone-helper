#!/usr/bin/env node
'use strict';
const fs = require('fs');
const a = process.argv[2], b = process.argv[3];
function load(p) {
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).sort((x, y) => x.game - y.game);
}
const A = load(a), B = load(b);
if (A.length !== B.length) {
  console.log('COUNT_MISMATCH', A.length, B.length);
  process.exit(1);
}
let scoreDiff = 0, moveDiff = 0, games = 0;
const diffs = [];
for (let i = 0; i < A.length; i++) {
  const x = A[i], y = B[i];
  if (x.game !== y.game) throw new Error('game id mismatch');
  games++;
  const sd = (y.score - x.score) || 0;
  if (x.score !== y.score || x.busts !== y.busts || x.ncards !== y.ncards || x.perfect !== y.perfect) {
    scoreDiff++;
    diffs.push({ game: x.game, kind: 'score', a: [x.score, x.busts, x.perfect, x.ncards], b: [y.score, y.busts, y.perfect, y.ncards] });
  }
  const nm = Math.max(x.moves.length, y.moves.length);
  for (let k = 0; k < nm; k++) {
    const m = x.moves[k], n = y.moves[k];
    if (!m || !n || m.stay !== n.stay || m.col !== n.col || m.rem !== n.rem) {
      moveDiff++;
      diffs.push({ game: x.game, kind: 'move', k, a: m && { rem: m.rem, stay: m.stay, col: m.col }, b: n && { rem: n.rem, stay: n.stay, col: n.col } });
      break;
    }
  }
}
const sum = (xs, k) => xs.reduce((s, r) => s + (r[k] || 0), 0);
const out = {
  n: games, scoreDiff, moveDiff, pairedDiff: scoreDiff ? 'NONZERO' : 0,
  a: { file: a, visitTrips: sum(A, 'visitTrips'), cpuTrips: sum(A, 'cpuTrips'), cpuMean: +(sum(A, 'cpuMs') / games).toFixed(1), cpuMax: +Math.max(...A.map((r) => r.cpuMs)).toFixed(1), maxDecisionMs: +Math.max(...A.map((r) => r.maxMoveMs)).toFixed(1) },
  b: { file: b, visitTrips: sum(B, 'visitTrips'), cpuTrips: sum(B, 'cpuTrips'), cpuMean: +(sum(B, 'cpuMs') / games).toFixed(1), cpuMax: +Math.max(...B.map((r) => r.cpuMs)).toFixed(1), maxDecisionMs: +Math.max(...B.map((r) => r.maxMoveMs)).toFixed(1) },
  diffs: diffs.slice(0, 20),
};
console.log(JSON.stringify(out, null, 2));
if (scoreDiff || moveDiff) process.exit(2);
console.log('PARITY_OK identical moves and scores on', games, 'games');
