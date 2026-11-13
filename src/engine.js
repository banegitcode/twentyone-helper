'use strict';
// "21" solitaire engine + search policies. Runs unchanged in Node and in the browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TwentyOne = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // ---------------------------------------------------------------------------
  // ALL RULES AND POINT VALUES LIVE HERE. Edit and everything else follows.
  // ---------------------------------------------------------------------------
  const CONFIG = {
    numCols: 4,
    target: 21,
    maxCardsPerCol: 5,          // reaching this many cards without busting clears the column
    maxBusts: 3,                // this bust ends the game
    maxStays: 2,                // stays per game
    points: {
      twentyOne: 400,           // column hits exactly 21
      threeSevens: 600,         // column of exactly three 7s (instead of 400)
      fiveCard: 800,            // 5 cards without busting
      fiveCard21: 1000,         // 5 cards totaling exactly 21 (instead of 400/800)
    },
    // Streak bonus, added when a turn scores right after other scoring turns. Entry 0 is the bonus for the
    // 2nd scoring turn in a row, entry 1 for the 3rd, and so on; the last entry repeats for longer streaks.
    // Seen in the real game: +250 (2 in a row), +500 (3 in a row), +1,000 (4 in a row). 5+ is an assumption
    // (doubles once more to +2,000, then stays there); 5+ streaks happen in well under 1% of games.
    // A plain number means the same flat bonus every time.
    streakBonus: [250, 500, 1000, 2000],
    stayBreaksStreak: false,    // does using a Stay reset the streak?
    perfectBonus: 1000,         // finishing with zero busts
    timerCards: Infinity,       // short-game: only this many cards get played
    // 13 ranks and their values (Ace is 1, counted as 11 when that helps)
    ranks: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    rankValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10],
    copiesPerRank: 4,
  };

  // Column code: hard total (bits 0-4), has-ace (bit 5), card count (bits 6-8),
  // contains-a-non-7 (bit 9). 0 = empty column.
  const hardOf = (c) => c & 31, aceOf = (c) => (c >> 5) & 1, nOf = (c) => (c >> 6) & 7, not7Of = (c) => (c >> 9) & 1;
  const mkCol = (hard, ace, n, not7) => hard | (ace << 5) | (n << 6) | (not7 << 9);

  function compile(cfg) {
    cfg = Object.assign({}, CONFIG, cfg || {});
    cfg.points = Object.assign({}, CONFIG.points, (cfg && cfg.points) || {});
    if (cfg.target !== 21 || cfg.maxCardsPerCol > 7) throw new Error('the search evaluator assumes target 21 and at most 7 cards per column');
    const T = cfg.target;
    // sb[k] = bonus when a turn scores with k scoring turns immediately before it (k capped at sb.length - 1)
    const rawSb = cfg.streakBonus == null ? CONFIG.streakBonus : cfg.streakBonus;
    const sb = [0].concat(Array.isArray(rawSb) ? rawSb : [rawSb]).map(Number);
    if (sb.length < 2 || sb.length > 10 || sb.some((x) => !Number.isFinite(x))) throw new Error('streakBonus must be a number or a list of 1-9 numbers');
    const next = new Int32Array(1024 * 11), pts = new Int32Array(1024 * 11); // pts: -1 bust, 0 nothing, >0 cleared
    for (let c = 0; c < 1024; c++) for (let v = 1; v <= 10; v++) {
      const h = hardOf(c) + v, a = aceOf(c) | (v === 1 ? 1 : 0), n = nOf(c) + 1, nt = not7Of(c) | (v !== 7 ? 1 : 0);
      const k = c * 11 + v;
      if (h > T) { pts[k] = -1; next[k] = 0; continue; }
      const hit = h === T || (a && h + 10 === T);
      if (hit) {
        pts[k] = n >= cfg.maxCardsPerCol ? cfg.points.fiveCard21 : (!nt && n === 3 ? cfg.points.threeSevens : cfg.points.twentyOne);
        next[k] = 0;
      } else if (n >= cfg.maxCardsPerCol) { pts[k] = cfg.points.fiveCard; next[k] = 0; }
      else { pts[k] = 0; next[k] = mkCol(h, a, n, nt); }
    }
    const deck = new Int32Array(11);
    cfg.rankValues.forEach((v) => (deck[v] += cfg.copiesPerRank));
    return { cfg, next, pts, sb, fullDeck: deck, deckSize: cfg.rankValues.length * cfg.copiesPerRank };
  }
  const DEFAULT_RULES = compile();

  const softTotal = (c) => { const h = hardOf(c); return aceOf(c) && h + 10 <= 21 ? h + 10 : h; };

  // ---------------------------------------------------------------------------
  // Seeded RNG + shuffles
  // ---------------------------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Returns an array of card VALUES (1..10) in deal order.
  function shuffledDeck(seed, rules) {
    rules = rules || DEFAULT_RULES;
    const rng = mulberry32(seed * 2654435761 + 12345);
    const d = [];
    rules.cfg.rankValues.forEach((v) => { for (let i = 0; i < rules.cfg.copiesPerRank; i++) d.push(v); });
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = d[i]; d[i] = d[j]; d[j] = t; }
    return d;
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  function newGame(rules, opts) {
    rules = rules || DEFAULT_RULES; opts = opts || {};
    const horizon = opts.horizon != null ? opts.horizon : rules.cfg.timerCards;
    return {
      cols: new Int32Array(rules.cfg.numCols), deck: Int32Array.from(rules.fullDeck), rem: rules.deckSize,
      played: 0, horizon, busts: 0, stays: rules.cfg.maxStays, prev: 0, score: 0,
      over: false, reason: '', counts: { s21: 0, s5: 0, s777: 0, s521: 0, busts: 0, staysUsed: 0 },
    };
  }
  const cardsLeftToPlay = (st) => Math.min(st.rem, st.horizon - st.played);
  function cloneGame(st) {
    return Object.assign({}, st, { cols: Int32Array.from(st.cols), deck: Int32Array.from(st.deck), counts: Object.assign({}, st.counts) });
  }

  // move = { stay: -1 | colIndex, col: colIndex }. Returns an event describing what happened.
  function applyMove(rules, st, v, move) {
    if (st.over) throw new Error('game over');
    if (st.deck[v] <= 0) throw new Error('card not in deck: ' + v);
    const cfg = rules.cfg, ev = { card: v, stay: move.stay, col: move.col, pts: 0, streak: 0, bust: false, cleared: false };
    if (move.stay >= 0) {
      if (st.stays <= 0) throw new Error('no stays left');
      st.cols[move.stay] = 0; st.stays--; st.counts.staysUsed++;
      if (cfg.stayBreaksStreak) st.prev = 0;
    }
    const k = st.cols[move.col] * 11 + v, p = rules.pts[k];
    st.deck[v]--; st.rem--; st.played++;
    if (p < 0) {
      ev.bust = true; ev.cleared = true; st.busts++; st.counts.busts++; st.cols[move.col] = 0; st.prev = 0;
    } else if (p > 0) {
      ev.cleared = true; ev.pts = p; ev.streak = rules.sb[st.prev];
      st.score += p + ev.streak; if (st.prev < rules.sb.length - 1) st.prev++; st.cols[move.col] = 0;
      if (p === cfg.points.twentyOne) st.counts.s21++; else if (p === cfg.points.fiveCard) st.counts.s5++;
      else if (p === cfg.points.threeSevens) st.counts.s777++; else st.counts.s521++;
    } else { st.cols[move.col] = rules.next[k]; st.prev = 0; }
    if (st.busts >= cfg.maxBusts) { st.over = true; st.reason = 'busts'; }
    else if (st.rem === 0) { st.over = true; st.reason = 'deck'; }
    else if (st.played >= st.horizon) { st.over = true; st.reason = 'timer'; }
    if (st.over && st.busts === 0) { st.score += cfg.perfectBonus; ev.perfect = cfg.perfectBonus; }
    ev.score = st.score;
    return ev;
  }

  // ---------------------------------------------------------------------------
  // Features for the learned (neural) evaluator. Describes a position between cards.
  // ---------------------------------------------------------------------------
  const NF = 56;
  const _ord = new Int32Array(8), _key = new Int32Array(8);
  function featurize(cols, deck, rem, H, busts, stays, prev, NC, f) {
    f[0] = H / 52; f[1] = rem / 52; f[2] = busts === 0 ? 1 : 0; f[3] = busts === 1 ? 1 : 0; f[4] = busts >= 2 ? 1 : 0;
    f[5] = stays / 2; f[6] = prev > 0 ? 1 : 0; f[7] = (prev > 5 ? 5 : prev) / 5;
    for (let v = 1; v <= 10; v++) f[7 + v] = deck[v] / rem;
    // columns sorted by soft total, high first; empty columns last
    for (let i = 0; i < NC; i++) {
      const c = cols[i], h = c & 31; _ord[i] = i;
      _key[i] = c === 0 ? -1 : (((c >> 5) & 1) && h <= 11 ? h + 10 : h) * 8 + ((c >> 6) & 7);
    }
    for (let i = 1; i < NC; i++) { const o = _ord[i], k = _key[o]; let j = i - 1; while (j >= 0 && _key[_ord[j]] < k) { _ord[j + 1] = _ord[j]; j--; } _ord[j + 1] = o; }
    let room = 0, needMask = 0, p = 20;
    for (let q = 0; q < 4; q++, p += 9) {
      const c = q < NC ? cols[_ord[q]] : 0;
      if (c === 0) { for (let x = 0; x < 9; x++) f[p + x] = 0; if (q < NC) room = 21; continue; }
      const hard = c & 31, ace = (c >> 5) & 1, n = (c >> 6) & 7, not7 = (c >> 9) & 1, need = 21 - hard, softA = ace && hard <= 11 ? 1 : 0;
      if (need > room) room = need;
      let make = 0;
      if (need <= 10) { make = deck[need]; needMask |= 1 << need; }
      else if (ace) { make = deck[need - 10]; needMask |= 1 << (need - 10); }
      else if (hard === 10) { make = deck[1]; needMask |= 2; }
      let bust = 0; for (let x = need + 1; x <= 10; x++) bust += deck[x];
      f[p] = 1; f[p + 1] = (softA ? hard + 10 : hard) / 21; f[p + 2] = hard / 21; f[p + 3] = softA; f[p + 4] = n / 4;
      f[p + 5] = n === 4 ? 1 : 0; f[p + 6] = !not7 && n <= 2 ? 1 : 0; f[p + 7] = make / rem; f[p + 8] = bust / rem;
    }
    let a = 0; if (needMask) for (let x = 1; x <= 10; x++) if (needMask & (1 << x)) a += deck[x];
    let fo = 0; if (room < 10) for (let x = room + 1; x <= 10; x++) fo += deck[x];
    f[18] = a / rem; f[19] = fo / rem;
    return f;
  }

  // ---------------------------------------------------------------------------
  // Search policy
  // ---------------------------------------------------------------------------
  // Leaf weights. Leaf value estimates the future of a non-terminal state.
  const BASELINE_WEIGHTS = {
    fut: [140, 100, 60],   // per remaining card, by busts so far (difference = bust cost per card left)
    perfect: 1000,         // flat value kept while busts == 0 (first bust "costs" this)
    stay: 8,               // per stay left per remaining card (stay cost scales with cards left)
    stayCap: 52,
    streak: 0,             // value of carrying a live streak into the leaf
    streak2: 0,            // extra value per additional scoring turn already in that streak
    perfH: 0,              // perfect value shrinks by this per remaining card (more cards = more chances to bust)
    p21: 300,              // x P(random next card makes this column exactly 21)
    safe: 40,              // x P(random next card does not bust this column)
    four: 150,             // x P(safe) when column already holds 4 cards (5-card clear)
    pAny: 0,               // x P(next card completes at least one column) (distinct ranks, no double count)
    forced: [0, 0, 0],     // x P(next card busts every column), by busts so far
    soft: 0,               // per column holding an ace still counted as 11
    empty: 0,              // bonus when at least one column is empty
    cnt: [0, 0, 0, 0, 0],  // additive value by number of cards in the column
    tot: new Array(22).fill(0), // additive value by the column's soft total
  };

  function makeSearchState(rules, st) {
    return {
      cols: Int32Array.from(st.cols), deck: Int32Array.from(st.deck), rem: st.rem, H: cardsLeftToPlay(st),
      busts: st.busts, stays: st.stays, prev: st.prev,
    };
  }

  function createSearcher(rules, params) {
    rules = rules || DEFAULT_RULES;
    const cfg = rules.cfg, NEXT = rules.next, PTS = rules.pts, NC = cfg.numCols;
    const W = Object.assign({}, BASELINE_WEIGHTS, params.w || {});
    const CNT = W.cnt, TOT = W.tot;
    const depth = params.depth != null ? params.depth : 1;
    const endgameK = params.endgameK || 0;
    const useCache = !!params.cache;
    const deepen = params.deepen || null; // {depth, margin, topK, budgetMs?, factor?}
    // stays below the root: true = always, false = never, 'forced' = only when every plain placement busts,
    // 'smart' = always one level below the root, forced-only deeper
    const stayInner = params.stayInner === undefined ? true : params.stayInner;
    const SB = rules.sb, maxPrev = SB.length - 1, perfect = cfg.perfectBonus, maxBusts = cfg.maxBusts;
    let S = null, cache = null, egMemo = new Map(), nodes = 0;
    // Optional learned evaluator: params.nn = { layers: [{ nIn, nOut, W, b }], scale }. Replaces the weighted leaf.
    const NN = params.nn ? params.nn.layers.map((l) => ({ nIn: l.nIn, nOut: l.nOut, W: Float64Array.from(l.W), b: Float64Array.from(l.b) })) : null;
    const nnScale = params.nn ? params.nn.scale || 1000 : 0, nnA = new Float64Array(128), nnB = new Float64Array(128);
    function nnLeaf() {
      featurize(S.cols, S.deck, S.rem, S.H, S.busts, S.stays, S.prev, NC, nnA);
      let x = nnA, y = nnB;
      for (let li = 0; li < NN.length; li++) {
        const L = NN[li], W = L.W, nIn = L.nIn, nOut = L.nOut, last = li === NN.length - 1;
        for (let o = 0, k = 0; o < nOut; o++) {
          let s = L.b[o]; for (let i = 0; i < nIn; i++, k++) s += W[k] * x[i];
          y[o] = last || s > 0 ? s : 0;
        }
        const t = x; x = y; y = t;
      }
      return x[0] * nnScale;
    }

    function leaf() {
      if (NN) return nnLeaf();
      const H = S.H, deck = S.deck, rem = S.rem;
      let val = H * W.fut[S.busts] + (S.busts === 0 ? W.perfect - W.perfH * H : 0) + S.stays * W.stay * Math.min(H, W.stayCap);
      if (S.prev) val += W.streak + W.streak2 * (S.prev - 1);
      let room = 0, needMask = 0, anyEmpty = 0;
      for (let i = 0; i < NC; i++) {
        const c = S.cols[i]; if (c === 0) { anyEmpty = 1; room = 21; continue; }
        const hard = c & 31, ace = (c >> 5) & 1, n = (c >> 6) & 7, need = 21 - hard;
        if (need > room) room = need;
        let make = 0;
        if (need <= 10) { make = deck[need]; needMask |= 1 << need; }
        else if (ace) { make = deck[need - 10]; needMask |= 1 << (need - 10); }
        else if (hard === 10) { make = deck[1]; needMask |= 2; }
        let bust = 0; for (let x = need + 1; x <= 10; x++) bust += deck[x];
        const pSafe = 1 - bust / rem;
        val += W.p21 * (make / rem) + W.safe * pSafe + CNT[n] + TOT[ace && hard <= 11 ? hard + 10 : hard];
        if (n === 4) val += W.four * pSafe;
        if (ace && hard <= 11) val += W.soft;
      }
      if (anyEmpty) val += W.empty;
      if (W.pAny && needMask) { let a = 0; for (let x = 1; x <= 10; x++) if (needMask & (1 << x)) a += deck[x]; val += W.pAny * a / rem; }
      if (room < 10) { let f = 0; for (let x = room + 1; x <= 10; x++) f += deck[x]; val += W.forced[S.busts] * f / rem; }
      return val;
    }
    const terminal = () => (S.busts === 0 ? perfect : 0);
    const isTerminal = () => S.busts >= maxBusts || S.H <= 0;

    // Place card v (after optional stay on column si) into column j. Returns immediate reward.
    // Caller saves/restores state.
    function place(v, si, j) {
      if (si >= 0) { S.cols[si] = 0; S.stays--; if (cfg.stayBreaksStreak) S.prev = 0; }
      const k = S.cols[j] * 11 + v, p = PTS[k];
      S.deck[v]--; S.rem--; S.H--;
      let r = 0;
      if (p < 0) { S.busts++; S.cols[j] = 0; S.prev = 0; }
      else if (p > 0) { r = p + SB[S.prev]; if (S.prev < maxPrev) S.prev++; S.cols[j] = 0; }
      else { S.cols[j] = NEXT[k]; S.prev = 0; }
      return r;
    }

    // Enumerate distinct actions for card v. Calls fn(si, j).
    function forActions(withStays, fn) {
      const c = S.cols;
      for (let j = 0; j < NC; j++) {
        let dup = false; for (let k = 0; k < j; k++) if (c[k] === c[j]) { dup = true; break; }
        if (!dup) fn(-1, j);
      }
      if (withStays && S.stays > 0) {
        for (let i = 0; i < NC; i++) {
          if (c[i] === 0) continue;
          let dup = false; for (let k = 0; k < i; k++) if (c[k] === c[i]) { dup = true; break; }
          if (dup) continue;
          // after clearing i, columns are c with c[i]=0; dedupe targets by value
          for (let j = 0; j < NC; j++) {
            const cj = j === i ? 0 : c[j];
            let d2 = false;
            for (let k = 0; k < j; k++) { const ck = k === i ? 0 : c[k]; if (ck === cj) { d2 = true; break; } }
            if (!d2) fn(i, j);
          }
        }
      }
    }

    const FW = NC + 3, sv = new Int32Array(64 * FW); // save stack
    function save(sp) { const b = sp * FW; for (let i = 0; i < NC; i++) sv[b + i] = S.cols[i]; sv[b + NC] = S.busts; sv[b + NC + 1] = S.stays; sv[b + NC + 2] = S.prev; }
    function restore(sp, v) { const b = sp * FW; for (let i = 0; i < NC; i++) S.cols[i] = sv[b + i]; S.busts = sv[b + NC]; S.stays = sv[b + NC + 1]; S.prev = sv[b + NC + 2]; S.deck[v]++; S.rem++; S.H++; }

    let drawHash = 0;
    const ZH = [0, 1, 7, 49, 343, 2401, 16807, 117649, 823543, 5764801, 40353607]; // base-7 multiset hash (<=6 draws)
    function key(d) {
      const c = Array.from(S.cols).sort((a, b) => a - b);
      return c.join(',') + '|' + S.busts + S.stays + S.prev + d + '|' + drawHash;
    }

    function chance(d, sp) {
      if (isTerminal()) return terminal();
      if (d === 0) {
        nodes++;
        if (!NN || !useCache) return leaf();
        const k0 = key(0), h0 = cache.get(k0); if (h0 !== undefined) return h0; // the network is costly: reuse repeated positions
        const lv = leaf(); cache.set(k0, lv); return lv;
      }
      let k;
      if (useCache) { k = key(d); const hit = cache.get(k); if (hit !== undefined) return hit; }
      let sum = 0;
      for (let v = 1; v <= 10; v++) {
        const cnt = S.deck[v]; if (!cnt) continue;
        sum += cnt * decide(v, d, sp);
      }
      const r = sum / S.rem;
      if (useCache) cache.set(k, r);
      return r;
    }
    function decide(v, d, sp) {
      let best = -Infinity;
      save(sp);
      drawHash += ZH[v];
      let ws = stayInner === true;
      if (S.stays > 0 && (stayInner === 'forced' || (stayInner === 'smart' && sp > 1))) {
        ws = true; for (let i = 0; i < NC; i++) if (PTS[S.cols[i] * 11 + v] >= 0) { ws = false; break; }
      } else if (stayInner === 'smart') ws = true;
      forActions(ws, (si, j) => {
        const r = place(v, si, j);
        const val = r + chance(d - 1, sp + 1);
        restore(sp, v);
        if (val > best) best = val;
      });
      drawHash -= ZH[v];
      return best;
    }

    // ---- exact endgame: expectimax to the end, true objective, memoized per game ----
    function egKey() {
      const c = Array.from(S.cols).sort((a, b) => a - b);
      let s = c.join(',') + '|' + S.busts + S.stays + S.prev + S.H + '|';
      for (let v = 1; v <= 10; v++) s += S.deck[v] + '.';
      return s;
    }
    function egChance(sp) {
      if (isTerminal()) return terminal();
      const k = egKey(); const hit = egMemo.get(k); if (hit !== undefined) return hit;
      let sum = 0;
      for (let v = 1; v <= 10; v++) { const cnt = S.deck[v]; if (cnt) sum += cnt * egDecide(v, sp); }
      const r = sum / S.rem; egMemo.set(k, r); return r;
    }
    function egDecide(v, sp) {
      let best = -Infinity; save(sp);
      forActions(true, (si, j) => { const r = place(v, si, j); const val = r + egChance(sp + 1); restore(sp, v); if (val > best) best = val; });
      return best;
    }

    // Root: returns {stay, col, value, scores:[{stay,col,value}]}
    function choose(st, v) {
      const t0 = deepen && deepen.budgetMs ? now() : 0;
      S = makeSearchState(rules, st); nodes = 0; drawHash = 0;
      if (useCache) cache = new Map();
      const exact = endgameK > 0 && S.H <= endgameK;
      const list = [];
      save(0);
      forActions(true, (si, j) => {
        const r = place(v, si, j);
        const val = r + (exact ? egChance(1) : chance(depth, 1));
        restore(0, v);
        list.push({ stay: si, col: j, value: val });
      });
      let best = list[0];
      for (const a of list) if (a.value > best.value + 1e-9) best = a;
      // Selective deepening: when the top moves are close, re-score just those one card deeper.
      let deepened = false;
      if (deepen && !exact && list.length > 1) {
        const cands = list.filter((a) => a.value >= best.value - deepen.margin).sort((a, b) => b.value - a.value).slice(0, deepen.topK || 2);
        const est = deepen.budgetMs ? (now() - t0) * (deepen.factor || 40) * cands.length / list.length : 0;
        if (cands.length > 1 && (!deepen.budgetMs || est <= deepen.budgetMs)) {
          deepened = true; if (useCache) cache = new Map();
          let b2 = null;
          for (const a of cands) {
            const r = place(v, a.stay, a.col); a.deep = r + chance(deepen.depth, 1); restore(0, v);
            if (!b2 || a.deep > b2.deep + 1e-9) b2 = a;
          }
          best = b2;
        }
      }
      return { stay: best.stay, col: best.col, value: best.value, scores: list, nodes, exact, deepened };
    }
    function reset() { egMemo = new Map(); }
    return { choose, reset, weights: W };
  }

  // Generic game runner: policy.choose(state, v) -> {stay, col}
  function playGame(rules, policy, seed, opts) {
    rules = rules || DEFAULT_RULES; opts = opts || {};
    const deck = opts.deck || shuffledDeck(seed, rules);
    const st = newGame(rules, opts);
    if (policy.reset) policy.reset();
    let i = 0, ms = 0, moves = 0;
    while (!st.over) {
      const v = deck[i++];
      const t0 = opts.timing ? now() : 0;
      const m = policy.choose(st, v);
      if (opts.timing) { ms += now() - t0; }
      moves++;
      applyMove(rules, st, v, m);
    }
    return { score: st.score, busts: st.busts, reason: st.reason, played: st.played, counts: st.counts, ms, moves };
  }
  const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

  return {
    CONFIG, compile, DEFAULT_RULES, BASELINE_WEIGHTS, mulberry32, shuffledDeck, newGame, cloneGame, applyMove,
    cardsLeftToPlay, createSearcher, featurize, NF, playGame, softTotal, hardOf, aceOf, nOf, mkCol,
  };
});
