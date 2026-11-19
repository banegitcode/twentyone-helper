'use strict';
// leaf-selection check: a Learner-format net {W:[[..]],b:[[..]]} holding the champion's weights loads to the same layers as nets/ship_nn.json; unknown names / paths are rejected.
const fs = require('fs'), path = require('path'), assert = require('assert');
const { loadNet } = require('../js/policy.js'); const ship = loadNet('ship_nn');
const f = path.join(__dirname, '../nets/_fmtb_test.json');
fs.writeFileSync(f, JSON.stringify({ W: ship.layers.map((l) => { const rows = []; for (let o = 0; o < l.nOut; o++) rows.push(l.W.slice(o * l.nIn, (o + 1) * l.nIn)); return rows; }), b: ship.layers.map((l) => l.b) }));
try { const m = loadNet('_fmtb_test'); assert.strictEqual(JSON.stringify(m.layers), JSON.stringify(ship.layers)); assert.strictEqual(m.scale, ship.scale); console.log('format B == ship_nn: OK'); } finally { fs.unlinkSync(f); }
for (const bad of ['../x', 'nope_not_there']) { try { loadNet(bad); console.log('FAIL: accepted', bad); process.exit(1); } catch (e) { console.log('rejected', bad, '->', e.message.slice(0, 60)); } }
