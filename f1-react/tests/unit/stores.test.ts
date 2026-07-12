// ─── Testes do store de temporada + registro de corrida (I3) ─────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { runRace } from '../../src/lib/engine/engine';
import { buildRaceRecord } from '../../src/lib/stores/raceRecord';
import { useSeasonStore } from '../../src/lib/stores/seasonStore';

describe('buildRaceRecord', () => {
  const r = runRace('interlagos', 42);
  const rec = buildRaceRecord(r, 'interlagos', '2026-01-01T00:00:00.000Z', 42);

  it('classificação tem todas as posições, ordenada, com pos 1..N', () => {
    expect(rec.classification.length).toBe(r.finalState.length);
    rec.classification.forEach((row, i) => {
      expect(row.pos).toBe(i + 1);
      expect(row.code).toBe(r.finalState[i].code);
      expect(row.gapToLeader).toBe(r.finalState[i].gapToLeader);
    });
    expect(rec.classification[0].gapToLeader).toBe(0); // vencedor
  });

  it('startPos: cada piloto tem posição de largada válida (1..N) e única', () => {
    const starts = rec.classification.map(r => r.startPos);
    starts.forEach(s => { expect(s).toBeGreaterThanOrEqual(1); expect(s).toBeLessThanOrEqual(22); });
    expect(new Set(starts).size).toBe(22);                 // sem duplicatas → grid completo
    // o grid = ordem das timelines (índice+1)
    r.timelines.forEach((t, i) => {
      const row = rec.classification.find(c => c.code === t.code)!;
      expect(row.startPos).toBe(i + 1);
    });
  });

  it('metadados corretos (track, date, seed)', () => {
    expect(rec.trackKey).toBe('interlagos');
    expect(rec.trackName).toBe(r.track.name);
    expect(rec.date).toBe('2026-01-01T00:00:00.000Z');
    expect(rec.seed).toBe(42);
  });

  it('fastestLap = menor bestLapTime da corrida', () => {
    let min = Infinity, code = '';
    for (const d of r.finalState)
      if (d.bestLapTime != null && d.bestLapTime < min) { min = d.bestLapTime; code = d.code; }
    expect(rec.fastestLap).toEqual({ code, time: min });
  });
});

describe('seasonStore', () => {
  beforeEach(() => useSeasonStore.getState().clear());

  const sample = (track: string) => ({
    trackKey: track, trackName: track, date: '2026-01-01T00:00:00.000Z',
    seed: 1, classification: [], fastestLap: null,
  });

  it('addResult atribui id sequencial e acumula', () => {
    const { addResult } = useSeasonStore.getState();
    addResult(sample('interlagos'));
    addResult(sample('monaco'));
    const rs = useSeasonStore.getState().results;
    expect(rs.length).toBe(2);
    expect(rs.map(r => r.id)).toEqual([1, 2]);
    expect(rs[1].trackKey).toBe('monaco');
  });

  it('clear esvazia', () => {
    useSeasonStore.getState().addResult(sample('spa'));
    useSeasonStore.getState().clear();
    expect(useSeasonStore.getState().results).toEqual([]);
  });

  it('persiste e re-hidrata do storage (getItem/removeItem)', async () => {
    useSeasonStore.getState().addResult(sample('interlagos')); // grava (setItem)
    await useSeasonStore.persist.rehydrate();                  // lê de volta (getItem)
    expect(useSeasonStore.getState().results.length).toBeGreaterThanOrEqual(1);
    useSeasonStore.persist.clearStorage();                     // remove (removeItem)
  });
});
