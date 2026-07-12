import type { CornerSpeed, TimelineEvent, Track, TrackPath } from '../engine/types';

// ─── Velocidade no mapa (curvatura → frenagem) e transformações ──────────────

export interface SpeedWarp { timeFrac: number[]; distFrac: number[]; }

const MIN_VEL = 0.34;
const CURV_GAIN = 2.2;
const BRAKE_WINDOW = 8;
const MAX_ACCEL = 0.018;
const MIN_WEIGHT = 0.7;

// Reparametrização tempo→distância: curva fechada → lento; reto → rápido.
// Os parâmetros do perfil podem ser sobrescritos por pista (track.speedWarp).
export function buildSpeedWarp(trackPath: TrackPath, track: Track | null): SpeedWarp {
  const sw = track?.speedWarp;
  const minVel      = sw?.minVel      ?? MIN_VEL;
  const curvGain    = sw?.curvGain    ?? CURV_GAIN;
  const brakeWindow = sw?.brakeWindow ?? BRAKE_WINDOW;
  const maxAccel    = sw?.maxAccel    ?? MAX_ACCEL;
  const minWeight   = sw?.minWeight   ?? MIN_WEIGHT;
  // peso da velocidade local (1 - minWeight); sem override usa o literal 0.3 exato
  // para manter paridade byte-a-byte com o motor antigo nas pistas sem speedWarp.
  const velWeight   = sw?.minWeight == null ? 0.3 : 1 - minWeight;

  const pts = trackPath.points;
  const N = pts.length;
  const curv = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[i], c = pts[(i + 1) % N];
    let ang = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    while (ang > Math.PI) ang -= 2 * Math.PI;
    while (ang < -Math.PI) ang += 2 * Math.PI;
    curv[i] = Math.abs(ang);
  }
  const vel = curv.map(k => Math.max(minVel, 1 - k * curvGain / (Math.PI / 8)));
  const smooth = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    let m = 1;
    for (let d = -brakeWindow; d <= brakeWindow; d++) m = Math.min(m, vel[(i + d + N) % N]);
    smooth[i] = m * minWeight + vel[i] * velWeight;
  }

  if (track && track.cornerSpeeds) applyCornerOverrides(smooth, track.cornerSpeeds);

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < N; i++) {
      const prev = smooth[(i - 1 + N) % N];
      if (smooth[i] > prev + maxAccel) smooth[i] = prev + maxAccel;
    }
  }

  const cum = trackPath.cum, total = trackPath.total;
  const timeCum = [0];
  for (let i = 1; i < N; i++) {
    const segDist = (cum[i] - cum[i - 1]) / total;
    const v = (smooth[i] + smooth[i - 1]) / 2 || minVel;
    timeCum[i] = timeCum[i - 1] + segDist / v;
  }
  const timeTotal = timeCum[N - 1] || 1;
  const timeFrac = timeCum.map(t => t / timeTotal);
  const distFrac = cum.map(c => c / total);
  return { timeFrac, distFrac };
}

export function applyCornerOverrides(vel: number[], corners: CornerSpeed[]): void {
  const N = vel.length;
  for (const c of corners) {
    const center = Math.round(c.at * (N - 1));
    const spread = Math.round((c.spread ?? 0.03) * N);
    for (let d = -spread; d <= spread; d++) {
      const i = (center + d + N) % N;
      const w = 1 - Math.abs(d) / (spread + 1);
      vel[i] = Math.min(vel[i], c.speed * w + vel[i] * (1 - w));
    }
  }
}

// Fração-de-volta linear-no-tempo → fração-de-distância no traçado.
export function warpLapFraction(warp: SpeedWarp | null, frac: number): number {
  if (!warp) return frac;
  const laps = Math.floor(frac);
  const f = frac - laps;
  const tf = warp.timeFrac, df = warp.distFrac;
  let lo = 0, hi = tf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tf[mid] < f) lo = mid + 1; else hi = mid;
  }
  const i = Math.max(1, lo);
  const span = tf[i] - tf[i - 1] || 1;
  const t = (f - tf[i - 1]) / span;
  const distF = df[i - 1] + (df[i] - df[i - 1]) * t;
  return laps + distF;
}

// Posição do piloto no tempo T (interpola sub-célula pela timeline).
export function driverLapFraction(events: TimelineEvent[], T: number): number {
  let lo = 0, hi = events.length - 1;
  if (T <= events[0].time) {
    const e = events[0];
    return e.lap + (e.sector * 9 + e.miniSector + 1) / 27;
  }
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (events[mid].time <= T) lo = mid; else hi = mid - 1;
  }
  const e = events[lo];
  let doneMinis = e.lap * 27 + e.sector * 9 + e.miniSector + 1;
  const next = events[lo + 1];
  if (next) {
    const span = next.time - e.time || 1;
    const frac = Math.max(0, Math.min(1, (T - e.time) / span));
    doneMinis += frac;
  }
  return doneMinis / 27;
}

export interface MapTransform {
  mapX: (p: { x: number; y: number }) => number;
  mapY: (p: { x: number; y: number }) => number;
}

// Ponto normalizado [0,1] → pixel do canvas (rotação 90° + escala).
export function computeMapTransform(canvas: { width: number; height: number }, trackPath: TrackPath): MapTransform {
  const W = canvas.width, H = canvas.height;
  const pad = 28;
  const rot = (p: { x: number; y: number }) => ({ x: p.y, y: 1 - p.x });
  let rminX = Infinity, rmaxX = -Infinity, rminY = Infinity, rmaxY = -Infinity;
  for (const p of trackPath.points) {
    const r = rot(p);
    if (r.x < rminX) rminX = r.x; if (r.x > rmaxX) rmaxX = r.x;
    if (r.y < rminY) rminY = r.y; if (r.y > rmaxY) rmaxY = r.y;
  }
  const rw = rmaxX - rminX || 1, rh = rmaxY - rminY || 1;
  const sx = W - pad * 2, sy = H - pad * 2;
  const scale = Math.min(sx / rw, sy / rh);
  const drawW = rw * scale, drawH = rh * scale;
  const offX = (W - drawW) / 2, offY = (H - drawH) / 2;
  return {
    mapX: p => { const r = rot(p); return offX + (r.x - rminX) * scale; },
    mapY: p => { const r = rot(p); return offY + (r.y - rminY) * scale; },
  };
}
