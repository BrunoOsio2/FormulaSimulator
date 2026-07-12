// ─── Driver attributes ────────────────────────────────────────────────────────
// All stats 1–99.
// Handicap is inverted: higher = worse.
// Smoothness is reserved for tyre degradation — not used in sim yet.
//
// Sources: loosely based on 2024 season perception, not official ratings.

const DRIVER_ATTRS = {
  VER: { cornering: 97, braking: 96, reactions: 95, control: 96, accuracy: 95, smoothness: 82, overtaking: 97, defending: 94, adaptability: 93, growth: 20, handicap: 2  },
  LEC: { cornering: 94, braking: 90, reactions: 88, control: 84, accuracy: 90, smoothness: 78, overtaking: 88, defending: 82, adaptability: 85, growth: 55, handicap: 8  },
  HAM: { cornering: 93, braking: 95, reactions: 88, control: 94, accuracy: 93, smoothness: 92, overtaking: 95, defending: 91, adaptability: 96, growth: 10, handicap: 4  },
  NOR: { cornering: 91, braking: 88, reactions: 89, control: 88, accuracy: 89, smoothness: 80, overtaking: 87, defending: 83, adaptability: 84, growth: 72, handicap: 5  },
  PIA: { cornering: 87, braking: 84, reactions: 85, control: 85, accuracy: 85, smoothness: 80, overtaking: 82, defending: 78, adaptability: 80, growth: 78, handicap: 9  },
  SAI: { cornering: 89, braking: 88, reactions: 84, control: 89, accuracy: 88, smoothness: 84, overtaking: 84, defending: 85, adaptability: 86, growth: 35, handicap: 6  },
  RUS: { cornering: 88, braking: 86, reactions: 87, control: 87, accuracy: 88, smoothness: 81, overtaking: 83, defending: 82, adaptability: 83, growth: 60, handicap: 7  },
  ALO: { cornering: 92, braking: 93, reactions: 85, control: 93, accuracy: 92, smoothness: 90, overtaking: 93, defending: 95, adaptability: 91, growth: 8,  handicap: 3  },
  STR: { cornering: 78, braking: 76, reactions: 78, control: 76, accuracy: 75, smoothness: 74, overtaking: 72, defending: 74, adaptability: 80, growth: 45, handicap: 18 },
  GAS: { cornering: 82, braking: 80, reactions: 82, control: 78, accuracy: 79, smoothness: 76, overtaking: 78, defending: 76, adaptability: 77, growth: 50, handicap: 14 },
  OCO: { cornering: 81, braking: 79, reactions: 80, control: 77, accuracy: 78, smoothness: 75, overtaking: 76, defending: 78, adaptability: 76, growth: 48, handicap: 15 },
  HUL: { cornering: 80, braking: 78, reactions: 79, control: 80, accuracy: 79, smoothness: 77, overtaking: 75, defending: 79, adaptability: 75, growth: 20, handicap: 14 },
  TSU: { cornering: 82, braking: 80, reactions: 84, control: 74, accuracy: 77, smoothness: 73, overtaking: 80, defending: 72, adaptability: 74, growth: 55, handicap: 16 },
  ALB: { cornering: 79, braking: 77, reactions: 79, control: 80, accuracy: 78, smoothness: 76, overtaking: 74, defending: 76, adaptability: 79, growth: 40, handicap: 17 },
  SAR: { cornering: 68, braking: 65, reactions: 70, control: 65, accuracy: 66, smoothness: 68, overtaking: 62, defending: 64, adaptability: 67, growth: 82, handicap: 32 },
  MAG: { cornering: 77, braking: 76, reactions: 78, control: 72, accuracy: 73, smoothness: 71, overtaking: 73, defending: 77, adaptability: 73, growth: 22, handicap: 18 },
  BOT: { cornering: 83, braking: 82, reactions: 81, control: 82, accuracy: 82, smoothness: 80, overtaking: 79, defending: 78, adaptability: 80, growth: 18, handicap: 12 },
  ZHO: { cornering: 74, braking: 72, reactions: 73, control: 73, accuracy: 73, smoothness: 72, overtaking: 68, defending: 70, adaptability: 72, growth: 70, handicap: 24 },
  RIC: { cornering: 83, braking: 85, reactions: 82, control: 80, accuracy: 80, smoothness: 78, overtaking: 86, defending: 80, adaptability: 79, growth: 15, handicap: 14 },
  LAW: { cornering: 78, braking: 76, reactions: 80, control: 74, accuracy: 75, smoothness: 73, overtaking: 74, defending: 70, adaptability: 75, growth: 80, handicap: 20 },
};

// Nacionalidade de cada piloto (bandeira emoji) — placeholder até ter assets.
const DRIVER_FLAG = {
  VER: '🇳🇱', LEC: '🇲🇨', HAM: '🇬🇧', NOR: '🇬🇧', PIA: '🇦🇺',
  SAI: '🇪🇸', RUS: '🇬🇧', ALO: '🇪🇸', STR: '🇨🇦', GAS: '🇫🇷',
  OCO: '🇫🇷', HUL: '🇩🇪', TSU: '🇯🇵', ALB: '🇹🇭', SAR: '🇺🇸',
  MAG: '🇩🇰', BOT: '🇫🇮', ZHO: '🇨🇳', RIC: '🇦🇺', LAW: '🇳🇿',
};

// Returns effective value of an attribute after handicap penalty.
// effectiveAttr = attr × (1 - handicap / 200)
function effectiveAttr(code, attr) {
  const d = DRIVER_ATTRS[code];
  return d[attr] * (1 - d.handicap / 200);
}
