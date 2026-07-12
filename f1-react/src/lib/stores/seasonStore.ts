import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { RaceRecord } from './raceRecord';

// ─── Store da temporada ──────────────────────────────────────────────────────
// Histórico persistido (localStorage) dos resultados de corrida. Separado do
// estado da corrida atual (que segue no App.tsx). Base para campeonato/carreira.

interface SeasonState {
  results: RaceRecord[];
  addResult: (r: Omit<RaceRecord, 'id'>) => void; // atribui id sequencial
  clear: () => void;                               // reseta a temporada
}

// Fora do browser (testes em node) não há localStorage → usa um no-op silencioso
// para evitar os warnings do middleware persist. No browser, persiste de verdade.
// Storage do persist: usa localStorage no browser; fora dele (testes em node),
// um Map em memória — evita os warnings do middleware e mantém o store funcional.
const memory = new Map<string, string>();
const memoryStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, v); },
  removeItem: (k: string) => { memory.delete(k); },
};
const storage = createJSONStorage(() =>
  typeof localStorage !== 'undefined' ? localStorage : memoryStorage,
);

export const useSeasonStore = create<SeasonState>()(
  persist(
    (set) => ({
      results: [],
      addResult: (r) =>
        set((s) => ({ results: [...s.results, { ...r, id: s.results.length + 1 }] })),
      clear: () => set({ results: [] }),
    }),
    { name: 'f1.season', storage },
  ),
);
