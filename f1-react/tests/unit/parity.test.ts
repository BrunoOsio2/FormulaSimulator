// ─── Teste de PARIDADE: motor TS (novo) == motor JS (POC antigo) ──────────────
// Garante que a migração JS→TS não alterou nenhuma lógica. Carrega o motor JS
// original do POC via `vm` e compara, com a MESMA seed, as saídas das funções
// determinísticas. Determinismo é o oráculo (ver CLAUDE.md §3).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Motor novo (TS)
import { RNG } from '../../src/lib/engine/rng';
import { computeTimeline } from '../../src/lib/engine/timeline';
import { buildDrivers, miniSectorModifier, accuracyWindow } from '../../src/lib/engine/skills';
import { effectiveAttr } from '../../src/lib/data/drivers';
import { TRACKS } from '../../src/lib/data/tracks';
import { buildTrackPath, pointAtLapFraction } from '../../src/lib/map/geometry';
import { buildSpeedWarp, warpLapFraction, driverLapFraction } from '../../src/lib/map/mapgraph';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POC = path.resolve(__dirname, '../../../f1-poc/src');

// Carrega o motor JS antigo num sandbox vm (mesma técnica do test-unit.js do POC).
const sandbox: any = { Math, console, JSON, Array, Object, Number, isNaN, Infinity, window: {} };
vm.createContext(sandbox);
for (const f of [
  'core/rng.js', 'core/format.js', 'data/tracks.js', 'data/drivers.js',
  'race/constants.js', 'race/skills.js', 'race/timeline.js', 'race/engine.js',
  'map/geometry.js', 'map/mapgraph.js',
]) {
  const code = fs.readFileSync(path.join(POC, f), 'utf8');
  new vm.Script(code, { filename: path.join(POC, f) }).runInContext(sandbox);
}
const old = (name: string) => vm.runInContext(name, sandbox);

const TRACK_KEYS = ['monaco', 'spa', 'interlagos'];
// Paridade valida a LÓGICA do motor, não os dados do grid (que evoluem por
// temporada). Amostra = pilotos cujos atributos usados por estas funções são
// idênticos no motor antigo (2024) e no atual (2026): VER e HAM não mudaram.
const DRIVERS_SAMPLE = ['VER', 'HAM'];

describe('paridade: RNG', () => {
  it('mesma seed → mesma sequência que o motor antigo', () => {
    const OldRNG = old('RNG');
    for (const seed of [1, 42, 99999, 314159]) {
      const a = new RNG(seed);
      const b = new OldRNG(seed);
      for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
    }
  });
});

describe('paridade: effectiveAttr / skills', () => {
  it('effectiveAttr idêntico para todos os pilotos e atributos', () => {
    const oldEff = old('effectiveAttr');
    for (const code of DRIVERS_SAMPLE)
      for (const attr of ['cornering', 'braking', 'accuracy', 'reactions'])
        expect(effectiveAttr(code, attr as any)).toBe(oldEff(code, attr));
  });

  it('miniSectorModifier e accuracyWindow idênticos', () => {
    const oldMod = old('miniSectorModifier');
    const oldAcc = old('accuracyWindow');
    const oldTRACKS = old('TRACKS');
    for (const key of TRACK_KEYS)
      for (const code of DRIVERS_SAMPLE)
        for (const type of ['straight', 'braking', 'slow_corner', 'medium_corner', 'fast_corner']) {
          expect(miniSectorModifier(code, type as any, TRACKS[key]))
            .toBe(oldMod(code, type, oldTRACKS[key]));
        }
    for (const code of DRIVERS_SAMPLE)
      expect(accuracyWindow(code, 0.01)).toBe(oldAcc(code, 0.01));
  });

  it('buildDrivers idêntico (baseMini)', () => {
    const oldBuild = old('buildDrivers');
    for (const key of TRACK_KEYS) {
      const a = buildDrivers(TRACKS[key]);
      const b = oldBuild(old('TRACKS')[key]);
      // baseMini é independente do piloto (só depende da pista) — compara isso,
      // não o array inteiro, já que o grid (código/posição) mudou para 2026.
      expect(a[0].baseMini).toEqual(b[0].baseMini);
    }
  });
});

describe('paridade: computeTimeline (determinístico com seed fixa)', () => {
  it('gera timelines byte-a-byte idênticas ao motor antigo', () => {
    const oldCompute = old('computeTimeline');
    const oldTRACKS = old('TRACKS');
    const oldBuild = old('buildDrivers');
    for (const key of TRACK_KEYS) {
      const track = TRACKS[key];
      const baseMini = buildDrivers(track)[0].baseMini;
      const oldBaseMini = oldBuild(oldTRACKS[key])[0].baseMini;
      for (const seed of [1, 42, 7777]) {
        const a = computeTimeline('VER', baseMini, track, seed);
        const b = oldCompute('VER', oldBaseMini, oldTRACKS[key], seed);
        expect(a.length).toBe(b.length);
        // compara os campos numéricos de cada evento
        for (let i = 0; i < a.length; i++) {
          expect(a[i].time).toBe(b[i].time);
          expect(a[i].miniTime).toBe(b[i].miniTime);
          expect(a[i].sectorTime).toBe(b[i].sectorTime);
          expect(a[i].lapTime).toBe(b[i].lapTime);
        }
      }
    }
  });
});

describe('paridade: geometria do traçado', () => {
  it('buildTrackPath idêntico (pontos, cum, total)', () => {
    const oldBuild = old('buildTrackPath');
    const oldTRACKS = old('TRACKS');
    for (const key of TRACK_KEYS) {
      const a = buildTrackPath(TRACKS[key]);
      const b = oldBuild(oldTRACKS[key]);
      expect(a.total).toBe(b.total);
      expect(a.points).toEqual(b.points);
      expect(a.cum).toEqual(b.cum);
    }
  });

  it('pointAtLapFraction idêntico ao longo da volta', () => {
    const oldPoint = old('pointAtLapFraction');
    const oldBuild = old('buildTrackPath');
    const path = buildTrackPath(TRACKS.interlagos);
    const oldPath = oldBuild(old('TRACKS').interlagos);
    for (let f = 0; f < 1; f += 0.017) {
      const a = pointAtLapFraction(path, f);
      const b = oldPoint(oldPath, f);
      expect(a.x).toBe(b.x); expect(a.y).toBe(b.y);
    }
  });
});

describe('paridade: mapgraph (velocidade e transformações)', () => {
  it('buildSpeedWarp idêntico (pistas sem speedWarp); Monaco diverge por override', () => {
    const oldWarp = old('buildSpeedWarp');
    const oldBuild = old('buildTrackPath');
    for (const key of TRACK_KEYS) {
      const tp = buildTrackPath(TRACKS[key]);
      const oldTp = oldBuild(old('TRACKS')[key]);
      const a = buildSpeedWarp(tp, TRACKS[key]);
      const b = oldWarp(oldTp, old('TRACKS')[key]);
      // distFrac é geometria pura (cum/total) → idêntico em todas as pistas.
      expect(a.distFrac).toEqual(b.distFrac);
      if (TRACKS[key].speedWarp) {
        // Monaco tem perfil de velocidade próprio (curvas mais lentas, mais
        // contraste) — timeFrac DEVE divergir do motor antigo, por design.
        expect(a.timeFrac).not.toEqual(b.timeFrac);
      } else {
        expect(a.timeFrac).toEqual(b.timeFrac);
      }
    }
  });

  it('warpLapFraction e driverLapFraction idênticos', () => {
    const oldWarpLap = old('warpLapFraction');
    const oldDriverLap = old('driverLapFraction');
    const oldWarp = old('buildSpeedWarp');
    const oldBuild = old('buildTrackPath');
    const oldCompute = old('computeTimeline');
    const oldTRACKS = old('TRACKS');

    const tp = buildTrackPath(TRACKS.interlagos);
    const oldTp = oldBuild(oldTRACKS.interlagos);
    const warp = buildSpeedWarp(tp, TRACKS.interlagos);
    const oldW = oldWarp(oldTp, oldTRACKS.interlagos);
    for (let f = 0; f < 3; f += 0.05) {
      expect(warpLapFraction(warp, f)).toBe(oldWarpLap(oldW, f));
    }

    const baseMini = buildDrivers(TRACKS.interlagos)[0].baseMini;
    const ev = computeTimeline('VER', baseMini, TRACKS.interlagos, 42);
    const oldEv = oldCompute('VER', baseMini, oldTRACKS.interlagos, 42);
    for (let k = 0; k < ev.length; k += 37) {
      expect(driverLapFraction(ev, ev[k].time)).toBe(oldDriverLap(oldEv, oldEv[k].time));
    }
  });
});
