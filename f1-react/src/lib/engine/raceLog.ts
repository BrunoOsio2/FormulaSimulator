import type { RaceResult, DriverCode } from './types';
import { PHASE_LAPS } from './momentum';
import type { Compound } from './tyres';

// ─── Log por piloto (dashboard de detalhes) ──────────────────────────────────
// Extrai do RaceResult tudo que as 3 tabs do dashboard precisam. Puro/testável.

export interface LapRow {
  lap: number;                    // 1-based
  lapTime: number | null;
  sectors: (number | null)[];     // [s1, s2, s3]
  compound: Compound;
  momentum: number;               // -2..+2 da fase
}
export interface OvertakeRow { lap: number; kind: 'passou' | 'ultrapassado'; rival: DriverCode; }
export interface PitRow { lap: number; toCompound: Compound; }
export interface IncidentRow { lap: number; type: 'light' | 'vsc' | 'sc'; }

export interface DriverLog {
  code: DriverCode;
  laps: LapRow[];
  overtakes: OvertakeRow[];       // sem os ocorridos sob safety car
  pits: PitRow[];
  incidents: IncidentRow[];
}

// composto vigente numa volta, pela estratégia (stints).
function compoundAtLap(stints: RaceResult['strategies'][string], lap: number): Compound {
  for (const st of stints) if (lap >= st.startLap && lap < st.endLap) return st.compound;
  return stints[stints.length - 1].compound;
}

// upToLap (0-based) limita o log às voltas JÁ decorridas no playback — o dashboard
// ao vivo não deve mostrar voltas/eventos futuros (spoiler). Infinity = corrida toda
// (resumo final). Um evento/volta entra se sua volta (0-based) <= upToLap.
export function driverLog(result: RaceResult, code: DriverCode, upToLap = Infinity): DriverLog {
  const tl = result.timelines.find(t => t.code === code);
  const stints = result.strategies[code] ?? [];
  const mom = result.momentumByCode[code] ?? [];

  // ── Voltas: um LapRow por evento isLapEnd (só as já decorridas) ──
  const laps: LapRow[] = [];
  if (tl) {
    for (const ev of tl.events) {
      if (!ev.isLapEnd) continue;
      const lap0 = ev.lap;               // 0-based
      if (lap0 > upToLap) break;         // volta futura → para
      laps.push({
        lap: lap0 + 1,
        lapTime: ev.lapTime,
        sectors: [...ev.lapSectorTimes],
        compound: compoundAtLap(stints, lap0),
        momentum: mom[Math.floor(lap0 / PHASE_LAPS)] ?? 0,
      });
    }
  }

  // ── Ultrapassagens (sem caution): fez (passou) ou sofreu (ultrapassado) ──
  const overtakes: OvertakeRow[] = [];
  for (const o of result.overtakes) {
    if (o.caution || o.lap > upToLap) continue;   // ignora sob SC e voltas futuras
    if (o.passer === code) overtakes.push({ lap: o.lap + 1, kind: 'passou', rival: o.passed });
    else if (o.passed === code) overtakes.push({ lap: o.lap + 1, kind: 'ultrapassado', rival: o.passer });
  }
  overtakes.sort((a, b) => a.lap - b.lap);

  // ── Pit stops: fim de cada stint (exceto o último) → troca de composto ──
  // (só os que já aconteceram: a parada ocorre na última volta do stint)
  const pits: PitRow[] = [];
  for (let s = 0; s < stints.length - 1; s++) {
    if (stints[s].endLap - 1 > upToLap) break;
    pits.push({ lap: stints[s].endLap, toCompound: stints[s + 1].compound });
  }

  // ── Incidentes do piloto (só os já decorridos) ──
  const incidents: IncidentRow[] = result.incidents
    .filter(i => i.code === code && i.lap <= upToLap)
    .map(i => ({ lap: i.lap + 1, type: i.type }));

  return { code, laps, overtakes, pits, incidents };
}
