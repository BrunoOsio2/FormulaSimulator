import { useEffect } from 'react';
import { useRaceStore } from '../lib/stores/raceStore';

// Atalhos de teclado: espaço = play/pause, ← → = passo a passo (pausa antes).
// Ignora quando o foco está num campo de formulário.
export function useKeyboardControls() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useRaceStore.getState();
      if (!st.result) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault(); st.togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault(); st.setPlaying(false); st.stepPrev();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault(); st.setPlaying(false); st.stepNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
