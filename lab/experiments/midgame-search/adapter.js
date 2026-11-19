#!/usr/bin/env node
'use strict';
// 21 Lab submission (21 Search): deeper:16 (shipped52 network + search, exact solve from 16 cards, 3.2M new positions/move, logCap 25) plus a budgeted deeper
// mid-game search above 16 cards, with the leaf network selectable by config name from ./nets/.  JSON-lines protocol of bench/README.md; observable state only.
//   node adapter.js --config midsearch:<params>[:leaf=<name>][:leaflow=<name>]
//   examples   midsearch:champ=1                      champion's own search above 16 cards: must play move-for-move like deeper:16
//              midsearch:                             same algorithm re-implemented here, extra pass off: must also equal deeper:16
//              midsearch:xd=3,xk=3,xm=150,cap=60000,pool=1500000                extra 3-chance-ply pass on the top-3 candidates
//              midsearch:xd=3,bm=2,cap=60000:leaf=ship_nn                       with a 2-action beam inside
//   --timelog FILE   append one JSON line per finished game (think cpu ms, max move ms, search evals, rss)
//   --keep-budget    unused (deepen.budgetMs is always forced to 0, as in the Referee adapter)
// All weights are read from ./nets/<name>.json (inside this folder).  Details: ideas/midgame-search.md.
const fs = require('fs'), path = require('path'), readline = require('readline');
const DIR = process.env.CHAMPION_DIR || path.join(__dirname, '..', '..', 'engine', 'twentyone-solver');
const C = require('./js/common.js'); const E = C.E;
const { createMidPolicy } = require('./js/policy.js');
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const config = arg('config', 'midsearch:');
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'results', 'shipped_policies.json'), 'utf8'))['52'];
const spec = JSON.parse(JSON.stringify(base)); if (spec.deepen) spec.deepen.budgetMs = 0;
const rules = C.R, policy = createMidPolicy(rules, spec, config);

function toEngineState(o) {
  const cols = new Int32Array(4);
  for (let j = 0; j < 4; j++) {
    const cs = o.columns[j]; if (!cs.length) continue;
    let hard = 0, ace = 0, not7 = 0;
    for (const v of cs) { hard += v; if (v === 1) ace = 1; if (v !== 7) not7 = 1; }
    cols[j] = E.mkCol(hard, ace, cs.length, not7);
  }
  const deck = new Int32Array(11); for (let v = 1; v <= 10; v++) deck[v] = o.remaining[v - 1]; deck[o.current] += 1;
  return { cols, deck, rem: o.cards_left + 1, played: o.cards_dealt - 1, horizon: Infinity, busts: o.busts, stays: o.stays_left,
    prev: Math.min(o.streak, rules.sb.length - 1), score: o.score, over: false, reason: '',
    counts: { s21: 0, s5: 0, s777: 0, s521: 0, busts: o.busts, staysUsed: 2 - o.stays_left } };
}
const timelog = arg('timelog', null), movelog = arg('movelog', null); let gameNo = -1, flushed = -1;
let cpuMs = 0, maxMs = 0, slowRem = 0, moves = [], nDec = 0;
function flushGame() {
  if (gameNo < 0 || flushed === gameNo) return; flushed = gameNo;
  if (timelog) fs.appendFileSync(timelog, JSON.stringify({ game: gameNo, config, pid: process.pid, thinkCpuMs: Math.round(cpuMs), maxMoveMs: Math.round(maxMs), slowRem, decisions: nDec,
    search: policy.mid ? policy.mid.game() : null, exact: policy.stats, rssMB: Math.round(process.memoryUsage().rss / 1048576) }) + '\n');
  if (movelog) fs.appendFileSync(movelog, JSON.stringify({ game: gameNo, moves }) + '\n');
}
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.type === 'new_game') { flushGame(); gameNo = msg.game != null ? msg.game : gameNo + 1; cpuMs = 0; maxMs = 0; slowRem = 0; moves = []; nDec = 0; if (policy.reset) policy.reset(); }
  else if (msg.type === 'decide') {
    const st = toEngineState(msg.state); const u0 = process.cpuUsage();
    const m = policy.choose(st, msg.state.current);
    const u = process.cpuUsage(u0), ms = (u.user + u.system) / 1000; cpuMs += ms; nDec++; if (ms > maxMs) { maxMs = ms; slowRem = st.rem; }
    if (movelog) moves.push([st.rem, m.stay, m.col]);
    process.stdout.write(JSON.stringify({ stay: m.stay >= 0 ? m.stay : null, place: m.col }) + '\n');
  } else if (msg.type === 'quit') { flushGame(); process.exit(0); }
});
rl.on('close', () => { flushGame(); process.exit(0); });
