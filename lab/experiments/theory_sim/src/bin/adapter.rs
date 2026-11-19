//! Bench protocol adapter (JSON lines on stdin/stdout) for theory_sim's policies.  usage: adapter greedy[:bust,stay]
//! Used by bench: cmd:experiments/theory_sim/target/release/adapter greedy:500,0
use theory_sim::{game::*, policy::*};
use std::io::{BufRead, Write};
fn find<'a>(s: &'a str, key: &str) -> &'a str { let k = format!("\"{}\":", key); let i = s.find(&k).unwrap() + k.len(); &s[i..] }
fn int(s: &str, key: &str) -> i64 { let t = find(s, key); let e = t.find(|c: char| c == ',' || c == '}').unwrap(); t[..e].trim().parse().unwrap() }
fn ints(s: &str) -> Vec<i64> { s.split(|c: char| !(c.is_ascii_digit() || c == '-')).filter(|x| !x.is_empty()).map(|x| x.parse().unwrap()).collect() }
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let spec = a.get(1).cloned().unwrap_or("greedy".into());
    let (bc, sc) = if let Some(r) = spec.strip_prefix("greedy:") { let v: Vec<f64> = r.split(',').map(|x| x.parse().unwrap()).collect(); (v[0], v[1]) } else { (500.0, 0.0) };
    let mut pol = Greedy::new(bc, sc);
    let t = tabs();
    let stdin = std::io::stdin(); let mut out = std::io::stdout();
    for line in stdin.lock().lines() {
        let l = line.unwrap(); if l.trim().is_empty() { continue; }
        if l.contains("\"quit\"") { break; }
        if !l.contains("\"decide\"") { continue; }
        // columns
        let cs = find(&l, "columns"); let end = cs.find("]]").unwrap() + 2; let cols_s = &cs[..end];
        let mut st = St::new(); st.cnt = [0; 11];
        let mut j = 0; let mut depth = 0; let mut cur: Vec<i64> = vec![]; let mut num = String::new();
        let mut cols: Vec<Vec<i64>> = vec![vec![]; 4];
        for ch in cols_s.chars() {
            match ch { '[' => { depth += 1; } ']' => { if !num.is_empty() { cur.push(num.parse().unwrap()); num.clear(); } depth -= 1; if depth == 1 { cols[j] = cur.clone(); cur.clear(); j += 1; } }
                ',' => { if !num.is_empty() { cur.push(num.parse().unwrap()); num.clear(); } } c if c.is_ascii_digit() => num.push(c), _ => {} }
        }
        for j in 0..4 { let mut id = 0usize; for &v in &cols[j] { id = t.next[id][v as usize] as usize; } st.col[j] = id as u8; }
        let rem = ints(&find(&l, "remaining")[..find(&l, "remaining").find(']').unwrap()]);
        for v in 1..=10 { st.cnt[v] = rem[v - 1] as u8; }
        st.left = int(&l, "cards_left") as u8; st.busts = int(&l, "busts") as u8; st.stays = int(&l, "stays_left") as u8;
        st.streak = (int(&l, "streak") as u8).min(5);
        let cur = int(&l, "current") as usize;
        let (sy, pl) = pol.choose(&st, cur);
        let sy = if sy == 255 { "null".to_string() } else { sy.to_string() };
        writeln!(out, "{{\"stay\":{},\"place\":{}}}", sy, pl).unwrap(); out.flush().unwrap();
    }
}
