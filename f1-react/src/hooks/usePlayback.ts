import { useEffect } from 'react';
import { useRaceStore } from '../lib/stores/raceStore';

// Playback: enquanto `playing`, avança snapIdx a cada speedMs. Para no último
// frame. Efeito imperativo (setInterval) — por isso vive num hook, não na store.
export function usePlayback() {
  const playing = useRaceStore(s => s.playing);
  const result = useRaceStore(s => s.result);
  const speedMs = useRaceStore(s => s.speedMs);

  useEffect(() => {
    if (!playing || !result) return;
    const total = result.sectorSnapshots.length;
    const timer = setInterval(() => {
      const st = useRaceStore.getState();
      if (st.snapIdx < total - 1) st.stepNext();
      else st.setPlaying(false);
    }, speedMs);
    return () => clearInterval(timer);
  }, [playing, result, speedMs]);
}
