import type { Track, TimelineEvent } from './types';
import { RNG } from './rng';
import { MINI_PER_SECTOR, accuracyWindow, miniSectorModifier } from './skills';
import { miniMistakeLoss } from './mistakes';
import { momentumAtLap, mistakeMultiplier, paceDeltaPerMini, type MomentumLevel } from './momentum';

// ─── Timeline por piloto ───────────────────────────────────────────────────────
// Pré-computa todos os eventos de conclusão de mini-setor de um piloto na corrida
// (TOTAL_LAPS × 3 × 9). Cada evento guarda o tempo absoluto de corrida em que o
// mini-setor foi completado.
//   startOffset — instante de largada (s): P1 larga em 0, cada posição de grid
//   um pouco atrás. Só desloca o tempo absoluto; não conta como tempo de volta.
//   mistakeRng — RNG opcional para erros de pilotagem (C5). Se ausente, sem erros
//   (mantém a paridade com o motor antigo, que não os tinha).
//   momentum — série de forma por fase (C6). Se ausente, sem efeito de momentum.
export function computeTimeline(
  code: string, baseMini: number[], track: Track, seed: number,
  startOffset = 0, mistakeRng?: RNG, momentum?: MomentumLevel[],
): TimelineEvent[] {
  const rng        = new RNG(seed);
  const TOTAL_LAPS = track.laps;
  const events: TimelineEvent[] = [];

  let totalTime  = startOffset;
  let lapElapsed = 0;

  for (let lap = 0; lap < TOTAL_LAPS; lap++) {
    const lapSectorTimes: (number | null)[] = [null, null, null];
    const lapMiniTimes: number[][] = [[], [], []];
    // momentum vigente nesta volta: ajusta ritmo e chance de erro (C6)
    const level = momentum ? momentumAtLap(momentum, lap) : 0;
    const paceDelta = momentum ? paceDeltaPerMini(level) : 0;
    const mistMul = momentum ? mistakeMultiplier(level) : 1;

    for (let sector = 0; sector < 3; sector++) {
      let sectorTime = 0;
      const miniTimes: number[] = [];

      for (let ms = 0; ms < MINI_PER_SECTOR; ms++) {
        const type      = track.miniSectors[sector][ms];
        const window    = accuracyWindow(code, track.variation / MINI_PER_SECTOR);
        const variation = rng.range(-window, window);
        const skill     = miniSectorModifier(code, type, track);
        // erro de pilotagem (C5), modulado por control e por momentum (C6).
        const mistake   = mistakeRng ? miniMistakeLoss(code, track, mistakeRng, mistMul) : 0;
        // ritmo base + variação + skill + erro + ajuste de momentum (± por volta).
        const miniTime  = baseMini[sector] * (1 + variation) * skill + mistake + paceDelta;

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
