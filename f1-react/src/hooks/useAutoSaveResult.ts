import { useEffect, useRef } from 'react';
import type { RaceResult } from '../lib/engine/types';
import { useRaceStore } from '../lib/stores/raceStore';
import { useSeasonStore } from '../lib/stores/seasonStore';
import { buildRaceRecord } from '../lib/stores/raceRecord';

// Salva o resultado na temporada quando a corrida termina — uma vez por corrida
// (guard `savedFor` evita re-salvar a cada re-render enquanto atEnd continua true).
export function useAutoSaveResult() {
  const result = useRaceStore(s => s.result);
  const snapIdx = useRaceStore(s => s.snapIdx);
  const trackKey = useRaceStore(s => s.trackKey);
  const seed = useRaceStore(s => s.seed);
  const addResult = useSeasonStore(s => s.addResult);
  const savedFor = useRef<RaceResult | null>(null);

  const total = result ? result.sectorSnapshots.length : 0;
  const atEnd = !!result && snapIdx >= total - 1;

  useEffect(() => {
    if (!result || !atEnd || savedFor.current === result) return;
    savedFor.current = result;
    addResult(buildRaceRecord(result, trackKey, new Date().toISOString(), seed));
  }, [result, atEnd, trackKey, seed, addResult]);
}
