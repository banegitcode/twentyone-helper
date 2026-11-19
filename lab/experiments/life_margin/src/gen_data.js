'use strict';
// Self-play data for the learned evaluator: positions (between cards) with the points actually scored afterwards.
// node src/gen_data.js <spec.json> <seedStart> <games> <out.bin> [statesPerGame=13] [td]
// With `td`, each row gets a second label: the search's own value at the next card (lower noise, bootstrapped).
// Blend the two labels into a normal training file with src/blend.js.
// Half the games include one random move, and only positions from that move on are kept, so the
// network also sees positions the policy itself would not choose.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'); const E = require('./engine.js');
const TD = (isMainThread ? process.argv[7] : workerData.td) === 'td';
const ROW = E.NF + 1, OROW = ROW + (TD ? 1 : 0);
if (!isMainThread) {
  const { spec, seeds, per } = workerData; const R = E.DEFAULT_RULES;
  const { createPolicy } = require('./policies.js');
  const pol = createPolicy(R, spec);
  const out = new Float32Array(seeds.length * per * OROW); let n = 0;
  const f = new Float64Array(E.NF), buf = new Float64Array(52 * ROW), scoreAt = new Float64Array(52), tdAt = new Float64Array(52);
  for (const seed of seeds) {
    const rng = E.mulberry32(seed ^ (TD ? 0x2c1b3c6d : 0x5bd1e995)), deck = E.shuffledDeck(seed), st = E.newGame(R);
    if (pol.reset) pol.reset();
    const dev = rng() < 0.5 ? Math.floor(rng() * 50) : -1; let m = 0, i = 0;
    while (!st.over) {
      const v = deck[i]; let mv;
      if (i === dev) {
        const acts = [];
        for (let j = 0; j < 4; j++) acts.push({ stay: -1, col: j });
        if (st.stays > 0 && rng() < 0.3) for (let s = 0; s < 4; s++) if (st.cols[s]) for (let j = 0; j < 4; j++) acts.push({ stay: s, col: j });
        mv = acts[Math.floor(rng() * acts.length)];
      } else { mv = pol.choose(st, v); if (m > 0) tdAt[m - 1] = mv.value; }
      E.applyMove(R, st, v, mv); i++;
      if (!st.over && i > dev) {
        E.featurize(st.cols, st.deck, st.rem, E.cardsLeftToPlay(st), st.busts, st.stays, st.prev, 4, f);
        buf.set(f, m * ROW); scoreAt[m] = st.score; m++;
      }
    }
    // keep up to `per` random positions from this game
    const idx = Array.from({ length: m }, (_, k) => k);
    for (let k = idx.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const t = idx[k]; idx[k] = idx[j]; idx[j] = t; }
    for (let k = 0; k < Math.min(per, m); k++) {
      const a = idx[k]; for (let x = 0; x < E.NF; x++) out[n * OROW + x] = buf[a * ROW + x];
      out[n * OROW + E.NF] = (st.score - scoreAt[a]) / 1000;
      if (TD) out[n * OROW + E.NF + 1] = tdAt[a] / 1000;
      n++;
    }
  }
  const res = out.slice(0, n * OROW);
  parentPort.postMessage(res, [res.buffer]);
} else {
  const [specFile, s0, games, outFile, per] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], +process.argv[6] || 13];
  if (s0 < 1000000 || s0 + games > 1500000) throw new Error('training seeds must stay inside 1,000,000-1,499,999');
  const spec = JSON.parse(fs.readFileSync(specFile)); const N = 14, t0 = Date.now();
  const chunks = Array.from({ length: N }, () => []); for (let i = 0; i < games; i++) chunks[i % N].push(s0 + i);
  Promise.all(chunks.map((seeds) => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: { spec, seeds, per, td: process.argv[7] } }); w.on('message', res); w.on('error', rej); })))
    .then((parts) => {
      const fd = fs.openSync(outFile, 'w'); let rows = 0;
      for (const p of parts) { fs.writeSync(fd, Buffer.from(p.buffer, p.byteOffset, p.byteLength)); rows += p.length / OROW; }
      fs.closeSync(fd); console.log(rows, 'rows', ((Date.now() - t0) / 1000).toFixed(0) + 's');
    });
}
