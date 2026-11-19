use crate::game::*;
use crate::rng::*;
use crate::solver::Solver;
use crate::td::Net;

/// Result of one finished game.
#[derive(Clone, Debug, Default)]
pub struct GameRes {
    pub score: i32, pub busts: u8, pub cards: u8, pub stays_used: u8,
    pub n21: u16, pub n777: u16, pub n5: u16, pub n5_21: u16,   // clear counts by type
    pub pts_clear: i32, pub pts_streak: i32, pub pts_pb: i32,
    pub max_streak: u8, pub pts_by_type: [i32; 4],
}

pub trait Policy {
    /// st: state after drawing current card r (st.cnt/left already decremented). Returns (stay col or 255, place col).
    fn choose(&mut self, st: &St, r: usize) -> (u8, u8);
}

pub fn play<P: Policy>(deck: &[u8; 52], pol: &mut P, pb: i32) -> GameRes {
    play_hook(deck, pol, pb, &mut |_s, _r, _a, _p| {})
}
/// hook(state_after_draw, card, action, pts_gained) is called for every decision.
pub fn play_hook<P: Policy, F: FnMut(&St, usize, (u8, u8), i32)>(deck: &[u8; 52], pol: &mut P, pb: i32, hook: &mut F) -> GameRes {
    let t = tabs();
    let mut st = St::new();
    let mut g = GameRes::default();
    for i in 0..52 {
        let r = deck[i] as usize;
        st.draw(r);
        let a = pol.choose(&st, r);
        // classify clear type
        let before = st;
        let pl_col = if a.0 != 255 { 0 } else { before.col[a.1 as usize] };
        let mut tmp = before; if a.0 != 255 { tmp.col[a.0 as usize] = 0; }
        let id = tmp.col[a.1 as usize] as usize; let _ = pl_col;
        let nx = t.next[id][r];
        let base = t.pts[id][r];
        let pts = st.act(a.0, a.1, r);
        hook(&before, r, a, pts);
        g.cards = (i + 1) as u8;
        if nx == CLEAR {
            let bonus = pts - base as i32;
            g.pts_clear += base as i32; g.pts_streak += bonus;
            match base { 400 => { g.n21 += 1; g.pts_by_type[0] += 400; } 600 => { g.n777 += 1; g.pts_by_type[1] += 600; }
                800 => { g.n5 += 1; g.pts_by_type[2] += 800; } _ => { g.n5_21 += 1; g.pts_by_type[3] += 1000; } }
            g.max_streak = g.max_streak.max(st.streak);
        }
        if st.dead { break; }
    }
    g.stays_used = 2 - st.stays; g.busts = st.busts;
    let tb = st.term_bonus(pb);
    g.pts_pb = tb;
    g.score = st.score + tb;
    g
}

// ---------------- policies
/// Greedy one-step baseline: no learned values. Q = immediate points
///   + E_next[ max over next-card actions of immediate points (no streak lookahead beyond the bonus on that card) ]
///   - bust_cost*[this placement busts] - stay_cost*[uses a stay].
/// Uses the remaining multiset for the expectation. Parameters are fixed constants, not tuned (see ceiling notes).
pub struct Greedy { pub bust_cost: f64, pub stay_cost: f64, pub acts: Vec<(u8, u8)>, pub acts2: Vec<(u8, u8)> }
impl Greedy { pub fn new(bust_cost: f64, stay_cost: f64) -> Self { Greedy { bust_cost, stay_cost, acts: vec![], acts2: vec![] } } }
impl Policy for Greedy {
    fn choose(&mut self, st: &St, r: usize) -> (u8, u8) {
        actions(st, &mut self.acts);
        let mut best = (self.acts[0], f64::NEG_INFINITY);
        let acts = self.acts.clone();
        for &(sy, pl) in acts.iter() {
            let mut s2 = *st; let b0 = s2.busts; s2.score = 0;
            let pts = s2.act(sy, pl, r) as f64;
            let mut q = pts;
            if s2.busts > b0 { q -= self.bust_cost; }
            if sy != 255 { q -= self.stay_cost; }
            if !s2.over() {
                // expected best immediate next-card points (no stays assumed for the lookahead)
                let mut e = 0.0;
                for r2 in 1..=10usize {
                    if s2.cnt[r2] == 0 { continue; }
                    let p = s2.cnt[r2] as f64 / s2.left as f64;
                    let mut s3 = s2; s3.draw(r2);
                    let mut m = f64::NEG_INFINITY;
                    for j in 0..4u8 {
                        let mut s4 = s3; s4.score = 0; let b1 = s4.busts;
                        let mut pp = s4.place(j as usize, r2) as f64;
                        if s4.busts > b1 { pp -= self.bust_cost; }
                        if pp > m { m = pp; }
                    }
                    e += p * m;
                }
                q += e;
            }
            if q > best.1 { best = ((sy, pl), q); }
        }
        best.0
    }
}

/// TD value policy: ply 0 = argmax r+V(after). ply 1 = one chance layer of expectimax with V at leaves.
/// If st.left < endgame, uses the exact solver instead.
pub struct TdPolicy<'a> {
    pub net: &'a Net, pub ply: u8, pub endgame: u8, pub solver: Solver, pub acts: Vec<(u8, u8)>,
    pub stay_bias: f64,   // added to Q of actions that use a stay (experiments)
    pub allow_stay: Option<fn(&St) -> bool>,
}
impl<'a> TdPolicy<'a> {
    pub fn new(net: &'a Net, ply: u8, endgame: u8) -> Self { TdPolicy { net, ply, endgame, solver: Solver::new(1000), acts: vec![], stay_bias: 0.0, allow_stay: None } }
    pub fn q_after(&self, s2: &St, pts: f64) -> f64 {
        if s2.over() { return pts + s2.term_bonus(1000) as f64; }
        if self.ply == 0 { return pts + self.net.v(s2) as f64; }
        let mut e = 0.0; let mut acts = Vec::with_capacity(24);
        for r2 in 1..=10usize {
            if s2.cnt[r2] == 0 { continue; }
            let p = s2.cnt[r2] as f64 / s2.left as f64;
            let mut s3 = *s2; s3.draw(r2);
            actions(&s3, &mut acts);
            let mut m = f64::NEG_INFINITY;
            for &(sy, pl) in acts.iter() {
                let mut s4 = s3; s4.score = 0;
                let p4 = s4.act(sy, pl, r2) as f64;
                let q = p4 + if s4.over() { s4.term_bonus(1000) as f64 } else { self.net.v(&s4) as f64 };
                if q > m { m = q; }
            }
            e += p * m;
        }
        pts + e
    }
}
impl<'a> Policy for TdPolicy<'a> {
    fn choose(&mut self, st: &St, r: usize) -> (u8, u8) {
        if (st.left as usize) < self.endgame as usize {
            if self.solver.memo.len() > 30_000_000 { self.solver.memo.clear(); }
            return self.solver.best_action(st, r).0;
        }
        let mut acts = std::mem::take(&mut self.acts);
        actions(st, &mut acts);
        let mut best = (acts[0], f64::NEG_INFINITY);
        for &(sy, pl) in acts.iter() {
            let mut s2 = *st; s2.score = 0;
            let pts = s2.act(sy, pl, r) as f64;
            let mut q = self.q_after(&s2, pts);
            if sy != 255 { q += self.stay_bias; }
            if q > best.1 { best = ((sy, pl), q); }
        }
        self.acts = acts;
        best.0
    }
}

/// Parallel evaluation helper: runs seeds lo..=hi with `mk` building a fresh policy per thread; returns results in seed order.
pub fn eval_par<F, P>(lo: u64, hi: u64, threads: usize, pb: i32, mk: F) -> Vec<GameRes>
where F: Fn() -> P + Sync, P: Policy {
    let n = (hi - lo + 1) as usize;
    let mut out: Vec<GameRes> = vec![GameRes::default(); n];
    let chunk = (n + threads - 1) / threads;
    std::thread::scope(|sc| {
        for (ti, sl) in out.chunks_mut(chunk).enumerate() {
            let mk = &mk;
            sc.spawn(move || {
                let mut p = mk();
                for (k, slot) in sl.iter_mut().enumerate() {
                    let seed = lo + (ti * chunk + k) as u64;
                    *slot = play(&shuffled_deck(seed), &mut p, pb);
                }
            });
        }
    });
    out
}
pub fn mean_se(x: &[f64]) -> (f64, f64) {
    let n = x.len() as f64; let m = x.iter().sum::<f64>() / n;
    let v = x.iter().map(|a| (a - m) * (a - m)).sum::<f64>() / (n - 1.0);
    (m, (v / n).sqrt())
}

/// Load decks from a text file (one per line: seed then 52 card values), as written by js/dump_decks.js (Landon's shuffles).
pub fn load_decks(path: &str) -> Vec<(u64, [u8; 52])> {
    std::fs::read_to_string(path).unwrap().lines().map(|l| {
        let v: Vec<u64> = l.split_whitespace().map(|x| x.parse().unwrap()).collect();
        let mut d = [0u8; 52]; for i in 0..52 { d[i] = v[1 + i] as u8; } (v[0], d)
    }).collect()
}
/// Evaluate over explicit decks in parallel.
pub fn eval_decks<F, P>(decks: &[(u64, [u8; 52])], threads: usize, pb: i32, mk: F) -> Vec<GameRes>
where F: Fn() -> P + Sync, P: Policy {
    let n = decks.len();
    let mut out: Vec<GameRes> = vec![GameRes::default(); n];
    let chunk = (n + threads - 1) / threads;
    std::thread::scope(|sc| {
        for (ti, sl) in out.chunks_mut(chunk).enumerate() {
            let mk = &mk;
            sc.spawn(move || {
                let mut p = mk();
                for (k, slot) in sl.iter_mut().enumerate() { *slot = play(&decks[ti * chunk + k].1, &mut p, pb); }
            });
        }
    });
    out
}
pub fn summarize(name: &str, r: &[GameRes]) {
    let s: Vec<f64> = r.iter().map(|g| g.score as f64).collect();
    let (m, se) = mean_se(&s);
    let n = r.len() as f64;
    let mx = s.iter().cloned().fold(f64::MIN, f64::max); let mn = s.iter().cloned().fold(f64::MAX, f64::min);
    let zb = r.iter().filter(|g| g.busts == 0).count() as f64 / n;
    let b3 = r.iter().filter(|g| g.busts >= 3).count() as f64 / n;
    let avg = |f: &dyn Fn(&GameRes) -> f64| r.iter().map(|g| f(g)).sum::<f64>() / n;
    println!("{:<34} n={} mean {:.0} +-{:.0} (SE) min {:.0} max {:.0} | zero-bust {:.1}% 3-bust {:.1}% | clears/game 21:{:.2} 777:{:.3} 5c:{:.2} 5c21:{:.2} | pts: clear {:.0} streak {:.0} perfect {:.0} | stays used {:.2}",
        name, r.len(), m, se, mn, mx, 100.0 * zb, 100.0 * b3,
        avg(&|g| g.n21 as f64), avg(&|g| g.n777 as f64), avg(&|g| g.n5 as f64), avg(&|g| g.n5_21 as f64),
        avg(&|g| g.pts_clear as f64), avg(&|g| g.pts_streak as f64), avg(&|g| g.pts_pb as f64), avg(&|g| g.stays_used as f64));
}
