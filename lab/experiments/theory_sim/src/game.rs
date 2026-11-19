//! Rules engine. See RULES.md. Interpretation decisions (all documented in ideas/ceiling_rules_notes.md):
//!  * Column total: hard sum with Ace=1; if column holds an Ace and hard+10<=21, total = hard+10 (soft). Bust iff hard>21.
//!  * total==21 (best total) clears: 400; 5th card exactly 21 -> 1000; exactly 3 cards all 7s -> 600 (replaces 400).
//!    Three 7s can only be the first three cards of a column, 7+7+7 (any other three-7 column already
//!    cleared at 21 earlier or has >21); a 4th card can never form the trio. So "exactly three 7s" == column {7,7,7}.
//!  * 5 cards without bust and total!=21 -> 800. Bust on the 5th card = bust.
//!  * Streak: a placement that clears a column WITH points is a scoring card; streak counter n counts consecutive
//!    scoring cards. Bonus on the n-th: 2:+250, 3:+500, 4:+1000, >=5:+2000. Any non-scoring card (stays in column or bust) resets 0.
//!    Stay does not touch streak. Streak bonus is paid in addition to the clear points.
//!  * Stay: before placing current card, empty one column (cards discarded); 2 per game.
//!  * Perfect Bonus +1000 if game ends (52 cards placed) with 0 busts. Third bust ends game immediately.
use std::sync::OnceLock;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct Desc { pub h: u8, pub a: bool, pub c: u8, pub s7: bool }

pub struct Tabs {
    pub desc: Vec<Desc>,
    pub next: Vec<[i16; 11]>, // >=0 new state id ; CLEAR=-1 ; BUST=-2 (index by card value 1..10)
    pub pts: Vec<[i16; 11]>,  // clear points (before streak bonus)
    pub total: Vec<u8>,       // best total
}
pub const CLEAR: i16 = -1;
pub const BUST: i16 = -2;
pub const STREAK_BONUS: [i32; 7] = [0, 0, 250, 500, 1000, 2000, 2000];

fn norm(h: u8, a: bool, c: u8, s7: bool) -> Desc {
    if c == 0 { return Desc { h: 0, a: false, c: 0, s7: false }; }
    let a = if h > 11 { false } else { a };
    let s7 = s7 && !a && h == 7 * c; // only meaningful when every card is a 7
    Desc { h, a, c, s7 }
}
pub fn tabs() -> &'static Tabs {
    static T: OnceLock<Tabs> = OnceLock::new();
    T.get_or_init(|| {
        use std::collections::HashMap;
        let mut map: HashMap<Desc, usize> = HashMap::new();
        let mut desc: Vec<Desc> = vec![];
        let e = norm(0, false, 0, false);
        map.insert(e, 0); desc.push(e);
        let mut next = vec![]; let mut pts = vec![]; let mut total = vec![];
        let mut i = 0;
        while i < desc.len() {
            let d = desc[i];
            let tot = if d.a && d.h + 10 <= 21 { d.h + 10 } else { d.h };
            total.push(tot);
            let mut nx = [0i16; 11]; let mut pt = [0i16; 11];
            for r in 1..=10u8 {
                let h = d.h + r; let c = d.c + 1; let a = d.a || r == 1;
                // all-sevens: empty column counts as all-sevens
                let all7 = (d.c == 0 || d.s7) && r == 7;
                if h > 21 { nx[r as usize] = BUST; continue; }
                let t = if a && h + 10 <= 21 { h + 10 } else { h };
                if t == 21 {
                    nx[r as usize] = CLEAR;
                    pt[r as usize] = if c == 3 && all7 { 600 } else if c == 5 { 1000 } else { 400 };
                } else if c == 5 {
                    nx[r as usize] = CLEAR; pt[r as usize] = 800;
                } else {
                    let nd = norm(h, a, c, all7);
                    let id = *map.entry(nd).or_insert_with(|| { desc.push(nd); desc.len() - 1 });
                    nx[r as usize] = id as i16;
                }
            }
            next.push(nx); pts.push(pt);
            i += 1;
        }
        Tabs { desc, next, pts, total }
    })
}

#[derive(Clone, Copy, Debug)]
pub struct St {
    pub col: [u8; 4],
    pub busts: u8,
    pub stays: u8,
    pub streak: u8, // capped at 5
    pub cnt: [u8; 11], // remaining (undealt) cards by value; current card already removed when stepping
    pub left: u8,      // undealt cards in deck
    pub score: i32,
    pub dead: bool,
}
impl St {
    pub fn new() -> St {
        let mut cnt = [0u8; 11];
        for v in 1..=10 { cnt[v] = if v == 10 { 16 } else { 4 }; }
        St { col: [0; 4], busts: 0, stays: 2, streak: 0, cnt, left: 52, score: 0, dead: false }
    }
    #[inline] pub fn over(&self) -> bool { self.dead || self.left == 0 }
    /// Perfect Bonus awarded when the game ends alive with zero busts.
    #[inline] pub fn term_bonus(&self, pb: i32) -> i32 { if !self.dead && self.left == 0 && self.busts == 0 { pb } else { 0 } }
    /// Remove card r from the deck count (draw).
    #[inline] pub fn draw(&mut self, r: usize) { self.cnt[r] -= 1; self.left -= 1; }
    /// Place card value r in column j (after any stay). Returns points (clear + streak bonus). Does not touch deck.
    #[inline]
    pub fn place(&mut self, j: usize, r: usize) -> i32 {
        let t = tabs();
        let id = self.col[j] as usize;
        let nx = t.next[id][r];
        if nx == BUST {
            self.col[j] = 0; self.busts += 1; self.streak = 0;
            if self.busts >= 3 { self.dead = true; }
            0
        } else if nx == CLEAR {
            let p = t.pts[id][r] as i32;
            self.col[j] = 0;
            let ns = (self.streak + 1).min(5); self.streak = ns;
            let b = STREAK_BONUS[ns as usize];
            self.score += p + b;
            p + b
        } else { self.col[j] = nx as u8; self.streak = 0; 0 }
    }
    /// Apply an action for current card r: optional stay on column `stay` (255=none), then place at `pl`.
    #[inline]
    pub fn act(&mut self, stay: u8, pl: u8, r: usize) -> i32 {
        if stay != 255 { self.col[stay as usize] = 0; self.stays -= 1; }
        self.place(pl as usize, r)
    }
}

/// All distinct actions (stay column or 255, place column) for the current state; dedups symmetric actions.
pub fn actions(st: &St, out: &mut Vec<(u8, u8)>) {
    out.clear();
    // no-stay
    for j in 0..4u8 {
        if (0..j).any(|k| st.col[k as usize] == st.col[j as usize]) { continue; }
        out.push((255, j));
    }
    if st.stays > 0 {
        for s in 0..4u8 {
            if st.col[s as usize] == 0 { continue; } // staying an empty column is a no-op
            if (0..s).any(|k| st.col[k as usize] == st.col[s as usize]) { continue; }
            let mut c2 = st.col; c2[s as usize] = 0;
            for j in 0..4u8 {
                if (0..j).any(|k| c2[k as usize] == c2[j as usize]) { continue; }
                out.push((s, j));
            }
        }
    }
}
