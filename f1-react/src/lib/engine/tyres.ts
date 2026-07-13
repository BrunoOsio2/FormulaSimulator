import type { Track } from './types';
import { effectiveAttr } from '../data/drivers';

// ─── Pneus (E1) ──────────────────────────────────────────────────────────────
// 3 compostos: macio (rápido, degrada rápido), médio (equilíbrio), duro (lento,
// degrada devagar). O desgaste cresce com a idade do pneu (voltas no stint) e é
// modulado pela abrasão da pista (tireDegradation) e pela suavidade do piloto
// (smoothness alto → degrada menos). Puro/determinístico.

export type Compound = 'soft' | 'medium' | 'hard';

export const COMPOUNDS: Record<Compound, { paceOffset: number; degPerLap: number; label: string }> = {
  // paceOffset: fração somada ao tempo do mini com pneu NOVO (macio negativo = mais rápido)
  // degPerLap: fração adicionada por volta de idade do pneu
  soft:   { paceOffset: -0.006, degPerLap: 0.0016, label: 'M' }, // macio (vermelho)
  medium: { paceOffset:  0.000, degPerLap: 0.0009, label: 'M' }, // médio (amarelo)
  hard:   { paceOffset:  0.006, degPerLap: 0.0004, label: 'D' }, // duro (branco)
};

// Fator multiplicativo do tempo de um mini-setor dado o composto e a idade (voltas).
//   novo: 1 + paceOffset  (macio < 1 < duro)
//   desgaste: cresce com ageLaps × degPerLap × abrasão × (piloto pouco suave)
export function tyreMultiplier(compound: Compound, ageLaps: number, track: Track, code: string): number {
  const c = COMPOUNDS[compound];
  const abras = ((track.tireDegradation as number) ?? 5) / 5;      // ~0.6..2.0
  const smooth = effectiveAttr(code, 'smoothness');                 // 1..99
  const smoothFactor = 1 + (70 - smooth) / 120;                     // suave <1, bruto >1
  const wear = c.degPerLap * Math.max(0, ageLaps) * abras * smoothFactor;
  return 1 + c.paceOffset + wear;
}

// Cor do composto para a UI.
export const COMPOUND_COLOR: Record<Compound, string> = {
  soft:   '#e1483a', // vermelho
  medium: '#f5c518', // amarelo
  hard:   '#e8e8e8', // branco
};
