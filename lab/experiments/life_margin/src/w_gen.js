'use strict';
// Training data with exact endgame labels.
// node src/w_gen.js <seedStart> <games> <out.bin> [K=12] [workers=8] [perEarly=20] [perLate=4]
// Each game is played by the shipped search (no exact endgame) until K cards are left; the position there is then
// solved exactly (src/exact2.js). Every kept position before that point is labelled with
//   points scored from that position until K cards were left + exact value of the position at K cards,
// i.e. the real outcome of the first part plus perfect play (and no luck) for the rest. Positions after that point are
// played exactly and labelled with their exact value. Games that end before K cards are labelled with the real result.
// Half the games include one random move (as in gen_data.js); only positions after it are kept.
// Row: 56 inputs + label/1000 (same layout as gen_data.js without `td`), appended to <out.bin> as workers report.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'), path = require('path'); const E = require('./engine.js');
const ROW = E.NF + 1;
if (!isMainThread) {
  const { seeds, K, perE, perL } = workerData; const R = E.DEFAULT_RULES;
  const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../results/shipped_policies.json')))['52'];
  delete spec.exact; spec.deepen.budgetMs = 0;
  const pol = require('./policies.js').createPolicy(R, spec), X = require('./exact2.js').createExact(R, { logCap: 25 });
  const f = new Float64Array(E.NF), buf = new Float64Array(52 * E.NF), scoreAt = new Float64Array(52), remAt = new Int32Array(52), exAt = new Float64Array(52);
  let out = [], skipped = 0, done = 0;
  const flush = () => { const a = Float32Array.from(out); out = []; parentPort.postMessage({ rows: a, done, skipped }, [a.buffer]); done = 0; skipped = 0; };
  for (const seed of seeds) {
    const rng = E.mulberry32(seed ^ 0x7f4a7c15), deck = E.shuffledDeck(seed), st = E.newGame(R);
    if (pol.reset) pol.reset();
    const dev = rng() < 0.5 ? Math.floor(rng() * (52 - K)) : -1; let m = 0, i = 0, vK = NaN, sK = 0, bad = false;
    try {
      while (!st.over) {
        const v = deck[i]; let mv;
        if (st.rem === K && Number.isNaN(vK)) { vK = X.value(st); sK = st.score; }
        if (i === dev) {
          const acts = []; for (let j = 0; j < 4; j++) acts.push({ stay: -1, col: j });
          if (st.stays > 0 && rng() < 0.3) for (let s = 0; s < 4; s++) if (st.cols[s]) for (let j = 0; j < 4; j++) acts.push({ stay: s, col: j });
          mv = acts[Math.floor(rng() * acts.length)];
        } else mv = st.rem <= K ? X.choose(st, v) : pol.choose(st, v);
        E.applyMove(R, st, v, mv); i++;
        if (!st.over && i > dev) {
          E.featurize(st.cols, st.deck, st.rem, E.cardsLeftToPlay(st), st.busts, st.stays, st.prev, 4, f);
          buf.set(f, m * E.NF); scoreAt[m] = st.score; remAt[m] = st.rem; exAt[m] = st.rem <= K && st.rem > 0 ? X.value(st) : NaN; m++;
        }
      }
    } catch (e) { bad = true; }
    if (bad) { skipped++; continue; }
    done++;
    const early = [], late = [];
    for (let k = 0; k < m; k++) (remAt[k] > K ? early : remAt[k] > 0 ? late : []).push(k);
    const pick = (idx, n) => { for (let k = idx.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const t = idx[k]; idx[k] = idx[j]; idx[j] = t; } return idx.slice(0, n); };
    for (const a of pick(early, perE).concat(pick(late, perL))) {
      let y;
      if (remAt[a] <= K) y = exAt[a];
      else if (!Number.isNaN(vK)) y = sK - scoreAt[a] + vK;
      else y = st.score - scoreAt[a];                       // the game ended before K cards were left
      for (let x = 0; x < E.NF; x++) out.push(buf[a * E.NF + x]);
      out.push(y / 1000);
    }
    if (done >= 25) flush();
  }
  flush(); parentPort.postMessage({ end: true });
} else {
  const s0 = +process.argv[2], games = +process.argv[3], outFile = process.argv[4], K = +process.argv[5] || 12, N = +process.argv[6] || 8;
  const perE = +process.argv[7] || 20, perL = +process.argv[8] || 4;
  if (s0 < 1000000 || s0 + games > 1500000) throw new Error('training seeds must stay inside 1,000,000-1,499,999');
  const chunks = Array.from({ length: N }, () => []); for (let i = 0; i < games; i++) chunks[i % N].push(s0 + i);
  const fd = fs.openSync(outFile, 'a'), t0 = Date.now(); let rows = 0, done = 0, skipped = 0, ended = 0, lastLog = 0;
  for (const seeds of chunks) {
    const w = new Worker(__filename, { workerData: { seeds, K, perE, perL } });
    w.on('message', (msg) => {
      if (msg.end) { if (++ended === N) { fs.closeSync(fd); console.log('finished', done, 'games', rows, 'rows', skipped, 'skipped', ((Date.now() - t0) / 1000).toFixed(0) + 's'); } return; }
      fs.writeSync(fd, Buffer.from(msg.rows.buffer, msg.rows.byteOffset, msg.rows.byteLength)); rows += msg.rows.length / ROW; done += msg.done; skipped += msg.skipped;
      if (done - lastLog >= 2000) { lastLog = done; console.log(done, 'games', rows, 'rows', skipped, 'skipped', ((Date.now() - t0) / 1000).toFixed(0) + 's'); }
    });
    w.on('error', (e) => { console.error('worker died', e); process.exit(1); });
  }
}
