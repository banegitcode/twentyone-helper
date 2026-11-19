'use strict';
// Shared helpers: load the champion's modules read-only from engine/ and convert position lines to engine states.
const path = require('path'), fs = require('fs');
const ENGINE_SRC = process.env.TWENTYONE_SRC || path.join(__dirname, '../../../engine/twentyone-solver/src');
const E = require(path.join(ENGINE_SRC, 'engine.js'));
const R = E.DEFAULT_RULES;
// line format: id N busts stays streak cur [n hard ace all7]x4 cnt1..cnt10   (see ref/gen_positions.c)
function parseLine(line) {
  const t = line.trim().split(/\s+/).map(Number);
  const [id, N, busts, stays, streak, cur] = t, cols = [];
  for (let j = 0; j < 4; j++) { const [n, hard, ace, all7] = t.slice(6 + 4 * j, 10 + 4 * j); cols.push({ n, hard, ace, all7 }); }
  const cnt = t.slice(22, 32);
  return { id, N, busts, stays, streak, cur, cols, cnt };
}
function toState(p) {
  const st = E.newGame(R);
  for (let j = 0; j < 4; j++) { const c = p.cols[j]; st.cols[j] = c.n ? E.mkCol(c.hard, c.ace, c.n, c.all7 ? 0 : 1) : 0; }
  st.deck.fill(0); for (let v = 1; v <= 10; v++) st.deck[v] = p.cnt[v - 1];
  st.deck[p.cur]++;                       // the current card is still in the deck for the engine
  st.rem = p.N; st.played = 52 - p.N; st.busts = p.busts; st.stays = p.stays; st.prev = p.streak; st.score = 0;
  return st;
}
function loadPositions(file) { return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map(parseLine); }
// his own positions (results/z_positions.json) as the same objects, so both position sets can be timed identically
function fromEnginePositions(P) {
  return P.map((p) => ({ id: p.seed, N: p.rem, busts: p.busts, stays: p.stays, streak: p.prev, cur: p.card, st: Object.assign(E.newGame(R), { cols: Int32Array.from(p.cols), deck: Int32Array.from(p.deck), rem: p.rem, played: 52 - p.rem, busts: p.busts, stays: p.stays, prev: p.prev }) }));
}
module.exports = { E, R, ENGINE_SRC, parseLine, toState, loadPositions, fromEnginePositions };
