import { useEffect, useRef, type MouseEvent } from 'react';
import type { RaceResult, TrackPath } from '../lib/engine/types';
import { pointAtLapFraction, buildTrackPathFromSVG } from '../lib/map/geometry';
import { DRIVER_COLOR, DRIVER_FLAG } from '../lib/data/drivers';
import { fmtGap } from '../lib/engine/format';
import {
  buildSpeedWarp, warpLapFraction, driverLapFraction, computeMapTransform, type SpeedWarp,
} from '../lib/map/mapgraph';

interface Props {
  result: RaceResult;
  snapIdx: number;   // frame atual do playback
  playing: boolean;  // tocando (avança relógio) ou pausado (assenta)
  speedMs: number;   // ms por mini-setor (duração do segmento)
  selected: string | null;               // piloto selecionado (compartilhado com a tabela)
  onSelect: (code: string | null) => void; // callback ao clicar num carro
}

// Mapa 2D com carros animados. A lógica de relógio (segmento cronometrado) e
// desenho no canvas é imperativa (rAF + Canvas 2D), encapsulada aqui via refs.
export function TrackMap({ result, snapIdx, playing, speedMs, selected, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedRef = useRef<string | null>(selected);
  // posição em pixel de cada carro no último desenho (para o clique achar o mais próximo)
  const carPixels = useRef<{ code: string; x: number; y: number }[]>([]);

  // Estado do relógio de animação — refs (mutável entre frames, sem re-render).
  const pathRef = useRef<TrackPath | null>(null);
  const warpRef = useRef<SpeedWarp | null>(null);
  const dispT = useRef(0);
  const targetT = useRef(0);
  const segFrom = useRef(0);
  const segTo = useRef(0);
  const segDur = useRef(0);
  const segElapsed = useRef(0);
  const lastMs = useRef(0);
  const playingRef = useRef(playing);
  const snapRef = useRef(snapIdx);
  // Câmera do zoom: estado atual (animado) vs alvo. camX/camY = ponto do mundo
  // (pixel do mapa em zoom 1×) que fica no centro; camZoom = fator de ampliação.
  const camZoom = useRef(1);
  const camX = useRef(0);
  const camY = useRef(0);
  // transform efetivo do último frame, para o clique inverter corretamente.
  const camApplied = useRef({ zoom: 1, cx: 0, cy: 0 });
  // estado de bandeira (VSC/SC) do frame atual, lido pelo loop de desenho.
  const cautionRef = useRef<'none' | 'vsc' | 'sc'>('none');
  useEffect(() => {
    cautionRef.current = result.cautionByFrame[snapIdx] ?? 'none';
  }, [result, snapIdx]);

  // Constrói traçado + warp uma vez por corrida (quando o result muda).
  useEffect(() => {
    if (!result.track.svgPath) { pathRef.current = null; warpRef.current = null; return; }
    pathRef.current = buildTrackPathFromSVG(result.track.svgPath);
    warpRef.current = buildSpeedWarp(pathRef.current, result.track);
    dispT.current = 0; targetT.current = 0;
    segFrom.current = 0; segTo.current = 0; segDur.current = 0; segElapsed.current = 0;
    lastMs.current = 0;
  }, [result]);

  // A cada mudança de frame (snapIdx), define o alvo de tempo (maior totalTime do
  // frame → não congela quando o líder termina) e inicia um novo segmento.
  useEffect(() => {
    snapRef.current = snapIdx;
    const frame = result.sectorSnapshots[snapIdx];
    if (!frame) return;
    let newTarget = 0;
    for (const d of frame) if (d.totalTime > newTarget) newTarget = d.totalTime;
    const jump = Math.abs(newTarget - segTo.current);
    if (jump > 5) { dispT.current = newTarget; segFrom.current = newTarget; }
    else { segFrom.current = dispT.current; }
    segTo.current = newTarget;
    segDur.current = speedMs / 1000;
    segElapsed.current = 0;
    targetT.current = newTarget;
  }, [snapIdx, result, speedMs]);

  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Loop de animação (rAF) — roda enquanto o componente está montado.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const loop = (now: number) => {
      const dt = lastMs.current ? (now - lastMs.current) / 1000 : 0;
      lastMs.current = now;
      if (playingRef.current) {
        if (segDur.current > 0) {
          // interpola o segmento em segDur (duração de um mini-setor no relógio)
          segElapsed.current = Math.min(segDur.current, segElapsed.current + dt);
          const f = segElapsed.current / segDur.current;
          dispT.current = segFrom.current + (segTo.current - segFrom.current) * f;
        } else {
          dispT.current = segTo.current;
        }
      } else {
        dispT.current += (targetT.current - dispT.current) * Math.min(1, dt * 8);
      }
      draw(dispT.current, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf); // cleanup — sem leak ao desmontar

    function draw(T: number, dt: number) {
      const path = pathRef.current;
      if (!canvas || !path) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const { mapX, mapY } = computeMapTransform(canvas, path);
      const pts = path.points;

      // ── Câmera / zoom ──────────────────────────────────────────────────────
      // Alvo: se há piloto selecionado, amplia e centra nele; senão volta ao
      // overview (zoom 1, centro do canvas). Interpola suave a cada frame.
      const selCam = selectedRef.current;
      const ZOOM_IN = 2.4;
      let targetZoom = 1, targetCx = W / 2, targetCy = H / 2;
      if (selCam) {
        const t = result.timelines.find(tl => tl.code === selCam);
        if (t) {
          const frac = driverLapFraction(t.events, T);
          const p = pointAtLapFraction(path, warpLapFraction(warpRef.current, frac) + (result.track.startFrac ?? 0));
          targetZoom = ZOOM_IN; targetCx = mapX(p); targetCy = mapY(p);
        }
      }
      // suavização exponencial (segue a câmera sem tranco)
      const kCam = Math.min(1, dt * 6);
      camZoom.current += (targetZoom - camZoom.current) * kCam;
      camX.current += (targetCx - camX.current) * kCam;
      camY.current += (targetCy - camY.current) * kCam;
      const camZ = camZoom.current, camCX = camX.current, camCY = camY.current;
      camApplied.current = { zoom: camZ, cx: camCX, cy: camCY };

      ctx.save();
      // translada o ponto-alvo para o centro do canvas e amplia em torno dele
      ctx.translate(W / 2, H / 2);
      ctx.scale(camZ, camZ);
      ctx.translate(-camCX, -camCY);

      const tracePath = () => {
        ctx.beginPath();
        ctx.moveTo(mapX(pts[0]), mapY(pts[0]));
        for (let i = 1; i < pts.length; i++) ctx.lineTo(mapX(pts[i]), mapY(pts[i]));
        ctx.closePath();
      };
      const stroke = (color: string, width: number) => {
        tracePath();
        ctx.strokeStyle = color; ctx.lineWidth = width;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
      };

      // Traçado estilo F1 TV: leito escuro largo → asfalto claro discreto.
      // Glow sutil para dar profundidade sem competir com os carros coloridos.
      stroke('#000000', 24);                    // sombra/leito externo
      stroke('#24242f', 20);                    // borda da pista (kerb neutro)
      ctx.save();
      ctx.shadowColor = 'rgba(150, 160, 200, 0.3)';
      ctx.shadowBlur = 8;
      stroke('#8b93b8', 6);                     // asfalto (cinza-azulado suave)
      ctx.restore();
      stroke('#c4cae0', 2.5);                   // linha central discreta

      // Linha de largada/chegada — na fração real da pista (track.startFrac),
      // já que o ponto 0 do traçado (GeoJSON) começa num ponto arbitrário.
      const sf = result.track.startFrac ?? 0;
      const s0 = pointAtLapFraction(path, sf), s1 = pointAtLapFraction(path, sf + 0.01);
      const dx = s1.x - s0.x, dy = s1.y - s0.y;
      const dlen = Math.hypot(dx, dy) || 1;
      const nx = -dy / dlen, ny = dx / dlen;      // normal ao traçado (largura da pista)
      const tx = dx / dlen, ty = dy / dlen;       // tangente (sentido da pista)
      const cx = mapX(s0), cy = mapY(s0);
      const cell = 4;                             // tamanho do quadradinho
      const cols = 6;                             // ao longo da largura (perpendicular)
      const rows = 2;                             // 2 fileiras (bandeira quadriculada)
      ctx.save();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const along = (c - cols / 2 + 0.5) * cell; // posição perpendicular
          const depth = (r - rows / 2 + 0.5) * cell; // profundidade ao longo da pista
          const qx = cx + nx * along + tx * depth;
          const qy = cy + ny * along + ty * depth;
          ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#11141d';
          ctx.fillRect(qx - cell / 2, qy - cell / 2, cell, cell);
        }
      }
      ctx.restore();

      // Carros — ordem de corrida do frame atual define a posição (label)
      const frame = result.sectorSnapshots[snapRef.current];
      if (!frame) return;
      const orderByCode: Record<string, number> = {};
      frame.forEach((d, pos) => { orderByCode[d.code] = pos; });

      // Posição de cada carro: antes da sua largada usa posição de grid (fila
      // na reta); depois usa a fração-de-volta real. Cada posição de grid ocupa
      // GRID_GAP atrás da linha (sf), alternando em 2 colunas estilo F1.
      // (sf = startFrac já calculado acima para a bandeira de largada.)
      const GRID_GAP = 0.0035;   // fração de volta entre posições (~10–12 m)
      const drawList = result.timelines.map((t, gridIdx) => {
        const firstEventT = t.events[0]?.time ?? 0;
        let p;
        if (T < firstEventT) {
          // carro ainda não largou → posiciona na fila de grid:
          // P1 na linha, P2 meio grid atrás na coluna da direita, P3 1 gap atrás
          // na esquerda, etc. (alternância de colunas como numa grelha real de F1)
          const row    = Math.floor(gridIdx / 2);           // linha (0, 1, 2…)
          const col    = gridIdx % 2;                       // 0=esq, 1=dir
          const colOff = (col - 0.5) * 0.0008;             // pequeno offset lateral
          const fracBack = sf - (row + col * 0.5) * GRID_GAP + colOff;
          p = pointAtLapFraction(path, fracBack);
        } else {
          const frac = driverLapFraction(t.events, T);
          const warped = warpLapFraction(warpRef.current, frac);
          p = pointAtLapFraction(path, warped + sf);
        }
        return { code: t.code, pos: orderByCode[t.code] ?? 99, p };
      }).sort((a, b) => b.pos - a.pos);

      // registra posições em pixel (ESPAÇO DE TELA) para o clique achar o carro.
      // Como o desenho está sob o transform da câmera, converte world→tela:
      //   tela = (world - centroCam) * zoom + centroCanvas
      const pixels: { code: string; x: number; y: number }[] = [];
      const sel = selectedRef.current;
      const toScreenX = (wx: number) => (wx - camCX) * camZ + W / 2;
      const toScreenY = (wy: number) => (wy - camCY) * camZ + H / 2;

      // Safety car (C4): sob SC, desenha o carro de segurança logo À FRENTE do
      // líder no traçado (fração do líder + pequeno offset), com faixas amarelas.
      if (cautionRef.current === 'sc') {
        const leader = result.timelines.find(t => (orderByCode[t.code] ?? 99) === 0);
        if (leader) {
          const lf = warpLapFraction(warpRef.current, driverLapFraction(leader.events, T));
          const scP = pointAtLapFraction(path, lf + sf + 0.012); // um pouco à frente
          const sx = mapX(scP), sy = mapY(scP);
          ctx.save();
          ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2);
          ctx.fillStyle = '#f5c518'; ctx.fill();            // amarelo SC
          ctx.lineWidth = 2; ctx.strokeStyle = '#0a0a0f'; ctx.stroke();
          ctx.fillStyle = '#0a0a0f'; ctx.font = '700 10px "Titillium Web", monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('SC', sx, sy);
          ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
          ctx.restore();
        }
      }

      for (const d of drawList) {
        const x = mapX(d.p), y = mapY(d.p);
        pixels.push({ code: d.code, x: toScreenX(x), y: toScreenY(y) });
        const color = DRIVER_COLOR[d.code] || '#94a3b8';
        const isSel = d.code === sel;
        const r = isSel ? 15 : 13;   // ~33% maior que a largura do traçado (atravessa)
        // disco preenchido na cor da equipe
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        // anel de contorno: escuro (separa do traçado); branco quando selecionado
        ctx.lineWidth = isSel ? 3 : 2;
        ctx.strokeStyle = isSel ? '#ffffff' : 'rgba(10,10,15,0.85)';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        // label: líder sempre; selecionado sempre (destacado com fundo)
        if (d.pos === 0 || isSel) {
          const label = d.code;
          ctx.font = '700 11px "Titillium Web", monospace';
          const tw = ctx.measureText(label).width;
          const lx = x + r + 4, ly = y - r - 2;
          ctx.fillStyle = 'rgba(10,10,15,0.8)';
          ctx.fillRect(lx - 3, ly - 10, tw + 6, 14);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, lx, ly);
        }
      }
      carPixels.current = pixels;
      // hook de teste: posições em pixel dos carros no último frame
      (window as unknown as { __cars?: typeof pixels }).__cars = pixels;
      ctx.restore();   // encerra o transform da câmera
    }
  }, [result]);

  // Clique no mapa → seleciona o carro mais próximo (ou deseleciona se longe).
  const handleClick = (ev: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const py = (ev.clientY - rect.top) * (canvas.height / rect.height);
    let best: string | null = null, bestD = Infinity;
    for (const c of carPixels.current) {
      const d = (c.x - px) ** 2 + (c.y - py) ** 2;
      if (d < bestD) { bestD = d; best = c.code; }
    }
    // só seleciona se o clique foi razoavelmente perto de um carro (~24px)
    const next = best && bestD <= 32 * 32 ? best : null;
    onSelect(selected === next ? null : next); // clicar de novo deseleciona
  };

  // mantém o ref em sincronia para o loop de desenho ler sem re-assinar o rAF
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  if (!result.track.svgPath) return null;

  const frameNow = result.sectorSnapshots[snapIdx];
  const selIdx = selected ? frameNow.findIndex(r => r.code === selected) : -1;
  const selRow = selIdx >= 0 ? frameNow[selIdx] : null;
  const selPos = selIdx + 1;
  // Gaps para o carro à frente e atrás (só fazem sentido com um selecionado).
  // gapToLeader é acumulado; a diferença entre vizinhos = intervalo entre eles.
  const ahead = selRow && selIdx > 0 ? frameNow[selIdx - 1] : null;
  const behind = selRow && selIdx < frameNow.length - 1 ? frameNow[selIdx + 1] : null;
  const gapAhead = ahead && selRow ? selRow.gapToLeader - ahead.gapToLeader : null;
  const gapBehind = behind && selRow ? behind.gapToLeader - selRow.gapToLeader : null;

  const caution = result.cautionByFrame[snapIdx] ?? 'none';

  return (
    <div className="track-map-card" style={{ position: 'relative' }}>
      {caution !== 'none' && (
        <div className={`caution-banner ${caution}`}>
          🟡 {caution === 'sc' ? 'SAFETY CAR' : 'VIRTUAL SAFETY CAR'}
        </div>
      )}
      {selRow && (
        <div className="map-driver-label focused">
          {ahead && (
            <span className="mdl-neighbor ahead" title={`Carro à frente: ${ahead.code}`}>
              ▲ {ahead.code} <b>{fmtGap(gapAhead)}</b>
            </span>
          )}
          <span className="mdl-main">
            <span className="mdl-flag">{DRIVER_FLAG[selRow.code]}</span>
            <span className="mdl-code" style={{ color: DRIVER_COLOR[selRow.code] }}>{selRow.code}</span>
            <span className="mdl-pos">P{selPos}</span>
          </span>
          {behind && (
            <span className="mdl-neighbor behind" title={`Carro atrás: ${behind.code}`}>
              ▼ {behind.code} <b>{fmtGap(gapBehind)}</b>
            </span>
          )}
        </div>
      )}
      <canvas ref={canvasRef} id="trackCanvas" width={1200} height={520}
              style={{ cursor: 'pointer' }} onClick={handleClick} />
    </div>
  );
}

