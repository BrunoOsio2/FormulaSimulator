// ─── PRNG determinístico (xorshift32) ───────────────────────────────────────
// Mesma seed → mesma sequência de números aleatórios, sempre
class RNG {
  constructor(seed) { this.state = (seed >>> 0) || 1; }
  next() {
    let x = this.state;
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    return ((this.state = x >>> 0) >>> 0) / 0xFFFFFFFF;
  }
  range(min, max) { return min + this.next() * (max - min); }
}

// ─── Método RUIM: depende do FPS ────────────────────────────────────────────
// dt (delta time) varia conforme o FPS → resultados diferentes em hardwares diferentes
function runFrameDependent({ seed, durationSec, fps }) {
  const rng = new RNG(seed);
  const log = [];

  let position = 0, velocity = 1.0, energy = 100.0, eventCount = 0;
  const history = [];

  const isVariable  = fps === 'variable';
  const nominalFps  = isVariable ? 60 : fps;
  const totalFrames = durationSec * nominalFps;
  const baseDt      = 1 / nominalFps;

  for (let frame = 0; frame < totalFrames; frame++) {
    // Com FPS variável, o dt "treme" — simula um computador travando
    const dt = isVariable ? baseDt + rng.range(-0.010, 0.025) : baseDt;
    const t  = frame * baseDt;

    // Física: velocidade e posição acumulam a cada frame
    const force = rng.range(-0.5, 0.5);
    velocity += force * dt;
    position += velocity * dt;
    energy   -= Math.abs(force) * dt * 2;

    // Evento (ex: um gol) dispara quando o número sorteado passa de um limiar
    // PROBLEMA: com FPS diferente, rng.next() é chamado um número diferente de vezes
    // então o mesmo "jogo" produz eventos em momentos diferentes
    const roll = rng.next();
    if (roll > 0.72) {
      eventCount++;
      energy += 8;
      if (log.length < 12)
        log.push({ t: t.toFixed(1), msg: `Evento #${eventCount} no segundo ${t.toFixed(1)} (sorteio: ${roll.toFixed(3)})`, type: 'bad' });
    }

    if (frame % Math.max(1, Math.floor(nominalFps / 10)) === 0)
      history.push({ t, position });
  }

  return { finalPosition: position, finalEnergy: energy, eventCount, history, log };
}

// ─── Método CERTO: tick fixo ─────────────────────────────────────────────────
// dt é sempre constante → mesma seed = resultado idêntico, independente do FPS
function runFixedTick({ seed, durationSec, tickHz }) {
  const rng = new RNG(seed);
  const log = [];

  let position = 0, velocity = 1.0, energy = 100.0, eventCount = 0;
  const history = [];

  const dt         = 1 / tickHz; // NUNCA muda
  const totalTicks = durationSec * tickHz;

  for (let tick = 0; tick < totalTicks; tick++) {
    const t     = tick * dt;
    const force = rng.range(-0.5, 0.5);
    velocity += force * dt;
    position += velocity * dt;
    energy   -= Math.abs(force) * dt * 2;

    const roll = rng.next();
    if (roll > 0.72) {
      eventCount++;
      energy += 8;
      if (log.length < 12)
        log.push({ t: t.toFixed(1), msg: `Evento #${eventCount} no segundo ${t.toFixed(1)} (sorteio: ${roll.toFixed(3)})`, type: 'good' });
    }

    if (tick % Math.max(1, Math.floor(tickHz / 10)) === 0)
      history.push({ t, position });
  }

  return { finalPosition: position, finalEnergy: energy, eventCount, history, log };
}

// ─── Canvas ──────────────────────────────────────────────────────────────────
function renderCanvas(canvasEl, history, color) {
  const ctx = canvasEl.getContext('2d');
  const W = canvasEl.width, H = canvasEl.height;
  ctx.clearRect(0, 0, W, H);
  if (!history.length) return;

  const positions = history.map(h => h.position);
  const minP = Math.min(...positions), maxP = Math.max(...positions);
  const range = maxP - minP || 1;

  // grade
  ctx.strokeStyle = '#1a1f35'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, (i/4)*H); ctx.lineTo(W, (i/4)*H); ctx.stroke();
  }

  // linha
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
  history.forEach((h, i) => {
    const x = (i / (history.length - 1 || 1)) * W;
    const y = H - ((h.position - minP) / range) * (H - 10) - 5;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function renderLog(logEl, entries) {
  if (!entries.length) {
    logEl.innerHTML = '<span style="color:#475569;font-size:0.75rem">Nenhum evento gerado.</span>';
    return;
  }
  logEl.innerHTML = entries.map(e =>
    `<div class="ev ${e.type}">${e.msg}</div>`
  ).join('');
}

// ─── Estado das runs ─────────────────────────────────────────────────────────
let runs = []; // guarda as últimas 2 execuções para comparar

// ─── Execução principal ───────────────────────────────────────────────────────
function runSimulation() {
  const fpsMode  = document.getElementById('fpsMode').value;
  const tickHz   = parseInt(document.getElementById('tickRate').value);
  const seed     = parseInt(document.getElementById('seed').value);
  const duration = parseInt(document.getElementById('duration').value);
  const nomFps   = fpsMode === 'variable' ? 60 : parseInt(fpsMode);

  const bad  = runFrameDependent({ seed, durationSec: duration, fps: fpsMode === 'variable' ? 'variable' : nomFps });
  const good = runFixedTick({ seed, durationSec: duration, tickHz });

  // Canvases
  renderCanvas(document.getElementById('canvasBad'),  bad.history,  '#ef4444');
  renderCanvas(document.getElementById('canvasGood'), good.history, '#22c55e');

  // Resultados
  setText('badPos',    bad.finalPosition.toFixed(4));
  setText('badEnergy', bad.finalEnergy.toFixed(4));
  setText('badEvents', bad.eventCount);
  setText('goodPos',    good.finalPosition.toFixed(4));
  setText('goodEnergy', good.finalEnergy.toFixed(4));
  setText('goodEvents', good.eventCount);

  renderLog(document.getElementById('logBad'),  bad.log);
  renderLog(document.getElementById('logGood'), good.log);

  // Guarda run
  runs.push({ bad, good, fpsMode, tickHz, seed });
  if (runs.length > 2) runs.shift();

  // Status de quantas runs foram feitas
  const runCount = runs.length;
  const statusEl = document.getElementById('runStatus');
  if (runCount === 1) {
    statusEl.textContent = 'Execução 1 concluída. Agora mude o FPS e rode de novo para ver a diferença.';
    statusEl.style.color = '#93c5fd';
    markStep(1);
  } else {
    const sameConfig = runs[0].fpsMode === runs[1].fpsMode && runs[0].tickHz === runs[1].tickHz;
    statusEl.textContent = sameConfig
      ? 'Execução 2 concluída (mesma config). Para ver divergência real, mude o FPS entre as execuções.'
      : 'Execução 2 concluída com config diferente. Veja a comparação abaixo.';
    statusEl.style.color = sameConfig ? '#fbbf24' : '#4ade80';
    markStep(2);
  }

  updateComparison();
}

function updateComparison() {
  if (runs.length < 2) {
    setVerdict('pending', '⏳ Aguardando segunda execução', 'Rode a simulação mais uma vez (com um FPS diferente) para ver a comparação.');
    ['diffBadPos','diffBadEnergy','diffBadEvents','diffGoodPos','diffGoodEnergy','diffGoodEvents']
      .forEach(id => setDelta(id, null));
    return;
  }

  const [a, b] = runs;
  const dBadPos    = Math.abs(a.bad.finalPosition - b.bad.finalPosition);
  const dBadEnergy = Math.abs(a.bad.finalEnergy   - b.bad.finalEnergy);
  const dBadEv     = Math.abs(a.bad.eventCount    - b.bad.eventCount);
  const dGoodPos   = Math.abs(a.good.finalPosition - b.good.finalPosition);
  const dGoodEnergy = Math.abs(a.good.finalEnergy  - b.good.finalEnergy);
  const dGoodEv    = Math.abs(a.good.eventCount    - b.good.eventCount);

  setDelta('diffBadPos',    dBadPos);
  setDelta('diffBadEnergy', dBadEnergy);
  setDelta('diffBadEvents', dBadEv, true);
  setDelta('diffGoodPos',    dGoodPos);
  setDelta('diffGoodEnergy', dGoodEnergy);
  setDelta('diffGoodEvents', dGoodEv, true);

  const tickOk     = dGoodPos < 1e-9 && dGoodEnergy < 1e-9 && dGoodEv === 0;
  const frameBad   = dBadPos > 0.001 || dBadEnergy > 0.001 || dBadEv > 0;
  const sameConfig = a.fpsMode === b.fpsMode;

  if (sameConfig) {
    setVerdict('deterministic', '✓ Mesma config usada nas duas execuções',
      `Com o mesmo FPS, o método ruim também foi idêntico — pois as condições eram iguais. Para ver o problema real, mude o FPS entre as execuções (simula dois computadores diferentes).`);
  } else if (tickOk && frameBad) {
    markStep(3);
    setVerdict('divergent', '⚠ Divergência confirmada no método ruim',
      `Com FPS ${a.fpsMode} na execução 1 e FPS ${b.fpsMode} na execução 2 (mesma seed "${a.seed}"), o método dependente de FPS produziu resultados diferentes: posição divergiu em ${dBadPos.toFixed(4)}, energia em ${dBadEnergy.toFixed(4)}, e ${dBadEv} evento(s) a mais/a menos. Em um jogo de manager, isso seria um gol que existe em uma partida e não existe na outra. O tick fixo permaneceu idêntico nas duas execuções (diferença = 0).`);
  } else if (tickOk) {
    setVerdict('deterministic', '✓ Tick fixo é determinístico',
      `O método de tick fixo produziu resultado idêntico nas duas execuções (diferença = 0). O método de FPS também não divergiu muito — tente FPS 15 vs 120 para ampliar a diferença.`);
  } else {
    setVerdict('pending', '— Resultado inconclusivo', 'Tente configs mais diferentes (ex: 15 FPS vs 120 FPS).');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setText(id, val) { document.getElementById(id).textContent = val; }

function setDelta(id, val, isInt = false) {
  const el = document.getElementById(id);
  if (val === null) { el.textContent = '—'; el.className = 'delta-val muted'; return; }
  const isZero = isInt ? val === 0 : val < 1e-9;
  el.textContent = isInt ? (isZero ? '0 (idêntico)' : `+${val} evento(s)`) : (isZero ? '0.000000 (idêntico)' : val.toFixed(6));
  el.className   = 'delta-val ' + (isZero ? 'zero' : 'diff');
}

function setVerdict(type, title, body) {
  const el = document.getElementById('verdict');
  el.className = `verdict-box ${type}`;
  el.innerHTML = `<strong>${title}</strong>${body}`;
}

function markStep(n) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step${i}`);
    if (i < n)      { el.classList.remove('active'); el.classList.add('done'); }
    else if (i === n) { el.classList.add('active'); }
  }
}

function resetAll() {
  runs = [];
  ['canvasBad','canvasGood'].forEach(id => {
    const c = document.getElementById(id);
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
  });
  ['badPos','badEnergy','badEvents','goodPos','goodEnergy','goodEvents'].forEach(id => setText(id, '—'));
  ['logBad','logGood'].forEach(id => {
    document.getElementById(id).innerHTML = '<span style="color:#475569;font-size:0.75rem">Aguardando simulação...</span>';
  });
  ['diffBadPos','diffBadEnergy','diffBadEvents','diffGoodPos','diffGoodEnergy','diffGoodEvents']
    .forEach(id => setDelta(id, null));
  setVerdict('pending', 'Aguardando...', 'Rode a simulação duas vezes para ver a comparação. Na segunda vez, mude o FPS para simular um hardware diferente.');
  document.getElementById('runStatus').textContent = '';
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step${i}`);
    el.classList.remove('done', 'active');
    if (i === 1) el.classList.add('active');
  }
}

document.getElementById('btnStart').addEventListener('click', runSimulation);
document.getElementById('btnReset').addEventListener('click', resetAll);
