import type { Track, Timeline } from './types';
import { RNG } from './rng';
import type { Incident } from './incidents';
import { Compound, COMPOUNDS, tyreMultiplier } from './tyres';

// ─── Estratégia: stints, pneus e pit stops (E2) ──────────────────────────────
// Cada carro tem NO MÁXIMO 1 jogo de cada composto (macio/médio/duro) → nunca
// repete composto, no máximo 3 stints, e a corrida usa ≥2 compostos (regra F1).
// A estratégia é REATIVA ao safety car: uma parada perto de uma janela de SC é
// deslocada para dentro dela (pit barato). Tudo determinístico dado o RNG.

const MINI_PER_LAP = 27;

export interface Stint { compound: Compound; startLap: number; endLap: number; }

// Escolhe os compostos dos stints (todos distintos) e as voltas de parada.
// nStops = 1 → 2 stints; nStops = 2 → 3 stints. Reage ao SC.
export function planStrategy(_code: string, track: Track, laps: number, incidents: Incident[], rng: RNG): Stint[] {
  const abras = ((track.tireDegradation as number) ?? 5) / 10;      // 0.1..1.0
  // 1 parada é o padrão; pista abrasiva aumenta a chance de 2 paradas (exceção)
  const twoStops = rng.next() < 0.10 + abras * 0.25;                 // ~0.12..0.35
  const nStints = twoStops ? 3 : 2;

  // compostos distintos: escolhe nStints dos 3, mantendo variedade.
  // heurística simples: 1 parada → {médio, duro} ou {macio, duro}; 2 paradas → os 3.
  let compounds: Compound[];
  if (nStints === 3) {
    compounds = ['soft', 'medium', 'hard'];
  } else {
    compounds = rng.next() < 0.5 ? ['medium', 'hard'] : ['soft', 'hard'];
  }

  // voltas de parada: divide a corrida em nStints janelas ~iguais, com jitter.
  const pitLaps: number[] = [];
  for (let s = 1; s < nStints; s++) {
    const base = Math.round((laps * s) / nStints);
    const jitter = Math.round((rng.next() - 0.5) * 4); // ±2 voltas
    pitLaps.push(Math.max(2, Math.min(laps - 2, base + jitter)));
  }

  // reação ao SC: se uma janela de SC começa dentro de 4 voltas ANTES de uma
  // parada planejada, antecipa a parada para a 1ª volta do SC (pit barato).
  const scWindows = incidents.filter(i => i.type === 'sc').map(i => ({ a: i.lap, b: i.lap + i.durLaps }));
  for (let p = 0; p < pitLaps.length; p++) {
    for (const w of scWindows) {
      // uma parada planejada até ~8 voltas ANTES ou DENTRO da janela de SC é
      // antecipada/deslocada para a 1ª volta do SC (pit barato sob neutralização).
      if (pitLaps[p] >= w.a - 8 && pitLaps[p] <= w.b + 2) { pitLaps[p] = w.a; break; }
    }
  }
  pitLaps.sort((x, y) => x - y);

  // monta os stints a partir das voltas de parada
  const stints: Stint[] = [];
  let start = 0;
  for (let s = 0; s < nStints; s++) {
    const end = s < pitLaps.length ? pitLaps[s] : laps;
    stints.push({ compound: compounds[s], startLap: start, endLap: end });
    start = end;
  }
  return stints;
}

// composto e idade (voltas no stint atual) de um piloto numa dada volta.
export function stintAtLap(stints: Stint[], lap: number): { compound: Compound; age: number } {
  for (const st of stints) {
    if (lap >= st.startLap && lap < st.endLap) return { compound: st.compound, age: lap - st.startLap };
  }
  const last = stints[stints.length - 1];
  return { compound: last.compound, age: lap - last.startLap };
}

// ── Camada de pneus: aplica o desgaste aos mini-tempos (E1) ──────────────────
// Reescreve event.miniTime e re-acumula event.time. Preserva o tempo limpo em
// event.cleanMini (para cores) — capturado antes.
export function applyTyres(timelines: Timeline[], strategies: Record<string, Stint[]>, track: Track): void {
  for (const t of timelines) {
    const stints = strategies[t.code];
    if (!stints) continue;
    const ev = t.events;
    let acc = ev[0].time - ev[0].miniTime;   // largada
    for (let k = 0; k < ev.length; k++) {
      const { compound, age } = stintAtLap(stints, ev[k].lap);
      const mult = tyreMultiplier(compound, age, track, t.code);
      const dur = ev[k].miniTime * mult;
      acc += dur;
      ev[k].time = acc;
    }
  }
}

// ── Pit stops: custo da parada nos mini-tempos da volta de troca (E2) ────────
// Na última volta de cada stint (exceto o último), infla os mini-tempos perto do
// fim da volta (zona de pit) com: entrada lenta + mini "parado" + saída. O tempo
// total adicionado ≈ pitLaneTimeLoss. Re-acumula os tempos absolutos.
export function applyPitStops(timelines: Timeline[], strategies: Record<string, Stint[]>, track: Track): void {
  const pitLoss = (track.pitLaneTimeLoss as number) ?? 20; // s

  for (const t of timelines) {
    const stints = strategies[t.code];
    if (!stints) continue;
    // voltas de parada = endLap de cada stint que não é o último
    const pitLaps = new Set(stints.slice(0, -1).map(s => s.endLap - 1)); // parada na última volta do stint

    const ev = t.events;
    // durações atuais (pós-pneu), capturadas antes de re-inflar
    const durs = ev.map((e, k) => (k === 0 ? e.miniTime : e.time - ev[k - 1].time));
    let acc = ev[0].time - durs[0];
    for (let k = 0; k < ev.length; k++) {
      let dur = durs[k];
      // aplica o custo do pit nos 3 últimos minis da volta de parada
      if (pitLaps.has(ev[k].lap)) {
        const miniInLap = ev[k].sector * 9 + ev[k].miniSector;
        if (miniInLap === MINI_PER_LAP - 3) dur += pitLoss * 0.30;  // entrada (frear pit)
        if (miniInLap === MINI_PER_LAP - 2) dur += pitLoss * 0.45;  // parado (troca)
        if (miniInLap === MINI_PER_LAP - 1) dur += pitLoss * 0.25;  // saída
      }
      acc += dur;
      ev[k].time = acc;
    }
  }
  void COMPOUNDS;
}
