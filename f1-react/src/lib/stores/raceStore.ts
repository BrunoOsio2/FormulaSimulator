import { create } from 'zustand';
import type { RaceResult } from '../engine/types';
import { runRace } from '../engine/engine';

// ─── Store da corrida atual ──────────────────────────────────────────────────
// Estado de DOMÍNIO da corrida (o que a UI mostra). Efeitos imperativos —
// timers de playback, sequência do semáforo, atalhos de teclado — ficam em
// hooks (src/hooks), NÃO aqui: store reativa não é lugar de setInterval/rAF.
// Preferências trackKey/speedMs são persistidas no localStorage (subscribe abaixo).

export const SPEEDS = [
  { v: 600, label: 'Muito lento (0.6s/mini)' },
  { v: 300, label: 'Lento (0.3s/mini)' },
  { v: 150, label: 'Normal (0.15s/mini)' },
  { v: 80,  label: 'Rápido (0.08s/mini)' },
  { v: 30,  label: 'Muito rápido' },
];
// Ordenado do mais LENTO (maior ms) ao mais RÁPIDO (menor ms), para os botões +/-.
export const SPEED_VALUES = SPEEDS.map(s => s.v); // [600, 300, 150, 80, 30]

export interface Perf { ms: number; ticks: number; ups: number; laps: string }

// Acesso seguro ao localStorage (ausente em ambiente node/testes).
const ls = typeof localStorage !== 'undefined' ? localStorage : null;

interface RaceState {
  // domínio
  trackKey: string;
  result: RaceResult | null;
  snapIdx: number;
  playing: boolean;
  speedMs: number;
  selected: string | null;
  perf: Perf | null;
  lights: number | 'out' | null;   // semáforo: 0..5 luzes, 'out' apaga, null sem corrida
  showRanking: boolean;
  detailsCode: string | null;       // piloto aberto no dashboard de detalhes (ou null)
  seed: number;                     // seed da corrida atual (reprodutibilidade / salvar)

  // actions
  setTrackKey: (k: string) => void;
  run: (seed?: number) => void;     // gera a corrida (não dispara timers — isso é do hook)
  reset: () => void;
  setSnap: (i: number) => void;
  stepNext: () => void;
  stepPrev: () => void;
  togglePlay: () => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (ms: number) => void;
  stepFaster: () => void;
  stepSlower: () => void;
  setSelected: (code: string | null) => void;
  setLights: (l: number | 'out' | null) => void;
  openRanking: () => void;
  closeRanking: () => void;
  openDetails: (code: string) => void;
  closeDetails: () => void;
}

const total = (r: RaceResult | null) => (r ? r.sectorSnapshots.length : 0);

export const useRaceStore = create<RaceState>((set, get) => ({
  trackKey: ls?.getItem('f1.track') || 'interlagos',
  result: null,
  snapIdx: 0,
  playing: false,
  speedMs: Number(ls?.getItem('f1.speed')) || 80,
  selected: null,
  perf: null,
  lights: null,
  showRanking: false,
  detailsCode: null,
  seed: 0,

  setTrackKey: (k) => set({ trackKey: k }),

  run: (seed) => {
    const s = seed ?? Math.floor(Math.random() * 0xFFFFFFFF);
    const { trackKey } = get();
    const t0 = performance.now();
    const r = runRace(trackKey, s);
    const ms = performance.now() - t0;
    const ticks = r.track.laps * 3 * 9;
    set({
      result: r, snapIdx: 0, playing: false, seed: s,
      perf: {
        ms, ticks, ups: Math.round(ticks / (ms / 1000)),
        laps: `${r.track.laps} voltas · ${r.sectorSnapshots.length} setores`,
      },
    });
  },

  reset: () => set({
    result: null, snapIdx: 0, playing: false, perf: null,
    selected: null, showRanking: false, lights: null, detailsCode: null,
  }),

  setSnap: (i) => {
    const max = total(get().result) - 1;
    set({ snapIdx: Math.max(0, Math.min(max, i)) });
  },
  stepNext: () => {
    const max = total(get().result) - 1;
    set(st => ({ snapIdx: Math.min(max, st.snapIdx + 1) }));
  },
  stepPrev: () => set(st => ({ snapIdx: Math.max(0, st.snapIdx - 1) })),

  togglePlay: () => set(st => {
    const atEnd = st.snapIdx >= total(st.result) - 1;
    // ao dar play no fim, recomeça do zero
    return { playing: !st.playing, snapIdx: !st.playing && atEnd ? 0 : st.snapIdx };
  }),
  setPlaying: (p) => set({ playing: p }),

  setSpeed: (ms) => set({ speedMs: ms }),
  stepFaster: () => set(st => {
    const i = SPEED_VALUES.indexOf(st.speedMs);
    return i >= 0 && i < SPEED_VALUES.length - 1 ? { speedMs: SPEED_VALUES[i + 1] } : {};
  }),
  stepSlower: () => set(st => {
    const i = SPEED_VALUES.indexOf(st.speedMs);
    return i > 0 ? { speedMs: SPEED_VALUES[i - 1] } : {};
  }),

  setSelected: (code) => set({ selected: code }),
  setLights: (l) => set({ lights: l }),
  openRanking: () => set({ showRanking: true }),
  closeRanking: () => set({ showRanking: false }),
  openDetails: (code) => set({ detailsCode: code }),
  closeDetails: () => set({ detailsCode: null }),
}));

// Persiste as preferências (pista/velocidade) no localStorage, como antes.
useRaceStore.subscribe((s, prev) => {
  if (s.trackKey !== prev.trackKey) ls?.setItem('f1.track', s.trackKey);
  if (s.speedMs !== prev.speedMs) ls?.setItem('f1.speed', String(s.speedMs));
});
