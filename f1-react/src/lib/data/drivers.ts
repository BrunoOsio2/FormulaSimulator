import type { DriverAttrs, DriverCode } from '../engine/types';

// ─── Atributos dos pilotos (1–99; handicap invertido: maior = pior) ───────────
// Grid 2026 (22 carros, 11 equipes). Ratings por percepção, não oficiais.
// Estreantes/novatos vêm com growth alto e handicap maior (menos rodagem).
export const DRIVER_ATTRS: Record<DriverCode, DriverAttrs> = {
  // ── Red Bull ──
  VER: { cornering: 97, braking: 96, reactions: 95, control: 96, accuracy: 95, smoothness: 82, overtaking: 97, defending: 94, adaptability: 93, growth: 20, handicap: 2  },
  HAD: { cornering: 82, braking: 80, reactions: 83, control: 79, accuracy: 80, smoothness: 76, overtaking: 80, defending: 76, adaptability: 78, growth: 85, handicap: 15 },
  // ── Ferrari ──
  LEC: { cornering: 94, braking: 90, reactions: 88, control: 84, accuracy: 90, smoothness: 78, overtaking: 88, defending: 82, adaptability: 85, growth: 50, handicap: 8  },
  HAM: { cornering: 93, braking: 95, reactions: 88, control: 94, accuracy: 93, smoothness: 92, overtaking: 95, defending: 91, adaptability: 96, growth: 8,  handicap: 4  },
  // ── Mercedes ──
  RUS: { cornering: 89, braking: 87, reactions: 88, control: 88, accuracy: 89, smoothness: 82, overtaking: 84, defending: 83, adaptability: 84, growth: 55, handicap: 6  },
  ANT: { cornering: 88, braking: 85, reactions: 88, control: 85, accuracy: 85, smoothness: 79, overtaking: 84, defending: 80, adaptability: 84, growth: 88, handicap: 9  },
  // ── McLaren ──
  NOR: { cornering: 92, braking: 89, reactions: 90, control: 89, accuracy: 90, smoothness: 81, overtaking: 88, defending: 84, adaptability: 85, growth: 68, handicap: 4  },
  PIA: { cornering: 90, braking: 87, reactions: 88, control: 88, accuracy: 88, smoothness: 82, overtaking: 85, defending: 82, adaptability: 84, growth: 75, handicap: 5  },
  // ── Aston Martin ──
  ALO: { cornering: 92, braking: 93, reactions: 85, control: 93, accuracy: 92, smoothness: 90, overtaking: 93, defending: 95, adaptability: 91, growth: 6,  handicap: 3  },
  STR: { cornering: 78, braking: 76, reactions: 78, control: 76, accuracy: 75, smoothness: 74, overtaking: 72, defending: 74, adaptability: 80, growth: 40, handicap: 18 },
  // ── Audi ──
  HUL: { cornering: 82, braking: 80, reactions: 80, control: 82, accuracy: 81, smoothness: 78, overtaking: 77, defending: 80, adaptability: 78, growth: 15, handicap: 12 },
  BOR: { cornering: 81, braking: 79, reactions: 82, control: 78, accuracy: 79, smoothness: 75, overtaking: 79, defending: 75, adaptability: 77, growth: 86, handicap: 16 },
  // ── Alpine ──
  GAS: { cornering: 83, braking: 81, reactions: 82, control: 79, accuracy: 80, smoothness: 77, overtaking: 79, defending: 77, adaptability: 78, growth: 45, handicap: 13 },
  COL: { cornering: 80, braking: 78, reactions: 82, control: 77, accuracy: 78, smoothness: 75, overtaking: 82, defending: 74, adaptability: 78, growth: 82, handicap: 17 },
  // ── Williams ──
  ALB: { cornering: 84, braking: 82, reactions: 82, control: 84, accuracy: 83, smoothness: 80, overtaking: 80, defending: 82, adaptability: 83, growth: 38, handicap: 11 },
  SAI: { cornering: 89, braking: 88, reactions: 84, control: 89, accuracy: 88, smoothness: 84, overtaking: 84, defending: 85, adaptability: 86, growth: 30, handicap: 6  },
  // ── Haas ──
  OCO: { cornering: 82, braking: 80, reactions: 81, control: 78, accuracy: 79, smoothness: 76, overtaking: 77, defending: 79, adaptability: 77, growth: 42, handicap: 14 },
  BEA: { cornering: 82, braking: 81, reactions: 83, control: 79, accuracy: 80, smoothness: 77, overtaking: 81, defending: 77, adaptability: 79, growth: 84, handicap: 15 },
  // ── Racing Bulls ──
  LAW: { cornering: 80, braking: 78, reactions: 81, control: 76, accuracy: 77, smoothness: 74, overtaking: 78, defending: 73, adaptability: 77, growth: 76, handicap: 17 },
  LIN: { cornering: 76, braking: 74, reactions: 80, control: 73, accuracy: 74, smoothness: 72, overtaking: 76, defending: 71, adaptability: 74, growth: 90, handicap: 21 },
  // ── Cadillac ──
  PER: { cornering: 84, braking: 83, reactions: 82, control: 84, accuracy: 83, smoothness: 81, overtaking: 85, defending: 83, adaptability: 82, growth: 12, handicap: 10 },
  BOT: { cornering: 82, braking: 81, reactions: 80, control: 82, accuracy: 81, smoothness: 80, overtaking: 78, defending: 78, adaptability: 79, growth: 14, handicap: 13 },
};

// Nacionalidade (bandeira emoji) — placeholder até ter assets.
export const DRIVER_FLAG: Record<DriverCode, string> = {
  VER: '🇳🇱', HAD: '🇫🇷',                    // Red Bull
  LEC: '🇲🇨', HAM: '🇬🇧',                    // Ferrari
  RUS: '🇬🇧', ANT: '🇮🇹',                    // Mercedes
  NOR: '🇬🇧', PIA: '🇦🇺',                    // McLaren
  ALO: '🇪🇸', STR: '🇨🇦',                    // Aston Martin
  HUL: '🇩🇪', BOR: '🇧🇷',                    // Audi
  GAS: '🇫🇷', COL: '🇦🇷',                    // Alpine
  ALB: '🇹🇭', SAI: '🇪🇸',                    // Williams
  OCO: '🇫🇷', BEA: '🇬🇧',                    // Haas
  LAW: '🇳🇿', LIN: '🇬🇧',                    // Racing Bulls
  PER: '🇲🇽', BOT: '🇫🇮',                    // Cadillac
};

// Cor de cada piloto no mapa (baseada nas cores das equipes 2026).
export const DRIVER_COLOR: Record<DriverCode, string> = {
  VER: '#1e5bc6', HAD: '#4781d7',           // Red Bull
  LEC: '#e8002d', HAM: '#ff6d6d',           // Ferrari
  RUS: '#27f4d2', ANT: '#00d7b6',           // Mercedes
  NOR: '#ff8000', PIA: '#ffb27a',           // McLaren
  ALO: '#229971', STR: '#5fcfa8',           // Aston Martin
  HUL: '#e2004f', BOR: '#f56aa0',           // Audi
  GAS: '#0093cc', COL: '#6fc7e6',           // Alpine
  ALB: '#37bedd', SAI: '#8fe0f0',           // Williams
  OCO: '#b6babd', BEA: '#e2e2e2',           // Haas
  LAW: '#6692ff', LIN: '#a0b6ff',           // Racing Bulls
  PER: '#d4af37', BOT: '#ecd77a',           // Cadillac
};


// Valor efetivo de um atributo após a penalidade de handicap.
// effectiveAttr = attr × (1 - handicap / 200)
export function effectiveAttr(code: DriverCode, attr: keyof DriverAttrs): number {
  const d = DRIVER_ATTRS[code];
  return d[attr] * (1 - d.handicap / 200);
}
