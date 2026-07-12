// ─── Tráfego + ultrapassagem (C2 + C1) ───────────────────────────────────────
// Passe de resolução determinístico sobre as timelines LIMPAS.
//
// C2 (tráfego): um carro que alcança outro mais lento fica preso atrás e forma
// trenzinho (car-following) — não atravessa.
// C1 (ultrapassagem): quando um seguidor genuinamente MAIS RÁPIDO está preso e
// cruza a linha de largada (1 tentativa por volta), pode tentar passar. A decisão
// vem de fora via `tryPass` (o motor injeta skills+RNG). Sucesso → o atacante
// "solta" e passa a andar no próprio ritmo limpo (cruza à frente); falha →
// continua preso a MIN_GAP até a próxima volta.
//
// Para saber se o seguidor é REALMENTE mais rápido (e não só colado por inércia),
// mantemos em paralelo o tempo LIMPO acumulado de cada carro (ct) — o quando ele
// cruzaria cada marca sozinho. É esse tempo que revela quem tem pace para passar.

export const MIN_GAP = 0.35;      // s — distância mínima atrás do carro da frente
const MINI_PER_LAP = 27;          // 3 setores × 9 minis

// tryPass(attackerIdx, defenderIdx, lap) → true se o atacante passa nesta volta.
export type TryPass = (attacker: number, defender: number, lap: number) => boolean;

export function resolveTraffic(
  clean: number[][],
  startOffsets: number[],
  minGap = MIN_GAP,
  tryPass?: TryPass,
): number[][] {
  const n = clean.length;
  const total = clean.map(c => c.length);
  const dist = new Array<number>(n).fill(0);
  const attemptedLap = new Array<number>(n).fill(-1);      // 1 tentativa/volta
  const passedPred = new Array<number>(n).fill(-1);        // predecessor que já passou nesta perseguição

  // rt[p][d] = tempo REAL (com tráfego) ao completar d minis; rt[p][0] = largada.
  const rt: number[][] = clean.map((c, p) => {
    const a = new Array<number>(c.length + 1);
    a[0] = startOffsets[p];
    return a;
  });
  // ct[p][d] = tempo LIMPO acumulado (sem tráfego) ao completar d minis.
  const ct: number[][] = clean.map((c, p) => {
    const a = new Array<number>(c.length + 1);
    a[0] = startOffsets[p];
    for (let k = 0; k < c.length; k++) a[k + 1] = a[k] + c[k];
    return a;
  });

  const order = new Array<number>(n);

  while (true) {
    for (let p = 0; p < n; p++) order[p] = p;
    order.sort((a, b) => {
      if (dist[a] !== dist[b]) return dist[b] - dist[a];   // maior dist = à frente
      const ra = rt[a][dist[a]], rb = rt[b][dist[b]];
      if (ra !== rb) return ra - rb;                       // chegou antes = à frente
      return a - b;
    });

    let best = -1, bestTime = Infinity;
    for (let oi = 0; oi < n; oi++) {
      const p = order[oi];
      if (dist[p] >= total[p]) continue;
      const m = dist[p] + 1;
      const pred = oi > 0 ? order[oi - 1] : -1;
      if (pred !== -1 && dist[pred] < m) continue;         // preso: espera o da frente

      const tClean = rt[p][dist[p]] + clean[p][dist[p]];   // quando P completaria m a partir de agora
      let tFinal = tClean;

      if (pred !== -1) {
        const held = rt[pred][m] + minGap;
        // Genuinamente mais rápido? Comparar o tempo LIMPO acumulado dos dois na
        // marca m: se P (sozinho) cruzaria m antes do pred (sozinho), tem pace.
        const fasterByPace = ct[p][m] < ct[pred][m];
        const wouldBeHeld = tClean < held;                 // encostou no da frente

        if (wouldBeHeld && fasterByPace) {
          const lap = Math.floor((m - 1) / MINI_PER_LAP);
          const attemptPoint = m % MINI_PER_LAP === 0;     // cruzando a linha de largada
          let passed = passedPred[p] === pred;             // já passou este pred? segue solto
          if (!passed && tryPass && attemptPoint && attemptedLap[p] !== lap) {
            attemptedLap[p] = lap;
            passed = tryPass(p, pred, lap);
            if (passed) passedPred[p] = pred;
          }
          tFinal = passed ? tClean : held;                 // passou → ritmo limpo; senão → preso
        } else if (wouldBeHeld) {
          tFinal = held;                                   // mais lento/igual: só segura o gap
        }
      }

      if (tFinal < bestTime) { bestTime = tFinal; best = p; }
    }
    if (best === -1) break;

    rt[best][dist[best] + 1] = bestTime;
    dist[best]++;
  }

  return rt.map(a => a.slice(1));
}
