import type { Track } from './types';
import { RNG } from './rng';
import { effectiveAttr } from '../data/drivers';

// ─── Erros de pilotagem (C5) ─────────────────────────────────────────────────
// Cada mini-setor tem uma pequena chance de "erro" (trava de roda, escapada) que
// adiciona tempo. Probabilidade e magnitude moduladas por `control`: piloto com
// control alto erra menos e perde menos. Pistas técnicas/bumpy aumentam o risco.
// Determinístico dado o RNG (o motor injeta um RNG por seed, consumido em ordem).

const BASE_RATE = 0.010;   // chance-base de erro por mini (control médio)
const MIN_LOSS = 0.25;     // s — perda mínima num erro
const MAX_LOSS = 1.40;     // s — perda máxima num erro

// Sorteia o tempo perdido por erro NESTE mini (0 se não houve erro). Consome
// exatamente 2 valores do RNG (erro? / magnitude) em ordem estável → determinismo.
// rateMul — multiplicador da chance (ex.: momentum ruim erra mais).
export function miniMistakeLoss(code: string, track: Track, rng: RNG, rateMul = 1): number {
  const control = effectiveAttr(code, 'control');           // 1..99
  const tech = ((track.technicality as number) ?? 5) / 10;  // 0.1..1.0
  const bump = ((track.bumpiness as number) ?? 5) / 10;     // 0.1..1.0
  // control alto → menos erros; pista técnica/bumpy → mais
  const rate = BASE_RATE * ((99 - control) / 30) * (0.6 + 0.4 * tech) * (0.7 + 0.3 * bump) * rateMul;

  const roll = rng.next();
  const mag = rng.next();
  return roll < rate ? MIN_LOSS + mag * (MAX_LOSS - MIN_LOSS) : 0;
}
