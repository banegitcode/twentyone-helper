'use strict';
// Minimal JS port of the 21 rules (RULES.md as implemented in bench/refsim.py). Used only to drive the adapters.
const STREAK = { 2: 250, 3: 500, 4: 1000 };
const streakBonus = (k) => (k < 2 ? 0 : STREAK[k] || 2000);
function scoreColumn(c) {
  const hard = c.reduce((a, b) => a + b, 0), total = c.includes(1) && hard + 10 <= 21 ? hard + 10 : hard, n = c.length;
  if (hard > 21) return ['bust', 0];
  if (total === 21) return n === 3 && c.every((v) => v === 7) ? ['clear', 600] : n === 5 ? ['clear', 1000] : ['clear', 400];
  return n === 5 ? ['clear', 800] : ['keep', 0];
}
class Game {
  constructor(values) {
    this.deck = values.slice(); this.cols = [[], [], [], []]; this.busts = 0; this.stays = 2; this.streak = 0; this.score = 0; this.pos = 0; this.over = false;
    this.rem = new Array(10).fill(0); for (const v of values) this.rem[v - 1]++; this.rem[values[0] - 1]--;
  }
  obs() {
    return { columns: this.cols.map((c) => c.slice()), current: this.deck[this.pos], remaining: this.rem.slice(), busts: this.busts, stays_left: this.stays,
      streak: this.streak, score: this.score, cards_dealt: this.pos + 1, cards_left: this.deck.length - this.pos - 1 };
  }
  step(stay, place) {
    if (stay !== null && stay !== undefined) { if (this.stays <= 0 || stay < 0 || stay > 3) throw new Error('illegal stay'); this.cols[stay] = []; this.stays--; }
    if (!(place >= 0 && place <= 3)) throw new Error('illegal place');
    const r = this.deck[this.pos], c = this.cols[place]; c.push(r);
    const [kind, pts0] = scoreColumn(c); let pts = pts0;
    if (kind === 'bust') { this.busts++; this.cols[place] = []; this.streak = 0; if (this.busts >= 3) this.over = true; }
    else if (kind === 'clear') { this.cols[place] = []; this.streak++; pts += streakBonus(this.streak); }
    else this.streak = 0;
    this.score += pts; this.pos++;
    if (this.pos >= this.deck.length) this.over = true; else if (!this.over) this.rem[this.deck[this.pos] - 1]--;
  }
  get final() { return this.score + (this.over && this.busts === 0 ? 1000 : 0); }
}
if (typeof module !== "undefined" && module.exports) module.exports = { Game }; else self.Game = Game;
