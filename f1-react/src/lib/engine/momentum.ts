import type { Track } from './types';
import { RNG } from './rng';
import { DRIVER_ATTRS } from '../data/drivers';

// ─── Momentum / forma do piloto (C6) ─────────────────────────────────────────
// Ideia estilo Winning Eleven: a cada X voltas, cada piloto recebe uma "forma"
// (seta ↑↑ / ↑ / → / ↓ / ↓↓) que dura aquela fase. A forma:
//   - ajusta o ritmo geral em ±~2 décimos por volta (nível -2..+2);
//   - multiplica a chance de erro (fase ruim = erra mais).
// Ligado ao `handicap`: quem tem handicap alto tem forma mais VOLÁTIL e com viés
// NEGATIVO (mais chance de fase ruim, menos de fase inspirada). Determinístico
// dado o RNG (o motor injeta um por seed).

export const PHASE_LAPS = 8;              // recalcula a forma a cada 8 voltas
export type MomentumLevel = -2 | -1 | 0 | 1 | 2;

// Ganho de tempo por volta em cada nível (s). Negativo = mais rápido (embalado).
// -2 → +0.20s/volta (lento); +2 → -0.20s/volta (rápido). Distribuído nos 27 minis.
const PACE_PER_LEVEL = 0.10;              // s por nível por volta
const MINI_PER_LAP = 27;

// Multiplicador da chance de erro por nível: fase ruim erra mais.
// nível -2 → 1.8×; 0 → 1.0×; +2 → 0.5×.
export function mistakeMultiplier(level: MomentumLevel): number {
  return 1 - level * 0.25;               // -2→1.5, -1→1.25, 0→1, 1→0.75, 2→0.5
}

// Ganho no tempo de um MINI-setor para um dado nível (s). >0 = mais lento.
export function paceDeltaPerMini(level: MomentumLevel): number {
  return (-level * PACE_PER_LEVEL) / MINI_PER_LAP;
}

// Sorteia o nível de momentum de uma fase, enviesado pelo handicap do piloto.
// handicap 0 → simétrico em torno de 0; handicap alto → puxa p/ negativo e amplia.
export function rollMomentum(code: string, rng: RNG): MomentumLevel {
  const handicap = DRIVER_ATTRS[code]?.handicap ?? 10;   // 1..~30 (maior = pior)
  const bias = -handicap / 40;                           // 0 a ~-0.75 (empurra p/ ruim)
  // r ∈ [-1,1] centrado; soma o viés; mapeia em faixas para {-2..2}
  const r = (rng.next() * 2 - 1) + bias;
  if (r < -0.6) return -2;
  if (r < -0.2) return -1;
  if (r <  0.2) return 0;
  if (r <  0.6) return 1;
  return 2;
}

// Constrói a série de momentum de um piloto para a corrida inteira: um nível por
// FASE (PHASE_LAPS voltas). Retorna um array indexado por fase.
export function buildMomentumSeries(code: string, track: Track, rng: RNG): MomentumLevel[] {
  const phases = Math.ceil(track.laps / PHASE_LAPS);
  const series: MomentumLevel[] = [];
  for (let i = 0; i < phases; i++) series.push(rollMomentum(code, rng));
  return series;
}

// Nível de momentum vigente numa dada volta (0-based).
export function momentumAtLap(series: MomentumLevel[], lap: number): MomentumLevel {
  return series[Math.floor(lap / PHASE_LAPS)] ?? 0;
}
