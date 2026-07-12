// ─── Tipos centrais do motor de simulação ────────────────────────────────────

export type MiniSectorType =
  | 'straight' | 'braking' | 'slow_corner' | 'medium_corner' | 'fast_corner';

export type DriverCode = string;

export interface DriverAttrs {
  cornering: number;
  braking: number;
  reactions: number;
  control: number;
  accuracy: number;
  smoothness: number;
  overtaking: number;
  defending: number;
  adaptability: number;
  growth: number;
  handicap: number;
}

export interface CornerSpeed {
  at: number;      // fração de distância [0,1]
  speed: number;   // velocidade relativa alvo
  spread?: number; // largura da influência (fração)
}

export interface Track {
  name: string;
  country: string;
  difficulty: string;
  laps: number;
  baseLap: number;
  gapPerPos: number;
  sectorRatio: [number, number, number];
  variation: number;
  trackWeight: number;
  sectorProfile: { cornering: number; braking: number; reactions: number }[];
  miniSectors: MiniSectorType[][]; // 3 setores × 9 minis
  // atributos descritivos (layout, grip, clima, pneus, etc.)
  [key: string]: unknown;
  svgPath?: string;
  startFrac?: number; // fração [0,1] onde fica a linha de largada real no traçado
  cornerSpeeds?: CornerSpeed[];
  speedWarp?: SpeedWarpParams; // ajuste fino do perfil aceleração/frenagem no mapa (por pista)
}

// Parâmetros do warp de velocidade do mapa (curvatura → frenagem). Opcional por
// pista; sem isto, usa os defaults globais em buildSpeedWarp.
export interface SpeedWarpParams {
  minVel?: number;      // velocidade mínima nas curvas mais fechadas
  curvGain?: number;    // sensibilidade da frenagem à curvatura
  brakeWindow?: number; // amostras à frente/atrás que puxam a antecipação de freio
  maxAccel?: number;    // teto de aceleração por amostra (saída de curva)
  minWeight?: number;   // peso do mínimo-na-janela vs. velocidade local [0,1]
}

// Um evento = conclusão de um mini-setor por um piloto.
export interface TimelineEvent {
  time: number;
  lap: number;
  sector: number;
  miniSector: number;
  miniTime: number;
  isSectorEnd: boolean;
  isLapEnd: boolean;
  sectorTime: number | null;
  lapTime: number | null;
  curMiniSoFar: number[];
  lapSectorTimes: (number | null)[];
  lapMiniTimes: number[][];
}

export interface Timeline {
  code: DriverCode;
  events: TimelineEvent[];
}

// Linha por piloto num frame de playback.
export interface SnapshotRow {
  code: DriverCode;
  lap: number;
  sector: number;
  lastLapTime: number | null;
  bestLapTime: number | null;
  lastSectors: (number | null)[];
  lastMiniTimes: number[][];
  curSectorTimes: (number | null)[];
  curMiniTimesPerSector: number[][];
  gapToLeader: number;
  totalTime: number;
  finished: boolean;
}

export type Snapshot = SnapshotRow[];

export interface FinalStateRow {
  code: DriverCode;
  lapsCompleted: number;
  sectorsCompleted: number;
  totalTime: number;
  lastLapTime: number | null;
  bestLapTime: number | null;
  gapToLeader: number;
}

export interface RaceResult {
  finalState: FinalStateRow[];
  sectorSnapshots: Snapshot[];
  lapSnapshots: Snapshot[];
  track: Track;
  miniRef: { min: number; max: number }[][];
  personalBest: Record<DriverCode, number[][]>;
  sectorRef: { min: number }[];
  sectorPB: Record<DriverCode, number[]>;
  sectorColors: Record<string, string>;
  timelines: Timeline[];
}

// Traçado geométrico normalizado.
export interface TrackPath {
  points: { x: number; y: number }[];
  cum: number[];
  total: number;
}
