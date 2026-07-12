import { useEffect, useRef, type MouseEvent } from 'react';
import type { RaceResult, TrackPath } from '../lib/engine/types';
import { pointAtLapFraction, buildTrackPathFromSVG } from '../lib/map/geometry';
import { DRIVER_COLOR, DRIVER_FLAG } from '../lib/data/drivers';
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
      draw(dispT.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf); // cleanup — sem leak ao desmontar

    function draw(T: number) {
      const path = pathRef.current;
      if (!canvas || !path) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const { mapX, mapY } = computeMapTransform(canvas, path);
      const pts = path.points;

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

      // Posição de cada carro pela fração-de-volta real. O grid de largada já
      // está no backend (offset de tempo por posição em computeTimeline), então
      // os retardatários já aparecem atrás — sem stagger visual artificial.
      // (sf = startFrac já calculado acima para a bandeira de largada.)
      const drawList = result.timelines.map(t => {
        const frac = driverLapFraction(t.events, T);
        // desloca a fração de volta pela linha de largada real (startFrac);
        // pointAtLapFraction faz wrap, então somar funciona cruzando o ponto 0.
        const warped = warpLapFraction(warpRef.current, frac);
        const p = pointAtLapFraction(path, warped + sf);
        return { code: t.code, pos: orderByCode[t.code] ?? 99, p };
      }).sort((a, b) => b.pos - a.pos);

      // registra posições em pixel para o clique achar o carro mais próximo
      const pixels: { code: string; x: number; y: number }[] = [];
      const sel = selectedRef.current;

      for (const d of drawList) {
        const x = mapX(d.p), y = mapY(d.p);
        pixels.push({ code: d.code, x, y });
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

  const selRow = selected ? result.sectorSnapshots[snapIdx].find(r => r.code === selected) : null;
  const selPos = selected ? result.sectorSnapshots[snapIdx].findIndex(r => r.code === selected) + 1 : 0;

  return (
    <div className="track-map-card" style={{ position: 'relative' }}>
      {selRow && (
        <div className="map-driver-label">
          <span className="mdl-flag">{DRIVER_FLAG[selRow.code]}</span>
          <span className="mdl-code" style={{ color: DRIVER_COLOR[selRow.code] }}>{selRow.code}</span>
          <span className="mdl-pos">P{selPos}</span>
        </div>
      )}
      <canvas ref={canvasRef} id="trackCanvas" width={1200} height={520}
              style={{ cursor: 'pointer' }} onClick={handleClick} />
    </div>
  );
}

