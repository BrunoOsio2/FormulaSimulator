// ─── RNG (xorshift32) ─────────────────────────────────────────────────────────
// Gerador pseudo-aleatório determinístico: mesma seed → mesma sequência.
export class RNG {
  private state: number;
  constructor(seed: number) { this.state = (seed >>> 0) || 1; }
  next(): number {
    let x = this.state;
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    return ((this.state = x >>> 0) >>> 0) / 0xFFFFFFFF;
  }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
}
