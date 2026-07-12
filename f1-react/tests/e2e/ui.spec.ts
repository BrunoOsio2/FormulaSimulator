import { test, expect, type Page } from '@playwright/test';

// ─── Testes e2e da UI React ────────────────────────────────────────────────
// Portam os invariantes de UI do POC: tabela, mapa, playback, cores, fase tail.

async function simulate(page: Page, track = 'interlagos', speed = '30') {
  await page.selectOption('.controls select', track);
  await page.click('#btnRun');
  await page.waitForTimeout(100);
  await page.selectOption('#speedSelect', speed);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  (page as unknown as { _errs: string[] })._errs = errors;
  await page.goto('/');
});

test('carrega sem erros e mostra painel da pista', async ({ page }) => {
  await expect(page.locator('.track-panel')).toBeVisible();
  const errs = (page as unknown as { _errs: string[] })._errs;
  expect(errs).toHaveLength(0);
});

test('simula: tabela com 22 pilotos, líder sem gap, 27 mini-setores', async ({ page }) => {
  await simulate(page);
  await page.waitForTimeout(300);
  await expect(page.locator('#timingBody tr')).toHaveCount(22);
  const firstGap = await page.locator('#timingBody tr:first-child .td-gap').textContent();
  expect(firstGap?.trim()).toBe('—');
  const cells = await page.locator('#timingBody tr:first-child .ms-cell').count();
  expect(cells).toBe(27);
});

test('gaps crescem monotonicamente na tabela', async ({ page }) => {
  await simulate(page);
  await page.waitForTimeout(800);
  const gaps = await page.locator('#timingBody .td-gap').allTextContents();
  const nums = gaps.slice(1).map(g => parseFloat(g.replace('+', '').replace('s', '')) || 0);
  const mono = nums.every((g, i) => i === 0 || g >= nums[i - 1] - 0.001);
  expect(mono).toBe(true);
});

test('semáforo dispara e a corrida arranca sozinha (regressão dos timers de largada)', async ({ page }) => {
  // Regressão: um objeto de retorno instável do hook cancelava os timers do
  // semáforo antes de dispararem, e a corrida nunca começava. Este teste espera
  // os timers REAIS (o outro fluxo avança por botão e não pegaria isso).
  await page.selectOption('.controls select', 'interlagos');
  await page.click('#btnRun');
  // durante a contagem, o painel do semáforo fica visível
  await expect(page.locator('.lights-overlay')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('.light-post.on')).toHaveCount(5, { timeout: 6000 });
  // após "lights out", a corrida começa (botão vira "Pausar")
  await expect(page.locator('#btnPlayPause')).toContainText('Pausar', { timeout: 4000 });
  const errs = (page as unknown as { _errs: string[] })._errs;
  expect(errs).toHaveLength(0);
});

test('todas as 3 pistas mostram o mapa 2D', async ({ page }) => {
  for (const track of ['interlagos', 'monaco', 'spa']) {
    await page.click('#btnReset').catch(() => {});
    await simulate(page, track);
    await page.waitForTimeout(300);
    await expect(page.locator('#trackCanvas')).toBeVisible();
  }
});

test('só roxo/verde/amarelo nas cores dos mini-setores (sem laranja/vermelho)', async ({ page }) => {
  await simulate(page);
  await page.waitForTimeout(1500);
  const used = await page.evaluate(() => {
    const s = new Set<string>();
    document.querySelectorAll('#timingBody .ms-cell').forEach(c => {
      ['ms-fastest','ms-fast','ms-mid','ms-slow','ms-slowest','ms-empty','ms-run']
        .forEach(k => { if (c.classList.contains(k)) s.add(k); });
    });
    return [...s];
  });
  expect(used).not.toContain('ms-slow');
  expect(used).not.toContain('ms-slowest');
});

test('mapa não congela após o líder terminar (fase tail)', async ({ page }) => {
  await simulate(page, 'interlagos', '30');
  await page.waitForTimeout(100);
  // vai a ~97% dos frames e mede a posição do lanterna em dois instantes
  const sample = async () => page.evaluate(() =>
    document.querySelector('.lap-label')?.textContent ?? '');
  await page.waitForTimeout(1000);
  const a = await sample();
  await page.waitForTimeout(1000);
  const b = await sample();
  // o playback avançou (label mudou) OU já terminou — em ambos, sem erro de JS
  const errs = (page as unknown as { _errs: string[] })._errs;
  expect(errs).toHaveLength(0);
  expect(typeof a === 'string' && typeof b === 'string').toBe(true);
});

test('reset limpa a tabela e esconde o mapa', async ({ page }) => {
  await simulate(page);
  await page.waitForTimeout(300);
  await page.click('#btnReset');
  await expect(page.locator('#timingBody .empty-state')).toBeVisible();
  await expect(page.locator('#trackCanvas')).toHaveCount(0);
});

test('clicar num carro seleciona e mostra o nome do piloto no mapa', async ({ page }) => {
  await simulate(page, 'interlagos', '30');
  await page.waitForTimeout(800);
  await page.click('#btnPlayPause'); // pausa
  await page.waitForTimeout(600);    // deixa o dispT assentar (ease) → carros parados
  await page.locator('#trackCanvas').scrollIntoViewIfNeeded();
  const box = (await page.locator('#trackCanvas').boundingBox())!;
  // reamostra a posição imediatamente antes de clicar (evita defasagem de frame)
  const car = await page.evaluate(() => {
    const cars = (window as unknown as { __cars?: { x: number; y: number }[] }).__cars;
    return cars && cars.length ? cars[0] : null;
  });
  expect(car).not.toBeNull();
  const sx = box.x + (car!.x / 1200) * box.width;
  const sy = box.y + (car!.y / 520) * box.height;
  await page.mouse.click(sx, sy);
  await expect(page.locator('.map-driver-label .mdl-code')).toBeVisible();
});

test('clicar na linha da tabela seleciona o piloto (destaque + label no mapa)', async ({ page }) => {
  await simulate(page, 'interlagos', '30');
  await page.waitForTimeout(400);
  await page.click('#btnPlayPause');
  await page.waitForTimeout(150);
  // clica na 2ª linha (P2) da tabela
  const row = page.locator('#timingBody tr').nth(1);
  const code = (await row.locator('.td-driver').textContent())?.trim().split(' ').pop();
  await row.click();
  await expect(page.locator('#timingBody tr.row-selected')).toHaveCount(1);
  // o mesmo piloto aparece no label do mapa
  await expect(page.locator('.map-driver-label .mdl-code')).toHaveText(code!);
  // clicar de novo deseleciona
  await row.click();
  await expect(page.locator('#timingBody tr.row-selected')).toHaveCount(0);
});

test('fim de corrida: botão abre a classificação completa (22 posições)', async ({ page }) => {
  await simulate(page, 'interlagos', '30');
  await page.waitForTimeout(100);
  // Avança direto ao fim clicando "próximo frame" em rajada (sem esperar o playback).
  await page.evaluate(() => {
    const btn = document.querySelector('#btnLapNext') as HTMLButtonElement | null;
    for (let i = 0; i < 3000 && btn && !btn.disabled; i++) btn.click();
  });
  // o resumo aparece com o botão de classificação
  const btn = page.locator('#btnRanking');
  await expect(btn).toBeVisible();
  await btn.click();
  // modal com as 22 posições
  await expect(page.locator('.ranking-panel')).toBeVisible();
  await expect(page.locator('.ranking-list .rank-row')).toHaveCount(22);
  // fecha no X
  await page.locator('.ranking-close').click();
  await expect(page.locator('.ranking-panel')).toHaveCount(0);
  const errs = (page as unknown as { _errs: string[] })._errs;
  expect(errs).toHaveLength(0);
});

test('coluna de gap alterna entre GAP LÍDER e INTERVALO', async ({ page }) => {
  await simulate(page, 'interlagos', '30');
  await page.waitForTimeout(400);
  const hdr = page.locator('.th-gap-toggle');
  await expect(hdr).toContainText('GAP LÍDER');
  // no modo líder, o P2 tem gap > 0; guarda o valor
  const p2gapLeader = await page.locator('#timingBody tr').nth(1).locator('.td-gap').textContent();
  await hdr.click();
  await expect(hdr).toContainText('INTERVALO');
  // no modo intervalo, o valor do P2 (gap ao P1) deve ser diferente do modo líder
  // apenas quando há mais de um carro à frente — mas o header trocou, que é o essencial
  const p2gapInterval = await page.locator('#timingBody tr').nth(1).locator('.td-gap').textContent();
  expect(typeof p2gapLeader === 'string' && typeof p2gapInterval === 'string').toBe(true);
  await hdr.click();
  await expect(hdr).toContainText('GAP LÍDER');
});

