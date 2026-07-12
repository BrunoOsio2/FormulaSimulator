// ─── Track map — lógica pura (testável) ──────────────────────────────────────
// Funções de geometria/velocidade do mapa 2D, extraídas do index.html para
// permitir testes unitários. NÃO dependem do DOM (buildTrackPathFromSVG, que
// usa getPointAtLength, permanece no index.html por precisar do browser).
//
// Carregado como <script src="mapgraph.js"> no browser e via vm nos testes.
// Depende de normalizePath (sim.js) apenas indiretamente — aqui só há funções puras.

// Constantes do perfil de velocidade (curvatura → frenagem/aceleração).
const MIN_VEL = 0.34;    // velocidade mínima nas curvas mais fechadas
const CURV_GAIN = 2.2;   // quão forte a curvatura reduz a velocidade
const BRAKE_WINDOW = 8;  // pontos de antecipação (freia antes / acelera depois)
const MAX_ACCEL = 0.018; // aumento máximo de velocidade por ponto (rampa de saída)

// Constrói a reparametrização tempo→distância para o carro frear nas curvas.
// A velocidade vem da CURVATURA GEOMÉTRICA do próprio traçado: curva fechada
// (raio pequeno) → lento; reto (curvatura ~0) → rápido. `cornerSpeeds` (opcional
// em tracks.js) permite override manual por curva.
function buildSpeedWarp(trackPath, track) {
  const pts = trackPath.points;
  const N = pts.length;
  // curvatura por ponto = variação de ângulo entre segmentos vizinhos (circular)
  const curv = new Array(N);
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[i], c = pts[(i + 1) % N];
    let ang = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    while (ang > Math.PI) ang -= 2 * Math.PI;
    while (ang < -Math.PI) ang += 2 * Math.PI;
    curv[i] = Math.abs(ang);
  }
  // velocidade base: cai com a curvatura (reta→1, curva fechada→MIN_VEL)
  let vel = curv.map(k => Math.max(MIN_VEL, 1 - k * CURV_GAIN / (Math.PI / 8)));
  // suaviza com janela: o piloto freia ANTES e acelera DEPOIS da curva.
  const smooth = new Array(N);
  for (let i = 0; i < N; i++) {
    let m = 1;
    for (let d = -BRAKE_WINDOW; d <= BRAKE_WINDOW; d++) {
      m = Math.min(m, vel[(i + d + N) % N]);
    }
    smooth[i] = m * 0.7 + vel[i] * 0.3;
  }

  // Override manual opcional por curva (cornerSpeeds em tracks.js)
  if (track && track.cornerSpeeds) applyCornerOverrides(smooth, track.cornerSpeeds);

  // Limite de aceleração (slew rate): velocidade pode CAIR livre (frenagem brusca
  // realista) mas só SOBE gradualmente — rampa proporcional na saída da curva.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < N; i++) {
      const prev = smooth[(i - 1 + N) % N];
      if (smooth[i] > prev + MAX_ACCEL) smooth[i] = prev + MAX_ACCEL;
    }
  }

  // Reparametriza por TEMPO: tempo de cada segmento = distância / velocidade.
  const cum = trackPath.cum, total = trackPath.total;
  const timeCum = [0];
  for (let i = 1; i < N; i++) {
    const segDist = (cum[i] - cum[i - 1]) / total;
    const v = (smooth[i] + smooth[i - 1]) / 2 || MIN_VEL;
    timeCum[i] = timeCum[i - 1] + segDist / v;
  }
  const timeTotal = timeCum[N - 1] || 1;
  const timeFrac = timeCum.map(t => t / timeTotal);
  const distFrac = cum.map(c => c / total);
  return { timeFrac, distFrac };
}

// Aplica overrides de velocidade por curva ancorados em `at` (fração de dist).
function applyCornerOverrides(vel, corners) {
  const N = vel.length;
  for (const c of corners) {
    const center = Math.round(c.at * (N - 1));
    const spread = Math.round((c.spread ?? 0.03) * N);
    for (let d = -spread; d <= spread; d++) {
      const i = (center + d + N) % N;
      const w = 1 - Math.abs(d) / (spread + 1); // triangular
      vel[i] = Math.min(vel[i], c.speed * w + vel[i] * (1 - w));
    }
  }
}

// Converte fração-de-volta linear-no-tempo → fração-de-distância no traçado.
function warpLapFraction(warp, frac) {
  if (!warp) return frac;
  const laps = Math.floor(frac);
  const f = frac - laps;               // 0..1 uniforme no tempo
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

// Posição do piloto no tempo T (interpola sub-célula pela timeline de eventos).
// Retorna volta-fração: parte inteira = volta, fração = progresso na volta.
function driverLapFraction(events, T) {
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

// Transformação ponto-normalizado [0,1] → pixel do canvas (rotação 90° + escala).
// Recebe {width,height} (canvas real no browser, ou objeto simples nos testes).
function computeMapTransform(canvas, trackPath) {
  const W = canvas.width, H = canvas.height;
  const pad = 28;
  const rot = p => ({ x: p.y, y: 1 - p.x }); // rotação 90° (eixo longo na horizontal)
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
