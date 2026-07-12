import type { RaceResult, Snapshot, Timeline } from './types';
import { TRACKS } from '../data/tracks';
import { MINI_PER_SECTOR, buildDrivers } from './skills';
import { computeTimeline } from './timeline';
import { deriveSeed } from './rng';

// ─── Motor da corrida ──────────────────────────────────────────────────────────
// Estratégia:
//   1. Pré-computa a timeline completa de cada piloto (seed aleatória por piloto).
//   2. Processa todos os eventos em ordem cronológica (event-driven).
//   3. Emite um frame de playback a cada avanço do piloto da frente; após o líder
//      terminar, emite um frame por evento para os retardatários cruzarem a linha.
//   4. A barra de mini-setores de cada piloto reflete o progresso da volta atual.
export function runRace(trackKey = 'interlagos', seed?: number): RaceResult {
  const track      = TRACKS[trackKey];
  const drivers    = buildDrivers(track);
  const TOTAL_LAPS = track.laps;

  // Seed-mãe: reproduzível se `seed` for passado; senão aleatória (cada corrida
  // única). Cada piloto recebe uma seed derivada de (master, índice de grid) via
  // deriveSeed — determinística e descorrelacionada entre pilotos.
  const master = seed ?? Math.floor(Math.random() * 0xFFFFFFFF);
  // startOffset = i * gapPerPos: grid de largada — P1 (i=0) larga em 0, cada
  // posição atrás larga um pouco depois, criando gaps reais desde o começo.
  const timelines: Timeline[] = drivers.map((d, i) => ({
    code:   d.code,
    events: computeTimeline(d.code, d.baseMini, track,
              deriveSeed(master, i), i * track.gapPerPos),
  }));

  // Estado de exibição por piloto
  const dstate = timelines.map(t => ({
    code:                 t.code,
    miniCompleted:        0,
    lapsCompleted:        0,
    totalTime:            0,
    sector:               0,
    miniSector:           0,
    lastLapTime:          null as number | null,
    bestLapTime:          null as number | null,
    lastSectors:          [null, null, null] as (number | null)[],
    lastMiniTimes:        [[], [], []] as number[][],
    curSectorTimes:       [null, null, null] as (number | null)[],
    curMiniTimesPerSector:[[], [], []] as number[][],
    gapToLeader:          0,
  }));

  const ptrs = new Array(timelines.length).fill(0);
  const sectorSnapshots: Snapshot[] = [];
  const lapSnapshots: Snapshot[] = [];
  const TOTAL_MINIS = TOTAL_LAPS * 3 * MINI_PER_SECTOR;
  let framesEmitted = 0;
  let leaderDone = false;

  const buildFrame = (): Snapshot => {
    let ref = dstate[0];
    for (const d of dstate) {
      if (d.miniCompleted > ref.miniCompleted ||
         (d.miniCompleted === ref.miniCompleted && d.totalTime < ref.totalTime)) ref = d;
    }
    const N = ref.miniCompleted;
    const refEvents = timelines.find(t => t.code === ref.code)!.events;
    const refTime = refEvents[Math.min(N - 1, refEvents.length - 1)].time;

    const withTiming = dstate.map((d, i) => {
      const evIdx = Math.min(N - 1, timelines[i].events.length - 1);
      return { d, timeToN: timelines[i].events[evIdx].time };
    });
    withTiming.sort((a, b) => a.timeToN - b.timeToN);

    return withTiming.map(({ d, timeToN }, pos) => ({
      code:                 d.code,
      lap:                  d.lapsCompleted,
      sector:               d.sector,
      lastLapTime:          d.lastLapTime,
      bestLapTime:          d.bestLapTime,
      lastSectors:          [...d.lastSectors],
      lastMiniTimes:        d.lastMiniTimes.map(a => [...a]),
      curSectorTimes:       [...d.curSectorTimes],
      curMiniTimesPerSector:d.curMiniTimesPerSector.map(a => [...a]),
      gapToLeader:          pos === 0 ? 0 : timeToN - refTime,
      totalTime:            d.totalTime,
      finished:             d.lapsCompleted >= TOTAL_LAPS,
    }));
  };

  // Processa TODOS os eventos até cada piloto completar a distância total.
  while (true) {
    let minTime = Infinity, minIdx = -1;
    for (let i = 0; i < timelines.length; i++) {
      if (ptrs[i] >= timelines[i].events.length) continue;
      if (timelines[i].events[ptrs[i]].time < minTime) {
        minTime = timelines[i].events[ptrs[i]].time;
        minIdx  = i;
      }
    }
    if (minIdx === -1) break;

    const ev = timelines[minIdx].events[ptrs[minIdx]];
    ptrs[minIdx]++;

    const ds = dstate[minIdx];
    ds.totalTime = ev.time;
    ds.miniCompleted++;
    ds.curMiniTimesPerSector[ev.sector].push(ev.miniTime);

    if (ev.isSectorEnd) {
      ds.curSectorTimes[ev.sector] = ev.sectorTime;
    }

    if (ev.isLapEnd) {
      ds.lapsCompleted++;
      ds.lastLapTime = ev.lapTime;
      if (ds.bestLapTime === null || (ev.lapTime as number) < ds.bestLapTime) {
        ds.bestLapTime = ev.lapTime;
      }
      ds.lastSectors   = [...ev.lapSectorTimes];
      ds.lastMiniTimes = ev.lapMiniTimes.map(a => [...a]);
      ds.curSectorTimes        = [null, null, null];
      ds.curMiniTimesPerSector = [[], [], []];
      ds.sector      = 0;
      ds.miniSector  = 0;
    } else if (ev.isSectorEnd) {
      ds.sector     = ev.sector + 1;
      ds.miniSector = 0;
    } else {
      ds.miniSector = ev.miniSector + 1;
    }

    const maxMinis = Math.max(...dstate.map(d => d.miniCompleted));
    const leaderJustAdvanced = ds.miniCompleted === maxMinis && ds.miniCompleted > framesEmitted;

    if (!leaderDone && leaderJustAdvanced) {
      framesEmitted = ds.miniCompleted;
      const frame = buildFrame();
      sectorSnapshots.push(frame);
      if (ev.isLapEnd) lapSnapshots.push(frame);
      if (ds.miniCompleted >= TOTAL_MINIS) leaderDone = true;
    } else if (leaderDone) {
      sectorSnapshots.push(buildFrame());
    }
  }

  // Classificação final: timeline COMPLETA de cada piloto.
  const finalState = timelines.map(t => {
    const events   = t.events;
    const lastEv   = events[events.length - 1];
    let best = Infinity;
    // usa isLapEnd: só o último mini do S3 tem lapTime; os outros são null
    // (e `null < Infinity` é true em JS, o que corromperia o mínimo)
    for (const e of events) if (e.isLapEnd && (e.lapTime as number) < best) best = e.lapTime as number;
    return {
      code:             t.code,
      lapsCompleted:    TOTAL_LAPS,
      sectorsCompleted: events.length,
      totalTime:        lastEv.time,
      lastLapTime:      lastEv.lapTime,
      bestLapTime:      best === Infinity ? null : best,
      gapToLeader:      0,
    };
  });

  finalState.sort((a, b) => a.totalTime - b.totalTime);
  const winnerTime = finalState[0].totalTime;
  finalState.forEach((d, i) => { d.gapToLeader = i === 0 ? 0 : d.totalTime - winnerTime; });

  // Referências para coloração (recorde global e PB por mini-setor e por setor)
  const miniRef: { min: number; max: number }[][] = [[], [], []];
  for (let s = 0; s < 3; s++)
    for (let m = 0; m < MINI_PER_SECTOR; m++) miniRef[s][m] = { min: Infinity, max: -Infinity };

  const personalBest: Record<string, number[][]> = {};
  const sectorRef = [ { min: Infinity }, { min: Infinity }, { min: Infinity } ];
  const sectorPB: Record<string, number[]> = {};
  for (const t of timelines) {
    const pb: number[][] = [[], [], []];
    for (let s = 0; s < 3; s++)
      for (let m = 0; m < MINI_PER_SECTOR; m++) pb[s][m] = Infinity;
    const spb = [Infinity, Infinity, Infinity];

    for (const ev of t.events) {
      const r = miniRef[ev.sector][ev.miniSector];
      if (ev.miniTime < r.min) r.min = ev.miniTime;
      if (ev.miniTime > r.max) r.max = ev.miniTime;
      if (ev.miniTime < pb[ev.sector][ev.miniSector]) pb[ev.sector][ev.miniSector] = ev.miniTime;
      if (ev.isSectorEnd && ev.sectorTime != null) {
        if (ev.sectorTime < sectorRef[ev.sector].min) sectorRef[ev.sector].min = ev.sectorTime;
        if (ev.sectorTime < spb[ev.sector]) spb[ev.sector] = ev.sectorTime;
      }
    }
    personalBest[t.code] = pb;
    sectorPB[t.code] = spb;
  }

  // Cor de cada fechamento de setor no modelo LIVE do F1 (best acumulado):
  //   roxo = global best; verde = PB próprio; amarelo = atrás do PB.
  const sectorColors: Record<string, string> = {};
  const closeEvents: { code: string; time: number; lap: number; sector: number; st: number }[] = [];
  for (const t of timelines)
    for (const ev of t.events)
      if (ev.isSectorEnd && ev.sectorTime != null)
        closeEvents.push({ code: t.code, time: ev.time, lap: ev.lap, sector: ev.sector, st: ev.sectorTime });

  closeEvents.sort((a, b) => a.time - b.time);
  const gBest = [Infinity, Infinity, Infinity];
  const pBest: Record<string, number[]> = {};
  for (const c of closeEvents) {
    if (!pBest[c.code]) pBest[c.code] = [Infinity, Infinity, Infinity];
    let cls: string;
    if (c.st <= gBest[c.sector] + 1e-9) cls = 'ms-fastest';
    else if (c.st <= pBest[c.code][c.sector] + 1e-9) cls = 'ms-fast';
    else cls = 'ms-mid';
    if (c.st < gBest[c.sector]) gBest[c.sector] = c.st;
    if (c.st < pBest[c.code][c.sector]) pBest[c.code][c.sector] = c.st;
    sectorColors[`${c.code}|${c.lap}|${c.sector}`] = cls;
  }

  return { finalState, sectorSnapshots, lapSnapshots, track, miniRef, personalBest, sectorRef, sectorPB, sectorColors, timelines };
}
