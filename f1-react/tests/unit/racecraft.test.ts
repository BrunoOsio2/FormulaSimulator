// ─── Testes: ultrapassagem (C1) + erros de pilotagem (C5) ────────────────────
import { describe, it, expect } from 'vitest';
import { overtakeChance, resolvePass, MAX_CHANCE } from '../../src/lib/engine/overtake';
import { resolveTraffic } from '../../src/lib/engine/traffic';
import { miniMistakeLoss } from '../../src/lib/engine/mistakes';
import {
  rollMomentum, buildMomentumSeries, momentumAtLap, paceDeltaPerMini,
  mistakeMultiplier, PHASE_LAPS,
} from '../../src/lib/engine/momentum';
import { RNG, deriveSeed } from '../../src/lib/engine/rng';
import { TRACKS } from '../../src/lib/data/tracks';
import { buildDrivers } from '../../src/lib/engine/skills';
import { computeTimeline } from '../../src/lib/engine/timeline';

describe('overtakeChance (C1)', () => {
  it('atacante melhor tem mais chance que atacante pior', () => {
    const strong = overtakeChance('VER', 'LIN', TRACKS.interlagos); // ótimo overtaking vs fraco defending
    const weak = overtakeChance('LIN', 'VER', TRACKS.interlagos);   // fraco vs ótimo defending
    expect(strong).toBeGreaterThan(weak);
  });
  it('Monaco (baixa oportunidade) < Interlagos (alta) para o mesmo par', () => {
    expect(overtakeChance('VER', 'LIN', TRACKS.monaco))
      .toBeLessThan(overtakeChance('VER', 'LIN', TRACKS.interlagos));
  });
  it('chance sempre em [0, MAX_CHANCE]', () => {
    for (const t of ['monaco', 'spa', 'interlagos'] as const)
      for (const [a, d] of [['VER', 'LIN'], ['LIN', 'VER'], ['NOR', 'PIA']]) {
        const c = overtakeChance(a, d, TRACKS[t]);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(MAX_CHANCE);
      }
  });
  it('resolvePass: sorteio < chance → passa', () => {
    expect(resolvePass(0.1, 0.5)).toBe(true);
    expect(resolvePass(0.9, 0.5)).toBe(false);
  });
});

describe('resolveTraffic — ultrapassagem (C1)', () => {
  const LAPS = 3, MINIS = 27 * LAPS;
  const clean = [
    new Array(MINIS).fill(1.0),  // P0 lento na frente
    new Array(MINIS).fill(0.7),  // P1 rápido atrás
  ];
  const starts = [0, 0.5];

  it('atacante rápido passa quando tryPass concede → termina à frente', () => {
    const r = resolveTraffic(clean, starts, undefined, (_a, _d, lap) => lap >= 1);
    expect(r[1][MINIS - 1]).toBeLessThan(r[0][MINIS - 1]); // P1 à frente no fim
  });
  it('sem passe concedido → atacante fica preso atrás (C2 puro)', () => {
    const r = resolveTraffic(clean, starts, undefined, () => false);
    expect(r[1][MINIS - 1]).toBeGreaterThan(r[0][MINIS - 1]); // P1 preso atrás
  });
  it('no máximo 1 tentativa por volta por atacante', () => {
    const laps: number[] = [];
    resolveTraffic(clean, starts, undefined, (_a, _d, lap) => { laps.push(lap); return false; });
    // sem repetir a mesma volta para o mesmo atacante
    expect(new Set(laps).size).toBe(laps.length);
  });
  it('determinística com o mesmo tryPass', () => {
    const tp = (_a: number, _d: number, lap: number) => lap % 2 === 0;
    expect(resolveTraffic(clean, starts, undefined, tp))
      .toEqual(resolveTraffic(clean, starts, undefined, tp));
  });
});

describe('miniMistakeLoss (C5)', () => {
  const t = TRACKS.monaco;
  const errCount = (code: string, seed: number) => {
    const rng = new RNG(deriveSeed(seed, 1));
    let n = 0;
    for (let i = 0; i < 2106; i++) if (miniMistakeLoss(code, t, rng) > 0) n++;
    return n;
  };

  it('piloto com control baixo erra mais que control alto', () => {
    expect(errCount('LIN', 42)).toBeGreaterThan(errCount('VER', 42)); // LIN 73 vs VER 96
  });
  it('determinístico dado o RNG (mesma seed → mesma contagem)', () => {
    expect(errCount('LIN', 7)).toBe(errCount('LIN', 7));
  });
  it('erro (quando ocorre) só adiciona tempo, nunca reduz', () => {
    const rng = new RNG(deriveSeed(1, 1));
    for (let i = 0; i < 500; i++) expect(miniMistakeLoss('LIN', t, rng)).toBeGreaterThanOrEqual(0);
  });
});

describe('momentum / forma (C6)', () => {
  it('paceDeltaPerMini: nível + é mais rápido (delta negativo), - é mais lento', () => {
    expect(paceDeltaPerMini(2)).toBeLessThan(0);
    expect(paceDeltaPerMini(-2)).toBeGreaterThan(0);
    expect(paceDeltaPerMini(0)).toBeCloseTo(0, 12);
  });
  it('mistakeMultiplier: forma ruim erra mais, boa erra menos', () => {
    expect(mistakeMultiplier(-2)).toBeGreaterThan(1);
    expect(mistakeMultiplier(2)).toBeLessThan(1);
    expect(mistakeMultiplier(0)).toBe(1);
  });
  it('rollMomentum sempre em {-2..2}', () => {
    const rng = new RNG(deriveSeed(42, 5));
    for (let i = 0; i < 500; i++) {
      const m = rollMomentum('VER', rng);
      expect(m).toBeGreaterThanOrEqual(-2);
      expect(m).toBeLessThanOrEqual(2);
    }
  });
  it('handicap alto → momentum médio mais negativo que handicap baixo', () => {
    const avg = (code: string) => {
      const rng = new RNG(deriveSeed(1, 3));
      let sum = 0; const N = 2000;
      for (let i = 0; i < N; i++) sum += rollMomentum(code, rng);
      return sum / N;
    };
    expect(avg('LIN')).toBeLessThan(avg('VER')); // LIN handicap alto → mais azarado
  });
  it('buildMomentumSeries: 1 nível por fase; momentumAtLap indexa por fase', () => {
    const rng = new RNG(deriveSeed(1, 2));
    const s = buildMomentumSeries('VER', TRACKS.interlagos, rng);
    expect(s.length).toBe(Math.ceil(TRACKS.interlagos.laps / PHASE_LAPS));
    expect(momentumAtLap(s, 0)).toBe(momentumAtLap(s, PHASE_LAPS - 1));
    expect(momentumAtLap(s, PHASE_LAPS)).toBe(s[1]);
  });
  it('determinístico: mesma seed → mesma série', () => {
    const a = buildMomentumSeries('NOR', TRACKS.spa, new RNG(deriveSeed(9, 2)));
    const b = buildMomentumSeries('NOR', TRACKS.spa, new RNG(deriveSeed(9, 2)));
    expect(a).toEqual(b);
  });
});

describe('computeTimeline com erros (C5) preserva estrutura', () => {
  it('mistakeRng infla alguns minis mas mantém 27/volta e ordem crescente', () => {
    const t = TRACKS.interlagos;
    const d = buildDrivers(t).find(x => x.code === 'LIN')!;
    const clean = computeTimeline('LIN', d.baseMini, t, deriveSeed(1, 1));
    const withM = computeTimeline('LIN', d.baseMini, t, deriveSeed(1, 1), 0, new RNG(deriveSeed(1, 9)));
    expect(withM.length).toBe(clean.length);
    for (let i = 1; i < withM.length; i++) expect(withM[i].time).toBeGreaterThan(withM[i - 1].time);
    // com erros, o tempo total é >= o limpo (só adiciona)
    expect(withM[withM.length - 1].time).toBeGreaterThanOrEqual(clean[clean.length - 1].time - 1e-9);
  });
});
