import type { Track, TrackPath } from '../engine/types';
import { MINI_PER_SECTOR } from '../engine/skills';

// ─── Geometria da pista ─────────────────────────────────────────────────────
// Traçado procedural a partir dos 27 tipos de mini-setor. (No browser, o
// Interlagos usa o traçado real via SVG; ver buildTrackPathFromSVG.)

const MINI_CURVE_ANGLE: Record<string, number> = {
  straight:      0.00,
  braking:       0.15,
  fast_corner:   0.28,
  medium_corner: 0.55,
  slow_corner:   0.85,
};
const SUBSTEPS = 4;

export function buildTrackPath(track: Track): TrackPath {
  const types: string[] = [];
  for (let s = 0; s < 3; s++)
    for (let m = 0; m < MINI_PER_SECTOR; m++) types.push(track.miniSectors[s][m]);

  let angleSum = 0;
  for (const t of types) angleSum += (MINI_CURVE_ANGLE[t] || 0);
  const norm = angleSum > 1e-6 ? (2 * Math.PI) / angleSum : (2 * Math.PI) / types.length;

  const pts: { x: number; y: number }[] = [];
  let heading = 0, x = 0, y = 0;
  const STEP = 1;
  for (const t of types) {
    const turn = (MINI_CURVE_ANGLE[t] || 0) * norm / SUBSTEPS;
    for (let k = 0; k < SUBSTEPS; k++) {
      heading += turn;
      x += Math.cos(heading) * STEP;
      y += Math.sin(heading) * STEP;
      pts.push({ x, y });
    }
  }

  const N = pts.length;
  const gapX = pts[N - 1].x - pts[0].x;
  const gapY = pts[N - 1].y - pts[0].y;
  for (let i = 0; i < N; i++) {
    pts[i].x -= gapX * i / (N - 1);
    pts[i].y -= gapY * i / (N - 1);
  }

  return normalizePath(pts);
}

// Normaliza pontos para bounding box [0,1] e calcula arco cumulativo.
export function normalizePath(pts: { x: number; y: number }[]): TrackPath {
  const N = pts.length;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const scale = 1 / Math.max(w, h);
  for (const p of pts) {
    p.x = (p.x - minX) * scale;
    p.y = (p.y - minY) * scale;
  }

  const cum = [0];
  for (let i = 1; i < N; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    cum[i] = cum[i - 1] + Math.hypot(dx, dy);
  }
  const total = cum[N - 1] || 1;

  return { points: pts, cum, total };
}

// Posição XY em uma fração da volta [0,1) por interpolação de arco-length.
export function pointAtLapFraction(path: TrackPath, frac: number): { x: number; y: number } {
  const { points, cum, total } = path;
  frac = ((frac % 1) + 1) % 1;
  const target = frac * total;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < target) lo = mid + 1; else hi = mid;
  }
  const i = Math.max(1, lo);
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (target - cum[i - 1]) / seg;
  return {
    x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
    y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
  };
}

// Constrói o traçado a partir de um path SVG real (string `d`), amostrando
// pontos uniformes com getPointAtLength. Depende do DOM — só roda no browser.
export function buildTrackPathFromSVG(d: string, samples = 300): TrackPath {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const el  = document.createElementNS(NS, 'path');
  el.setAttribute('d', d);
  svg.appendChild(el);
  svg.style.position = 'absolute';
  svg.style.width = '0'; svg.style.height = '0';
  document.body.appendChild(svg);
  const len = el.getTotalLength();
  const raw: { x: number; y: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const p = el.getPointAtLength(len * i / samples);
    raw.push({ x: p.x, y: p.y });
  }
  document.body.removeChild(svg);
  return normalizePath(raw);
}
