import type { RaceResult } from '../engine/types';

// ─── Registro de corrida (o que é salvo na temporada) ────────────────────────
// Deriva um RaceRecord (serializável, sem funções/objetos pesados) do RaceResult.
// Puro e testável — a data vem de fora (não usar Date.now aqui).

export interface ResultRow {
  pos: number;                 // 1..N (posição final)
  startPos: number;            // 1..N (posição de largada / grid)
  code: string;
  gapToLeader: number;         // s (0 para o vencedor)
  bestLapTime: number | null;  // melhor volta do piloto
}

export interface RaceRecord {
  id: number;                  // sequencial, atribuído pelo store
  trackKey: string;
  trackName: string;
  date: string;                // ISO string (passada de fora)
  seed?: number;               // seed da corrida (reprodutibilidade — I1)
  classification: ResultRow[];
  fastestLap: { code: string; time: number } | null;
}

// finalState já vem ordenado por tempo (líder primeiro). Mapeia para a
// classificação salva + acha a volta mais rápida da corrida.
export function buildRaceRecord(
  result: RaceResult,
  trackKey: string,
  dateISO: string,
  seed?: number,
): Omit<RaceRecord, 'id'> {
  // Posição de largada: timelines está em ordem de grid (índice+1 = grid).
  const startByCode: Record<string, number> = {};
  result.timelines.forEach((t, i) => { startByCode[t.code] = i + 1; });

  const classification: ResultRow[] = result.finalState.map((d, i) => ({
    pos: i + 1,
    startPos: startByCode[d.code] ?? i + 1,
    code: d.code,
    gapToLeader: d.gapToLeader,
    bestLapTime: d.bestLapTime,
  }));

  let fastestLap: { code: string; time: number } | null = null;
  for (const d of result.finalState) {
    if (d.bestLapTime != null && (fastestLap === null || d.bestLapTime < fastestLap.time)) {
      fastestLap = { code: d.code, time: d.bestLapTime };
    }
  }

  return {
    trackKey,
    trackName: result.track.name,
    date: dateISO,
    seed,
    classification,
    fastestLap,
  };
}
