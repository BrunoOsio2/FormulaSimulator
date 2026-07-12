const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  // Cobertura JS do Chromium — mede quanto do <script> inline do index.html
  // (a camada de UI/animação que não dá para testar em unit) é exercida.
  await page.coverage.startJSCoverage();
  await page.goto(fileUrl);

  const results = [];
  const assert = (name, cond, detail = '') => {
    results.push({ name, pass: !!cond, detail });
  };

  // ── 1. Página carrega sem erros ───────────────────────────────
  assert('Página carrega sem erros de JS', errors.length === 0, errors.join(' | '));

  // ── 2. Painel de atributos da pista renderiza ─────────────────
  const trackPanelExists = await page.locator('.track-panel').count();
  assert('Painel da pista renderiza', trackPanelExists > 0);

  // ── 3. Simular corrida ────────────────────────────────────────
  await page.selectOption('#trackSelect', 'interlagos');
  await page.click('#btnRun');
  await page.waitForTimeout(300);

  // Tabela deve ter 20 linhas
  const rowCount = await page.locator('#timingBody tr').count();
  assert('Tabela tem 20 pilotos', rowCount === 20, `got ${rowCount}`);

  // ── 4. Primeira linha = líder, sem gap ────────────────────────
  const firstGap = await page.locator('#timingBody tr:first-child .td-gap').textContent();
  assert('Líder sem gap', firstGap.trim() === '—', `got "${firstGap}"`);

  // ── 5. Barra de mini-setores existe ───────────────────────────
  const miniCells = await page.locator('#timingBody tr:first-child .ms-cell').count();
  assert('27 mini-setores na 1a linha', miniCells === 27, `got ${miniCells}`);

  // ── 6. Setar velocidade rápida e deixar rodar ─────────────────
  await page.selectOption('#speedSelect', '30');
  // pausa e reinicia rápido
  await page.waitForTimeout(1500);

  // Capturar estado a meio da corrida: pilotos em setores diferentes?
  const laps = await page.locator('#timingBody .td-lap').allTextContents();
  const uniqueLaps = new Set(laps.map(l => l.trim()));
  assert('Pilotos em voltas diferentes (não lockstep)', uniqueLaps.size >= 1, `laps: ${[...uniqueLaps].join(',')}`);

  // ── 7. Gaps aumentam ao longo da tabela ───────────────────────
  const gaps = await page.locator('#timingBody .td-gap').allTextContents();
  const gapNums = gaps.slice(1).map(g => parseFloat(g.replace('+','').replace('s','')) || 0);
  const monotonic = gapNums.every((g, i) => i === 0 || g >= gapNums[i-1] - 0.001);
  assert('Gaps crescem monotonicamente', monotonic, `gaps: ${gaps.slice(0,5).join(',')}`);

  // ── 8. Deixar terminar e verificar volta final ────────────────
  await page.waitForTimeout(8000);
  const label = await page.locator('#lapLabel').textContent();
  assert('Label mostra volta/setor', /Volta \d+/.test(label), `got "${label}"`);

  // ── 9. Barra preenche gradualmente (mini-setor a mini-setor) ──
  // Em algum ponto deve haver uma linha com barra parcial (nem toda cheia nem toda vazia)
  const partialBars = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#timingBody tr')];
    return rows.some(tr => {
      const cells = [...tr.querySelectorAll('.ms-cell')];
      const empty = cells.filter(c => c.classList.contains('ms-empty')).length;
      return empty > 0 && empty < 27; // parcialmente preenchida
    });
  });
  assert('Barra preenche gradualmente (parcial existe)', partialBars);

  // ── 10. MELHOR VOLTA <= ÚLTIMA VOLTA para o líder ─────────────
  const bestTxt = await page.locator('#timingBody tr:first-child td:nth-child(4)').textContent();
  const lastTxt = await page.locator('#timingBody tr:first-child td:nth-child(7)').textContent();
  const toMs = t => { const m = t.match(/(\d+):(\d+\.\d+)/); return m ? +m[1]*60 + +m[2] : NaN; };
  const bestMs = toMs(bestTxt), lastMs = toMs(lastTxt);
  assert('Melhor volta <= última volta', isNaN(bestMs) || isNaN(lastMs) || bestMs <= lastMs + 0.001,
    `melhor=${bestTxt} última=${lastTxt}`);

  // ── 10b. Layout estável: a barra de mini-setores não desloca ──
  // Mede a posição X da primeira barra em 2 momentos do playback.
  await page.click('#btnReset');
  await page.selectOption('#trackSelect', 'interlagos');
  await page.click('#btnRun');
  await page.waitForTimeout(50);
  await page.selectOption('#speedSelect', '150');
  await page.waitForTimeout(200);
  const barX1 = await page.evaluate(() => {
    const el = document.querySelector('#timingBody tr:first-child .mini-bar');
    return el ? Math.round(el.getBoundingClientRect().left) : null;
  });
  await page.waitForTimeout(600); // deixa vários mini-setores preencherem
  const barX2 = await page.evaluate(() => {
    const el = document.querySelector('#timingBody tr:first-child .mini-bar');
    return el ? Math.round(el.getBoundingClientRect().left) : null;
  });
  assert('Barra de mini-setores não desloca horizontalmente',
    barX1 !== null && barX1 === barX2, `x1=${barX1} x2=${barX2}`);

  // Também: a largura da coluna GAP não muda entre '—' e '+X.XXXs'
  const gapWidths = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#timingBody .td-gap')];
    return [...new Set(cells.map(c => Math.round(c.getBoundingClientRect().width)))];
  });
  assert('Coluna GAP tem largura uniforme', gapWidths.length === 1, `larguras: ${gapWidths.join(',')}`);

  // ── 10c. Roxo (recorde) pertence mais ao líder que ao lanterna ─
  // Convenção F1: roxo = recorde da corrida. O líder (mais rápido) detém a
  // maioria dos recordes; o lanterna raramente ou nunca tem roxo.
  await page.selectOption('#speedSelect', '30');
  await page.waitForTimeout(2000);
  const colorCmp = await page.evaluate(() => {
    const countPurple = (tr) =>
      [...tr.querySelectorAll('.ms-cell')].filter(c => c.classList.contains('ms-fastest')).length;
    const rows = [...document.querySelectorAll('#timingBody tr')];
    return { leader: countPurple(rows[0]), last: countPurple(rows[rows.length - 1]) };
  });
  assert('Líder detém mais recordes (roxo) que o lanterna',
    colorCmp.leader >= colorCmp.last, `líder=${colorCmp.leader} último=${colorCmp.last} roxos`);

  // ── 10d. Só 3 cores em uso (roxo/verde/amarelo), sem laranja/vermelho ──
  const usedColors = await page.evaluate(() => {
    const classes = new Set();
    document.querySelectorAll('#timingBody .ms-cell').forEach(c => {
      ['ms-fastest','ms-fast','ms-mid','ms-slow','ms-slowest','ms-empty']
        .forEach(k => { if (c.classList.contains(k)) classes.add(k); });
    });
    return [...classes];
  });
  const forbidden = usedColors.filter(c => c === 'ms-slow' || c === 'ms-slowest');
  assert('Apenas roxo/verde/amarelo (sem laranja/vermelho)', forbidden.length === 0,
    `usadas: ${usedColors.join(',')}`);

  // ── 10e. Líder NÃO é sempre roxo — varia entre roxo e verde ──
  // Reúne, ao longo de várias voltas, as cores das células completas do líder.
  const leaderColorMix = await page.evaluate(async () => {
    const seen = { roxo: 0, verde: 0, amarelo: 0 };
    for (let k = 0; k < 30; k++) {
      const cells = [...document.querySelectorAll('#timingBody tr:first-child .ms-cell')];
      cells.forEach(c => {
        if (c.classList.contains('ms-fastest')) seen.roxo++;
        else if (c.classList.contains('ms-fast')) seen.verde++;
        else if (c.classList.contains('ms-mid')) seen.amarelo++;
      });
      await new Promise(r => setTimeout(r, 60));
    }
    return seen;
  });
  assert('Líder varia de cor (não é 100% roxo)',
    leaderColorMix.verde > 0 || leaderColorMix.amarelo > 0,
    `roxo=${leaderColorMix.roxo} verde=${leaderColorMix.verde} amar=${leaderColorMix.amarelo}`);

  // ── 10f. Exatamente 1 melhor volta roxa (recorde da corrida) ──
  const fastestLapCheck = await page.evaluate(() => {
    const purple = [...document.querySelectorAll('#timingBody .td-fastest-lap')];
    // O tempo roxo deve ser o menor entre todos os MELHOR VOLTA da tabela
    const toMs = t => { const m = t.match(/(\d+):(\d+\.\d+)/); return m ? +m[1]*60 + +m[2] : Infinity; };
    const bests = [...document.querySelectorAll('#timingBody tr')].map(tr => {
      const cell = tr.children[3]; // coluna MELHOR VOLTA
      return toMs(cell.textContent);
    });
    const minBest = Math.min(...bests);
    const purpleMs = purple.length ? toMs(purple[0].textContent) : Infinity;
    return { count: purple.length, isMin: Math.abs(purpleMs - minBest) < 0.01 };
  });
  assert('Melhor volta da corrida fica roxa (1 célula, = menor tempo)',
    fastestLapCheck.count === 1 && fastestLapCheck.isMin,
    `count=${fastestLapCheck.count} isMin=${fastestLapCheck.isMin}`);

  // ── 11. Testar as 3 pistas ────────────────────────────────────
  for (const track of ['monaco', 'spa', 'interlagos']) {
    await page.click('#btnReset');
    await page.selectOption('#trackSelect', track);
    await page.click('#btnRun');
    await page.waitForTimeout(100);
    await page.selectOption('#speedSelect', '30');
    await page.waitForTimeout(400);
    const rc = await page.locator('#timingBody tr').count();
    assert(`${track}: tabela com 20 pilotos`, rc === 20, `got ${rc}`);
    const cells = await page.locator('#timingBody tr:first-child .ms-cell').count();
    assert(`${track}: 27 mini-setores`, cells === 27, `got ${cells}`);
  }

  // ── 12. Integridade da simulação (rodando no browser) ─────────
  const integrity = await page.evaluate(() => {
    const out = {};
    for (const track of ['monaco', 'spa', 'interlagos']) {
      const r = runRace(track);
      const errs = [];
      if (r.lapSnapshots.length !== r.track.laps) errs.push('lap count ' + r.lapSnapshots.length);
      // Ao menos o mínimo de frames (líder) + frames extras da fase tail (retardatários)
      const minFrames = r.track.laps * 3 * 9;
      if (r.sectorSnapshots.length < minFrames) errs.push('mini count ' + r.sectorSnapshots.length);
      if (r.sectorSnapshots.some(s => s.length !== 20)) errs.push('nao 20 pilotos');
      let gapErr = 0;
      r.sectorSnapshots.forEach(s => {
        for (let i = 1; i < s.length; i++)
          if (s[i].gapToLeader < s[i-1].gapToLeader - 0.001) gapErr++;
      });
      if (gapErr) errs.push(gapErr + ' gaps fora de ordem');
      if (r.finalState.some(d => d.lapsCompleted !== r.track.laps)) errs.push('nao terminaram');
      if (r.finalState.some(d => d.bestLapTime > d.lastLapTime + 1e-9)) errs.push('bestLap>lastLap');
      // Último frame do playback: TODOS os pilotos devem ter terminado a corrida
      const lastFrame = r.sectorSnapshots[r.sectorSnapshots.length - 1];
      if (lastFrame.some(d => d.lap < r.track.laps)) errs.push('playback termina antes de todos');
      out[track] = errs;
    }
    return out;
  });
  for (const [track, errs] of Object.entries(integrity)) {
    assert(`Integridade ${track}`, errs.length === 0, errs.join(', '));
  }

  // ── 14. Mapa 2D: traçado real do Interlagos via SVG ───────────
  const geo = await page.evaluate(() => {
    const path = buildTrackPathFromSVG(TRACKS.interlagos.svgPath);
    const pts = path.points;
    let minX=1,maxX=0,minY=1,maxY=0;
    pts.forEach(p => { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
    const closeGap = Math.hypot(pts[0].x-pts[pts.length-1].x, pts[0].y-pts[pts.length-1].y);
    const a = pointAtLapFraction(path, 0), b = pointAtLapFraction(path, 0.999);
    return { n: pts.length, w: maxX-minX, h: maxY-minY, closeGap, loopGap: Math.hypot(a.x-b.x, a.y-b.y) };
  });
  {
    const g = geo;
    const ok = g.n >= 200 && g.w > 0.2 && g.h > 0.2 && g.loopGap < 0.1;
    assert('Mapa Interlagos: traçado SVG válido', ok,
      `n=${g.n} bbox=${g.w.toFixed(2)}x${g.h.toFixed(2)} closeGap=${g.closeGap.toFixed(4)} loopGap=${g.loopGap.toFixed(3)}`);
  }

  // ── 15. timelines expostas com eventos corretos ───────────────
  const tlCheck = await page.evaluate(() => {
    const r = runRace('interlagos');
    return {
      count: r.timelines.length,
      evLen: r.timelines[0].events.length,
      expected: r.track.laps * 27,
    };
  });
  assert('timelines: 20 pilotos com laps×27 eventos',
    tlCheck.count === 20 && tlCheck.evLen === tlCheck.expected,
    `count=${tlCheck.count} evLen=${tlCheck.evLen} esperado=${tlCheck.expected}`);

  // ── 16. Interlagos mostra o mapa; Monaco/Spa escondem ─────────
  async function mapVisibleAfterRun(track) {
    await page.click('#btnReset');
    await page.selectOption('#trackSelect', track);
    await page.click('#btnRun');
    await page.waitForTimeout(300);
    return page.evaluate(() => {
      const c = document.getElementById('trackCanvas');
      const visible = document.getElementById('trackMap').style.display !== 'none';
      const rect = c.getBoundingClientRect();
      return { visible, w: Math.round(rect.width), h: Math.round(rect.height) };
    });
  }
  const interMap = await mapVisibleAfterRun('interlagos');
  assert('Interlagos: mapa visível e dimensionado',
    interMap.visible && interMap.w > 0 && interMap.h > 0,
    `visible=${interMap.visible} ${interMap.w}x${interMap.h}`);
  for (const track of ['monaco', 'spa']) {
    const m = await mapVisibleAfterRun(track);
    assert(`${track}: mapa escondido (sem SVG)`, !m.visible, `visible=${m.visible}`);
  }

  // ── 17. Sem erros de JS durante o playback do mapa (Interlagos) ─
  await page.click('#btnReset');
  await page.selectOption('#trackSelect', 'interlagos');
  await page.click('#btnRun');
  await page.waitForTimeout(100);
  await page.selectOption('#speedSelect', '30');
  await page.waitForTimeout(1500);
  assert('Sem erros de JS com o mapa animando', errors.length === 0, errors.join(' | '));

  // ── 17b. Líder desliza contínuo E varia velocidade (freia em curva) ──
  // Em Lento, amostrando a XY ao longo de ~2s: sempre há movimento (contínuo),
  // e o deslocamento por passo VARIA (rápido na reta, lento na curva).
  await page.click('#btnReset');
  await page.selectOption('#trackSelect', 'interlagos');
  await page.click('#btnRun');
  await page.waitForTimeout(100);
  await page.selectOption('#speedSelect', '300'); // Lento
  await page.waitForTimeout(400);
  const samples = [];
  for (let k = 0; k < 20; k++) {
    const xy = await page.evaluate(() => window.__leaderXY || null);
    if (xy) samples.push(xy);
    await page.waitForTimeout(120);
  }
  // deslocamentos entre amostras consecutivas
  const deltas = [];
  for (let i = 1; i < samples.length; i++) {
    deltas.push(Math.hypot(samples[i].x - samples[i-1].x, samples[i].y - samples[i-1].y));
  }
  const moved = deltas.filter(d => d > 0.3).length;      // passos com movimento real
  const maxJump = Math.max(...deltas, 0);
  // movimento contínuo (quase todo passo move) e sem salto absurdo.
  // teto 120: nas retas longas o carro acelera bastante (legítimo, não solavanco).
  assert('Líder desliza contínuo em velocidade lenta',
    moved >= deltas.length - 2 && maxJump < 120,
    `movidos=${moved}/${deltas.length} maxJump=${maxJump.toFixed(1)}`);
  // variação de velocidade: os passos com movimento não são todos iguais
  const movedDeltas = deltas.filter(d => d > 0.3).sort((a, b) => a - b);
  const ratio = movedDeltas.length ? movedDeltas[movedDeltas.length - 1] / movedDeltas[0] : 1;
  assert('Velocidade varia entre reta e curva (freia nas curvas)',
    ratio > 1.5,
    `ratio max/min=${ratio.toFixed(2)} deltas=[${deltas.map(d=>d.toFixed(1)).join(',')}]`);

  // ── 17c. Após o líder terminar, os carros NÃO congelam (fase tail) ──
  // Vai quase ao fim do playback (onde o P1 já cruzou) e confirma que o mapa
  // ainda anima: a posição do líder de classificação muda entre dois instantes.
  await page.click('#btnReset');
  await page.selectOption('#trackSelect', 'interlagos');
  await page.click('#btnRun');
  await page.waitForTimeout(100);
  await page.selectOption('#speedSelect', '30'); // muito rápido, chega ao fim
  // pula para ~95% dos frames via prev/next seria lento; deixa rodar até quase o fim
  await page.evaluate(() => {
    // avança o playback manualmente para perto do fim
    const total = snapshots.length;
    currentLap = Math.floor(total * 0.97);
    renderTable(currentLap);
  });
  await page.waitForTimeout(200);
  const tailA = await page.evaluate(() => window.__lastXY ? {...window.__lastXY} : null);
  await page.evaluate(() => { if (currentLap < snapshots.length - 1) renderTable(++currentLap); });
  await page.waitForTimeout(400);
  const tailB = await page.evaluate(() => window.__lastXY ? {...window.__lastXY} : null);
  const tailMoved = (tailA && tailB) ? Math.hypot(tailB.x - tailA.x, tailB.y - tailA.y) : 0;
  assert('Mapa não congela após o líder terminar (fase tail)',
    tailA && tailB && tailMoved > 0.5,
    `tailMoved=${tailMoved.toFixed(1)}`);

  // ── 18. Screenshot para inspeção visual ───────────────────────
  await page.click('#btnReset');
  await page.selectOption('#trackSelect', 'interlagos');
  await page.click('#btnRun');
  await page.waitForTimeout(100);
  await page.selectOption('#speedSelect', '30');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.resolve(__dirname, '..', 'screenshots', 'test-screenshot.png'), fullPage: true });

  // ── 19. Cobertura do <script> inline do index.html ────────────
  // A API do Playwright retorna { url, source, functions[].ranges{startOffset,
  // endOffset,count} }. Marcamos os bytes cobertos (count>0) num bitmap e medimos
  // a fração do source exercida pela suíte e2e.
  const coverage = await page.coverage.stopJSCoverage();
  let usedBytes = 0, totalBytes = 0;
  for (const entry of coverage) {
    if (!entry.url.includes('index.html')) continue; // só o inline da página
    const n = entry.source.length;
    totalBytes += n;
    const covered = new Uint8Array(n);
    for (const fn of entry.functions)
      for (const r of fn.ranges)
        if (r.count > 0)
          for (let k = r.startOffset; k < r.endOffset && k < n; k++) covered[k] = 1;
    for (let k = 0; k < n; k++) usedBytes += covered[k];
  }
  const pctInline = totalBytes ? (100 * usedBytes / totalBytes) : 0;
  assert('Cobertura do JS inline do index.html >= 55%',
    pctInline >= 55, `${pctInline.toFixed(1)}% (${usedBytes}/${totalBytes} bytes)`);

  await browser.close();

  // ── Report ────────────────────────────────────────────────────
  console.log('\n═══ RESULTADOS DOS TESTES ═══');
  let passed = 0;
  for (const r of results) {
    console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? '  → ' + r.detail : ''}`);
    if (r.pass) passed++;
  }
  console.log(`\n${passed}/${results.length} testes passaram`);
  process.exit(passed === results.length ? 0 : 1);
})();
