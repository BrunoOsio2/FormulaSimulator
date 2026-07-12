import type { Track } from './types';
import { effectiveAttr } from '../data/drivers';

// ─── Ultrapassagem (C1) ──────────────────────────────────────────────────────
// Chance de um atacante passar um defensor, dada a habilidade dos dois e a
// passabilidade da pista. Puro e testável; a decisão (RNG) fica no motor.
//
//   overtaking (atacante) vs defending (defensor) → vantagem de skill
//   overtakingOpportunities da pista → escala geral (Monaco ~0, Interlagos alto)
//   defensiveDifficulty da pista → reforça o defensor (Monaco é difícil de passar)

// chance ∈ [0, MAX_CHANCE]. Determinística dado (atacante, defensor, pista).
export const MAX_CHANCE = 0.9;

export function overtakeChance(attacker: string, defender: string, track: Track): number {
  const atk = effectiveAttr(attacker, 'overtaking');   // 1..99
  const def = effectiveAttr(defender, 'defending');    // 1..99
  const opp = (track.overtakingOpportunities as number) ?? 5;   // 1..10
  const ddiff = (track.defensiveDifficulty as number) ?? 5;     // 1..10

  // vantagem de skill em torno de 0.5 (igualdade → 0.5)
  const skillEdge = (atk - def) / 99;                  // -1..1
  const base = 0.5 + skillEdge * 0.5;                  // 0..1

  // pista: oportunidade abre a janela; dificuldade defensiva fecha
  const oppFactor = opp / 10;                          // 0.1..1.0
  const defPenalty = 1 - (ddiff - 5) / 20;             // ddiff 5→1.0, 9→0.8, 1→1.2

  const chance = base * oppFactor * defPenalty;
  return Math.max(0, Math.min(MAX_CHANCE, chance));
}

// Resolve a tentativa: sucesso se o sorteio [0,1) cai abaixo da chance.
export function resolvePass(rngValue: number, chance: number): boolean {
  return rngValue < chance;
}
