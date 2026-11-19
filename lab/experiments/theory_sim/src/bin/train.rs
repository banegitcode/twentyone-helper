//! TD(0) afterstate training of the linear evaluator by self-play (greedy w.r.t. current weights; no exploration).
use theory_sim::{game::*, rng::*, td::*};
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let games: u64 = args.get(1).map(|s| s.parse().unwrap()).unwrap_or(1_000_000);
    let out = args.get(2).cloned().unwrap_or("net.bin".into());
    let a0: f32 = args.get(3).map(|s| s.parse().unwrap()).unwrap_or(0.02);
    let mut net = match args.get(4) { Some(p) => Net::load(p), None => Net::new() };
    let mut acts = Vec::new();
    let (mut tot, mut cnt) = (0f64, 0f64);
    for g in 0..games {
        let frac = g as f64 / games as f64;
        let alpha = (a0 * (1.0 - frac as f32) + 0.0015) / 9.0;
        let deck = shuffled_deck(1_000_000_000 + g);
        let mut st = St::new();
        let mut prev: Option<St> = None;
        let mut total = 0i32;
        for i in 0..52 {
            let r = deck[i] as usize;
            st.draw(r);
            actions(&st, &mut acts);
            let mut best: ((u8, u8), f32, i32, St) = (acts[0], f32::NEG_INFINITY, 0, st);
            for &(sy, pl) in acts.iter() {
                let mut s2 = st; s2.score = 0;
                let p = s2.act(sy, pl, r);
                let q = p as f32 + if s2.over() { s2.term_bonus(1000) as f32 } else { net.v(&s2) };
                if q > best.1 { best = ((sy, pl), q, p, s2); }
            }
            if let Some(pv) = prev { let d = alpha * (best.1 - net.v(&pv)); net.update(&pv, d); }
            total += best.2; st = best.3;
            if st.over() { total += st.term_bonus(1000); break; }
            prev = Some(st);
        }
        if g % 50 == 0 { tot += total as f64; cnt += 1.0; }
        if (g + 1) % 200_000 == 0 { println!("games {} train-avg(sampled) {:.0}", g + 1, tot / cnt); tot = 0.0; cnt = 0.0; }
    }
    net.save(&out);
}
