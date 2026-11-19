//! Replays Landon's-engine traces (js/crosscheck_gen.js) in theory_sim and compares per-move points, bust flags and final score.
use theory_sim::{game::*};
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let decks: Vec<(u64, Vec<u8>)> = std::fs::read_to_string(&a[1]).unwrap().lines().map(|l| { let v: Vec<u64> = l.split_whitespace().map(|x| x.parse().unwrap()).collect(); (v[0], v[1..].iter().map(|&x| x as u8).collect()) }).collect();
    let mut bad = 0; let mut n = 0; let mut sums = [0i64; 4];
    for line in std::fs::read_to_string(&a[2]).unwrap().lines() {
        let (head, moves) = line.split_once(" | ").unwrap();
        let h: Vec<i64> = head.split_whitespace().map(|x| x.parse().unwrap()).collect();
        let seed = h[0] as u64; let deck = &decks.iter().find(|d| d.0 == seed).unwrap().1;
        let mut st = St::new(); let mut ok = true;
        for (i, m) in moves.split(' ').enumerate() {
            let f: Vec<i64> = m.split(',').map(|x| x.parse().unwrap()).collect();
            let r = deck[i] as usize; st.draw(r);
            let b0 = st.busts;
            let stay = if f[0] < 0 { 255 } else { f[0] as u8 };
            let p = st.act(stay, f[1] as u8, r) as i64;
            let bust = (st.busts > b0) as i64;
            if p != f[2] || bust != f[3] { ok = false; println!("seed {} move {} mismatch: mine pts {} bust {} / theirs {} {}", seed, i, p, bust, f[2], f[3]); break; }
        }
        let fin = st.score as i64 + st.term_bonus(1000) as i64;
        if ok && fin != h[1] { ok = false; println!("seed {} final mismatch {} vs {}", seed, fin, h[1]); }
        if ok && st.busts as i64 != h[2] { ok = false; println!("seed {} busts mismatch", seed); }
        if !ok { bad += 1; }
        n += 1; sums[0] += h[3]; sums[1] += h[4]; sums[2] += h[5]; sums[3] += h[6];
    }
    println!("replayed {} games, mismatches {}; clear types in traces: 21s {} 777s {} 5card {} 5card21 {}", n, bad, sums[0], sums[1], sums[2], sums[3]);
}
