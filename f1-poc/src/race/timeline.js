// ─── Timeline por piloto ───────────────────────────────────────────────────────
// Pré-computa todos os eventos de conclusão de mini-setor de um piloto na corrida
// (TOTAL_LAPS × 3 × 9). Cada evento guarda o tempo absoluto de corrida em que o
// mini-setor foi completado, permitindo reproduzir a barra preenchendo célula a
// célula e interpolar a posição no mapa em qualquer instante.
function computeTimeline(code, baseMini, track, seed) {
  const rng        = new RNG(seed);
  const TOTAL_LAPS = track.laps;
  const events     = [];

  let totalTime  = 0;
  let lapElapsed = 0;

  for (let lap = 0; lap < TOTAL_LAPS; lap++) {
    const lapSectorTimes = [null, null, null];
    const lapMiniTimes   = [[], [], []];

    for (let sector = 0; sector < 3; sector++) {
      let sectorTime = 0;
      const miniTimes = [];

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

        // No último mini de um setor, o tempo do setor é finalizado
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
          // progresso acumulado desta volta (para exibição)
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
