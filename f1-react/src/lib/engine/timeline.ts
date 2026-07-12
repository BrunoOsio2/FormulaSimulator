import type { Track, TimelineEvent } from './types';
import { RNG } from './rng';
import { MINI_PER_SECTOR, accuracyWindow, miniSectorModifier } from './skills';

// ─── Timeline por piloto ───────────────────────────────────────────────────────
// Pré-computa todos os eventos de conclusão de mini-setor de um piloto na corrida
// (TOTAL_LAPS × 3 × 9). Cada evento guarda o tempo absoluto de corrida em que o
// mini-setor foi completado.
//   startOffset — instante de largada (s): P1 larga em 0, cada posição de grid
//   um pouco atrás. Só desloca o tempo absoluto; não conta como tempo de volta.
export function computeTimeline(code: string, baseMini: number[], track: Track, seed: number, startOffset = 0): TimelineEvent[] {
  const rng        = new RNG(seed);
  const TOTAL_LAPS = track.laps;
  const events: TimelineEvent[] = [];

  let totalTime  = startOffset;
  let lapElapsed = 0;

  for (let lap = 0; lap < TOTAL_LAPS; lap++) {
    const lapSectorTimes: (number | null)[] = [null, null, null];
    const lapMiniTimes: number[][] = [[], [], []];

    for (let sector = 0; sector < 3; sector++) {
      let sectorTime = 0;
      const miniTimes: number[] = [];

      for (let ms = 0; ms < MINI_PER_SECTOR; ms++) {
        const type      = track.miniSectors[sector][ms];
        const window    = accuracyWindow(code, track.variation / MINI_PER_SECTOR);
        const variation = rng.range(-window, window);
        const skill     = miniSectorModifier(code, type, track);
        const miniTime  = baseMini[sector] * (1 + variation) * skill;

        sectorTime += miniTime;
        lapElapsed += miniTime;
        totalTime  += miniTime;
        miniTimes.push(miniTime);

        const isLastMini = ms === MINI_PER_SECTOR - 1;
        const isLapEnd   = isLastMini && sector === 2;

        if (isLastMini) {
          lapSectorTimes[sector] = sectorTime;
          lapMiniTimes[sector]   = [...miniTimes];
        }

        events.push({
          time:        totalTime,
          lap,
          sector,
          miniSector:  ms,
          miniTime,
          isSectorEnd: isLastMini,
          isLapEnd,
          sectorTime:  isLastMini ? sectorTime : null,
          lapTime:     isLapEnd ? lapElapsed : null,
          curMiniSoFar:   miniTimes.slice(),
          lapSectorTimes: [...lapSectorTimes],
          lapMiniTimes:   lapMiniTimes.map(a => [...a]),
        });
      }

      if (sector === 2) lapElapsed = 0;
    }
  }

  return events;
}
