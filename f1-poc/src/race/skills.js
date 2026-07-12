// ─── Habilidade do piloto → tempo de mini-setor ───────────────────────────────
// Cada tipo de mini-setor testa um atributo primário e tem um peso.

const MINI_SECTOR_ATTR = {
  straight:      'reactions',
  braking:       'braking',
  slow_corner:   'cornering',
  medium_corner: 'cornering',
  fast_corner:   'cornering',
};

const MINI_SECTOR_WEIGHT = {
  straight:      0.6,
  braking:       1.0,
  slow_corner:   0.8,
  medium_corner: 0.9,
  fast_corner:   1.1,
};

// Multiplicador de tempo do mini-setor: 1.0 para um piloto perfeito (99),
// maior (mais lento) conforme a habilidade cai. Escala com trackWeight.
// SPREAD controla o quanto a habilidade separa o pelotão (grid moderado).
const SPREAD = 0.15;
function miniSectorModifier(code, type, track) {
  const attr  = MINI_SECTOR_ATTR[type];
  const w     = MINI_SECTOR_WEIGHT[type];
  const score = effectiveAttr(code, attr);
  const delta = (99 - score) / 99;
  return 1 + delta * (track.trackWeight / 10) * SPREAD * w;
}

// Janela de variação aleatória por mini-setor: mais accuracy → mais consistente.
function accuracyWindow(code, baseVariation) {
  const acc   = effectiveAttr(code, 'accuracy');
  const scale = 1 - (acc / 99) * 0.5;
  return baseVariation * scale;
}

// Constrói o estado inicial dos pilotos: tempo base de cada mini-setor por setor.
function buildDrivers(track) {
  return DRIVERS.map((code, i) => ({
    code,
    pos: i + 1,
    baseMini: track.sectorRatio.map(r => (track.baseLap * r) / MINI_PER_SECTOR),
  }));
}
