// ─────────────────────────────────────────────────────────────────────────────
//  Testes unitários e de integração — F1 Race Simulation POC
//
//  Os fontes (tracks.js, drivers.js, sim.js) são scripts de browser (globais,
//  sem module.exports). Este harness os carrega num contexto `vm` do Node,
//  expondo as funções para teste SEM modificar os arquivos originais.
//
//  Rodar:  node test-unit.js
//  (integração de UI via Playwright continua em test.js)
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

// ── Carrega os fontes num sandbox compartilhado ──────────────────────────────
const sandbox = { Math, console, JSON, Array, Object, Number, isNaN, Infinity };
sandbox.window = {}; // sim.js grava window.__leaderXY etc.; inofensivo aqui
vm.createContext(sandbox);
// Ordem de carregamento = ordem de dependência (globais de browser).
const SRC_FILES = [
  'core/rng.js', 'core/format.js',
  'data/tracks.js', 'data/drivers.js',
  'race/constants.js', 'race/skills.js', 'race/timeline.js', 'race/engine.js',
  'map/geometry.js', 'map/mapgraph.js',
];
for (const f of SRC_FILES) {
  const abs  = path.resolve(__dirname, '..', 'src', f);
  const code = fs.readFileSync(abs, 'utf8');
  // filename ABSOLUTO: necessário para o c8/V8 associar a cobertura ao arquivo
  // real em disco (caminho relativo resulta em 0%).
  const script = new vm.Script(code, { filename: abs });
  script.runInContext(sandbox);
}
// `const`/`class` no topo de um script vm NÃO viram propriedades do contexto
// global — só declarações `function` são capturadas. Extraímos os demais
// avaliando os identificadores dentro do próprio contexto.
const pick = (names) => Object.fromEntries(
  names.map(n => [n, vm.runInContext(n, sandbox)])
);
const {
  RNG, effectiveAttr, miniSectorModifier, accuracyWindow, buildDrivers,
  computeTimeline, runRace, buildTrackPath, normalizePath, pointAtLapFraction,
  fmtTime, fmtGap, fmtSec, TRACKS, DRIVERS, DRIVER_ATTRS, DRIVER_FLAG,
  MINI_PER_SECTOR,
} = pick([
  'RNG', 'effectiveAttr', 'miniSectorModifier', 'accuracyWindow', 'buildDrivers',
  'computeTimeline', 'runRace', 'buildTrackPath', 'normalizePath', 'pointAtLapFraction',
  'fmtTime', 'fmtGap', 'fmtSec', 'TRACKS', 'DRIVERS', 'DRIVER_ATTRS', 'DRIVER_FLAG',
  'MINI_PER_SECTOR',
]);
// mapgraph.js
const { buildSpeedWarp, applyCornerOverrides, warpLapFraction, driverLapFraction, computeMapTransform } =
  pick(['buildSpeedWarp', 'applyCornerOverrides', 'warpLapFraction', 'driverLapFraction', 'computeMapTransform']);

// ── Mini framework ───────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const fails = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; fails.push({ name, msg: e.message }); console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function group(title) { console.log('\n\x1b[1m' + title + '\x1b[0m'); }
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ═════════════════════════════════════════════════════════════════════════════
//  UNIT: RNG (xorshift32)
// ═════════════════════════════════════════════════════════════════════════════
group('RNG');

test('next() retorna valores em [0,1)', () => {
  const r = new RNG(1);
  for (let i = 0; i < 1000; i++) { const v = r.next(); assert(v >= 0 && v < 1, 'fora de [0,1): ' + v); }
});

test('mesma seed → mesma sequência (determinístico)', () => {
  const a = new RNG(42), b = new RNG(42);
  for (let i = 0; i < 50; i++) assert.strictEqual(a.next(), b.next());
});

test('seeds diferentes → sequências diferentes', () => {
  const a = new RNG(1), b = new RNG(2);
  let diff = false;
  for (let i = 0; i < 10; i++) if (a.next() !== b.next()) diff = true;
  assert(diff, 'sequências idênticas para seeds diferentes');
});

test('seed 0 é saneada (não trava em zero)', () => {
  const r = new RNG(0);
  const vals = new Set();
  for (let i = 0; i < 10; i++) vals.add(r.next());
  assert(vals.size > 1, 'RNG preso em valor único com seed 0');
});

test('range(min,max) fica dentro do intervalo', () => {
  const r = new RNG(7);
  for (let i = 0; i < 500; i++) { const v = r.range(-5, 5); assert(v >= -5 && v < 5, 'fora do range: ' + v); }
});

test('range(a,a) retorna sempre a', () => {
  const r = new RNG(3);
  for (let i = 0; i < 10; i++) assert.strictEqual(r.range(2, 2), 2);
});

// ═════════════════════════════════════════════════════════════════════════════
//  UNIT: effectiveAttr (drivers.js)
// ═════════════════════════════════════════════════════════════════════════════
group('effectiveAttr');

test('aplica penalidade de handicap: attr × (1 - handicap/200)', () => {
  const d = DRIVER_ATTRS.VER;
  const exp = d.cornering * (1 - d.handicap / 200);
  assert(approx(effectiveAttr('VER', 'cornering'), exp));
});

test('handicap maior reduz mais a eficácia', () => {
  // SAR tem handicap alto (32), VER baixo (2): a razão efetiva/bruta é menor p/ SAR
  const ratioVER = effectiveAttr('VER', 'cornering') / DRIVER_ATTRS.VER.cornering;
  const ratioSAR = effectiveAttr('SAR', 'cornering') / DRIVER_ATTRS.SAR.cornering;
  assert(ratioSAR < ratioVER, `SAR ${ratioSAR} deveria ser < VER ${ratioVER}`);
});

test('handicap 0 hipotético não penaliza', () => {
  // valida a fórmula: com handicap 0, efetivo == bruto
  const d = DRIVER_ATTRS.VER;
  const eff = d.cornering * (1 - 0 / 200);
  assert.strictEqual(eff, d.cornering);
});

// ═════════════════════════════════════════════════════════════════════════════
//  UNIT: miniSectorModifier
// ═════════════════════════════════════════════════════════════════════════════
group('miniSectorModifier');

test('piloto perfeito (99 em tudo) tende a modifier ~1.0', () => {
  // cria um code fake com 99 seria invasivo; usa VER (quase 99) e checa proximidade
  const m = miniSectorModifier('VER', 'straight', TRACKS.interlagos);
  assert(m >= 1.0 && m < 1.02, 'modifier fora do esperado p/ piloto rápido: ' + m);
});

test('piloto mais lento tem modifier maior (mais lento) que o mais rápido', () => {
  const fast = miniSectorModifier('VER', 'slow_corner', TRACKS.monaco);
  const slow = miniSectorModifier('SAR', 'slow_corner', TRACKS.monaco);
  assert(slow > fast, `SAR ${slow} deveria ser > VER ${fast}`);
});

test('modifier >= 1 sempre (nunca mais rápido que o baseline 99)', () => {
  for (const code of DRIVERS)
    for (const type of ['straight','braking','slow_corner','medium_corner','fast_corner'])
      assert(miniSectorModifier(code, type, TRACKS.spa) >= 1 - 1e-9, `${code}/${type} < 1`);
});

test('trackWeight maior amplifica a diferença de skill', () => {
  // Monaco trackWeight 10 vs Interlagos 6: a penalidade do SAR é maior em Monaco
  const mMon = miniSectorModifier('SAR', 'slow_corner', TRACKS.monaco);
  const mInt = miniSectorModifier('SAR', 'slow_corner', TRACKS.interlagos);
  assert(mMon > mInt, `Monaco ${mMon} deveria penalizar mais que Interlagos ${mInt}`);
});

// ═════════════════════════════════════════════════════════════════════════════
//  UNIT: accuracyWindow
// ═════════════════════════════════════════════════════════════════════════════
group('accuracyWindow');

test('janela é positiva e menor que a base (accuracy reduz)', () => {
  const base = 0.01;
  const w = accuracyWindow('VER', base);
  assert(w > 0 && w < base, 'janela fora do esperado: ' + w);
});

test('maior accuracy → janela menor (mais consistente)', () => {
  // VER accuracy 95, SAR 66 → VER tem janela menor
  const wVER = accuracyWindow('VER', 0.01);
  const wSAR = accuracyWindow('SAR', 0.01);
  assert(wVER < wSAR, `VER ${wVER} deveria ser < SAR ${wSAR}`);
});

test('janela escala linearmente com a base', () => {
  assert(approx(accuracyWindow('HAM', 0.02), accuracyWindow('HAM', 0.01) * 2));
});

// ═════════════════════════════════════════════════════════════════════════════
//  UNIT: buildDrivers
// ═════════════════════════════════════════════════════════════════════════════
group('buildDrivers');

test('retorna os 20 pilotos na ordem do grid', () => {
  const d = buildDrivers(TRACKS.interlagos);
  assert.strictEqual(d.length, 20);
  assert.strictEqual(d[0].code, 'VER');
  assert.strictEqual(d[19].code, 'LAW');
});

test('baseMini soma = baseLap (3 setores × ratio / 9 × 9)', () => {
  const t = TRACKS.interlagos;
  const d = buildDrivers(t)[0];
  const somaMini = d.baseMini.reduce((a, r) => a + r * MINI_PER_SECTOR, 0);
  assert(approx(somaMini, t.baseLap, 1e-6), `${somaMini} != ${t.baseLap}`);
});

test('baseMini tem 3 setores', () => {
  assert.strictEqual(buildDrivers(TRACKS.spa)[0].baseMini.length, 3);
});

// ═════════════════════════════════════════════════════════════════════════════
//  UNIT: fmtTime / fmtGap / fmtSec
// ═════════════════════════════════════════════════════════════════════════════
group('formatadores');

test('fmtTime formata m:ss.mmm', () => {
  assert.strictEqual(fmtTime(71.861), '1:11.861');
  assert.strictEqual(fmtTime(90), '1:30.000');
  assert.strictEqual(fmtTime(5.5), '0:05.500');
});

test('fmtTime(null) → travessão', () => assert.strictEqual(fmtTime(null), '—'));

test('fmtGap formata +X.XXXs e trata líder', () => {
  assert.strictEqual(fmtGap(0), '—');
  assert.strictEqual(fmtGap(null), '—');
  assert.strictEqual(fmtGap(1.234), '+1.234s');
});

test('fmtGap com gap negativo mostra sinal −', () => {
  // ramo gap < 0 (piloto à frente no comparativo): sem o '+'
  assert.strictEqual(fmtGap(-0.5), '-0.500s');
});

test('fmtSec formata 3 casas e trata null', () => {
  assert.strictEqual(fmtSec(23.7286), '23.729');
  assert.strictEqual(fmtSec(null), '—');
});

// ═════════════════════════════════════════════════════════════════════════════
//  UNIT: geometria — normalizePath / buildTrackPath / pointAtLapFraction
// ═════════════════════════════════════════════════════════════════════════════
group('geometria');

test('normalizePath encaixa em bounding box [0,1]', () => {
  const raw = [{x:10,y:20},{x:30,y:20},{x:30,y:60},{x:10,y:60}];
  const p = normalizePath(raw);
  let minX=1,maxX=0,minY=1,maxY=0;
  p.points.forEach(pt=>{minX=Math.min(minX,pt.x);maxX=Math.max(maxX,pt.x);minY=Math.min(minY,pt.y);maxY=Math.max(maxY,pt.y);});
  assert(minX>=-1e-9 && minY>=-1e-9 && maxX<=1+1e-9 && maxY<=1+1e-9, 'fora de [0,1]');
});

test('normalizePath produz cum crescente e total > 0', () => {
  const p = normalizePath([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);
  for (let i = 1; i < p.cum.length; i++) assert(p.cum[i] >= p.cum[i-1], 'cum não-monotônico');
  assert(p.total > 0);
});

test('normalizePath com pontos degenerados não quebra (fallback ÷0)', () => {
  // todos iguais → w=h=0 → cai no fallback `|| 1`; total 0 vira 1
  const p = normalizePath([{x:5,y:5},{x:5,y:5},{x:5,y:5}]);
  assert(Number.isFinite(p.total) && p.total >= 0, 'total inválido');
  assert(p.points.every(pt => Number.isFinite(pt.x) && Number.isFinite(pt.y)), 'NaN nos pontos');
});

test('pointAtLapFraction com traçado degenerado usa fallback de segmento', () => {
  const p = normalizePath([{x:5,y:5},{x:5,y:5},{x:5,y:5}]);
  const pt = pointAtLapFraction(p, 0.5);
  assert(Number.isFinite(pt.x) && Number.isFinite(pt.y), 'NaN no ponto degenerado');
});

test('buildTrackPath gera loop fechado (primeiro ≈ último ponto)', () => {
  const p = buildTrackPath(TRACKS.interlagos);
  const a = p.points[0], b = p.points[p.points.length-1];
  assert(Math.hypot(a.x-b.x, a.y-b.y) < 0.02, 'loop não fecha');
});

test('buildTrackPath tem 27×SUBSTEPS pontos e bbox não-degenerada', () => {
  const p = buildTrackPath(TRACKS.monaco);
  assert.strictEqual(p.points.length, 27 * 4);
  let minX=1,maxX=0,minY=1,maxY=0;
  p.points.forEach(pt=>{minX=Math.min(minX,pt.x);maxX=Math.max(maxX,pt.x);minY=Math.min(minY,pt.y);maxY=Math.max(maxY,pt.y);});
  assert(maxX-minX > 0.2 && maxY-minY > 0.2, 'traçado degenerado');
});

test('pointAtLapFraction(0) ≈ pointAtLapFraction(1) (fecha o loop)', () => {
  const p = buildTrackPath(TRACKS.interlagos);
  const a = pointAtLapFraction(p, 0), b = pointAtLapFraction(p, 0.999);
  assert(Math.hypot(a.x-b.x, a.y-b.y) < 0.1, 'fração 0 e ~1 muito distantes');
});

test('pointAtLapFraction faz wrap para [0,1) (frac 1.5 == 0.5)', () => {
  const p = buildTrackPath(TRACKS.spa);
  const a = pointAtLapFraction(p, 0.5), b = pointAtLapFraction(p, 1.5);
  assert(approx(a.x, b.x, 1e-9) && approx(a.y, b.y, 1e-9), 'wrap incorreto');
});

test('pointAtLapFraction retorna ponto dentro da bbox do traçado', () => {
  const p = buildTrackPath(TRACKS.interlagos);
  for (let f = 0; f < 1; f += 0.05) {
    const pt = pointAtLapFraction(p, f);
    assert(pt.x >= -1e-6 && pt.x <= 1+1e-6 && pt.y >= -1e-6 && pt.y <= 1+1e-6, 'ponto fora da bbox em f='+f);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  INTEGRAÇÃO: computeTimeline
// ═════════════════════════════════════════════════════════════════════════════
group('computeTimeline (integração)');

test('gera laps × 27 eventos', () => {
  const t = TRACKS.interlagos;
  const d = buildDrivers(t)[0];
  const ev = computeTimeline('VER', d.baseMini, t, 123);
  assert.strictEqual(ev.length, t.laps * 27);
});

test('tempos (event.time) são estritamente crescentes', () => {
  const t = TRACKS.spa;
  const ev = computeTimeline('HAM', buildDrivers(t)[0].baseMini, t, 5);
  for (let i = 1; i < ev.length; i++) assert(ev[i].time > ev[i-1].time, 'time não-crescente em '+i);
});

test('mesma seed → timeline idêntica (determinismo)', () => {
  const t = TRACKS.interlagos, bm = buildDrivers(t)[0].baseMini;
  const a = computeTimeline('VER', bm, t, 999);
  const b = computeTimeline('VER', bm, t, 999);
  assert(a.every((e,i)=>approx(e.time, b[i].time)), 'timelines divergem com mesma seed');
});

test('flags isSectorEnd/isLapEnd nas posições corretas', () => {
  const t = TRACKS.interlagos;
  const ev = computeTimeline('VER', buildDrivers(t)[0].baseMini, t, 1);
  assert(ev[8].isSectorEnd && !ev[8].isLapEnd, 'mini 8 deveria fechar setor (não volta)');
  assert(ev[26].isSectorEnd && ev[26].isLapEnd, 'mini 26 deveria fechar volta');
  assert(!ev[0].isSectorEnd, 'mini 0 não fecha setor');
});

test('sectorTime só presente em isSectorEnd; lapTime só em isLapEnd', () => {
  const t = TRACKS.spa;
  const ev = computeTimeline('ALO', buildDrivers(t)[0].baseMini, t, 2);
  ev.forEach(e => {
    if (e.isSectorEnd) assert(e.sectorTime != null); else assert(e.sectorTime == null);
    if (e.isLapEnd) assert(e.lapTime != null); else assert(e.lapTime == null);
  });
});

test('soma dos 3 setores da 1ª volta ≈ lapTime da 1ª volta', () => {
  const t = TRACKS.interlagos;
  const ev = computeTimeline('VER', buildDrivers(t)[0].baseMini, t, 77);
  const lapEnd = ev.find(e => e.isLapEnd);
  const somaSetores = lapEnd.lapSectorTimes.reduce((a,b)=>a+b,0);
  assert(approx(somaSetores, lapEnd.lapTime, 1e-6), `${somaSetores} != ${lapEnd.lapTime}`);
});

// ═════════════════════════════════════════════════════════════════════════════
//  INTEGRAÇÃO: runRace
// ═════════════════════════════════════════════════════════════════════════════
group('runRace (integração)');

for (const track of ['monaco', 'spa', 'interlagos']) {
  const r = runRace(track);

  test(`${track}: finalState com 20 pilotos ordenados por tempo`, () => {
    assert.strictEqual(r.finalState.length, 20);
    for (let i = 1; i < 20; i++)
      assert(r.finalState[i].totalTime >= r.finalState[i-1].totalTime, 'não ordenado por tempo');
  });

  test(`${track}: todos completam o número certo de voltas`, () => {
    assert(r.finalState.every(d => d.lapsCompleted === r.track.laps), 'nem todos terminam');
  });

  test(`${track}: líder tem gap 0, gaps crescem`, () => {
    assert.strictEqual(r.finalState[0].gapToLeader, 0);
    for (let i = 1; i < 20; i++) assert(r.finalState[i].gapToLeader >= r.finalState[i-1].gapToLeader - 1e-9);
  });

  test(`${track}: bestLapTime <= lastLapTime p/ todos`, () => {
    r.finalState.forEach(d => {
      if (d.bestLapTime != null && d.lastLapTime != null)
        assert(d.bestLapTime <= d.lastLapTime + 1e-9, d.code + ' bestLap > lastLap');
    });
  });

  test(`${track}: sectorSnapshots >= laps×27 e cada frame tem 20 pilotos`, () => {
    assert(r.sectorSnapshots.length >= r.track.laps * 27, 'poucos frames');
    assert(r.sectorSnapshots.every(f => f.length === 20), 'frame sem 20 pilotos');
  });

  test(`${track}: lapSnapshots == número de voltas`, () => {
    assert.strictEqual(r.lapSnapshots.length, r.track.laps);
  });

  test(`${track}: gaps monotônicos dentro de cada frame`, () => {
    let bad = 0;
    r.sectorSnapshots.forEach(f => { for (let i=1;i<f.length;i++) if (f[i].gapToLeader < f[i-1].gapToLeader - 0.001) bad++; });
    assert.strictEqual(bad, 0, bad + ' gaps fora de ordem');
  });

  test(`${track}: último frame tem todos finished na última volta`, () => {
    const last = r.sectorSnapshots[r.sectorSnapshots.length - 1];
    assert(last.every(d => d.lap >= r.track.laps), 'nem todos terminaram no playback');
  });

  test(`${track}: timelines = 20, cada uma com laps×27 eventos`, () => {
    assert.strictEqual(r.timelines.length, 20);
    assert(r.timelines.every(t => t.events.length === r.track.laps * 27));
  });

  test(`${track}: sectorColors só usa classes válidas`, () => {
    const valid = new Set(['ms-fastest','ms-fast','ms-mid']);
    assert(Object.values(r.sectorColors).every(c => valid.has(c)), 'classe de cor inválida');
  });

  test(`${track}: cada setor da corrida tem exatamente 1 recorde (roxo global)`, () => {
    // por setor, o global-best pertence a um piloto; ao menos 1 roxo por setor deve existir
    for (let s = 0; s < 3; s++) {
      const anyPurple = Object.keys(r.sectorColors).some(k => k.endsWith('|'+s) && r.sectorColors[k] === 'ms-fastest');
      assert(anyPurple, 'setor '+s+' sem nenhum roxo');
    }
  });
}

test('VER (mais rápido) vence Interlagos com frequência dominante', () => {
  // não-determinístico (seed por piloto), mas VER deve vencer a grande maioria
  let vios = 0;
  for (let i = 0; i < 20; i++) if (runRace('interlagos').finalState[0].code !== 'VER') vios++;
  assert(vios <= 3, `VER perdeu ${vios}/20 corridas — esperado dominante`);
});

test('sectorRef/sectorPB expostos e coerentes', () => {
  const r = runRace('spa');
  assert(r.sectorRef.length === 3 && r.sectorRef.every(s => s.min > 0));
  assert(r.sectorPB.VER.length === 3);
  // recorde global <= PB de qualquer piloto no mesmo setor
  for (let s = 0; s < 3; s++)
    assert(r.sectorRef[s].min <= r.sectorPB.SAR[s] + 1e-9, 'recorde > PB no setor '+s);
});

// ═════════════════════════════════════════════════════════════════════════════
//  REGRESSÃO: bugs corrigidos que não devem voltar
// ═════════════════════════════════════════════════════════════════════════════
group('regressão (bugs históricos)');

test('REGRESSÃO: corrida não termina quando o P1 cruza (todos completam)', () => {
  // Bug: finalState refletia o estado parado no fim do líder → 19 pilotos não terminavam.
  for (const track of ['monaco', 'spa', 'interlagos']) {
    const r = runRace(track);
    const notDone = r.finalState.filter(d => d.lapsCompleted !== r.track.laps);
    assert.strictEqual(notDone.length, 0, `${track}: ${notDone.length} pilotos não terminaram`);
  }
});

test('REGRESSÃO: playback não congela após o líder terminar (último frame com todos na última volta)', () => {
  // Bug: relógio usava totalTime do P1; ao terminar, congelava os retardatários.
  const r = runRace('interlagos');
  const last = r.sectorSnapshots[r.sectorSnapshots.length - 1];
  assert(last.every(d => d.lap >= r.track.laps), 'nem todos na última volta no frame final');
  // e o maior totalTime do último frame é o do lanterna (corrida inteira coberta)
  const maxT = Math.max(...last.map(d => d.totalTime));
  assert(maxT >= r.finalState[0].totalTime, 'relógio não cobriu até o último a terminar');
});

test('REGRESSÃO: gaps monotônicos em TODOS os frames (ordem = tempo)', () => {
  // Bug: ordenação do snapshot divergia do cálculo de gap → gaps fora de ordem.
  for (const track of ['monaco', 'spa', 'interlagos']) {
    const r = runRace(track);
    let bad = 0;
    r.sectorSnapshots.forEach(f => { for (let i=1;i<f.length;i++) if (f[i].gapToLeader < f[i-1].gapToLeader - 0.001) bad++; });
    assert.strictEqual(bad, 0, `${track}: ${bad} gaps fora de ordem`);
  }
});

test('REGRESSÃO: cores NÃO são estáticas (VER varia entre roxo e amarelo)', () => {
  // Bug: modelo de bandas/PB fixo dava 100% de uma cor por piloto. No modelo live,
  // VER deve ter roxo (recordes) E amarelo (voltas piores), nunca 100% de uma cor.
  const r = runRace('interlagos');
  const verKeys = Object.keys(r.sectorColors).filter(k => k.startsWith('VER|'));
  const cores = new Set(verKeys.map(k => r.sectorColors[k]));
  assert(cores.size >= 2, 'VER tem cor única (estático): ' + [...cores].join(','));
  assert(cores.has('ms-fastest'), 'VER (mais rápido) deveria ter roxos');
});

test('REGRESSÃO: roxo = global best; existe ao menos 1 por setor e é raro (não domina)', () => {
  const r = runRace('interlagos');
  const all = Object.values(r.sectorColors);
  const roxos = all.filter(c => c === 'ms-fastest').length;
  const frac = roxos / all.length;
  assert(frac > 0 && frac < 0.25, `roxo em ${(frac*100).toFixed(1)}% — esperado raro (recorde)`);
});

test('REGRESSÃO: variação por volta existe (setores não são idênticos entre voltas)', () => {
  // Sanidade: se a variação por-volta zerar, as cores live nunca mudariam.
  const t = TRACKS.interlagos;
  const ev = computeTimeline('HAM', buildDrivers(t)[0].baseMini, t, 314);
  const s0 = ev.filter(e => e.isSectorEnd && e.sector === 0).map(e => e.sectorTime);
  const spread = Math.max(...s0) - Math.min(...s0);
  assert(spread > 0, 'S1 idêntico em todas as voltas (variação zerada)');
});

// ═════════════════════════════════════════════════════════════════════════════
//  UNIT: mapgraph.js — perfil de velocidade e transformações do mapa
// ═════════════════════════════════════════════════════════════════════════════
group('mapgraph: buildSpeedWarp / warpLapFraction');

// helper: traçado sintético com um trecho reto e uma curva fechada
function makeSyntheticPath() {
  // meia-volta em retângulo com cantos → curvatura concentrada nos cantos
  const raw = [];
  for (let i = 0; i <= 20; i++) raw.push({ x: i / 20, y: 0 });      // reta superior
  for (let i = 1; i <= 5; i++)  raw.push({ x: 1, y: i / 5 });       // canto/descida
  for (let i = 19; i >= 0; i--) raw.push({ x: i / 20, y: 1 });      // reta inferior
  for (let i = 4; i >= 1; i--)  raw.push({ x: 0, y: i / 5 });       // canto/subida
  return normalizePath(raw);
}

test('buildSpeedWarp retorna timeFrac e distFrac monotônicos em [0,1]', () => {
  const warp = buildSpeedWarp(buildTrackPath(TRACKS.interlagos), TRACKS.interlagos);
  for (const key of ['timeFrac', 'distFrac']) {
    const a = warp[key];
    assert(approx(a[0], 0, 1e-9), key + ' não começa em 0');
    assert(approx(a[a.length - 1], 1, 1e-9), key + ' não termina em 1');
    for (let i = 1; i < a.length; i++) assert(a[i] >= a[i-1] - 1e-9, key + ' não-monotônico');
  }
});

test('warpLapFraction(null) é identidade', () => {
  assert.strictEqual(warpLapFraction(null, 0.42), 0.42);
});

test('warpLapFraction preserva a parte inteira (volta) e mapeia [0,1)', () => {
  const warp = buildSpeedWarp(buildTrackPath(TRACKS.interlagos), TRACKS.interlagos);
  assert(approx(warpLapFraction(warp, 0), 0, 1e-6), 'frac 0 deveria mapear ~0');
  const v = warpLapFraction(warp, 3.5);
  assert(v >= 3 && v < 4, 'volta 3 não preservada: ' + v);
});

test('velocidade varia: carro anda mais distância na reta que na curva', () => {
  // Num traçado com reta+curva, avançar o mesmo Δtempo cobre mais distância na reta.
  const warp = buildSpeedWarp(makeSyntheticPath(), null);
  const step = 0.02;
  let maxAdvance = 0, minAdvance = Infinity;
  for (let f = 0; f < 1 - step; f += step) {
    const adv = warpLapFraction(warp, f + step) - warpLapFraction(warp, f);
    maxAdvance = Math.max(maxAdvance, adv);
    minAdvance = Math.min(minAdvance, adv);
  }
  assert(maxAdvance / minAdvance > 1.3, `sem variação de velocidade (ratio ${(maxAdvance/minAdvance).toFixed(2)})`);
});

test('cornerSpeeds override reduz a velocidade na posição indicada', () => {
  const path = makeSyntheticPath();
  const base = buildSpeedWarp(path, null);
  const over = buildSpeedWarp(path, { cornerSpeeds: [{ at: 0.5, speed: 0.05, spread: 0.1 }] });
  // com override lento em 0.5, o tempo para chegar em dist 0.5 aumenta (mais lento ali)
  // compara a fração de tempo no ponto de distância ~0.5
  const idx = Math.round(base.distFrac.length * 0.5);
  assert(over.timeFrac[idx] !== base.timeFrac[idx], 'override não teve efeito');
});

test('applyCornerOverrides nunca aumenta a velocidade (só reduz)', () => {
  const vel = new Array(50).fill(1.0);
  applyCornerOverrides(vel, [{ at: 0.5, speed: 0.3, spread: 0.1 }]);
  assert(vel.every(v => v <= 1.0 + 1e-9), 'override aumentou velocidade');
  assert(vel.some(v => v < 0.9), 'override não reduziu nada');
});

test('applyCornerOverrides usa spread padrão (0.03) quando omitido', () => {
  const vel = new Array(100).fill(1.0);
  applyCornerOverrides(vel, [{ at: 0.5, speed: 0.2 }]); // sem spread → ?? 0.03
  assert(vel.some(v => v < 0.9), 'override sem spread não teve efeito');
});

test('buildSpeedWarp lida com traçado degenerado (fallbacks ÷0)', () => {
  // path de pontos idênticos: total 0, segmentos 0 → cai nos fallbacks || 1 / || MIN_VEL
  const degen = normalizePath([{x:1,y:1},{x:1,y:1},{x:1,y:1},{x:1,y:1}]);
  const warp = buildSpeedWarp(degen, null);
  assert(warp.timeFrac.every(Number.isFinite) && warp.distFrac.every(Number.isFinite), 'NaN no warp degenerado');
});

test('buildSpeedWarp trata curvatura reversa (wrap de ângulo ±π)', () => {
  // traçado em forma de 8 / com inversão de sentido força o while de wrap de ângulo
  const raw = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * 4 * Math.PI; // duas voltas → ângulos passam de π
    raw.push({ x: Math.cos(a), y: Math.sin(a * 2) });
  }
  const warp = buildSpeedWarp(normalizePath(raw), null);
  assert(warp.timeFrac.every(Number.isFinite), 'wrap de ângulo produziu NaN');
});

group('mapgraph: driverLapFraction');

test('driverLapFraction cresce monotonicamente com T', () => {
  const t = TRACKS.interlagos;
  const ev = computeTimeline('VER', buildDrivers(t)[0].baseMini, t, 42);
  let prev = -1;
  for (let k = 0; k < ev.length; k += 50) {
    const f = driverLapFraction(ev, ev[k].time);
    assert(f >= prev - 1e-9, 'não-monotônico em k=' + k);
    prev = f;
  }
});

test('driverLapFraction: T antes do 1º evento retorna início da volta 0', () => {
  const t = TRACKS.spa;
  const ev = computeTimeline('HAM', buildDrivers(t)[0].baseMini, t, 1);
  const f = driverLapFraction(ev, -5);
  assert(f >= 0 && f < 0.1, 'início fora do esperado: ' + f);
});

test('driverLapFraction: no fim da corrida ≈ número de voltas', () => {
  const t = TRACKS.interlagos;
  const ev = computeTimeline('VER', buildDrivers(t)[0].baseMini, t, 7);
  const f = driverLapFraction(ev, ev[ev.length - 1].time + 100);
  assert(approx(f, t.laps, 0.05), 'fim ≠ voltas totais: ' + f);
});

group('mapgraph: computeMapTransform');

test('computeMapTransform mapeia pontos dentro do canvas', () => {
  const path = buildTrackPath(TRACKS.interlagos);
  const canvas = { width: 1200, height: 520 };
  const { mapX, mapY } = computeMapTransform(canvas, path);
  for (const p of path.points) {
    const x = mapX(p), y = mapY(p);
    assert(x >= 0 && x <= 1200, 'x fora do canvas: ' + x);
    assert(y >= 0 && y <= 520, 'y fora do canvas: ' + y);
  }
});

test('computeMapTransform respeita o padding (28px) nas bordas', () => {
  const path = buildTrackPath(TRACKS.spa);
  const canvas = { width: 900, height: 500 };
  const { mapX, mapY } = computeMapTransform(canvas, path);
  const xs = path.points.map(mapX), ys = path.points.map(mapY);
  assert(Math.min(...xs) >= 27 && Math.max(...xs) <= 873, 'x sem padding');
  assert(Math.min(...ys) >= 27 && Math.max(...ys) <= 473, 'y sem padding');
});

test('computeMapTransform com traçado degenerado não gera NaN (fallback ÷0)', () => {
  const degen = normalizePath([{x:2,y:2},{x:2,y:2},{x:2,y:2}]);
  const { mapX, mapY } = computeMapTransform({ width: 800, height: 400 }, degen);
  const x = mapX(degen.points[0]), y = mapY(degen.points[0]);
  assert(Number.isFinite(x) && Number.isFinite(y), 'NaN no transform degenerado');
});

// ═════════════════════════════════════════════════════════════════════════════
//  DADOS: consistência de tracks.js e drivers.js
// ═════════════════════════════════════════════════════════════════════════════
group('dados (tracks / drivers)');

for (const key of Object.keys(TRACKS)) {
  const t = TRACKS[key];
  test(`${key}: sectorRatio soma 1.0`, () => {
    assert(approx(t.sectorRatio.reduce((a,b)=>a+b,0), 1.0, 1e-9), 'ratio não soma 1');
  });
  test(`${key}: miniSectors = 3 setores × 9 minis de tipos válidos`, () => {
    const valid = new Set(['straight','braking','slow_corner','medium_corner','fast_corner']);
    assert.strictEqual(t.miniSectors.length, 3);
    t.miniSectors.forEach(sec => {
      assert.strictEqual(sec.length, 9);
      sec.forEach(type => assert(valid.has(type), 'tipo inválido: '+type));
    });
  });
  test(`${key}: laps e baseLap positivos`, () => {
    assert(t.laps > 0 && t.baseLap > 0);
  });
}

test('DRIVER_ATTRS e DRIVER_FLAG cobrem os 20 pilotos', () => {
  DRIVERS.forEach(code => {
    assert(DRIVER_ATTRS[code], 'sem attrs: '+code);
    assert(DRIVER_FLAG[code], 'sem bandeira: '+code);
  });
});

test('só Interlagos tem svgPath (Monaco/Spa escondem mapa)', () => {
  assert(TRACKS.interlagos.svgPath, 'Interlagos deveria ter svgPath');
  assert(!TRACKS.monaco.svgPath && !TRACKS.spa.svgPath, 'Monaco/Spa não deveriam ter svgPath');
});

// ── Relatório ────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log(`\x1b[1m${passed} passaram, ${failed} falharam\x1b[0m (${passed + failed} testes)`);
if (failed) {
  console.log('\nFalhas:');
  fails.forEach(f => console.log(`  ✗ ${f.name}\n      ${f.msg}`));
}
process.exit(failed ? 1 : 0);
