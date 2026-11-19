#!/usr/bin/env node
'use strict';
// Diagnostic adapter for deeper:16 slow-decision replay.
// Does not modify exact3.js / hybrid.js / adapter.js: monkeypatches createExact and
// withExactEndFallback after require, then speaks the same JSON-lines protocol as
// the frozen deeper:16 adapter. The policy never receives the future card order.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const FROZEN_ROOT = '/workspace/21lab/bench/frozen/exact-endgame-deeper@90c2d73f938b';
const FROZEN = path.join(FROZEN_ROOT, 'experiments/exact-endgame-deeper');
const CHAMPION_DIR = process.env.CHAMPION_DIR || path.join(FROZEN_ROOT, 'engine/twentyone-solver');
process.env.CHAMPION_DIR = CHAMPION_DIR;
process.env.TWENTYONE_SRC = path.join(CHAMPION_DIR, 'src');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const DIAG_LOG = arg('diag', process.env.DIAG_LOG || null);
const config = arg('config', 'deeper:16');

const cpuMs = (() => {
  let last = process.cpuUsage();
  return () => {
    const d = process.cpuUsage(last);
    last = process.cpuUsage();
    return (d.user + d.system) / 1000;
  };
})();
const cpuNow = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };

const E3 = require(path.join(FROZEN, 'js/exact3.js'));
const origCreateExact = E3.createExact;
const diag = emptyDiag();
let Xref = null;

function emptyDiag() {
  return {
    exactAttempted: false,
    outcome: 'base (rem>xK or cardsLeft mismatch)',
    exactMs: 0,
    baseMs: 0,
    baseCalled: false,
    statesBefore: 0,
    statesAfter: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    freshEst: 0,
    cap: 0,
    kernel: null,
    cleared: false,
    clearStates: null,
    clearBytes: null,
    rem: 0,
    cardsLeftToPlay: null,
    busts: null,
    stays: null,
    prev: null,
    err: null,
  };
}

E3.createExact = function (rules, opts) {
  opts = Object.assign({}, opts || {});
  if (argv.includes('--no-wasm')) opts.wasm = false;
  const X = origCreateExact(rules, opts);
  const oc = X.choose.bind(X);
  const oclear = X.clear.bind(X);
  X.clear = function () {
    diag.cleared = true;
    diag.clearStates = X.states();
    diag.clearBytes = X.bytes();
    return oclear();
  };
  X.choose = function (st, v, maxNew) {
    diag.exactAttempted = true;
    diag.statesBefore = X.states();
    diag.bytesBefore = X.bytes();
    diag.cap = X.cap();
    diag.kernel = X.kernel();
    diag.cleared = false;
    diag.clearStates = null;
    diag.clearBytes = null;
    const t0 = process.cpuUsage();
    let m;
    try {
      m = oc(st, v, maxNew);
    } catch (e) {
      const t1 = process.cpuUsage(t0);
      diag.exactMs = (t1.user + t1.system) / 1000;
      diag.statesAfter = X.states();
      diag.bytesAfter = X.bytes();
      diag.err = String(e && e.message || e);
      diag.outcome = diag.cleared ? 'FULL+clear (threw)' : 'exact threw';
      throw e;
    }
    const t1 = process.cpuUsage(t0);
    diag.exactMs = (t1.user + t1.system) / 1000;
    diag.statesAfter = X.states();
    diag.bytesAfter = X.bytes();
    if (m) diag.outcome = 'solved';
    else if (diag.cleared) diag.outcome = 'FULL+clear';
    else diag.outcome = 'budget ABORT';
    if (diag.cleared) diag.freshEst = Math.max(0, (diag.clearStates || 0) - diag.statesBefore);
    else diag.freshEst = diag.statesAfter - diag.statesBefore;
    return m;
  };
  Xref = X;
  return X;
};

const H = require(path.join(FROZEN, 'js/hybrid.js'));
const origFB = H.withExactEndFallback;
H.withExactEndFallback = function (rules, base, o, shared) {
  const wrappedBase = {
    choose(st, v) {
      const t0 = process.cpuUsage();
      const m = base.choose(st, v);
      const t1 = process.cpuUsage(t0);
      diag.baseMs += (t1.user + t1.system) / 1000;
      diag.baseCalled = true;
      return m;
    },
    reset() { if (base.reset) base.reset(); },
  };
  return origFB(rules, wrappedBase, o, shared);
};

const C = require(path.join(FROZEN, 'js/common.js'));
const E = C.E;
const { createPolicy } = require(path.join(FROZEN, 'js/policy_exact3.js'));

const baseSpec = JSON.parse(fs.readFileSync(path.join(CHAMPION_DIR, 'results', 'shipped_policies.json'), 'utf8'))['52'];
const spec = JSON.parse(JSON.stringify(baseSpec));
delete spec.exact;
if (!argv.includes('--keep-budget') && spec.deepen) spec.deepen.budgetMs = 0;
if (config === 'parity13') spec.exact3 = { xK: 13, logCap: 21, budget: 100000 };
else if (config.startsWith('deeper:')) {
  const [, K, B, L, ev] = config.split(':');
  spec.exact3 = { xK: +K, budget: B ? +B : 3200000, logCap: L ? +L : 25 };
  if (ev === 'eval') { spec.exact3.useStandInEvaluator = true; spec.exact3.depth = 1; }
} else throw new Error('diag_adapter only supports parity13 / deeper:* (got ' + config + ')');

const rules = C.R;
const policy = createPolicy(rules, spec);
const xK = spec.exact3.xK;
const budget = spec.exact3.budget;
const logCap = spec.exact3.logCap;

function toEngineState(o) {
  const cols = new Int32Array(4);
  for (let j = 0; j < 4; j++) {
    const cs = o.columns[j]; if (!cs.length) continue;
    let hard = 0, ace = 0, not7 = 0;
    for (const v of cs) { hard += v; if (v === 1) ace = 1; if (v !== 7) not7 = 1; }
    cols[j] = E.mkCol(hard, ace, cs.length, not7);
  }
  const deck = new Int32Array(11);
  for (let v = 1; v <= 10; v++) deck[v] = o.remaining[v - 1];
  deck[o.current] += 1;
  return {
    cols, deck, rem: o.cards_left + 1, played: o.cards_dealt - 1, horizon: Infinity,
    busts: o.busts, stays: o.stays_left, prev: Math.min(o.streak, rules.sb.length - 1),
    score: o.score, over: false, reason: '',
    counts: { s21: 0, s5: 0, s777: 0, s521: 0, busts: o.busts, staysUsed: 2 - o.stays_left },
  };
}

function resetDiag() {
  const d = emptyDiag();
  for (const k of Object.keys(diag)) delete diag[k];
  Object.assign(diag, d);
  if (Xref) { diag.cap = Xref.cap(); diag.kernel = Xref.kernel(); }
}

function append(obj) {
  if (!DIAG_LOG) return;
  fs.appendFileSync(DIAG_LOG, JSON.stringify(obj) + '\n');
}

let gameNo = -1, seed = null, ply = 0;
let gameCpu0 = 0, gameWall0 = 0, maxDec = 0, nDec = 0;
let rssMax = 0;

function flushGame(extra) {
  if (gameNo < 0) return;
  const rec = Object.assign({
    type: 'game',
    pid: process.pid,
    seed, game: gameNo, config, xK, budget, logCap,
    cpuMs: +(cpuNow() - gameCpu0).toFixed(1),
    wallMs: +(performance.now() - gameWall0).toFixed(1),
    maxDecMs: +maxDec.toFixed(1),
    decisions: nDec,
    rssMB: Math.round(process.memoryUsage().rss / 1048576),
    rssMaxMB: rssMax,
    kernel: Xref ? Xref.kernel() : null,
    cap: Xref ? Xref.cap() : null,
    tableEnd: Xref ? Xref.states() : null,
    bytesEnd: Xref ? Xref.bytes() : null,
  }, extra || {});
  append(rec);
  gameNo = -1;
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.type === 'new_game') {
    flushGame();
    gameNo = msg.game != null ? msg.game : gameNo + 1;
    seed = msg.seed != null ? msg.seed : null;
    ply = 0; nDec = 0; maxDec = 0;
    rssMax = Math.round(process.memoryUsage().rss / 1048576);
    if (policy.reset) policy.reset();
    gameCpu0 = cpuNow();
    gameWall0 = performance.now();
    append({
      type: 'new_game', pid: process.pid, seed, game: gameNo, config, xK, budget, logCap,
      tableAtStart: Xref ? Xref.states() : null, bytesAtStart: Xref ? Xref.bytes() : null,
      cap: Xref ? Xref.cap() : null, kernel: Xref ? Xref.kernel() : null,
    });
  } else if (msg.type === 'decide') {
    const recvCpu = cpuNow();
    const wall0 = performance.now();
    resetDiag();
    const st = toEngineState(msg.state);
    diag.rem = st.rem;
    diag.cardsLeftToPlay = E.cardsLeftToPlay(st);
    diag.busts = st.busts;
    diag.stays = st.stays;
    diag.prev = st.prev;
    if (Xref && !diag.exactAttempted) {
      diag.statesBefore = Xref.states();
      diag.bytesBefore = Xref.bytes();
      diag.cap = Xref.cap();
      diag.kernel = Xref.kernel();
    }
    const m = policy.choose(st, msg.state.current);
    const decCpu = cpuNow() - recvCpu;
    const decWall = performance.now() - wall0;
    nDec++; ply++;
    if (decCpu > maxDec) maxDec = decCpu;
    const rss = Math.round(process.memoryUsage().rss / 1048576);
    if (rss > rssMax) rssMax = rss;
    const occupancy = diag.cap ? diag.statesAfter / diag.cap : null;
    const memOccAfter = diag.cap ? diag.bytesAfter / (12 * diag.cap) : null;
    const memOccBefore = diag.cap ? diag.bytesBefore / (12 * diag.cap) : null;
    const fallbackKind = (!diag.exactAttempted) ? 'base (exact not attempted)'
      : (diag.outcome === 'solved') ? 'none'
      : diag.baseCalled ? 'base fallback' : 'unknown (exact failed, base not called)';
    append({
      type: 'decision', pid: process.pid, seed, game: gameNo, ply,
      rem: diag.rem, cardsLeftToPlay: diag.cardsLeftToPlay,
      busts: diag.busts, stays: diag.stays, prev: diag.prev,
      current: msg.state.current, score: msg.state.score,
      exactAttempted: diag.exactAttempted,
      outcome: diag.outcome,
      fallback: fallbackKind,
      exactMs: +diag.exactMs.toFixed(2),
      baseMs: +diag.baseMs.toFixed(2),
      cpuMs: +decCpu.toFixed(2),
      wallMs: +decWall.toFixed(2),
      freshEst: diag.freshEst,
      statesBefore: diag.statesBefore,
      statesAfter: diag.statesAfter,
      bytesBefore: diag.bytesBefore,
      bytesAfter: diag.bytesAfter,
      cap: diag.cap,
      occupancyBefore: memOccBefore,
      occupancyAfter: memOccAfter,
      statesFracBefore: diag.cap ? diag.statesBefore / diag.cap : null,
      statesFracAfter: occupancy,
      cleared: diag.cleared,
      clearStates: diag.clearStates,
      clearBytes: diag.clearBytes,
      kernel: diag.kernel,
      stay: m.stay >= 0 ? m.stay : null,
      place: m.col,
      exactFlag: !!m.exact,
      err: diag.err,
      rssMB: rss,
    });
    process.stdout.write(JSON.stringify({ stay: m.stay >= 0 ? m.stay : null, place: m.col }) + '\n');
  } else if (msg.type === 'game_over') {
    append({ type: 'game_over', pid: process.pid, seed, game: gameNo, score: msg.score });
  } else if (msg.type === 'quit') {
    flushGame();
    process.exit(0);
  }
});
rl.on('close', () => { flushGame(); process.exit(0); });
