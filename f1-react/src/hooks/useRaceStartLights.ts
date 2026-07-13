import { useRef, useCallback, useMemo, useEffect } from 'react';
import { useRaceStore } from '../lib/stores/raceStore';

// Largada estilo F1 (semáforo): 5 luzes vermelhas acendem uma a uma (~0.9s cada),
// seguram, e apagam todas de uma vez → a corrida começa (playing=true). Timers
// imperativos encapsulados aqui (não na store). Retorna { start, cancel } estável.
export function useRaceStartLights() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cancel = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const start = useCallback(() => {
    const { setLights, setPlaying } = useRaceStore.getState();
    cancel();
    // luzes acendem mais ágil (0.55s cada) — mantém a tensão sem delay longo
    const STEP = 550;
    for (let n = 1; n <= 5; n++) {
      timers.current.push(setTimeout(() => setLights(n), n * STEP));
    }
    const outAt = 5 * STEP + 700;                 // segura as 5 luzes ~0.7s
    timers.current.push(setTimeout(() => setLights('out'), outAt));
    timers.current.push(setTimeout(() => {        // apaga tudo → larga
      setLights(null);
      setPlaying(true);
    }, outAt + 350));
  }, [cancel]);

  // limpa os timers ao desmontar (uma vez)
  useEffect(() => cancel, [cancel]);

  // objeto de retorno estável — evita re-disparar effects que dependem dele
  return useMemo(() => ({ start, cancel }), [start, cancel]);
}
