// ─── Tráfego / dirty air (C2) ────────────────────────────────────────────────
// Passe de resolução determinístico sobre as timelines LIMPAS: um carro que
// alcança outro mais lento fica preso atrás (não passa — ultrapassagem é o C1,
// futuro). Puro (sem RNG) → não afeta o determinismo por seed nem a paridade.
//
// Modelo (car-following, sem ultrapassagem):
//   - Cada carro avança um mini-setor por vez até completar todos.
//   - A cada passo, ordena os carros pela posição na pista (distância + tempo);
//     o predecessor imediato de um carro é o que está logo à frente.
//   - Um carro só pode avançar para a marca `m` se seu predecessor JÁ cruzou `m`
//     (senão espera — não pode passar por cima dele). Ao avançar, seu tempo é
//     `max(tempo limpo, tempo do predecessor em m + MIN_GAP)` → forma trenzinho.
//   - Escolhe sempre o carro elegível que chega mais cedo → sem deadlock, todos
//     completam (o líder da pista nunca tem predecessor, sempre anda livre).

export const MIN_GAP = 0.35; // s — distância mínima que o tráfego força atrás do carro da frente

// clean[p][k]     = duração LIMPA do k-ésimo mini do piloto p (event.miniTime)
// startOffsets[p] = instante de largada de p (grid)
// Retorna resolved[p][k] = tempo absoluto em que p COMPLETA o k-ésimo mini,
// já respeitando o tráfego. Mesma forma de clean.
export function resolveTraffic(
  clean: number[][],
  startOffsets: number[],
  minGap = MIN_GAP,
): number[][] {
  const n = clean.length;
  const total = clean.map(c => c.length);
  const dist = new Array<number>(n).fill(0);         // minis já completados por piloto
  // rt[p][d] = tempo ao completar d minis; rt[p][0] = largada. length = total+1.
  const rt: number[][] = clean.map((c, p) => {
    const a = new Array<number>(c.length + 1);
    a[0] = startOffsets[p];
    return a;
  });

  // buffer de ordenação reutilizado
  const order = new Array<number>(n);

  while (true) {
    // Ordem de pista: mais distância à frente; empate → chegou antes (menor rt);
    // empate final → índice (determinístico).
    for (let p = 0; p < n; p++) order[p] = p;
    order.sort((a, b) => {
      if (dist[a] !== dist[b]) return dist[b] - dist[a];        // maior dist = à frente
      const ra = rt[a][dist[a]], rb = rt[b][dist[b]];
      if (ra !== rb) return ra - rb;                            // chegou antes = à frente
      return a - b;
    });

    // Escolhe o carro elegível (predecessor já cruzou a marca m) que chega mais cedo.
    let best = -1, bestTime = Infinity;
    for (let oi = 0; oi < n; oi++) {
      const p = order[oi];
      if (dist[p] >= total[p]) continue;                       // já terminou
      const m = dist[p] + 1;
      const pred = oi > 0 ? order[oi - 1] : -1;                // predecessor imediato
      // elegível se não tem predecessor OU o predecessor já cruzou a marca m
      if (pred !== -1 && dist[pred] < m) continue;             // preso: espera o da frente
      const tClean = rt[p][dist[p]] + clean[p][dist[p]];
      const tFinal = pred !== -1
        ? Math.max(tClean, rt[pred][m] + minGap)               // segura atrás do predecessor
        : tClean;                                              // líder da pista: livre
      if (tFinal < bestTime) { bestTime = tFinal; best = p; }
    }
    if (best === -1) break;                                    // todos terminaram

    rt[best][dist[best] + 1] = bestTime;
    dist[best]++;
  }

  return rt.map(a => a.slice(1)); // descarta a largada (índice 0)
}
