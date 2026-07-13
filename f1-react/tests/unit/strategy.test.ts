// ─── Testes: pneus (E1) + estratégia/pit (E2) ────────────────────────────────
import { describe, it, expect } from 'vitest';
import { tyreMultiplier } from '../../src/lib/engine/tyres';
import { planStrategy, applyPitStops, stintAtLap, type Stint } from '../../src/lib/engine/strategy';
import type { Timeline } from '../../src/lib/engine/types';
import { RNG, deriveSeed } from '../../src/lib/engine/rng';
import { TRACKS } from '../../src/lib/data/tracks';
import { runRace } from '../../src/lib/engine/engine';

describe('tyres (E1)', () => {
  const t = TRACKS.interlagos;
  it('pneu novo: macio mais rápido que duro', () => {
    expect(tyreMultiplier('soft', 0, t, 'VER')).toBeLessThan(tyreMultiplier('hard', 0, t, 'VER'));
  });
  it('desgaste aumenta o tempo (mais idade → mais lento)', () => {
    expect(tyreMultiplier('soft', 20, t, 'VER')).toBeGreaterThan(tyreMultiplier('soft', 0, t, 'VER'));
  });
  it('macio degrada mais rápido que duro', () => {
    const degSoft = tyreMultiplier('soft', 20, t, 'VER') - tyreMultiplier('soft', 0, t, 'VER');
    const degHard = tyreMultiplier('hard', 20, t, 'VER') - tyreMultiplier('hard', 0, t, 'VER');
    expect(degSoft).toBeGreaterThan(degHard);
  });
  it('piloto suave (smoothness alto) degrada menos', () => {
    // VER smoothness 82 vs LIN 72 → LIN degrada mais
    const degVER = tyreMultiplier('soft', 20, t, 'VER') - tyreMultiplier('soft', 0, t, 'VER');
    const degLIN = tyreMultiplier('soft', 20, t, 'LIN') - tyreMultiplier('soft', 0, t, 'LIN');
    expect(degLIN).toBeGreaterThan(degVER);
  });
});

describe('planStrategy (E2)', () => {
  const t = TRACKS.interlagos;
  it('determinístico: mesma seed → mesma estratégia', () => {
    const a = planStrategy('VER', t, 71, [], new RNG(deriveSeed(1, 1)));
    const b = planStrategy('VER', t, 71, [], new RNG(deriveSeed(1, 1)));
    expect(a).toEqual(b);
  });
  it('1-2 paradas (2-3 stints)', () => {
    for (let s = 0; s < 20; s++) {
      const st = planStrategy('VER', t, 71, [], new RNG(deriveSeed(s, 9)));
      expect(st.length).toBeGreaterThanOrEqual(2);
      expect(st.length).toBeLessThanOrEqual(3);
    }
  });
  it('REGRA: no máx 1 de cada composto (todos distintos) e ≥2 tipos', () => {
    for (let s = 0; s < 30; s++) {
      const st = planStrategy('VER', t, 71, [], new RNG(deriveSeed(s, 3)));
      const comps = st.map(x => x.compound);
      expect(new Set(comps).size).toBe(comps.length);   // sem repetição
      expect(new Set(comps).size).toBeGreaterThanOrEqual(2);
    }
  });
  it('stints cobrem a corrida sem buracos (contíguos, 0..laps)', () => {
    const st = planStrategy('VER', t, 71, [], new RNG(deriveSeed(4, 3)));
    expect(st[0].startLap).toBe(0);
    expect(st[st.length - 1].endLap).toBe(71);
    for (let i = 1; i < st.length; i++) expect(st[i].startLap).toBe(st[i - 1].endLap);
  });
  it('reage ao SC: parada próxima é deslocada para dentro da janela', () => {
    // SC na volta 30; uma parada planejada perto deve cair em 30.
    const inc = [{ lap: 30, type: 'sc' as const, durLaps: 3, code: 'LIN' }];
    let reacted = false;
    for (let s = 0; s < 40; s++) {
      const st = planStrategy('VER', t, 71, inc, new RNG(deriveSeed(s, 3)));
      if (st.some(x => x.endLap === 30)) { reacted = true; break; }
    }
    expect(reacted).toBe(true);
  });
});

describe('applyPitStops (E2)', () => {
  function mk(minis = 71 * 27): Timeline {
    const events = [];
    let t = 0;
    for (let k = 0; k < minis; k++) {
      t += 1;
      events.push({
        time: t, lap: Math.floor(k / 27), sector: Math.floor((k % 27) / 9), miniSector: k % 9,
        miniTime: 1, isSectorEnd: false, isLapEnd: false, sectorTime: null, lapTime: null,
        curMiniSoFar: [], lapSectorTimes: [null, null, null], lapMiniTimes: [[], [], []],
      });
    }
    return { code: 'VER', events };
  }
  it('adiciona ~pitLaneTimeLoss ao tempo total na volta de parada', () => {
    const tl = mk();
    const before = tl.events[tl.events.length - 1].time;
    const stints: Stint[] = [
      { compound: 'soft', startLap: 0, endLap: 30 },
      { compound: 'hard', startLap: 30, endLap: 71 },
    ];
    applyPitStops([tl], { VER: stints }, TRACKS.interlagos);
    const added = tl.events[tl.events.length - 1].time - before;
    const pitLoss = TRACKS.interlagos.pitLaneTimeLoss as number;
    expect(added).toBeGreaterThan(pitLoss * 0.8);
    expect(added).toBeLessThan(pitLoss * 1.2);
  });
  it('mantém monotonia (tempos crescentes)', () => {
    const tl = mk();
    applyPitStops([tl], { VER: [{ compound: 'soft', startLap: 0, endLap: 30 }, { compound: 'hard', startLap: 30, endLap: 71 }] }, TRACKS.interlagos);
    for (let k = 1; k < tl.events.length; k++) expect(tl.events[k].time).toBeGreaterThan(tl.events[k - 1].time);
  });
});

describe('stintAtLap', () => {
  const st: Stint[] = [
    { compound: 'soft', startLap: 0, endLap: 20 },
    { compound: 'medium', startLap: 20, endLap: 71 },
  ];
  it('retorna composto e idade corretos', () => {
    expect(stintAtLap(st, 5)).toEqual({ compound: 'soft', age: 5 });
    expect(stintAtLap(st, 25)).toEqual({ compound: 'medium', age: 5 });
  });
});

describe('runRace com estratégia (E1/E2)', () => {
  it('expõe strategies e snapshot com compound/tyreAge', () => {
    const r = runRace('interlagos', 42);
    expect(Object.keys(r.strategies).length).toBe(22);
    const frame = r.sectorSnapshots[Math.floor(r.sectorSnapshots.length / 2)];
    expect(frame.every(row => row.compound && typeof row.tyreAge === 'number')).toBe(true);
  });
  it('determinismo: mesma seed → mesmas estratégias', () => {
    expect(runRace('spa', 7).strategies).toEqual(runRace('spa', 7).strategies);
  });
  it('todos completam as voltas; regra dos compostos cumprida por todos', () => {
    const r = runRace('interlagos', 42);
    expect(r.finalState.every(d => d.lapsCompleted === r.track.laps)).toBe(true);
    Object.values(r.strategies).forEach(st => {
      const comps = st.map(x => x.compound);
      expect(new Set(comps).size).toBe(comps.length);           // distintos
      expect(new Set(comps).size).toBeGreaterThanOrEqual(2);
    });
  });
  it('gaps monotônicos por frame', () => {
    const r = runRace('interlagos', 42);
    let bad = 0;
    r.sectorSnapshots.forEach(f => { for (let i = 1; i < f.length; i++) if (f[i].gapToLeader < f[i - 1].gapToLeader - 0.02) bad++; });
    expect(bad).toBe(0);
  });
});
