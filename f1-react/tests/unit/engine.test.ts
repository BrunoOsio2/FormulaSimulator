// ─── Testes unitários do motor TS ─────────────────────────────────────────────
// Espelha a cobertura do POC (test-unit.js) em Vitest, exercendo cada função e
// os invariantes do motor (CLAUDE.md §6).
import { describe, it, expect } from 'vitest';
import { RNG, deriveSeed } from '../../src/lib/engine/rng';
import { fmtTime, fmtGap, fmtSec } from '../../src/lib/engine/format';
import { effectiveAttr, DRIVER_ATTRS, DRIVER_FLAG } from '../../src/lib/data/drivers';
import { TRACKS } from '../../src/lib/data/tracks';
import {
  DRIVERS, MINI_PER_SECTOR, miniSectorModifier, accuracyWindow, buildDrivers,
} from '../../src/lib/engine/skills';
import { computeTimeline } from '../../src/lib/engine/timeline';
import { runRace } from '../../src/lib/engine/engine';
import { buildTrackPath, normalizePath, pointAtLapFraction } from '../../src/lib/map/geometry';
import {
  buildSpeedWarp, applyCornerOverrides, warpLapFraction, driverLapFraction, computeMapTransform,
} from '../../src/lib/map/mapgraph';

const TRACK_KEYS = ['monaco', 'spa', 'interlagos'];

describe('RNG', () => {
  it('valores em [0,1)', () => {
    const r = new RNG(1);
    for (let i = 0; i < 1000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('determinístico por seed', () => {
    const a = new RNG(42), b = new RNG(42);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });
  it('seed 0 saneada', () => {
    const r = new RNG(0); const s = new Set<number>();
    for (let i = 0; i < 10; i++) s.add(r.next());
    expect(s.size).toBeGreaterThan(1);
  });
  it('range dentro do intervalo e range(a,a)=a', () => {
    const r = new RNG(7);
    for (let i = 0; i < 200; i++) { const v = r.range(-5, 5); expect(v).toBeGreaterThanOrEqual(-5); expect(v).toBeLessThan(5); }
    expect(new RNG(3).range(2, 2)).toBe(2);
  });
  it('deriveSeed: determinística, nunca 0, descorrelaciona salt e seed', () => {
    // T-deriveSeed (SPEC-5/7): mesma entrada → mesma saída; salts e seeds
    // diferentes → seeds diferentes; nunca degenera para 0.
    expect(deriveSeed(9, 3)).toBe(deriveSeed(9, 3));
    expect(deriveSeed(9, 3)).not.toBe(deriveSeed(9, 4));      // salt diferente
    expect(deriveSeed(9, 3)).not.toBe(deriveSeed(10, 3));     // seed diferente
    const s = new Set<number>();
    for (let i = 0; i < 100; i++) { const v = deriveSeed(0, i); expect(v).not.toBe(0); s.add(v); }
    expect(s.size).toBeGreaterThan(90);                       // baixa colisão entre salts
  });
});

describe('effectiveAttr', () => {
  it('aplica handicap', () => {
    const d = DRIVER_ATTRS.VER;
    expect(effectiveAttr('VER', 'cornering')).toBeCloseTo(d.cornering * (1 - d.handicap / 200), 9);
  });
  it('handicap maior penaliza mais', () => {
    const rVER = effectiveAttr('VER', 'cornering') / DRIVER_ATTRS.VER.cornering;
    const rLIN = effectiveAttr('LIN', 'cornering') / DRIVER_ATTRS.LIN.cornering;
    expect(rLIN).toBeLessThan(rVER);
  });
});

describe('skills', () => {
  it('miniSectorModifier >= 1 sempre', () => {
    for (const code of DRIVERS)
      for (const type of ['straight','braking','slow_corner','medium_corner','fast_corner'] as const)
        expect(miniSectorModifier(code, type, TRACKS.spa)).toBeGreaterThanOrEqual(1 - 1e-9);
  });
  it('piloto lento tem modifier maior', () => {
    expect(miniSectorModifier('LIN', 'slow_corner', TRACKS.monaco))
      .toBeGreaterThan(miniSectorModifier('VER', 'slow_corner', TRACKS.monaco));
  });
  it('accuracyWindow reduz com accuracy e escala linear', () => {
    expect(accuracyWindow('VER', 0.01)).toBeLessThan(accuracyWindow('LIN', 0.01));
    expect(accuracyWindow('HAM', 0.02)).toBeCloseTo(accuracyWindow('HAM', 0.01) * 2, 12);
  });
  it('buildDrivers: 22 pilotos, baseMini soma baseLap', () => {
    const d = buildDrivers(TRACKS.interlagos);
    expect(d.length).toBe(22);
    expect(d[0].code).toBe('VER');
    const soma = d[0].baseMini.reduce((a, r) => a + r * MINI_PER_SECTOR, 0);
    expect(soma).toBeCloseTo(TRACKS.interlagos.baseLap, 6);
  });
});

describe('formatadores', () => {
  it('fmtTime', () => { expect(fmtTime(71.861)).toBe('1:11.861'); expect(fmtTime(null)).toBe('—'); });
  it('fmtGap', () => { expect(fmtGap(0)).toBe('—'); expect(fmtGap(1.234)).toBe('+1.234s'); expect(fmtGap(-0.5)).toBe('-0.500s'); });
  it('fmtSec', () => { expect(fmtSec(23.7286)).toBe('23.729'); expect(fmtSec(null)).toBe('—'); });
});

describe('geometria', () => {
  it('normalizePath em [0,1] e cum crescente', () => {
    const p = normalizePath([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);
    for (let i = 1; i < p.cum.length; i++) expect(p.cum[i]).toBeGreaterThanOrEqual(p.cum[i-1]);
    expect(p.total).toBeGreaterThan(0);
  });
  it('normalizePath degenerado não gera NaN', () => {
    const p = normalizePath([{x:5,y:5},{x:5,y:5},{x:5,y:5}]);
    expect(p.points.every(pt => Number.isFinite(pt.x) && Number.isFinite(pt.y))).toBe(true);
  });
  it('buildTrackPath fecha loop, 108 pontos, bbox ok', () => {
    const p = buildTrackPath(TRACKS.monaco);
    expect(p.points.length).toBe(27 * 4);
    const a = p.points[0], b = p.points[p.points.length - 1];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.02);
  });
  it('pointAtLapFraction wrap e dentro da bbox', () => {
    const p = buildTrackPath(TRACKS.spa);
    const a = pointAtLapFraction(p, 0.5), b = pointAtLapFraction(p, 1.5);
    expect(a.x).toBeCloseTo(b.x, 12); expect(a.y).toBeCloseTo(b.y, 12);
    for (let f = 0; f < 1; f += 0.05) {
      const pt = pointAtLapFraction(p, f);
      expect(pt.x).toBeGreaterThanOrEqual(-1e-6); expect(pt.x).toBeLessThanOrEqual(1 + 1e-6);
    }
  });
});

describe('computeTimeline', () => {
  it('laps×27 eventos, tempos crescentes, determinístico', () => {
    const t = TRACKS.interlagos, bm = buildDrivers(t)[0].baseMini;
    const ev = computeTimeline('VER', bm, t, 123);
    expect(ev.length).toBe(t.laps * 27);
    for (let i = 1; i < ev.length; i++) expect(ev[i].time).toBeGreaterThan(ev[i-1].time);
    const a = computeTimeline('VER', bm, t, 999), b = computeTimeline('VER', bm, t, 999);
    expect(a.map(e => e.time)).toEqual(b.map(e => e.time));
  });
  it('flags e soma de setores', () => {
    const t = TRACKS.interlagos;
    const ev = computeTimeline('VER', buildDrivers(t)[0].baseMini, t, 1);
    expect(ev[8].isSectorEnd && !ev[8].isLapEnd).toBe(true);
    expect(ev[26].isSectorEnd && ev[26].isLapEnd).toBe(true);
    const lapEnd = ev.find(e => e.isLapEnd)!;
    const soma = lapEnd.lapSectorTimes.reduce((a, b) => (a as number) + (b as number), 0);
    expect(soma).toBeCloseTo(lapEnd.lapTime as number, 6);
  });
});

describe('runRace (invariantes)', () => {
  for (const track of TRACK_KEYS) {
    const r = runRace(track);
    it(`${track}: 22 pilotos ordenados, todos terminam, gaps crescem`, () => {
      expect(r.finalState.length).toBe(22);
      expect(r.finalState.every(d => d.lapsCompleted === r.track.laps)).toBe(true);
      expect(r.finalState[0].gapToLeader).toBe(0);
      for (let i = 1; i < 22; i++) {
        expect(r.finalState[i].totalTime).toBeGreaterThanOrEqual(r.finalState[i-1].totalTime);
        expect(r.finalState[i].gapToLeader).toBeGreaterThanOrEqual(r.finalState[i-1].gapToLeader - 1e-9);
      }
    });
    it(`${track}: grid de largada — gaps já escalonados no frame 0`, () => {
      // REGRESSÃO: antes todos largavam juntos (gap ~0.001s). Com o grid de
      // largada (startOffset = i*gapPerPos), P22 já está segundos atrás no início.
      const first = r.sectorSnapshots[0];
      expect(first[0].gapToLeader).toBe(0);
      // gap cresce com a posição e o último tem um gap significativo (não ~0)
      for (let i = 1; i < first.length; i++)
        expect(first[i].gapToLeader).toBeGreaterThanOrEqual(first[i-1].gapToLeader - 1e-9);
      expect(first[first.length - 1].gapToLeader).toBeGreaterThan(r.track.gapPerPos * 10);
    });
    it(`${track}: pelotão se espalha — P1→P22 > 3s ao fim da 1ª volta`, () => {
      // REGRESSÃO: antes P1→P22 separavam só ~0.3s numa volta (pace-spread ínfimo).
      const f1 = r.sectorSnapshots.find(f => f[0].lap >= 1);
      expect(f1).toBeTruthy();
      const spread = f1![f1!.length - 1].gapToLeader;
      expect(spread).toBeGreaterThan(3);
    });
    it(`${track}: bestLap não-null e <= lastLap, snapshots ok, lapSnapshots = voltas`, () => {
      // REGRESSÃO: bestLapTime NÃO pode ser null (bug: null < Infinity corrompia o mín)
      r.finalState.forEach(d => {
        expect(d.bestLapTime).not.toBeNull();
        expect(d.bestLapTime!).toBeLessThanOrEqual((d.lastLapTime as number) + 1e-9);
      });
      expect(r.sectorSnapshots.length).toBeGreaterThanOrEqual(r.track.laps * 27);
      expect(r.sectorSnapshots.every(f => f.length === 22)).toBe(true);
      expect(r.lapSnapshots.length).toBe(r.track.laps);
    });
    it(`${track}: gaps monotônicos por frame; último frame todos na última volta`, () => {
      let bad = 0;
      r.sectorSnapshots.forEach(f => { for (let i=1;i<f.length;i++) if (f[i].gapToLeader < f[i-1].gapToLeader - 0.001) bad++; });
      expect(bad).toBe(0);
      const last = r.sectorSnapshots[r.sectorSnapshots.length - 1];
      expect(last.every(d => d.lap >= r.track.laps)).toBe(true);
    });
    it(`${track}: sectorColors válidos, roxo raro por setor`, () => {
      const valid = new Set(['ms-fastest','ms-fast','ms-mid']);
      expect(Object.values(r.sectorColors).every(c => valid.has(c))).toBe(true);
      for (let s = 0; s < 3; s++)
        expect(Object.keys(r.sectorColors).some(k => k.endsWith('|'+s) && r.sectorColors[k] === 'ms-fastest')).toBe(true);
    });
  }
  it('VER vence Interlagos com frequência dominante', () => {
    let vios = 0;
    for (let i = 0; i < 20; i++) if (runRace('interlagos').finalState[0].code !== 'VER') vios++;
    expect(vios).toBeLessThanOrEqual(3);
  });
});

describe('runRace — seed (I1)', () => {
  // resumo comparável de um RaceResult (barato de comparar, cobre o essencial)
  const digest = (r: ReturnType<typeof runRace>) => ({
    finalState: r.finalState,
    nFrames: r.sectorSnapshots.length,
    firstFrame: r.sectorSnapshots[0],
    midFrame: r.sectorSnapshots[Math.floor(r.sectorSnapshots.length / 2)],
    sectorColors: r.sectorColors,
  });

  it('T-SPEC2: mesma (track, seed) → resultado idêntico', () => {
    for (const t of ['interlagos', 'monaco', 'spa']) {
      expect(digest(runRace(t, 123))).toEqual(digest(runRace(t, 123)));
    }
  });
  it('T-SPEC4: seeds diferentes → corridas diferentes', () => {
    const a = runRace('interlagos', 1).finalState.map(d => d.totalTime);
    const b = runRace('interlagos', 2).finalState.map(d => d.totalTime);
    expect(a).not.toEqual(b);
  });
  it('T-SPEC3: sem seed → corridas únicas (Math.random)', () => {
    const a = runRace('interlagos').finalState.map(d => d.totalTime);
    const b = runRace('interlagos').finalState.map(d => d.totalTime);
    expect(a).not.toEqual(b);
  });
  it('T-SPEC7: seed 0 é válida e reproduzível; 22 terminam', () => {
    const a = runRace('interlagos', 0), b = runRace('interlagos', 0);
    expect(a.finalState.length).toBe(22);
    expect(a.finalState.every(d => d.lapsCompleted === a.track.laps)).toBe(true);
    expect(digest(a)).toEqual(digest(b));
  });
});

describe('mapgraph', () => {
  it('buildSpeedWarp monotônico em [0,1]', () => {
    const w = buildSpeedWarp(buildTrackPath(TRACKS.interlagos), TRACKS.interlagos);
    for (const key of ['timeFrac','distFrac'] as const) {
      const a = w[key];
      expect(a[0]).toBeCloseTo(0, 9); expect(a[a.length-1]).toBeCloseTo(1, 9);
      for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThanOrEqual(a[i-1] - 1e-9);
    }
  });
  it('warpLapFraction identidade sem warp; preserva volta', () => {
    expect(warpLapFraction(null, 0.42)).toBe(0.42);
    const w = buildSpeedWarp(buildTrackPath(TRACKS.interlagos), TRACKS.interlagos);
    const v = warpLapFraction(w, 3.5);
    expect(v).toBeGreaterThanOrEqual(3); expect(v).toBeLessThan(4);
  });
  it('applyCornerOverrides só reduz; spread padrão', () => {
    const vel = new Array(100).fill(1.0);
    applyCornerOverrides(vel, [{ at: 0.5, speed: 0.2 }]);
    expect(vel.every(v => v <= 1 + 1e-9)).toBe(true);
    expect(vel.some(v => v < 0.9)).toBe(true);
  });
  it('driverLapFraction cresce e trata bordas', () => {
    const t = TRACKS.interlagos;
    const ev = computeTimeline('VER', buildDrivers(t)[0].baseMini, t, 42);
    expect(driverLapFraction(ev, -5)).toBeGreaterThanOrEqual(0);
    expect(driverLapFraction(ev, ev[ev.length-1].time + 100)).toBeCloseTo(t.laps, 1);
  });
  it('computeMapTransform mapeia dentro do canvas com padding', () => {
    const p = buildTrackPath(TRACKS.spa);
    const { mapX, mapY } = computeMapTransform({ width: 900, height: 500 }, p);
    const xs = p.points.map(mapX), ys = p.points.map(mapY);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(27);
    expect(Math.max(...xs)).toBeLessThanOrEqual(873);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(27);
    expect(Math.max(...ys)).toBeLessThanOrEqual(473);
  });
});

describe('dados', () => {
  for (const key of TRACK_KEYS) {
    it(`${key}: sectorRatio soma 1, miniSectors 3×9 válidos`, () => {
      expect(TRACKS[key].sectorRatio.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      const valid = new Set(['straight','braking','slow_corner','medium_corner','fast_corner']);
      expect(TRACKS[key].miniSectors.length).toBe(3);
      TRACKS[key].miniSectors.forEach(sec => {
        expect(sec.length).toBe(9);
        sec.forEach(t => expect(valid.has(t)).toBe(true));
      });
    });
  }
  it('22 pilotos com attrs e bandeira; todas as 3 pistas têm svgPath (mapa)', () => {
    expect(DRIVERS.length).toBe(22);
    DRIVERS.forEach(c => { expect(DRIVER_ATTRS[c]).toBeTruthy(); expect(DRIVER_FLAG[c]).toBeTruthy(); });
    expect(TRACKS.interlagos.svgPath).toBeTruthy();
    expect(TRACKS.monaco.svgPath).toBeTruthy();
    expect(TRACKS.spa.svgPath).toBeTruthy();
  });
  it('svgPath de cada pista é um loop válido (começa em M, fecha em Z)', () => {
    for (const k of TRACK_KEYS) {
      const d = TRACKS[k].svgPath!;
      expect(d.trim().charAt(0).toUpperCase()).toBe('M');
      expect(d.trim().slice(-1).toUpperCase()).toBe('Z');
    }
  });
});
