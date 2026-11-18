'use strict';
// Strategy experiments (round 3): streak-chasing and bust-on-purpose players built on top of the shipped search.
// Everything in y_policies.js plus:
//   { type: 'shape', base, b, a, tie, early }
//     Re-ranks the base search's candidate moves (never the exact endgame's):
//       b   : adds b x (chance the NEXT card scores after this move) x (400 + streak bonus it would earn)
//       a   : adds a points to a move that busts a column while the game is still bust-free ("bust on purpose")
//       tie : if set, instead picks, among moves within `tie` points of the best, the one with the highest chance
//             that the next card scores
//       early: only re-rank while more than this many cards remain
//   { type: 'chaser' }  no search, no network: score now if possible, otherwise set up the best chance to score next card
const E = require('./engine.js'); const Y = require('./y_policies.js');
function nextScoreChance(rules, st) {              // chance that the next card can clear some column
  let hit = 0;
  for (let v = 1; v <= 10; v++) { const c = st.deck[v]; if (!c) continue; for (let j = 0; j < rules.cfg.numCols; j++) if (rules.pts[st.cols[j] * 11 + v] > 0) { hit += c; break; } }
  return st.rem ? hit / st.rem : 0;
}
function forcedBustChance(rules, st) {            // chance that the next card busts whichever column it goes on
  let bad = 0;
  for (let v = 1; v <= 10; v++) { const c = st.deck[v]; if (!c) continue; let ok = false; for (let j = 0; j < rules.cfg.numCols; j++) if (rules.pts[st.cols[j] * 11 + v] >= 0) { ok = true; break; } if (!ok) bad += c; }
  return st.rem ? bad / st.rem : 0;
}
function readyRanks(rules, st) {                  // how many different card values would score next turn
  let n = 0;
  for (let v = 1; v <= 10; v++) { if (!st.deck[v]) continue; for (let j = 0; j < rules.cfg.numCols; j++) if (rules.pts[st.cols[j] * 11 + v] > 0) { n++; break; } }
  return n;
}
function twoCardChance(rules, st) {               // expected scoring turns over the next two cards, placing the first greedily
  if (!st.rem) return 0; let tot = 0;
  for (let v = 1; v <= 10; v++) {
    const c = st.deck[v]; if (!c) continue; let best = 0;
    for (let j = 0; j < rules.cfg.numCols; j++) {
      const k = rules.pts[st.cols[j] * 11 + v]; if (k < 0) continue;
      const g = E.cloneGame(st); E.applyMove(rules, g, v, { stay: -1, col: j });
      const x = (k > 0 ? 1 : 0) + (g.over ? 0 : nextScoreChance(rules, g)); if (x > best) best = x;
    }
    tot += c * best;
  }
  return tot / st.rem;
}
function after(rules, st, v, m) { const g = E.cloneGame(st); const ev = E.applyMove(rules, g, v, m); return { g, ev }; }
function createS(rules, spec) {
  if (spec.exactEnd) { const b = Object.assign({}, spec); delete b.exactEnd; return require('./exact.js').withExactEnd(rules, createS(rules, b), spec.exactEnd); }
  if (spec.type === 'shape') {
    const base = createS(rules, spec.base), SB = rules.sb, mx = SB.length - 1;
    return {
      choose(st, v) {
        const m = base.choose(st, v);
        if (m.exact || !m.scores || m.scores.length < 2 || (spec.early && st.rem <= spec.early)) return m;
        let best = null, bestV = -Infinity; const top = m.value;
        for (const s of m.scores) {
          if (!Number.isFinite(s.value)) continue;
          const { g, ev } = after(rules, st, v, s); let p = g.over ? 0 : spec.two ? twoCardChance(rules, g) / 2 : nextScoreChance(rules, g);
          if ((spec.minPrev && g.prev < spec.minPrev) || (spec.late && st.rem > spec.late) || (spec.tens && st.deck[10] / st.rem < spec.tens)) p = 0;
          const risky = spec.safe != null && (g.over || g.busts > st.busts || forcedBustChance(rules, g) > spec.safe);   // 'safe': chase only when bust risk is low
          let val;
          if (risky) p = 0;
          if (spec.tie) { if (s.value < top - spec.tie) continue; val = p * 1e6 + s.value; }
          else {
            val = s.value + (spec.b || 0) * p * (400 + SB[Math.min(g.prev, mx)]);
            if (spec.a && st.busts === 0 && g.busts === 1) val += spec.a;
            if (spec.ranks && !g.over) val += spec.ranks * readyRanks(rules, g);
            if (spec.eleven && !g.over) for (let j = 0; j < rules.cfg.numCols; j++) if (rules.pts[g.cols[j] * 11 + 10] > 0) val += spec.eleven;
            if (spec.stayStreak && s.stay >= 0 && ev.pts > 0 && st.prev >= 2) val += spec.stayStreak;
          }
          if (val > bestV) { bestV = val; best = s; }
        }
        return best ? { stay: best.stay, col: best.col, value: best.value } : m;
      },
      reset() { if (base.reset) base.reset(); },
    };
  }
  if (spec.type === 'chaser') {
    const NC = rules.cfg.numCols;
    return {
      choose(st, v) {
        let best = null, bestV = -Infinity;
        const tryMove = (m) => {
          const { g, ev } = after(rules, st, v, m); let val;
          if (ev.bust) val = -1e6 - (m.stay >= 0 ? 1 : 0);
          else if (ev.pts > 0) val = 1e6 + ev.pts + nextScoreChance(rules, g) * 100;
          else val = nextScoreChance(rules, g) * 1000 + E.hardOf(g.cols[m.col]) - (m.stay >= 0 ? 500 : 0);
          if (val > bestV) { bestV = val; best = m; }
        };
        for (let j = 0; j < NC; j++) tryMove({ stay: -1, col: j });
        if (bestV < 0 && st.stays > 0) for (let i = 0; i < NC; i++) if (st.cols[i] !== 0) tryMove({ stay: i, col: i });
        return best;
      },
    };
  }
  if (spec.type === 'sw') { const a = createS(rules, spec.early), b = createS(rules, spec.late); return { choose(st, v) { return st.rem <= spec.at ? b.choose(st, v) : a.choose(st, v); }, reset() { if (a.reset) a.reset(); if (b.reset) b.reset(); } }; }
  return Y.createPolicy(rules, spec);
}
module.exports = { createPolicy: createS };
