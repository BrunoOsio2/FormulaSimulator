import type { RaceResult, Snapshot, Timeline } from './types';
import { TRACKS } from '../data/tracks';
import { MINI_PER_SECTOR, buildDrivers } from './skills';
import { computeTimeline } from './timeline';
import { RNG, deriveSeed } from './rng';
import { resolveTraffic } from './traffic';
import { overtakeChance, resolvePass } from './overtake';
import { buildMomentumSeries, momentumAtLap } from './momentum';
import { planIncidents, neutralizations, applyNeutralizations } from './incidents';
import { planStrategy, applyTyres, applyPitStops, stintAtLap, type Stint } from './strategy';

// ─── Motor da corrida ──────────────────────────────────────────────────────────
// Estratégia:
//   1. Pré-computa a timeline LIMPA de cada piloto (pace sozinho; seed por piloto).
//   2. Aplica tráfego + ultrapassagem (resolveTraffic): carro preso atrás de um
//      mais lento forma trenzinho (C2) e pode tentar passar ao cruzar a linha (C1).
//   3. Processa os eventos em ordem cronológica (event-driven) → frames de playback.
//   4. Emite um frame a cada avanço do líder; após ele terminar, um por evento.
export function runRace(trackKey = 'interlagos', seed?: number): RaceResult {
  const track      = TRACKS[trackKey];
  const drivers    = buildDrivers(track);
  const TOTAL_LAPS = track.laps;

  // Seed-mãe: reproduzível se `seed` for passado; senão aleatória (cada corrida
  // única). Cada piloto recebe uma seed derivada de (master, índice de grid) via
  // deriveSeed — determinística e descorrelacionada entre pilotos.
  const master = seed ?? Math.floor(Math.random() * 0xFFFFFFFF);
  // Largada parada real: TODOS largam no mesmo instante (t=0). A posição de grid
  // não dá vantagem de tempo — a ordem final emerge do ritmo (pace) + tráfego.
  const startOffsets = drivers.map(() => 0);
  // Momentum / forma (C6): série por fase de cada piloto, enviesada pelo handicap.
  // RNG dedicado por piloto (salt distinto) → determinístico e sem perturbar os
  // demais consumos de RNG (variação/erros).
  const momentums = drivers.map((d, i) =>
    buildMomentumSeries(d.code, track, new RNG(deriveSeed(master, 0x310AD0 + i))));
  const momentumByCode: Record<string, number[]> = {};
  drivers.forEach((d, i) => { momentumByCode[d.code] = momentums[i]; });
  const timelines: Timeline[] = drivers.map((d, i) => ({
    code:   d.code,
    // RNG de variação (seed por piloto) + RNG separado de erros (C5) + momentum (C6),
    // cada um com salt distinto para não perturbar a sequência de variação (paridade).
    events: computeTimeline(d.code, d.baseMini, track,
              deriveSeed(master, i), startOffsets[i],
              new RNG(deriveSeed(master, 0x5A1710 + i)), momentums[i]),
  }));

  // ── Incidentes + Safety Car (C4) — planejados PRIMEIRO ────────────────────
  // A agenda de SC é determinística e precisa existir ANTES da estratégia, para
  // a IA de pit poder reagir ao safety car (parar sob SC = pit barato).
  const incidents = planIncidents(track, TOTAL_LAPS, drivers.map(d => d.code), new RNG(deriveSeed(master, 0x5AFEC)));
  const neuts = neutralizations(incidents);
  const cautionAtLap = (lap: number): 'none' | 'vsc' | 'sc' => {
    for (const z of neuts) if (lap >= z.startLap && lap < z.endLap) return z.type;
    return 'none';
  };

  // ── Estratégia + Pneus + Pit stops (E1/E2) ────────────────────────────────
  // Cada carro tem no máx 1 jogo de cada composto; a parada reage ao SC. Aplica
  // o desgaste (applyTyres) e o custo do pit (applyPitStops) sobre os mini-tempos
  // LIMPOS, ANTES do tráfego/neutralização. RNG dedicado por piloto.
  const strategies: Record<string, Stint[]> = {};
  drivers.forEach((d, i) => {
    strategies[d.code] = planStrategy(d.code, track, TOTAL_LAPS, incidents,
      new RNG(deriveSeed(master, 0x71235 + i)));
  });
  applyTyres(timelines, strategies, track);
  applyPitStops(timelines, strategies, track);

  // ── Tráfego (C2) + Ultrapassagem (C1) ─────────────────────────────────────
  // As timelines acima já têm pneu+pit. Aqui aplicamos o tráfego (preso atrás de
  // um mais lento) e a ultrapassagem: ao cruzar a linha, 1 tentativa/volta,
  // decidida por overtaking×defending×pista via RNG dedicado. O event.miniTime é
  // preservado — cores refletem o ritmo, não o atraso por tráfego.
  const passRng = new RNG(deriveSeed(master, 0x0ADDDECA));
  // Log de ultrapassagens: registra cada passe concedido com a volta e se estava
  // sob bandeira (VSC/SC) — a UI ignora os sob caution. `lap` vem do resolveTraffic.
  const overtakes: { lap: number; passer: string; passed: string; caution: boolean }[] = [];
  const tryPass = (attacker: number, defender: number, lap: number): boolean => {
    const chance = overtakeChance(drivers[attacker].code, drivers[defender].code, track);
    const ok = resolvePass(passRng.next(), chance);
    if (ok) {
      overtakes.push({
        lap, passer: drivers[attacker].code, passed: drivers[defender].code,
        caution: cautionAtLap(lap) !== 'none',
      });
    }
    return ok;
  };
  // base do tráfego = durações atuais (pós pneu+pit) de cada mini
  const durNow = timelines.map(t => t.events.map((e, k) => k === 0 ? e.miniTime : e.time - t.events[k - 1].time));
  const resolved = resolveTraffic(durNow, startOffsets, undefined, tryPass);
  timelines.forEach((t, p) => {
    for (let k = 0; k < t.events.length; k++) t.events[k].time = resolved[p][k];
  });

  // ── Neutralização do Safety Car (C4) ──────────────────────────────────────
  // Desacelera todos nas janelas de VSC/SC e agrupa no SC. Reescreve os tempos.
  applyNeutralizations(timelines, neuts, track.baseLap);

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
  const cautionByFrame: ('none' | 'vsc' | 'sc')[] = [];
  const TOTAL_MINIS = TOTAL_LAPS * 3 * MINI_PER_SECTOR;
  const TAIL_SUBSAMPLE = 6; // fase tail: 1 frame a cada N eventos (evita arrastar no fim)
  let tailCount = 0;
  let framesEmitted = 0;
  let leaderDone = false;

  // caution do frame = estado de neutralização na volta do líder (maior lap do frame)
  const cautionOf = (frame: Snapshot): 'none' | 'vsc' | 'sc' => {
    let lap = 0;
    for (const r of frame) if (r.lap > lap) lap = r.lap;
    return cautionAtLap(lap);
  };

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
      return { d, i, timeToN: timelines[i].events[evIdx].time };
    });
    withTiming.sort((a, b) => a.timeToN - b.timeToN);

    return withTiming.map(({ d, i, timeToN }, pos) => {
      const st = stintAtLap(strategies[d.code], d.lapsCompleted);
      return {
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
      momentum:             momentumAtLap(momentums[i], d.lapsCompleted),
      compound:             st.compound,
      tyreAge:              st.age,
    }; });
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
      cautionByFrame.push(cautionOf(frame));
      if (ev.isLapEnd) lapSnapshots.push(frame);
      if (ds.miniCompleted >= TOTAL_MINIS) leaderDone = true;
    } else if (leaderDone) {
      // Fase tail (líder já terminou): subamostra para não arrastar — emite 1
      // frame a cada TAIL_SUBSAMPLE eventos, mas sempre no fim de volta (carro
      // cruzando a linha) e no último evento de cada piloto (chegada visível).
      const last = ptrs[minIdx] >= timelines[minIdx].events.length;
      if (ev.isLapEnd || last || (++tailCount % TAIL_SUBSAMPLE === 0)) {
        const frame = buildFrame();
        sectorSnapshots.push(frame);
        cautionByFrame.push(cautionOf(frame));
      }
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

  return { finalState, sectorSnapshots, lapSnapshots, track, miniRef, personalBest, sectorRef, sectorPB, sectorColors, timelines, neutralizations: neuts, cautionByFrame, strategies, overtakes, incidents, momentumByCode };
}
