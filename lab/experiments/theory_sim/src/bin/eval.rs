//! eval <decks.txt|seeds:LO-HI> <policy...>   policies: greedy | td0 | td1 | td1eg<K>
use theory_sim::{policy::*, rng::*, td::*};
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let decks: Vec<(u64, [u8; 52])> = if let Some(r) = a[1].strip_prefix("seeds:") {
        let (lo, hi) = r.split_once('-').unwrap(); (lo.parse::<u64>().unwrap()..=hi.parse::<u64>().unwrap()).map(|s| (s, shuffled_deck(s))).collect()
    } else { load_decks(&a[1]) };
    let net = Net::load("net_b.bin");
    for p in &a[2..] {
        let t = std::time::Instant::now();
        let res = match p.as_str() {
            "greedy" => eval_decks(&decks, 8, 1000, || Greedy::new(500.0, 500.0)),
            "td0" => eval_decks(&decks, 8, 1000, || TdPolicy::new(&net, 0, 0)),
            "td1" => eval_decks(&decks, 8, 1000, || TdPolicy::new(&net, 1, 0)),
            s if s.starts_with("td1eg") => { let k: u8 = s[5..].parse().unwrap(); eval_decks(&decks, 8, 1000, || TdPolicy::new(&net, 1, k)) }
            s if s.starts_with("greedy:") => { let v: Vec<f64> = s[7..].split(',').map(|x| x.parse().unwrap()).collect(); eval_decks(&decks, 8, 1000, || Greedy::new(v[0], v[1])) }
            _ => panic!("policy"),
        };
        summarize(p, &res);
        eprintln!("  ({:.1}s)", t.elapsed().as_secs_f64());
    }
}
