#!/usr/bin/env node
'use strict';
// 21 Lab submission: champion deeper:16 plus a hard per-move visit cap (and an optional CPU backstop).
// JSON-lines protocol of bench/README.md. Only the observable state arrives; the deck order never reaches this process.
//
//   node adapter.js --config deeper16g[:visitCap]              visit-counter guard only; CPU guard OFF
//   node adapter.js --config deeper16g[:visitCap]:cpu=5000     plus the CPU backstop (ms)
//   node adapter.js --config deeper16g[:visitCap] --mac        same as :cpu=5000 (Landon's Mac/browser build)
//
// Defaults: xK 16, budget 3,200,000 new positions/move, logCap 25 (identical to deeper:16), visitCap from
// js/defaults.js (measured). A bare third numeric field is NOT treated as cpuMs — CPU is opt-in only.
//
// When the visit or CPU guard trips, the move falls back to the champion's own search (solved positions are
// kept), same as a budget ABORT, and a line is written to stderr and (if given) --timelog:
//   seed, move number, CPU ms, reason, visits.
// Budget aborts are the normal deeper:16 path and are not logged as guard trips.
//   --timelog FILE  append one JSON line per finished game, plus one JSON line per guard trip (type:"trip")
//   --movelog FILE  append one JSON line per game with the move list
//   --keep-budget   keep deepen.budgetMs of the champion search; default forces it to 0 like the Referee's adapter.
const fs = require('fs'), path = require('path'), readline = require('readline');
const DIR = process.env.CHAMPION_DIR || path.join(__dirname, '..', '..', 'engine', 'twentyone-solver');
const C = require('./js/common.js'); const E = C.E;
const D = require('./js/defaults.js');
const { createPolicy } = require('./js/policy.js');
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const config = arg('config', 'deeper16g'), keepBudget = argv.includes('--keep-budget'), mac = argv.includes('--mac');
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'results', 'shipped_policies.json'), 'utf8'))['52'];
const spec = JSON.parse(JSON.stringify(base)); delete spec.exact; if (!keepBudget && spec.deepen) spec.deepen.budgetMs = 0;

function parseConfig(cfg) {
  if (!cfg.startsWith('deeper16g')) throw new Error('unknown --config ' + cfg);
  const parts = cfg.split(':').slice(1);
  let visitCap = D.VISIT_CAP, cpuMs = 0;
  for (const p of parts) {
    if (p === '' || p == null) continue;
    if (/^cpu=/i.test(p)) {
      const n = +p.slice(4);
      if (!(n >= 0)) throw new Error('bad cpu= value in ' + cfg);
      cpuMs = n;
    } else if (/^\d+$/.test(p)) {
      visitCap = +p;
    } else {
      throw new Error('unknown deeper16g field "' + p + '" in ' + cfg + ' (CPU guard is :cpu=MS or --mac, not a bare number)');
    }
  }
  if (mac && cpuMs === 0) cpuMs = D.CPU_MS_MAC;
  if (!visitCap) throw new Error('deeper16g visitCap is not set (defaults.VISIT_CAP is still 0; pass :visitCap or fill defaults after measuring)');
  return { xK: D.XK, budget: D.BUDGET, logCap: D.LOGCAP, visitCap, cpuMs };
}
const gcfg = parseConfig(config);
spec.exact3g = gcfg;
const rules = C.R, policy = createPolicy(rules, spec);

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

const timelog = arg('timelog', null), movelog = arg('movelog', null);
let gameNo = -1, seed = null, moveNo = 0, flushed = -1;
let thinkCpu = 0, maxMoveMs = 0, nDec = 0, trips = 0, budgetAborts = 0, exactSolved = 0, moves = [];
let gameCpu0 = null;

function tripLine(extra) {
  return Object.assign({
    type: 'trip', game: gameNo, seed, move: moveNo, config, pid: process.pid,
    visitCap: gcfg.visitCap, cpuCap: gcfg.cpuMs,
  }, extra);
}
function logTrip(lm, rem) {
  trips++;
  const rec = tripLine({
    reason: lm.reason, visits: lm.visits, fresh: lm.fresh, cpuMs: Math.round(lm.cpuMs * 1000) / 1000,
    rem, kernel: lm.kernel,
  });
  const msg = `[deeper16g] GUARD trip reason=${rec.reason} seed=${seed} game=${gameNo} move=${moveNo} rem=${rem} visits=${rec.visits} cpuMs=${rec.cpuMs} visitCap=${gcfg.visitCap} cpuCap=${gcfg.cpuMs}`;
  process.stderr.write(msg + '\n');
  if (timelog) fs.appendFileSync(timelog, JSON.stringify(rec) + '\n');
}
function flushGame() {
  if (gameNo < 0 || flushed === gameNo) return;
  flushed = gameNo;
  let cpuMs = 0;
  if (gameCpu0 && typeof process.cpuUsage === 'function') {
    const u = process.cpuUsage(gameCpu0); cpuMs = (u.user + u.system) / 1000;
  }
  const row = { game: gameNo, seed, config, pid: process.pid, thinkCpuMs: Math.round(cpuMs), maxMoveMs: Math.round(maxMoveMs),
    decisions: nDec, trips, budgetAborts, exactSolved, visitCap: gcfg.visitCap, cpuCap: gcfg.cpuMs,
    rssMB: Math.round(process.memoryUsage().rss / 1048576) };
  if (timelog) fs.appendFileSync(timelog, JSON.stringify(row) + '\n');
  if (movelog) fs.appendFileSync(movelog, JSON.stringify({ game: gameNo, seed, config, moves }) + '\n');
}
function startGame(msg) {
  flushGame();
  gameNo = msg.game != null ? msg.game : gameNo + 1;
  seed = msg.seed != null ? msg.seed : null;
  moveNo = 0; thinkCpu = 0; maxMoveMs = 0; nDec = 0; trips = 0; budgetAborts = 0; exactSolved = 0; moves = [];
  gameCpu0 = (typeof process.cpuUsage === 'function') ? process.cpuUsage() : null;
  if (policy.reset) policy.reset();
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.type === 'new_game') startGame(msg);
  else if (msg.type === 'decide') {
    moveNo += 1; nDec += 1;
    const st = toEngineState(msg.state);
    const t0 = (typeof process.cpuUsage === 'function') ? process.cpuUsage() : null;
    const m = policy.choose(st, msg.state.current);
    let dt = 0;
    if (t0) { const u = process.cpuUsage(t0); dt = (u.user + u.system) / 1000; }
    if (dt > maxMoveMs) maxMoveMs = dt;
    const lm = policy.lastExact;
    if (lm) {
      if (lm.aborted && (lm.reason === 'visit' || lm.reason === 'cpu')) logTrip(lm, st.rem);
      else if (lm.aborted && lm.reason === 'budget') budgetAborts++;
      else if (!lm.aborted && lm.visits > 0) exactSolved++;
    }
    if (movelog) moves.push({ move: moveNo, rem: st.rem, stay: m.stay, col: m.col, exact: !!(m && m.exact),
      visits: lm ? lm.visits : 0, fresh: lm ? lm.fresh : 0, aborted: lm ? lm.aborted : false, reason: lm ? lm.reason : null, cpuMs: Math.round(dt * 1000) / 1000 });
    process.stdout.write(JSON.stringify({ stay: m.stay >= 0 ? m.stay : null, place: m.col }) + '\n');
  } else if (msg.type === 'quit') { flushGame(); process.exit(0); }
});
rl.on('close', () => { flushGame(); process.exit(0); });
