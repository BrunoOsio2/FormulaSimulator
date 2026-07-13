import type { Track, Timeline } from './types';
import { RNG } from './rng';

// ─── Incidentes e Safety Car (C4) ────────────────────────────────────────────
// Três níveis de incidente:
//   light → erro pontual (tratado pelo C5/mistakes; aqui só registramos o evento)
//   vsc   → Virtual Safety Car: pelotão inteiro desacelera por N voltas (sem agrupar)
//   sc    → Safety Car: pelotão desacelera E agrupa atrás do carro de segurança
//
// A neutralização é uma camada de pós-processamento sobre os tempos JÁ resolvidos
// (pós-tráfego): reescreve event.time preservando o miniTime limpo (usado p/ cores).
// Puro/determinístico dado o RNG → não afeta o determinismo por seed.

export const MINI_PER_LAP = 27;
export const VSC_FACTOR = 1.45;      // sob VSC os minis duram ~45% a mais
export const SC_FACTOR  = 1.7;       // sob SC, ainda mais lento
export const SC_BUNCH_GAP = 0.6;     // s — distância nominal do trenzinho atrás do SC
const VSC_DUR = 2;                   // voltas de duração do VSC
const SC_DUR  = 3;                   // voltas de duração do SC

export type IncidentType = 'light' | 'vsc' | 'sc';
export interface Incident { lap: number; type: IncidentType; durLaps: number; code: string; }
export interface Neutralization { startLap: number; endLap: number; type: 'vsc' | 'sc'; }

// Sorteia a agenda de incidentes da corrida. Probabilidade escalada por
// safetyCarProbability da pista. Frequência ALTA (demo): fácil de ver/testar.
// Cada incidente é atribuído a um piloto (`codes` = grid, do fundo p/ frente tem
// mais chance de se envolver). Determinístico dado o RNG.
export function planIncidents(track: Track, laps: number, codes: string[], rng: RNG): Incident[] {
  const scProb = ((track.safetyCarProbability as number) ?? 5) / 10; // 0.1..1.0
  const incidents: Incident[] = [];
  let cooldown = 0; // voltas restantes de neutralização (evita sobreposição)

  // por volta, chance de incidente (demo: base alta). Distribui os níveis.
  const perLapChance = 0.07 * (0.5 + scProb); // ~0.07..0.105 por volta
  for (let lap = 1; lap < laps - 1; lap++) {   // nunca na 1ª nem última volta
    if (cooldown > 0) { cooldown--; continue; }
    if (rng.next() < perLapChance) {
      const roll = rng.next();
      // reparte (demo p/ testar o SC): 25% leve, 30% VSC, 45% SC.
      let type: IncidentType, durLaps: number;
      if (roll < 0.25) { type = 'light'; durLaps = 0; }
      else if (roll < 0.55) { type = 'vsc'; durLaps = VSC_DUR; }
      else { type = 'sc'; durLaps = SC_DUR; }
      // piloto envolvido: viés para o fundo do grid (mais azarados). Índice
      // = floor(r² × N) → concentra nos índices maiores (fim do grid).
      const r = rng.next();
      const idx = Math.min(codes.length - 1, Math.floor((0.3 + 0.7 * r) * codes.length));
      incidents.push({ lap, type, durLaps, code: codes[idx] });
      cooldown = durLaps + 2; // pausa após a janela
    }
  }
  return incidents;
}

// Converte os incidentes de neutralização (vsc/sc) em janelas de volta.
export function neutralizations(incidents: Incident[]): Neutralization[] {
  return incidents
    .filter(i => i.type === 'vsc' || i.type === 'sc')
    .map(i => ({ startLap: i.lap, endLap: i.lap + i.durLaps, type: i.type as 'vsc' | 'sc' }));
}

// Aplica as neutralizações reescrevendo os tempos absolutos das timelines.
//   Passo 1 (VSC + SC): desacelera — infla as durações dos minis nas voltas
//   neutralizadas e re-acumula (cascata; monotônico por construção).
//   Passo 2 (só SC): agrupa — durante janelas de SC, segura cada carro a
//   SC_BUNCH_GAP do da frente. Processa em ordem cronológica; ao atrasar um
//   carro, propaga o atraso para os eventos seguintes DELE (mantém monotonia).
export function applyNeutralizations(timelines: Timeline[], neuts: Neutralization[], baseLap: number): void {
  if (neuts.length === 0) return;
  const n = timelines.length;
  // Duração de UM mini ao ritmo de segurança — IGUAL para todos os carros (o VSC/SC
  // impõe a mesma velocidade), o que preserva o gap em segundos durante a janela.
  const neutralBase = baseLap / (3 * 9);

  const factorAtLap = (lap: number): number => {
    for (const z of neuts) {
      if (lap >= z.startLap && lap < z.endLap) return z.type === 'sc' ? SC_FACTOR : VSC_FACTOR;
    }
    return 1;
  };
  const isSCLap = (lap: number): boolean =>
    neuts.some(z => z.type === 'sc' && lap >= z.startLap && lap < z.endLap);

  // ── Passo 1: desaceleração ─────────────────────────────────────────────────
  // Sob neutralização, todos andam ao MESMO ritmo (velocidade de segurança), então
  // o gap em SEGUNDOS deve ser PRESERVADO (não escalar). Para isso, a duração
  // neutralizada de um mini é a duração LIMPA (miniTime, ~igual entre carros no
  // mesmo ponto) × fator — não a duração real (que embute o pace individual e
  // faria o gap crescer proporcionalmente). Fora da janela, usa a duração real.
  for (const t of timelines) {
    const ev = t.events;
    const durs = ev.map((e, k) => (k === 0 ? e.miniTime : e.time - ev[k - 1].time));
    let acc = ev[0].time - ev[0].miniTime;       // tempo de largada
    for (let k = 0; k < ev.length; k++) {
      const f = factorAtLap(ev[k].lap);
      // neutralizado → ritmo comum a TODOS (neutralBase × fator); normal → duração real
      const dur = f !== 1 ? neutralBase * f : Math.max(0, durs[k]);
      acc += dur;
      ev[k].time = acc;
    }
  }

  // ── Passo 2: agrupamento sob SC ────────────────────────────────────────────
  // Processa os carros em ORDEM DE PISTA (líder primeiro), reconstruindo cada
  // carro por DELTAS (o ritmo próprio pós-desaceleração):
  //   - durante voltas de SC: o carro "cola" no predecessor a SC_BUNCH_GAP;
  //   - fora do SC: retoma o próprio ritmo a partir do tempo anterior.
  // Assim, ao SAIR do SC, o carro parte da posição AGRUPADA (não salta de volta
  // ao gap antigo) e a distância só reabre gradualmente pela diferença de pace.
  if (!neuts.some(z => z.type === 'sc')) return;
  const total = timelines.map(t => t.events.length);
  const rt: number[][] = timelines.map(t => t.events.map(e => e.time));
  // durações reais de cada carro (pós-passo-1), capturadas ANTES de comprimir
  const durs: number[][] = timelines.map((t, i) =>
    t.events.map((e, k) => (k === 0 ? e.miniTime : rt[i][k] - rt[i][k - 1])));

  // ordem de pista = ordem final de distância/tempo. Líder = menor tempo acumulado.
  const trackOrder = [...Array(n).keys()].sort((a, b) => rt[a][total[a] - 1] - rt[b][total[b] - 1]);

  const MIN_DUR = 0.02; // piso de duração entre marcas (evita tempos iguais)
  for (let oi = 1; oi < n; oi++) {       // líder (oi=0) não muda
    const i = trackOrder[oi], pred = trackOrder[oi - 1];
    const ev = timelines[i].events;
    for (let k = 0; k < total[i]; k++) {
      const ownPrev = k > 0 ? rt[i][k - 1] : rt[i][0] - durs[i][0];
      const paceT = ownPrev + Math.max(MIN_DUR, durs[i][k]);   // retoma ritmo próprio
      if (isSCLap(ev[k].lap)) {
        // cola atrás do predecessor, mas nunca antes do próprio ritmo mínimo
        const predT = k < rt[pred].length ? rt[pred][k] : rt[pred][rt[pred].length - 1];
        rt[i][k] = Math.max(ownPrev + MIN_DUR, predT + SC_BUNCH_GAP);
      } else {
        rt[i][k] = paceT;                                       // fora do SC: pace próprio
      }
    }
  }
  timelines.forEach((t, i) => { for (let k = 0; k < t.events.length; k++) t.events[k].time = rt[i][k]; });
}
