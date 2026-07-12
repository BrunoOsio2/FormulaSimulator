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

// Deriva uma seed-filha determinística a partir de uma seed-mãe e um salt (ex.:
// índice de grid do piloto). Espelha o mix xorshift do RNG, mas embaralha o salt
// com a constante da razão áurea (0x9e3779b1) para descorrelacionar os filhos.
// Puro e testável. Nunca retorna 0 (o RNG saneia 0→1, mas garantimos aqui também).
export function deriveSeed(seed: number, salt: number): number {
  let x = ((seed >>> 0) ^ ((salt + 1) * 0x9e3779b1)) >>> 0;
  x ^= x << 13; x ^= x >> 17; x ^= x << 5;
  return (x >>> 0) || 1;
}
