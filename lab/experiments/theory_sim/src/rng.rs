//! RNG: SplitMix64 stream seeded with the integer seed. Deck: canonical order
//! A,A,A,A,2x4,...,9x4,then 16 tens (J/Q/K/10 are all value 10), Fisher-Yates from i=51 down to 1,
//! j = ((next_u64()>>32) * (i+1)) >> 32, swap(deck[i], deck[j]). Card i of the game = deck[i].
//! Deck entries are VALUES 1..=10 (1 = Ace).
pub struct SplitMix(pub u64);
impl SplitMix {
    pub fn new(seed: u64) -> Self { SplitMix(seed) }
    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^ (z >> 31)
    }
    #[inline]
    pub fn below(&mut self, n: u32) -> u32 { (((self.next_u64() >> 32) * n as u64) >> 32) as u32 }
    #[inline]
    pub fn unit(&mut self) -> f64 { (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64 }
}
pub fn shuffled_deck(seed: u64) -> [u8; 52] {
    let mut d = [0u8; 52];
    let mut k = 0;
    for v in 1..=10u8 { let n = if v == 10 { 16 } else { 4 }; for _ in 0..n { d[k] = v; k += 1; } }
    let mut r = SplitMix::new(seed);
    for i in (1..52).rev() { let j = r.below(i as u32 + 1) as usize; d.swap(i, j); }
    d
}
