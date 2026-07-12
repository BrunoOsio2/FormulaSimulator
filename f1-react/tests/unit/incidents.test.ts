// ─── Testes: incidentes e safety car (C4) ────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  planIncidents, neutralizations, applyNeutralizations, SC_BUNCH_GAP,
} from '../../src/lib/engine/incidents';
import type { Timeline } from '../../src/lib/engine/types';
import { RNG, deriveSeed } from '../../src/lib/engine/rng';
import { TRACKS } from '../../src/lib/data/tracks';
import { runRace } from '../../src/lib/engine/engine';

describe('planIncidents (C4)', () => {
  it('determinístico: mesma seed → mesma agenda', () => {
    const a = planIncidents(TRACKS.monaco, 78, new RNG(deriveSeed(5, 1)));
    const b = planIncidents(TRACKS.monaco, 78, new RNG(deriveSeed(5, 1)));
    expect(a).toEqual(b);
  });
  it('gera incidentes e nunca na 1ª nem na última volta', () => {
    const inc = planIncidents(TRACKS.monaco, 78, new RNG(deriveSeed(1, 1)));
    expect(inc.length).toBeGreaterThan(0);
    inc.forEach(i => { expect(i.lap).toBeGreaterThanOrEqual(1); expect(i.lap).toBeLessThan(77); });
  });
  it('janelas de neutralização não se sobrepõem', () => {
    const neuts = neutralizations(planIncidents(TRACKS.monaco, 78, new RNG(deriveSeed(9, 1))));
    const sorted = [...neuts].sort((a, b) => a.startLap - b.startLap);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].startLap).toBeGreaterThanOrEqual(sorted[i - 1].endLap);
  });
});

// helper: cria timelines sintéticas espaçadas (C0 na frente, C1, C2 atrás)
function mkTimelines(offsets: number[], per = 1.0, minis = 54): Timeline[] {
  return offsets.map((off, idx) => {
    const events = [];
    let t = off;
    for (let k = 0; k < minis; k++) {
      t += per;
      events.push({
        time: t, lap: Math.floor(k / 27), sector: 0, miniSector: k % 9, miniTime: per,
        isSectorEnd: false, isLapEnd: false, sectorTime: null, lapTime: null,
        curMiniSoFar: [], lapSectorTimes: [null, null, null], lapMiniTimes: [[], [], []],
      });
    }
    return { code: 'C' + idx, events };
  });
}

describe('applyNeutralizations (C4)', () => {
  it('VSC: infla os tempos na janela e mantém a ordem', () => {
    const tls = mkTimelines([0, 2, 4]);
    const before = tls.map(t => t.events[53].time);
    applyNeutralizations(tls, [{ startLap: 0, endLap: 1, type: 'vsc' }], 27);
    // todos ficam mais lentos (tempo final maior)
    tls.forEach((t, i) => expect(t.events[53].time).toBeGreaterThan(before[i]));
    // ordem preservada (C0 < C1 < C2)
    expect(tls[0].events[53].time).toBeLessThan(tls[1].events[53].time);
    expect(tls[1].events[53].time).toBeLessThan(tls[2].events[53].time);
  });
  it('VSC: PRESERVA o gap em segundos (não agrupa, não escala)', () => {
    // C0 e C1 largam 2s de gap. Sob VSC (ritmo comum) o gap deve continuar ~2s
    // na mesma marca de distância — nem comprime (SC) nem cresce (proporcional).
    const tls = mkTimelines([0, 2, 4]);
    const gapBefore = tls[1].events[5].time - tls[0].events[5].time;   // marca antes... na v0
    applyNeutralizations(tls, [{ startLap: 0, endLap: 1, type: 'vsc' }], 27);
    const gapDuring = tls[1].events[20].time - tls[0].events[20].time; // marca dentro do VSC
    expect(gapBefore).toBeCloseTo(2.0, 1);
    expect(gapDuring).toBeCloseTo(2.0, 1);
  });
  it('SC: comprime os gaps para ~SC_BUNCH_GAP', () => {
    const tls = mkTimelines([0, 2, 4]);
    applyNeutralizations(tls, [{ startLap: 0, endLap: 1, type: 'sc' }], 27);
    const g1 = tls[1].events[20].time - tls[0].events[20].time;
    const g2 = tls[2].events[20].time - tls[1].events[20].time;
    expect(g1).toBeCloseTo(SC_BUNCH_GAP, 1);
    expect(g2).toBeCloseTo(SC_BUNCH_GAP, 1);
  });
  it('mantém monotonia de cada carro (tempos crescentes)', () => {
    const tls = mkTimelines([0, 2, 4]);
    applyNeutralizations(tls, [{ startLap: 0, endLap: 1, type: 'sc' }], 27);
    tls.forEach(t => { for (let k = 1; k < t.events.length; k++) expect(t.events[k].time).toBeGreaterThan(t.events[k - 1].time); });
  });
  it('REGRESSÃO: após o SC os gaps continuam comprimidos (não saltam de volta)', () => {
    // SC só na volta 0 (marcas 0..26); volta 1 (27..53) é pós-SC. O gap logo após
    // deve seguir ~SC_BUNCH_GAP e só reabrir gradual — não voltar ao gap original.
    const tls = mkTimelines([0, 2, 4]);
    applyNeutralizations(tls, [{ startLap: 0, endLap: 1, type: 'sc' }], 27);
    const gapAt = (k: number) => tls[1].events[k].time - tls[0].events[k].time;
    expect(gapAt(26)).toBeCloseTo(SC_BUNCH_GAP, 1);   // fim do SC
    expect(gapAt(27)).toBeLessThan(1.0);              // 1º pós-SC: ainda agrupado (não 2.0)
  });
  it('sem neutralizações → não altera nada', () => {
    const tls = mkTimelines([0, 2, 4]);
    const snap = tls.map(t => t.events.map(e => e.time));
    applyNeutralizations(tls, [], 27);
    tls.forEach((t, i) => t.events.forEach((e, k) => expect(e.time).toBe(snap[i][k])));
  });
});

describe('runRace com incidentes (C4)', () => {
  it('cautionByFrame tem o tamanho de sectorSnapshots e valores válidos', () => {
    const r = runRace('monaco', 1);
    expect(r.cautionByFrame.length).toBe(r.sectorSnapshots.length);
    const valid = new Set(['none', 'vsc', 'sc']);
    expect(r.cautionByFrame.every(c => valid.has(c))).toBe(true);
  });
  it('determinismo: mesma seed → mesmas neutralizações', () => {
    expect(runRace('monaco', 5).neutralizations).toEqual(runRace('monaco', 5).neutralizations);
  });
  it('todos completam as voltas mesmo com neutralização (sem DNF)', () => {
    const r = runRace('monaco', 1);
    expect(r.finalState.every(d => d.lapsCompleted === r.track.laps)).toBe(true);
  });
  it('gaps seguem monotônicos por frame sob SC', () => {
    const r = runRace('monaco', 1);
    let bad = 0;
    r.sectorSnapshots.forEach(f => { for (let i = 1; i < f.length; i++) if (f[i].gapToLeader < f[i - 1].gapToLeader - 0.02) bad++; });
    expect(bad).toBe(0);
  });
});
