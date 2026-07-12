// ─── RNG (xorshift32) ─────────────────────────────────────────────────────────
// Gerador pseudo-aleatório determinístico: mesma seed → mesma sequência.
class RNG {
  constructor(seed) { this.state = (seed >>> 0) || 1; }
  next() {
    let x = this.state;
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    return ((this.state = x >>> 0) >>> 0) / 0xFFFFFFFF;
  }
  range(min, max) { return min + this.next() * (max - min); }
}
