import type { DriverAttrs, MiniSectorType, Track } from './types';
import { effectiveAttr } from '../data/drivers';

// ─── Constantes da corrida ─────────────────────────────────────────────────────
// Grid 2026 — 22 carros (11 equipes × 2). Ordem = grid inicial aproximado.
export const DRIVERS: string[] = [
  'VER','NOR','PIA','LEC','HAM','RUS','ALO','SAI','ANT','GAS',
  'HAD','PER','ALB','HUL','OCO','BEA','STR','BOT','LAW','BOR',
  'COL','LIN',
];

export const MINI_PER_SECTOR = 9;

// ─── Habilidade do piloto → tempo de mini-setor ───────────────────────────────
const MINI_SECTOR_ATTR: Record<MiniSectorType, keyof DriverAttrs> = {
  straight:      'reactions',
  braking:       'braking',
  slow_corner:   'cornering',
  medium_corner: 'cornering',
  fast_corner:   'cornering',
};

const MINI_SECTOR_WEIGHT: Record<MiniSectorType, number> = {
  straight:      0.6,
  braking:       1.0,
  slow_corner:   0.8,
  medium_corner: 0.9,
  fast_corner:   1.1,
};

// Multiplicador de tempo do mini-setor: 1.0 para um piloto perfeito (99),
// maior (mais lento) conforme a habilidade cai. Escala com trackWeight.
// O fator SPREAD controla o quanto a habilidade separa o pelotão. Mantido baixo
// de propósito: hoje o piloto é o único fator, mas no futuro pneus e força do
// carro vão somar — então a habilidade sozinha não deve dominar o grid.
const SPREAD = 0.15;
export function miniSectorModifier(code: string, type: MiniSectorType, track: Track): number {
  const attr  = MINI_SECTOR_ATTR[type];
  const w     = MINI_SECTOR_WEIGHT[type];
  const score = effectiveAttr(code, attr);
  const delta = (99 - score) / 99;
  return 1 + delta * (track.trackWeight / 10) * SPREAD * w;
}

// Janela de variação aleatória por mini-setor: mais accuracy → mais consistente.
export function accuracyWindow(code: string, baseVariation: number): number {
  const acc   = effectiveAttr(code, 'accuracy');
  const scale = 1 - (acc / 99) * 0.5;
  return baseVariation * scale;
}

// Estado inicial dos pilotos: tempo base de cada mini-setor por setor.
export function buildDrivers(track: Track): { code: string; pos: number; baseMini: number[] }[] {
  return DRIVERS.map((code, i) => ({
    code,
    pos: i + 1,
    baseMini: track.sectorRatio.map(r => (track.baseLap * r) / MINI_PER_SECTOR),
  }));
}
