use theory_sim::game::*;
use theory_sim::policy::*;
use theory_sim::rng::*;

/// Scripted run: cards are placed exactly as scripted: (stay col or 255, place col). Returns final state.
/// Deck bookkeeping is faked (cnt not meaningful) so we only check scoring.
fn run(script: &[(u8, u8, usize)]) -> St {
    let mut st = St::new();
    for &(sy, pl, r) in script { st.left = 40; st.draw(r); st.act(sy, pl, r); if st.dead { break; } }
    st
}
fn pts(script: &[(u8, u8, usize)]) -> i32 { run(script).score }
const N: u8 = 255;

#[test] fn ace_plus_ten_is_21() { assert_eq!(pts(&[(N,0,1),(N,0,10)]), 400); }
#[test] fn soft_then_hard() { // 10,5,A(->1)=16, +5 = 21
    let s = run(&[(N,0,10),(N,0,5),(N,0,1)]); assert_eq!(s.score, 0); assert_eq!(s.busts, 0);
    let s = run(&[(N,0,10),(N,0,5),(N,0,1),(N,0,5)]); assert_eq!(s.score, 400); }
#[test] fn ace_ace_nine() { assert_eq!(pts(&[(N,0,1),(N,0,1),(N,0,9)]), 400); } // 11+1+9
#[test] fn ace_soft_stays_in_play() { // A,5 = soft 16; +9 -> hard 15 not bust, not 21; then +6 = 21
    let s = run(&[(N,0,1),(N,0,5),(N,0,9)]); assert_eq!((s.score, s.busts), (0, 0));
    assert_eq!(pts(&[(N,0,1),(N,0,5),(N,0,9),(N,0,6)]), 400); }
#[test] fn three_sevens_600_not_1000() { assert_eq!(pts(&[(N,0,7),(N,0,7),(N,0,7)]), 600); }
#[test] fn three_cards_21_with_one_seven_is_400() { assert_eq!(pts(&[(N,0,7),(N,0,4),(N,0,10)]), 400); assert_eq!(pts(&[(N,0,7),(N,0,7),(N,0,7)]), 600); }
#[test] fn seven_seven_then_nonseven_cannot_trio() { // 7,7,A: 15 hard (A=1)... then 6 -> 21 on 4th card =400
    assert_eq!(pts(&[(N,0,7),(N,0,7),(N,0,1),(N,0,6)]), 400);
    // 10,4,7 = 21 with a 7 only: 400
    assert_eq!(pts(&[(N,0,10),(N,0,4),(N,0,7)]), 400); }
#[test] fn five_card_no_bust_800() { assert_eq!(pts(&[(N,0,2),(N,0,2),(N,0,2),(N,0,2),(N,0,2)]), 800); }
#[test] fn five_card_21_is_1000() { assert_eq!(pts(&[(N,0,5),(N,0,4),(N,0,4),(N,0,4),(N,0,4)]), 1000); }
#[test] fn five_card_soft_21_is_1000() { assert_eq!(pts(&[(N,0,1),(N,0,1),(N,0,1),(N,0,1),(N,0,7)]), 1000); } // 11+1+1+1+7
#[test] fn five_card_bust_is_bust() { let s = run(&[(N,0,4),(N,0,4),(N,0,4),(N,0,4),(N,0,10)]); assert_eq!((s.score, s.busts), (0, 1)); assert_eq!(s.col[0], 0); }
#[test] fn bust_clears_column_counts_bust() { let s = run(&[(N,0,10),(N,0,10),(N,0,5)]); assert_eq!((s.busts, s.col[0]), (1, 0)); }
#[test] fn third_bust_ends() { let s = run(&[(N,0,10),(N,0,10),(N,0,5),(N,0,10),(N,0,10),(N,0,5),(N,0,10),(N,0,10),(N,0,5),(N,0,10)]); assert!(s.dead); assert_eq!(s.busts, 3); }
#[test] fn streak_bonuses() {
    // columns 0..3 each hold a 10; four aces clear them: 400, 400+250, 400+500, 400+1000, then 5th: put 10 then A
    let mut st = St::new(); st.col = [ (tabs().next[0][10]) as u8; 4 ];
    let mut tot = 0; for k in 0..4 { st.left = 40; st.draw(1); tot += st.place(k, 1); }
    assert_eq!(tot, 400 + 650 + 900 + 1400);
    assert_eq!(st.streak, 4);
    // 5th and 6th scoring cards: 400+2000 each
    st.col[0] = tabs().next[0][10] as u8; st.col[1] = st.col[0];
    st.draw(1); assert_eq!(st.place(0, 1), 2400); st.draw(1); assert_eq!(st.place(1, 1), 2400);
}
#[test] fn nonscoring_breaks_streak_stay_does_not() {
    let t = tabs(); let ten = t.next[0][10] as u8;
    let mut st = St::new(); st.col = [ten, ten, ten, 0]; st.left = 40;
    st.draw(1); assert_eq!(st.act(N, 0, 1), 400);
    st.draw(1); assert_eq!(st.act(3, 1, 1), 650);            // stay (on empty col, pointless but legal) keeps streak
    // non-scoring placement between resets
    let mut st = St::new(); st.col = [ten, ten, 0, 0]; st.left = 40;
    st.draw(1); assert_eq!(st.act(N, 0, 1), 400);
    st.draw(2); assert_eq!(st.act(N, 2, 2), 0); assert_eq!(st.streak, 0);
    st.draw(1); assert_eq!(st.act(N, 1, 1), 400);
}
#[test] fn stay_empties_column_and_allows_placing_into_it() {
    let t = tabs(); let ten = t.next[0][10] as u8;
    let mut st = St::new(); st.col = [ten, 0, 0, 0]; st.left = 40; st.stays = 2;
    st.draw(10); // stay col 0 then place 10 into emptied col0 => col0 = single 10, no points
    assert_eq!(st.act(0, 0, 10), 0); assert_eq!(st.stays, 1); assert_eq!(st.col[0], ten);
}
#[test] fn stay_freebie_no_bust_count() { let t = tabs(); let mut st = St::new(); st.col = [t.next[0][10] as u8, 0,0,0]; st.left=40; st.draw(3); st.act(0, 1, 3); assert_eq!(st.busts, 0); }
#[test] fn perfect_bonus() {
    let mut st = St::new(); st.left = 0; assert_eq!(st.term_bonus(1000), 1000);
    st.busts = 1; assert_eq!(st.term_bonus(1000), 0);
    let mut st = St::new(); st.left = 0; st.dead = true; assert_eq!(st.term_bonus(1000), 0);
}
#[test] fn deck_composition() {
    for seed in 1..50u64 { let d = shuffled_deck(seed); let mut c = [0; 11]; for &x in d.iter() { c[x as usize] += 1; }
        for v in 1..=9 { assert_eq!(c[v], 4); } assert_eq!(c[10], 16); }
    assert_eq!(shuffled_deck(1), shuffled_deck(1)); assert_ne!(shuffled_deck(1), shuffled_deck(2));
}
/// Whole-game accounting identity: score == sum(clear pts)+streak+pb.
#[test] fn full_game_accounting() {
    for seed in 1..200u64 { let mut p = Greedy::new(500.0, 500.0); let g = play(&shuffled_deck(seed), &mut p, 1000);
        assert_eq!(g.score, g.pts_clear + g.pts_streak + g.pts_pb);
        assert_eq!(g.pts_clear, g.pts_by_type.iter().sum::<i32>());
        assert!(g.busts <= 3); if g.busts == 0 { assert_eq!(g.pts_pb, 1000); } } }
/// Exact solver sanity: value with 0 cards left = 1000 iff zero busts; monotone in stays.
#[test] fn solver_basic() {
    use theory_sim::solver::Solver;
    let mut st = St::new(); for r in 1..=10 { st.cnt[r] = 0; } st.left = 0;
    let mut s = Solver::new(1000); assert_eq!(s.value(&st), 1000.0); st.busts = 1; assert_eq!(s.value(&st), 0.0);
    // 1 card left, a single 10 left, columns hold [10 (col state), ...]: place on empty cannot score; expect 1000 (no bust possible)
    let mut st = St::new(); for r in 1..=10 { st.cnt[r] = 0; } st.cnt[1] = 1; st.left = 1; st.col = [tabs().next[0][10] as u8, 0, 0, 0];
    let mut s = Solver::new(1000); assert_eq!(s.value(&st), 400.0 + 1000.0);
}
