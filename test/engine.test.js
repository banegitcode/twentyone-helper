'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/engine.js');
const R = E.DEFAULT_RULES;

// play a scripted sequence: [[cardValue, col, stayCol?], ...] on a fresh game
function play(seq, opts) {
  const st = E.newGame(R, opts);
  const evs = seq.map(([v, col, stay]) => E.applyMove(R, st, v, { col, stay: stay == null ? -1 : stay }));
  return { st, evs };
}

test('deck: 52 cards, sixteen 10s, seeded and reproducible', () => {
  const d = E.shuffledDeck(7);
  assert.equal(d.length, 52);
  assert.equal(d.filter((v) => v === 10).length, 16);
  for (let v = 1; v <= 9; v++) assert.equal(d.filter((x) => x === v).length, 4);
  assert.deepEqual(d, E.shuffledDeck(7));
  assert.notDeepEqual(d, E.shuffledDeck(8));
});

test('plain 21 scores 400 and clears', () => {
  const { st, evs } = play([[10, 0], [5, 0], [6, 0]]);
  assert.equal(evs[2].pts, 400); assert.equal(st.cols[0], 0); assert.equal(st.score, 400);
});

test('ace counts 11 when it helps: A+K = 21', () => {
  const { st, evs } = play([[1, 0], [10, 0]]);
  assert.equal(evs[1].pts, 400); assert.equal(st.score, 400);
});

test('ace falls back to 1: A,9 (soft 20) then 5 = 15, not a bust', () => {
  const { st, evs } = play([[1, 0], [9, 0], [5, 0]]);
  assert.equal(evs[2].bust, false); assert.equal(E.softTotal(st.cols[0]), 15); assert.equal(st.busts, 0);
});

test('ace as 1 completes hard 21: 10,10,A', () => {
  const { evs } = play([[10, 0], [10, 0], [1, 0]]);
  assert.equal(evs[2].pts, 400);
});

test('two aces: A,A = soft 12; then 9 = 21', () => {
  const { st, evs } = play([[1, 0], [1, 0]]);
  assert.equal(E.softTotal(st.cols[0]), 12);
  assert.equal(E.applyMove(R, st, 9, { col: 0, stay: -1 }).pts, 400);
  assert.equal(evs[1].pts, 0);
});

test('three 7s score 600', () => {
  const { st, evs } = play([[7, 1], [7, 1], [7, 1]]);
  assert.equal(evs[2].pts, 600); assert.equal(st.counts.s777, 1);
});

test('5 cards without busting score 800', () => {
  const { st, evs } = play([[2, 0], [2, 0], [2, 0], [2, 0], [3, 0]]);
  assert.equal(evs[4].pts, 800); assert.equal(st.cols[0], 0);
});

test('5 cards totaling 21 score 1000 (not 400 or 800)', () => {
  const { evs } = play([[2, 0], [3, 0], [4, 0], [5, 0], [7, 0]]);
  assert.equal(evs[4].pts, 1000);
});

test('5-card 21 via soft ace scores 1000', () => {
  const { evs } = play([[1, 0], [2, 0], [2, 0], [3, 0], [3, 0]]);
  assert.equal(evs[4].pts, 1000);
});

test('bust: clears column, no points, counts a bust', () => {
  const { st, evs } = play([[10, 0], [9, 0], [5, 0]]);
  assert.equal(evs[2].bust, true); assert.equal(st.cols[0], 0); assert.equal(st.score, 0); assert.equal(st.busts, 1);
});

test('bust on the 5th card is a bust, not 800', () => {
  const { st, evs } = play([[5, 0], [5, 0], [5, 0], [5, 0], [2, 0]]);
  assert.equal(evs[4].bust, true); assert.equal(st.score, 0);
});

test('third bust ends the game, no perfect bonus', () => {
  const seq = [];
  for (let b = 0; b < 3; b++) seq.push([10, 0], [10, 0], [b + 2, 0]);
  const { st } = play(seq);
  assert.equal(st.over, true); assert.equal(st.reason, 'busts'); assert.equal(st.score, 0);
  assert.throws(() => E.applyMove(R, st, 9, { col: 0, stay: -1 }));
});

test('stay empties a column with no penalty; max 2', () => {
  const st = E.newGame(R);
  E.applyMove(R, st, 10, { col: 0, stay: -1 });
  E.applyMove(R, st, 9, { col: 0, stay: -1 });
  const ev = E.applyMove(R, st, 5, { col: 0, stay: 0 }); // stay col 0, then place there
  assert.equal(ev.bust, false); assert.equal(st.busts, 0); assert.equal(st.stays, 1); assert.equal(E.softTotal(st.cols[0]), 5);
  E.applyMove(R, st, 6, { col: 1, stay: 0 }); // stay col 0, place elsewhere
  assert.equal(st.cols[0], 0); assert.equal(st.stays, 0); assert.equal(st.score, 0);
  assert.throws(() => E.applyMove(R, st, 2, { col: 1, stay: 1 }), /no stays/);
});

test('streak: +250 on the 2nd scoring turn in a row, +500 on the 3rd', () => {
  // set up three columns one card away from 21, then score three turns in a row
  const { st, evs } = play([[10, 0], [10, 1], [10, 2], [1, 0], [1, 1], [1, 2]]);
  assert.deepEqual(evs.slice(3).map((e) => e.pts), [400, 400, 400]);
  assert.deepEqual(evs.slice(3).map((e) => e.streak), [0, 250, 500]);
  assert.equal(st.score, 1950);
});

test('a five-card 800 counts towards the streak (seen in the real game)', () => {
  const { evs } = play([[2, 0], [2, 0], [2, 0], [2, 0], [10, 1], [1, 1], [3, 0], [10, 2]]);
  assert.equal(evs[5].pts, 400); assert.equal(evs[5].streak, 0);
  assert.equal(evs[6].pts, 800); assert.equal(evs[6].streak, 250);
});

test('streak pays +250, +500, +1,000 (seen in the real game), resets after a miss, and a plain number means flat', () => {
  const seq = [[10, 0], [10, 1], [10, 2], [10, 3], [1, 0], [1, 1], [1, 2], [1, 3], [5, 0], [6, 0], [10, 0], [5, 1], [6, 1], [10, 1]];
  const { st, evs } = play(seq);
  assert.deepEqual(evs.slice(4, 8).map((e) => e.streak), [0, 250, 500, 1000]);
  assert.equal(evs[10].pts, 400); assert.equal(evs[10].streak, 0); // non-scoring cards reset the streak
  assert.equal(evs[13].pts, 400); assert.equal(evs[13].streak, 0);
  assert.equal(st.score, 6 * 400 + 1750);
  const R2 = E.compile({ streakBonus: 250 });
  const s2 = E.newGame(R2); const out = seq.slice(0, 8).map(([v, col]) => E.applyMove(R2, s2, v, { col, stay: -1 }).streak);
  assert.deepEqual(out.slice(4), [0, 250, 250, 250]);
  const R3 = E.compile({ streakBonus: [250, 500] }); // last entry repeats
  const s3 = E.newGame(R3); const o3 = seq.slice(0, 8).map(([v, col]) => E.applyMove(R3, s3, v, { col, stay: -1 }).streak);
  assert.deepEqual(o3.slice(4), [0, 250, 500, 500]);
});

test('search sees the growing streak: prefers the order that scores three turns running', () => {
  // exact solve of the last 3 cards (A, A, 5): columns 20, 20, 16. Scoring A, A, 5 in a row is worth 400*3 + 250 + 500.
  const st = E.newGame(R);
  const pol = E.createSearcher(R, { depth: 1, endgameK: 4 });
  [[10, 0], [10, 0], [10, 1], [10, 1], [10, 2], [6, 2]].forEach(([v, c]) => E.applyMove(R, st, v, { col: c, stay: -1 }));
  for (let v = 1; v <= 10; v++) st.deck[v] = 0; st.deck[1] = 2; st.deck[5] = 1; st.rem = 3;
  const m = pol.choose(st, 5); // 5 first: 21 on column 2, then both aces score -> 400 + 650 + 900 + perfect 1000
  assert.equal(m.col, 2); assert.ok(m.exact); assert.ok(Math.abs(m.value - (400 + 650 + 900 + 1000)) < 1e-6, String(m.value));
});

test('streak breaks on a non-scoring card and on a bust', () => {
  const a = play([[10, 0], [10, 1], [1, 0], [5, 2], [1, 1]]);
  assert.equal(a.evs[4].streak, 0);
  const b = play([[10, 0], [10, 1], [10, 2], [9, 2], [1, 0], [5, 2], [1, 1]]); // 5 on 19 busts
  assert.equal(b.evs[5].bust, true); assert.equal(b.evs[6].streak, 0);
});

test('stay does not break the streak by default; configurable', () => {
  const seq = [[10, 0], [10, 1], [9, 2], [1, 0], [1, 1, 2]];
  assert.equal(play(seq).evs[4].streak, 250);
  const R2 = E.compile({ stayBreaksStreak: true });
  const st = E.newGame(R2);
  let ev; for (const [v, col, stay] of seq) ev = E.applyMove(R2, st, v, { col, stay: stay == null ? -1 : stay });
  assert.equal(ev.streak, 0);
});

test('perfect bonus: +1000 when the deck runs out with zero busts', () => {
  const pol = E.createSearcher(R, { depth: 0 });
  let seen = 0;
  for (let seed = 1; seed < 60 && seen < 2; seed++) {
    // replay manually so we can check the bonus arithmetic
    const deck = E.shuffledDeck(seed), st = E.newGame(R); let sum = 0, last;
    for (const v of deck) { if (st.over) break; last = E.applyMove(R, st, v, pol.choose(st, v)); sum += last.pts + last.streak; }
    if (st.reason !== 'deck') continue;
    seen++;
    assert.equal(st.score, sum + (st.busts === 0 ? 1000 : 0));
    assert.equal(last.perfect, st.busts === 0 ? 1000 : undefined);
  }
  assert.ok(seen > 0);
});

test('perfect bonus is paid at a timer end with zero busts; game stops at N cards', () => {
  const { st } = play([[10, 0], [1, 0], [5, 1]], { horizon: 3 });
  assert.equal(st.over, true); assert.equal(st.reason, 'timer'); assert.equal(st.score, 1400);
});

test('config overrides flow through', () => {
  const R2 = E.compile({ points: { twentyOne: 500 }, streakBonus: 100, perfectBonus: 0 });
  const st = E.newGame(R2);
  E.applyMove(R2, st, 10, { col: 0, stay: -1 }); E.applyMove(R2, st, 10, { col: 1, stay: -1 });
  E.applyMove(R2, st, 1, { col: 0, stay: -1 });
  const ev = E.applyMove(R2, st, 1, { col: 1, stay: -1 });
  assert.equal(ev.pts, 500); assert.equal(ev.streak, 100); assert.equal(st.score, 1100);
});

test('search: takes an immediate 21 and uses a stay rather than bust', () => {
  const pol = E.createSearcher(R, { depth: 1 });
  const st = E.newGame(R);
  [[10, 0], [9, 1], [8, 2], [7, 3]].forEach(([v, c]) => E.applyMove(R, st, v, { col: c, stay: -1 }));
  assert.equal(pol.choose(st, 1).col, 0); // ace on 10 = 21
  const st2 = E.newGame(R);
  [[10, 0], [10, 0], [10, 1], [10, 1], [10, 2], [10, 2], [10, 3], [10, 3]].forEach(([v, c]) => E.applyMove(R, st2, v, { col: c, stay: -1 }));
  const m = pol.choose(st2, 5); // every column is 20: must stay, not bust
  assert.ok(m.stay >= 0);
});

test('exact endgame equals brute-force enumeration on the last 4 cards', () => {
  const pol = E.createSearcher(R, { depth: 1, endgameK: 4 });
  const greedy = E.createSearcher(R, { depth: 0 });
  const deck = E.shuffledDeck(3), st = E.newGame(R);
  for (let i = 0; i < 48; i++) E.applyMove(R, st, deck[i], greedy.choose(st, deck[i]));
  if (st.over) return;
  // brute force: expected final score under optimal play over all orderings of the last 4 cards
  function bf(s, rest) {
    if (s.over) return s.score;
    let tot = 0;
    for (let i = 0; i < rest.length; i++) {
      const v = rest[i], r2 = rest.slice(0, i).concat(rest.slice(i + 1)); let best = -1;
      for (let stay = -1; stay < 4; stay++) for (let col = 0; col < 4; col++) {
        if (stay >= 0 && (s.stays === 0 || s.cols[stay] === 0)) continue;
        const c = E.cloneGame(s); E.applyMove(R, c, v, { stay, col }); best = Math.max(best, bf(c, r2));
      }
      tot += best;
    }
    return tot / rest.length;
  }
  const rest = deck.slice(49), v = deck[48];
  let best = -1;
  for (let stay = -1; stay < 4; stay++) for (let col = 0; col < 4; col++) {
    if (stay >= 0 && (st.stays === 0 || st.cols[stay] === 0)) continue;
    const c = E.cloneGame(st); E.applyMove(R, c, v, { stay, col }); best = Math.max(best, bf(c, rest));
  }
  const m = pol.choose(st, v);
  assert.ok(m.exact);
  assert.ok(Math.abs(m.value + st.score - best) < 1e-6, `${m.value + st.score} vs ${best}`);
});

test('learned evaluator: features are column-order independent and the network leaf is used', () => {
  const st = E.newGame(R);
  [[10, 0], [6, 1], [1, 2], [7, 3], [7, 3]].forEach(([v, c]) => E.applyMove(R, st, v, { col: c, stay: -1 }));
  const f1 = E.featurize(st.cols, st.deck, st.rem, E.cardsLeftToPlay(st), st.busts, st.stays, st.prev, 4, new Float64Array(E.NF));
  const perm = Int32Array.from([st.cols[2], st.cols[3], st.cols[0], st.cols[1]]);
  const f2 = E.featurize(perm, st.deck, st.rem, E.cardsLeftToPlay(st), st.busts, st.stays, st.prev, 4, new Float64Array(E.NF));
  assert.deepEqual(Array.from(f1), Array.from(f2));
  assert.ok(f1.every((x) => Number.isFinite(x) && x >= 0 && x <= 1));
  // a network that only rewards "cards left" (feature 0) makes every non-terminal move tie on the leaf,
  // so an immediate 21 must win on its real points
  const W = new Array(E.NF).fill(0); W[0] = 1;
  const pol = E.createSearcher(R, { depth: 1, cache: true, nn: { scale: 1000, layers: [{ nIn: E.NF, nOut: 1, W, b: [0] }] } });
  const m = pol.choose(st, 1); // ace on the 10 = 21
  assert.equal(m.col, 0);
});
