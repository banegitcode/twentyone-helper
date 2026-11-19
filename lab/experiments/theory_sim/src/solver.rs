//! Exact expectimax over the remaining multiset (no peeking at order): V(pre-draw state) = E_card max_action [pts + V(next)].
//! Memoised on (deck counts, sorted column ids, busts, stays, streak). `pb` = Perfect Bonus value (1000 normally, 0 to
//! measure the game without it). `streak_on` = false removes streak bonuses (not used by default).
use crate::game::*;
use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

#[derive(Default)]
pub struct Fx(u64);
impl Hasher for Fx {
    fn finish(&self) -> u64 { self.0 }
    fn write(&mut self, _b: &[u8]) { unimplemented!() }
    fn write_u128(&mut self, x: u128) {
        let a = (x as u64) ^ ((x >> 64) as u64).wrapping_mul(0x9E3779B97F4A7C15);
        let mut z = a.wrapping_mul(0xBF58476D1CE4E5B9);
        z ^= z >> 32;
        self.0 = z.wrapping_mul(0x94D049BB133111EB);
    }
}
pub type FxMap<V> = HashMap<u128, V, BuildHasherDefault<Fx>>;

pub struct Solver { pub memo: FxMap<f32>, pub pb: i32, pub nodes: u64 }
impl Solver {
    pub fn new(pb: i32) -> Self { Solver { memo: FxMap::default(), pb, nodes: 0 } }
    #[inline]
    fn key(st: &St) -> u128 {
        let mut c = st.col; c.sort_unstable();
        let mut k: u128 = 0;
        for r in 1..=10 { k = (k << 5) | st.cnt[r] as u128; }
        for j in 0..4 { k = (k << 8) | c[j] as u128; }
        k = (k << 2) | st.busts as u128; k = (k << 2) | st.stays as u128; k = (k << 3) | st.streak as u128;
        k
    }
    /// Expected future points (incl. Perfect Bonus at the end) from a pre-draw state.
    pub fn value(&mut self, st: &St) -> f64 {
        if st.dead { return 0.0; }
        if st.left == 0 { return if st.busts == 0 { self.pb as f64 } else { 0.0 }; }
        let k = Self::key(st);
        if let Some(&v) = self.memo.get(&k) { return v as f64; }
        self.nodes += 1;
        let mut tot = 0.0;
        let mut acts = Vec::with_capacity(24);
        for r in 1..=10usize {
            if st.cnt[r] == 0 { continue; }
            let p = st.cnt[r] as f64 / st.left as f64;
            let mut s2 = *st; s2.draw(r);
            actions(&s2, &mut acts);
            let mut best = f64::NEG_INFINITY;
            for &(sy, pl) in acts.iter() {
                let mut s3 = s2; s3.score = 0;
                let pts = s3.act(sy, pl, r) as f64;
                let v = pts + self.value(&s3);
                if v > best { best = v; }
            }
            tot += p * best;
        }
        self.memo.insert(k, tot as f32);
        tot
    }
    /// Q-value of each action for card r (current card already removed from st.cnt/left). Returns best action and its Q.
    pub fn best_action(&mut self, st: &St, r: usize) -> ((u8, u8), f64) {
        let mut acts = Vec::new(); actions(st, &mut acts);
        let mut best = (acts[0], f64::NEG_INFINITY);
        for &(sy, pl) in acts.iter() {
            let mut s3 = *st; s3.score = 0;
            let pts = s3.act(sy, pl, r) as f64;
            let v = pts + self.value(&s3);
            if v > best.1 { best = ((sy, pl), v); }
        }
        best
    }
}
