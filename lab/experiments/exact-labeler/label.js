#!/usr/bin/env node
'use strict';
// Exact batch labeler for 21 Learner.  stdin: JSON lines, one position each; stdout: one JSON line per input line (same order).
//   input : {"id":..., "cols":[[v,..],[..],[..],[..]], "deck":[13 counts by rank A,2..10,J,Q,K] (or 10 counts by value), "busts":0..3, "stays":0..2, "streak":0..4+, "score":any}
//   output: {"id", "v": expected points still to come under optimal play from this PRE-REVEAL state (incl. the Perfect Bonus if busts==0 at the end),
//            "ok": true|false, "ms": wall ms of the solve, "cpu_ms": CPU ms of the solve (use this when the box is loaded), "n": cards left, "pos": new table positions this solve needed, "err": reason when ok is false}
// Built on Landon's exact2 (WASM kernel, JS fallback), read-only from engine/twentyone-solver/src.  See README.md for every format assumption.
//   node label.js [--mem-mb 800] [--max-positions 60000000] [--wasm 1|0] [--cols values|ranks]   [--flag-fallback] [--deep 20 [--deep-mode expectimax|rollout] [--rollout S] [--samples S] [--try-exact] [--frontier 16]] [--cold 1 clears the table before every position: for timing] (use nice on the shared box)
const path = require('path'), readline = require('readline');
const SRC = process.env.TWENTYONE_SRC || path.join(__dirname, '../../engine/twentyone-solver/src');
const E = require(path.join(SRC, 'engine.js')), X2 = require(path.join(SRC, 'exact2.js'));
const R = E.DEFAULT_RULES;
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const memMB = +arg('mem-mb', 800), maxPos = +arg('max-positions', 60000000), useWasm = arg('wasm', '1') !== '0', colsMode = arg('cols', 'values'), cold = arg('cold', '0') === '1', flagFb = argv.includes('--flag-fallback');
const deepMax = +arg('deep', 0), samplesTop = +arg('samples', 0), FRONT = +arg('frontier', 16), tryExact = argv.includes('--try-exact'), deepMode = arg('deep-mode', 'expectimax'), rolloutS = +arg('rollout', 4);
// table bytes = 12 << logCap  (measured: ~0.72-0.76 * 2^logCap positions fit, ~16 bytes of RSS per stored position)
let logCap = Math.floor(Math.log2(memMB * 1048576 / 12)); logCap = Math.max(18, Math.min(28, logCap));
const X = X2.createExact(R, { logCap, wasm: useWasm });
// --flag-fallback: would the SHIPPED52 exact endgame (xK 13, budget 100,000 new positions per move, logCap 21) give up here and let the network search play?
//   shipped52's rule: exact is tried only when cards left <= 13; X.choose(st, v, 100000) returns null when it needs more than 100k new positions.  The decision happens AFTER the next
//   card v is revealed, and the labeled position is the pre-reveal state, so we run choose(st, v, 100000) for every value v still in the deck on a FRESH table (cleared for each v:
//   pessimistic for positions the real policy reaches after an earlier, larger solve of the same game kept most positions in its table) and report
//   fb_frac = share of next cards (weighted by how many are left in the deck) for which it gives up, fb = fb_frac >= 0.5, fb_any = fb_frac > 0.
//   More than 13 cards left: shipped52 does not even try the exact solve -> fb true, fb_frac 1, fb_why "gt13".
const XF = flagFb ? X2.createExact(R, { logCap: 21 }) : null; const FB_K = 13, FB_BUDGET = 100000;
function fallbackFlag(st, out) {
  if (st.rem > FB_K) { out.fb = true; out.fb_frac = 1; out.fb_why = 'gt13'; return; }
  let w = 0, bad = 0;
  for (let v = 1; v <= 10; v++) { const c = st.deck[v]; if (!c) continue; XF.clear(); const m = XF.choose(st, v, FB_BUDGET); w += c; if (!m) bad += c; }
  out.fb_frac = w ? +(bad / w).toFixed(4) : 0; out.fb = out.fb_frac >= 0.5; out.fb_any = bad > 0; if (bad) out.fb_why = 'budget100k';
}
const PERFECT = R.cfg.perfectBonus, TOP = R.sb.length - 1;

function toState(p) {
  if (!Array.isArray(p.cols) || p.cols.length !== 4) throw new Error('cols must be 4 lists');
  const warn = [], vcount = new Int32Array(11), cols = new Int32Array(4);
  for (let j = 0; j < 4; j++) {
    const cs = p.cols[j]; if (!Array.isArray(cs)) throw new Error('column ' + j + ' is not a list');
    if (cs.length > 4) throw new Error('column ' + j + ' has ' + cs.length + ' cards (a 5th card always clears the column)');
    let hard = 0, ace = 0, not7 = 0;
    for (const x0 of cs) {
      let x = x0; if (!Number.isInteger(x) || x < 1 || x > 13) throw new Error('bad card ' + x0 + ' in cols');
      if (x > 10) { if (colsMode === 'values') warn.push('cols value ' + x + ' read as rank J/Q/K = 10'); x = 10; }
      hard += x; vcount[x]++; if (x === 1) ace = 1; if (x !== 7) not7 = 1;
    }
    if (cs.length) {
      if (hard > 21) throw new Error('column ' + j + ' is already bust (' + hard + ')');
      if (hard === 21 || (ace && hard + 10 === 21)) throw new Error('column ' + j + ' totals 21: it would have been cleared');
      cols[j] = E.mkCol(hard, ace, cs.length, not7);
    }
  }
  const dk = p.deck, deck = new Int32Array(11); let rem = 0;
  if (!Array.isArray(dk) || (dk.length !== 13 && dk.length !== 10)) throw new Error('deck must have 13 counts by rank (A,2..10,J,Q,K) or 10 by value');
  dk.forEach((c, i) => {
    if (!Number.isInteger(c) || c < 0) throw new Error('bad deck count');
    const v = dk.length === 13 ? Math.min(i + 1, 10) : i + 1;
    if (dk.length === 13 && c > 4) throw new Error('more than 4 cards of rank ' + (i + 1));
    deck[v] += c; rem += c;
  });
  for (let v = 1; v <= 10; v++) if (deck[v] + vcount[v] > (v === 10 ? 16 : 4)) throw new Error('more cards of value ' + v + ' than exist (columns + deck)');
  const busts = p.busts | 0, stays = p.stays | 0, streak = p.streak | 0;
  if (busts < 0 || busts > 3) throw new Error('busts out of range'); if (stays < 0 || stays > 2) throw new Error('stays out of range'); if (streak < 0) throw new Error('streak < 0');
  const ncol = [...vcount].reduce((a, b) => a + b, 0); if (ncol + rem > 52) throw new Error('more than 52 cards in columns + deck');
  const st = E.newGame(R); st.cols = cols; st.deck = deck; st.rem = rem; st.played = 52 - rem; st.busts = busts; st.stays = stays; st.prev = Math.min(streak, TOP); st.score = 0;
  return { st, warn, rem };
}


// ---- --deep MAXN: depth-limited expectimax target for positions with FRONT+1 .. MAXN cards left (exact:false in the output).
// Chance and decision nodes are expanded (all distinct actions: card on each distinct live column, or Stay i + card on i only when no column is empty -- exact2's own restriction)
// until exactly FRONT (16) cards are left; each such position gets its EXACT value from exact2 (one shared table, so the sub-positions are reused).  At the TOP chance node only,
// --samples S > 0 averages over S individual unseen cards drawn without replacement (seeded by the id: reproducible) instead of all values: unbiased, with standard error `se`
// reported.  All lower chance nodes are expanded fully (sampling inside a max would bias the value upward).  The whole target shares the position budget (--max-positions): exceeded -> ok:false.
function hash32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
class OutOfBudget extends Error {}
function actionsOf(st) {
  const acts = [], seen = new Set(); let empty = false;
  for (let j = 0; j < 4; j++) if (!st.cols[j]) empty = true;
  for (let j = 0; j < 4; j++) { if (seen.has(st.cols[j])) continue; seen.add(st.cols[j]); acts.push({ stay: -1, col: j }); }
  if (st.stays > 0 && !empty) { const s2 = new Set(); for (let j = 0; j < 4; j++) { if (s2.has(st.cols[j])) continue; s2.add(st.cols[j]); acts.push({ stay: j, col: j }); } }
  return acts;
}
function deepLabel(st0, id, out) {
  let used = 0, n16 = 0; const memo = new Map();
  const key = (st) => Array.from(st.cols).sort((a, b) => a - b).join(',') + '|' + st.busts + st.stays + st.prev + '|' + Array.from(st.deck).join('');
  function exactAt(st) {
    const k = 'E' + key(st); if (memo.has(k)) return memo.get(k);
    const left = maxPos - used; if (left <= 0) throw new OutOfBudget();
    const s0 = X.states(), r = X.ponder(st, left), s1 = X.states();
    if (r !== 1) throw new OutOfBudget(r === -1 ? 'table' : 'positions');
    used += s1 >= s0 ? s1 - s0 : s1; n16++; const v = X.value(st); memo.set(k, v); return v;
  }
  function node(st, top) {
    if (st.rem <= FRONT) return exactAt(st);
    const k = 'D' + key(st); if (!top && memo.has(k)) return memo.get(k);
    let cards = [];                                    // [value, weight]
    if (top && samplesTop > 0) {
      const pool = []; for (let v = 1; v <= 10; v++) for (let c = 0; c < st.deck[v]; c++) pool.push(v);
      const rng = E.mulberry32(hash32(String(id))); for (let i = 0; i < Math.min(samplesTop, pool.length); i++) { const j = i + Math.floor(rng() * (pool.length - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; cards.push([pool[i], 1]); }
    } else for (let v = 1; v <= 10; v++) if (st.deck[v]) cards.push([v, st.deck[v]]);
    let sw = 0, sum = 0, sq = 0; const acts = actionsOf(st);
    for (const [v, w] of cards) {
      let best = -Infinity;
      for (const a of acts) {
        const s2 = E.cloneGame(st); s2.score = 0; E.applyMove(R, s2, v, a);
        const q = s2.score + (s2.over ? 0 : node(s2, false)); if (q > best) best = q;
      }
      sw += w; sum += w * best; sq += w * best * best;
    }
    const val = sum / sw;
    if (top && samplesTop > 0 && cards.length > 1) { const m = sum / sw, varr = Math.max(0, sq / sw - m * m) * cards.length / (cards.length - 1); out.se = +Math.sqrt(varr / cards.length).toFixed(3); }
    if (!top) memo.set(k, val); return val;
  }
  const v = node(st0, true);
  out.v = v; out.ok = true; out.exact = false; out.mode = 'depth-limited'; out.depth = st0.rem - FRONT; out.frontier = FRONT; out.samples = samplesTop > 0 ? Math.min(samplesTop, st0.rem) : 'all'; out.n16 = n16; out.pos = used;
}

// ---- --deep-mode rollout [--rollout S]: CHEAPER, noisier, BIASED-DOWN target for FRONT+1..MAXN cards left (exact:false, mode "rollout").
// S simulated continuations: draw the next cards at random from the unseen multiset (seeded by id; simulated draws, never the real future), let the champion's own network search
// (shipped52 without exact endgame, wall-clock deepening off) choose every action until exactly FRONT cards are left, and add the EXACT value of the position reached.
// label = mean over paths of (points collected on the path + exact value at the frontier), se = sd/sqrt(S).  This is the value of "champion policy for the first n-16 cards, then optimal",
// i.e. an unbiased estimate of a LOWER BOUND of the optimal value (the gap is the champion's loss over those cards: small but positive).  Cost: S exact 16-card solves (tables partly shared).
let ROLLPOL = null;
function rolloutLabel(st0, id, out) {
  if (!ROLLPOL) { const spec = JSON.parse(require('fs').readFileSync(path.join(SRC, '../results/shipped_policies.json')))['52']; delete spec.exact; if (spec.deepen) spec.deepen.budgetMs = 0; ROLLPOL = require(path.join(SRC, 'x_policies.js')).createPolicy(R, spec); }
  let used = 0, n16 = 0; const vals = [];
  function exactAt(st) { const left = maxPos - used; if (left <= 0) throw new OutOfBudget(); const s0 = X.states(), r = X.ponder(st, left), s1 = X.states(); if (r !== 1) throw new OutOfBudget(); used += s1 >= s0 ? s1 - s0 : s1; n16++; return X.value(st); }
  for (let k = 0; k < rolloutS; k++) {
    const rng = E.mulberry32((hash32(String(id)) ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0); const st = E.cloneGame(st0); st.score = 0; if (ROLLPOL.reset) ROLLPOL.reset(); let dead = false;
    while (st.rem > FRONT) {
      let r = Math.floor(rng() * st.rem), v = 1; for (; v <= 10; v++) { r -= st.deck[v]; if (r < 0) break; }
      const m = ROLLPOL.choose(st, v); E.applyMove(R, st, v, m); if (st.over) { dead = true; break; }
    }
    vals.push(st.score + (dead ? 0 : exactAt(st)));
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length; let sd = 0; if (vals.length > 1) sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
  out.v = mean; out.ok = true; out.exact = false; out.mode = 'rollout'; out.depth = st0.rem - FRONT; out.frontier = FRONT; out.paths = rolloutS; out.se = +(sd / Math.sqrt(vals.length)).toFixed(2); out.bias = 'lower bound (champion policy above the frontier)'; out.n16 = n16; out.pos = used;
}
function label(p) {
  const out = { id: p.id, v: null, ok: false, ms: 0 };
  let t0 = performance.now(), c0 = process.cpuUsage();
  try {
    const { st, warn, rem } = toState(p); out.n = rem; if (warn.length) out.warn = Array.from(new Set(warn)).join('; ');
    if (flagFb && st.busts < 3 && rem > 0) { const t1 = performance.now(); fallbackFlag(st, out); out.fb_ms = +(performance.now() - t1).toFixed(3); }
    if (st.busts >= 3) { out.v = 0; out.ok = true; out.exact = true; out.ms = 0; out.pos = 0; return out; }
    if (rem === 0) { out.v = st.busts === 0 ? PERFECT : 0; out.ok = true; out.exact = true; out.pos = 0; return out; }
    if (cold) X.clear(); t0 = performance.now(); c0 = process.cpuUsage(); const s0 = X.states();
    const wantDeep = deepMax > 0 && rem > FRONT;
    if (wantDeep && rem > deepMax) out.err = 'more than --deep ' + deepMax + ' cards left';
    else {
      let done = false;
      if (!wantDeep || tryExact) {
        const r = X.ponder(st, maxPos);                  // r: 1 solved, 0 position budget exceeded (progress kept), -1 table full (table emptied)
        { const s1 = X.states(); out.pos = r === -1 ? null : (s1 >= s0 ? s1 - s0 : s1); }   // s1 < s0: the table was rebuilt (new game): everything now stored is new
        if (r === 1) { out.v = X.value(st); out.ok = true; out.exact = true; done = true; }
        else if (!wantDeep) out.err = r === 0 ? 'position budget exceeded (' + maxPos + ')' : 'table full (memory budget ' + memMB + ' MB)';
      }
      if (!done && wantDeep) {
        try { if (deepMode === 'rollout') rolloutLabel(st, p.id, out); else deepLabel(st, p.id, out); delete out.err; } catch (e) { if (e instanceof OutOfBudget) { out.ok = false; out.err = 'depth-limited target exceeded the budget (' + (e.message || 'positions') + ')'; } else throw e; }
      }
    }
  } catch (e) { out.err = String(e.message || e); }
  out.ms = +(performance.now() - t0).toFixed(3); { const c = process.cpuUsage(c0); out.cpu_ms = +((c.user + c.system) / 1000).toFixed(3); }
  return out;
}
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let p; try { p = JSON.parse(line); } catch (e) { process.stdout.write(JSON.stringify({ id: null, v: null, ok: false, ms: 0, err: 'bad json' }) + '\n'); return; }
  process.stdout.write(JSON.stringify(label(p)) + '\n');
});
