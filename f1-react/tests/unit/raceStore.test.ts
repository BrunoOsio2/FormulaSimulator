// ─── Testes do raceStore (estado de domínio da corrida) ──────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { useRaceStore, SPEED_VALUES } from '../../src/lib/stores/raceStore';

const reset = () => useRaceStore.getState().reset();

describe('raceStore', () => {
  beforeEach(reset);

  it('run popula result e zera o playback', () => {
    useRaceStore.getState().run(42);
    const s = useRaceStore.getState();
    expect(s.result).not.toBeNull();
    expect(s.result!.finalState.length).toBe(22);
    expect(s.snapIdx).toBe(0);
    expect(s.playing).toBe(false);
    expect(s.seed).toBe(42);
    expect(s.perf).not.toBeNull();
  });

  it('run com mesma seed → resultado idêntico (determinismo via store)', () => {
    useRaceStore.getState().run(7);
    const a = useRaceStore.getState().result!.finalState.map(d => d.totalTime);
    reset();
    useRaceStore.getState().run(7);
    const b = useRaceStore.getState().result!.finalState.map(d => d.totalTime);
    expect(a).toEqual(b);
  });

  it('stepNext/stepPrev respeitam as bordas [0, total-1]', () => {
    const st = useRaceStore.getState();
    st.run(1);
    const total = useRaceStore.getState().result!.sectorSnapshots.length;
    st.stepPrev();
    expect(useRaceStore.getState().snapIdx).toBe(0);          // não passa de 0
    useRaceStore.getState().setSnap(total + 999);
    expect(useRaceStore.getState().snapIdx).toBe(total - 1);  // clamp no topo
    useRaceStore.getState().stepNext();
    expect(useRaceStore.getState().snapIdx).toBe(total - 1);  // não passa do fim
  });

  it('togglePlay alterna; dar play no fim recomeça do zero', () => {
    const st = useRaceStore.getState();
    st.run(1);
    const total = useRaceStore.getState().result!.sectorSnapshots.length;
    useRaceStore.getState().setSnap(total - 1);
    useRaceStore.getState().togglePlay();                     // play no fim
    expect(useRaceStore.getState().playing).toBe(true);
    expect(useRaceStore.getState().snapIdx).toBe(0);          // reiniciou
  });

  it('stepFaster/stepSlower andam na lista de velocidades e param nas pontas', () => {
    const slow = SPEED_VALUES[0], fast = SPEED_VALUES[SPEED_VALUES.length - 1];
    useRaceStore.getState().setSpeed(slow);
    useRaceStore.getState().stepSlower();
    expect(useRaceStore.getState().speedMs).toBe(slow);       // já no mais lento
    useRaceStore.getState().stepFaster();
    expect(useRaceStore.getState().speedMs).toBe(SPEED_VALUES[1]);
    useRaceStore.getState().setSpeed(fast);
    useRaceStore.getState().stepFaster();
    expect(useRaceStore.getState().speedMs).toBe(fast);       // já no mais rápido
  });

  it('reset limpa o estado da corrida', () => {
    useRaceStore.getState().run(1);
    useRaceStore.getState().reset();
    const s = useRaceStore.getState();
    expect(s.result).toBeNull();
    expect(s.snapIdx).toBe(0);
    expect(s.playing).toBe(false);
    expect(s.lights).toBeNull();
  });

  it('setLights / ranking / selected', () => {
    const st = useRaceStore.getState();
    st.setLights(3); expect(useRaceStore.getState().lights).toBe(3);
    st.openRanking(); expect(useRaceStore.getState().showRanking).toBe(true);
    st.closeRanking(); expect(useRaceStore.getState().showRanking).toBe(false);
    st.setSelected('VER'); expect(useRaceStore.getState().selected).toBe('VER');
  });

  it('setters simples: trackKey, speed, playing; togglePlay no meio só pausa', () => {
    const st = useRaceStore.getState();
    st.setTrackKey('monaco'); expect(useRaceStore.getState().trackKey).toBe('monaco');
    st.setSpeed(300); expect(useRaceStore.getState().speedMs).toBe(300);
    st.setPlaying(true); expect(useRaceStore.getState().playing).toBe(true);
    // togglePlay no meio da corrida (não no fim) apenas pausa, sem reiniciar snapIdx
    st.run(1);
    useRaceStore.getState().setSnap(5);
    useRaceStore.getState().setPlaying(true);
    useRaceStore.getState().togglePlay();
    expect(useRaceStore.getState().playing).toBe(false);
    expect(useRaceStore.getState().snapIdx).toBe(5);
  });
});
