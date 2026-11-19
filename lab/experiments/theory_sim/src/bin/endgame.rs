//! endgame <positions.jsonl> <maxrem> <out.csv>
//! For champion-like positions (js/gen_positions.js) with rem<=maxrem cards undealt, compute EXACT expectimax values
//! (true objective, Perfect Bonus included) of the same position with hypothetical busts / stays / Perfect-Bonus variants.
//! CSV columns: seed,rem,busts,stays,prev, Vb0,Vb1,Vb2 (pb=1000), Wb0,Wb1,Wb2 (pb=0), Vs0,Vs1,Vs2 (pb=1000, busts as actual)
use theory_sim::{game::*, solver::*};
use std::collections::HashMap;
use std::sync::Mutex;
fn num(s: &str, key: &str) -> i64 { let k = format!("\"{}\":", key); let i = s.find(&k).unwrap() + k.len(); let e = s[i..].find(|c: char| c == ',' || c == '}' || c == ']').unwrap(); s[i..i + e].trim().parse().unwrap() }
fn arr(s: &str, key: &str) -> Vec<i64> { let k = format!("\"{}\":[", key); let i = s.find(&k).unwrap() + k.len(); let e = s[i..].find(']').unwrap(); s[i..i + e].split(',').map(|x| x.trim().parse().unwrap()).collect() }
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let maxrem: i64 = a[2].parse().unwrap();
    let minrem: i64 = a.get(4).map(|x| x.parse().unwrap()).unwrap_or(0);
    let stride: usize = a.get(5).map(|x| x.parse().unwrap()).unwrap_or(1);
    let nth = a.get(6).map(|x| x.parse::<usize>().unwrap()).unwrap_or(8);
    let mut cntr = 0usize;
    let t = tabs();
    let mut idmap: HashMap<(u8, bool, u8, bool), u8> = HashMap::new();
    for (i, d) in t.desc.iter().enumerate() { idmap.insert((d.h, d.a, d.c, d.s7), i as u8); }
    let mut pos: Vec<St> = vec![]; let mut meta: Vec<(i64, i64)> = vec![];
    for l in std::fs::read_to_string(&a[1]).unwrap().lines() {
        if !l.starts_with("{\"t\":\"pos\"") { continue; }
        let rem = num(l, "rem"); if rem > maxrem || rem < minrem { continue; }
        cntr += 1; if cntr % stride != 0 { continue; }
        let mut st = St::new(); st.cnt = [0; 11];
        let dk = arr(l, "deck"); let mut left = 0;
        for v in 1..=10 { st.cnt[v] = dk[v - 1] as u8; left += dk[v - 1]; }
        assert_eq!(left, rem); st.left = rem as u8; st.score = 0;
        let cols = arr(l, "cols");
        for j in 0..4 { let c = cols[j] as u32; if c == 0 { st.col[j] = 0; continue; }
            let h = (c & 31) as u8; let ace = (c >> 5) & 1 == 1; let n = ((c >> 6) & 7) as u8; let not7 = (c >> 9) & 1 == 1;
            let ace = if h > 11 { false } else { ace };
            let s7 = !not7 && !ace && h == 7 * n;
            st.col[j] = *idmap.get(&(h, ace, n, s7)).expect("col"); }
        st.busts = num(l, "busts") as u8; st.stays = num(l, "stays") as u8; st.streak = (num(l, "prev") as u8).min(5);
        pos.push(st); meta.push((num(l, "seed"), rem));
    }
    eprintln!("{} positions", pos.len());
    let out = Mutex::new(vec![String::new(); pos.len()]);
    let next = std::sync::atomic::AtomicUsize::new(0);
    std::thread::scope(|sc| {
        for _ in 0..nth {
            sc.spawn(|| {
                let mut s1 = Solver::new(1000); let mut s0 = Solver::new(0);
                loop {
                    let i = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed); if i >= pos.len() { break; }
                    if s1.memo.len() > 1_500_000 { s1.memo.clear(); } if s0.memo.len() > 1_500_000 { s0.memo.clear(); }
                    let p = pos[i]; let mut row = format!("{},{},{},{},{}", meta[i].0, meta[i].1, p.busts, p.stays, p.streak);
                    for b in 0..3 { let mut q = p; q.busts = b; row += &format!(",{:.3}", s1.value(&q)); }
                    for b in 0..3 { let mut q = p; q.busts = b; row += &format!(",{:.3}", s0.value(&q)); }
                    for s in 0..3u8 { let mut q = p; q.stays = s; row += &format!(",{:.3}", s1.value(&q)); }
                    out.lock().unwrap()[i] = row;
                }
            });
        }
    });
    let mut txt = String::from("seed,rem,busts,stays,prev,Vb0,Vb1,Vb2,Wb0,Wb1,Wb2,Vs0,Vs1,Vs2\n");
    for r in out.into_inner().unwrap() { txt += &r; txt += "\n"; }
    std::fs::write(&a[3], txt).unwrap();
}
