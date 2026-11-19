//! Linear afterstate value function V(afterstate) trained with TD(0). Features (additive):
//!  per column: A[left][colstate] + B[tensBucket][colstate];  global: G[left][busts][stays][streak].
//! This is OUR OWN small evaluator (not the champion NN); used only as the "base policy" for strategy quantification.
use crate::game::*;
use std::io::{Read, Write};

pub const NTB: usize = 13;
pub struct Net { pub nc: usize, pub w: Vec<f32>, offb: usize, offg: usize }
impl Net {
    pub fn new() -> Net {
        let nc = tabs().desc.len();
        let offb = 53 * nc; let offg = offb + NTB * nc;
        let total = offg + 53 * 3 * 3 * 6;
        Net { nc, w: vec![0.0; total], offb, offg }
    }
    #[inline]
    pub fn feats(&self, st: &St) -> [u32; 9] {
        let l = st.left as usize;
        let tb = if l == 0 { 0 } else { ((st.cnt[10] as usize * 12 + l / 2) / l).min(NTB - 1) };
        let mut f = [0u32; 9];
        for j in 0..4 {
            let c = st.col[j] as usize;
            f[j] = (l * self.nc + c) as u32;
            f[4 + j] = (self.offb + tb * self.nc + c) as u32;
        }
        f[8] = (self.offg + ((l * 3 + st.busts.min(2) as usize) * 3 + st.stays as usize) * 6 + st.streak as usize) as u32;
        f
    }
    #[inline]
    pub fn v(&self, st: &St) -> f32 {
        let f = self.feats(st);
        let mut s = 0.0; for &i in f.iter() { s += self.w[i as usize]; } s
    }
    #[inline]
    pub fn update(&mut self, st: &St, delta: f32) {
        let f = self.feats(st);
        for &i in f.iter() { self.w[i as usize] += delta; }
    }
    pub fn save(&self, path: &str) {
        let mut f = std::fs::File::create(path).unwrap();
        for x in &self.w { f.write_all(&x.to_le_bytes()).unwrap(); }
    }
    pub fn load(path: &str) -> Net {
        let mut n = Net::new();
        let mut b = vec![]; std::fs::File::open(path).unwrap().read_to_end(&mut b).unwrap();
        assert_eq!(b.len(), n.w.len() * 4);
        for (i, ch) in b.chunks(4).enumerate() { n.w[i] = f32::from_le_bytes([ch[0], ch[1], ch[2], ch[3]]); }
        n
    }
}
