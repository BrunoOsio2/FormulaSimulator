// ─── Geometria da pista ─────────────────────────────────────────────────────
// Não há coordenadas de pista nos dados de simulação — o traçado procedural é
// gerado a partir dos 27 tipos de mini-setor. (No browser, o Interlagos usa o
// traçado real via SVG; ver buildTrackPathFromSVG no index.html.)

// Ângulo de curvatura por tipo de mini-setor (traçado procedural).
const MINI_CURVE_ANGLE = {
  straight:      0.00,
  braking:       0.15,
  fast_corner:   0.28,
  medium_corner: 0.55,
  slow_corner:   0.85,
};
const SUBSTEPS = 4; // sub-passos por mini-setor para suavizar curvas

// Gera um traçado fechado a partir dos 27 tipos: caminha por heading somando os
// ângulos (normalizados para fechar 360°) e corrige o drift para o loop fechar.
function buildTrackPath(track) {
  const types = [];
  for (let s = 0; s < 3; s++)
    for (let m = 0; m < MINI_PER_SECTOR; m++) types.push(track.miniSectors[s][m]);

  // Soma dos ângulos → fator de normalização para dar exatamente uma volta (2π)
  let angleSum = 0;
  for (const t of types) angleSum += (MINI_CURVE_ANGLE[t] || 0);
  const norm = angleSum > 1e-6 ? (2 * Math.PI) / angleSum : (2 * Math.PI) / types.length;

  // Caminhada por heading, subdividindo cada mini em SUBSTEPS
  const pts = [];
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

  // Correção de fechamento: distribui o gap linearmente ao longo do caminho
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
// Compartilhado pelo traçado procedural e pelo real (buildTrackPathFromSVG).
function normalizePath(pts) {
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
function pointAtLapFraction(path, frac) {
  const { points, cum, total } = path;
  frac = ((frac % 1) + 1) % 1; // wrap para [0,1)
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
