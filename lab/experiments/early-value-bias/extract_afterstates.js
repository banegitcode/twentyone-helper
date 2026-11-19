'use strict';
// Extract after-state features and network/search values for every logged candidate
// from existing champion decision logs. No new games; deck order is never used
// (after-states are computed from the already-logged observable state + action).
const L = require('../regret_map/lib.js');
const fs = require('fs');
const readline = require('readline');

const nn = L.makeNNValue();

function afterFeats(g) {
  const cs = Array.from(g.cols).map(L.colInfo);
  const live = cs.filter((c) => c);
  const ns = [0, 0, 0, 0, 0];
  let sumSoft = 0, maxSoft = 0, nSoft = 0;
  for (const c of live) {
    ns[c.n] = (ns[c.n] || 0) + 1;
    sumSoft += c.soft;
    if (c.soft > maxSoft) maxSoft = c.soft;
    if (c.ace && c.soft > c.hard) nSoft++;
  }
  return {
    remA: g.rem, bustsA: g.busts, staysA: g.stays, prevA: g.prev,
    nEmptyA: 4 - live.length, n1: ns[1] || 0, n2: ns[2] || 0, n3: ns[3] || 0, n4: ns[4] || 0,
    maxN: live.length ? Math.max(...live.map((c) => c.n)) : 0,
    sumSoft, maxSoft, nSoft, p: nn(g)
  };
}

function preFeats(st) {
  const cs = Array.from(st.cols).map(L.colInfo);
  const live = cs.filter((c) => c);
  return { nEmpty: 4 - live.length, maxN: live.length ? Math.max(...live.map((c) => c.n)) : 0 };
}

async function extract(inPath, outDec, outEnd) {
  const fd = fs.openSync(outDec, 'w');
  const fe = fs.openSync(outEnd, 'w');
  const rl = readline.createInterface({ input: fs.createReadStream(inPath), crlfDelay: Infinity });
  let nDec = 0, nCand = 0;
  for await (const line of rl) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.t === 'end') {
      fs.writeSync(fe, JSON.stringify({ g: r.g, final: r.score, endBusts: r.busts, played: r.played, reason: r.reason }) + '\n');
      continue;
    }
    if (r.t !== 'dec') continue;
    // Keep rem>=17 (above 16 cards left) and also 13-16 for comparison.
    if (r.rem < 13) continue;
    const st = L.mkState(r);
    const pre = preFeats(st);
    const scores = r.scores || [];
    const recs = [];
    for (const a of scores) {
      const g = L.E.cloneGame(st);
      const ev = L.E.applyMove(L.rules, g, r.v, a);
      const af = afterFeats(g);
      const chosen = (a.stay === r.stay && a.col === r.col) ? 1 : 0;
      recs.push({
        g: r.g, step: r.step, rem: r.rem, v: r.v,
        stay: a.stay, col: a.col, chosen,
        q: a.value, deep: a.deep == null ? null : a.deep,
        pts: ev.pts + (ev.streak || 0), bust: ev.bust ? 1 : 0, cleared: ev.cleared ? 1 : 0,
        busts: r.busts, stays: r.stays, prev: r.prev, score: r.score,
        nEmpty: pre.nEmpty, maxNpre: pre.maxN,
        exact: r.exact ? 1 : 0, mval: r.mval,
        ...af
      });
      nCand++;
    }
    // one JSON line per decision (candidates nested) to make within-decision analysis easy
    fs.writeSync(fd, JSON.stringify({
      g: r.g, step: r.step, rem: r.rem, v: r.v,
      stay: r.stay, col: r.col, exact: r.exact ? 1 : 0, mval: r.mval,
      busts: r.busts, stays: r.stays, prev: r.prev, score: r.score,
      nEmpty: pre.nEmpty, maxNpre: pre.maxN, nCand: recs.length,
      cands: recs
    }) + '\n');
    nDec++;
  }
  fs.closeSync(fd); fs.closeSync(fe);
  return { nDec, nCand };
}

(async () => {
  const src = process.argv[2] || '/workspace/21lab/experiments/regret_map/s1k_champ_all.jsonl';
  const outD = process.argv[3] || '/workspace/21lab/experiments/early-value-bias/s1k_after_rem13plus.jsonl';
  const outE = process.argv[4] || '/workspace/21lab/experiments/early-value-bias/s1k_ends.jsonl';
  const t0 = Date.now();
  const r = await extract(src, outD, outE);
  console.log(JSON.stringify({ ...r, ms: Date.now() - t0, src, outD, outE }));
})();
