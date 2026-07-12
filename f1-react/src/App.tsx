import { useState, useRef, useEffect, useCallback } from 'react';
import type { RaceResult } from './lib/engine/types';
import { runRace } from './lib/engine/engine';
import { fmtTime, fmtGap } from './lib/engine/format';
import { TRACKS } from './lib/data/tracks';
import { DRIVER_COLOR } from './lib/data/drivers';
import { TrackPanel } from './components/TrackPanel';
import { TimingTable } from './components/TimingTable';
import { TrackMap } from './components/TrackMap';
import { RaceRanking } from './components/RaceRanking';
import { useSeasonStore } from './lib/stores/seasonStore';
import { buildRaceRecord } from './lib/stores/raceRecord';

const SPEEDS = [
  { v: 600, label: 'Muito lento (0.6s/mini)' },
  { v: 300, label: 'Lento (0.3s/mini)' },
  { v: 150, label: 'Normal (0.15s/mini)' },
  { v: 80,  label: 'Rápido (0.08s/mini)' },
  { v: 30,  label: 'Muito rápido' },
];
// Ordenado do mais LENTO (maior ms) ao mais RÁPIDO (menor ms), para os botões +/-.
const SPEED_VALUES = SPEEDS.map(s => s.v);       // [600, 300, 150, 80, 30]

export default function App() {
  // Preferências persistidas (localStorage): pista e velocidade escolhidas.
  const [trackKey, setTrackKey] = useState(() => localStorage.getItem('f1.track') || 'interlagos');
  const [result, setResult] = useState<RaceResult | null>(null);
  const [snapIdx, setSnapIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(() => Number(localStorage.getItem('f1.speed')) || 80);
  const [selected, setSelected] = useState<string | null>(null);
  const [perf, setPerf] = useState<{ ms: number; ticks: number; ups: number; laps: string } | null>(null);
  // Largada estilo F1 (semáforo): lights = nº de luzes vermelhas acesas (0..5),
  // 'out' no instante em que tudo apaga (largada!), null quando não há corrida.
  const [lights, setLights] = useState<number | 'out' | null>(null);
  const trackWrapRef = useRef<HTMLDivElement>(null);   // âncora p/ scroll suave até a pista
  const countdownTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Temporada: salvar resultado ao terminar + modal de classificação completa.
  const addResult = useSeasonStore(s => s.addResult);
  const [showRanking, setShowRanking] = useState(false);
  const raceSeed = useRef<number>(0);          // seed da corrida atual (p/ salvar)
  const savedFor = useRef<RaceResult | null>(null); // guard: salva 1x por corrida

  useEffect(() => { localStorage.setItem('f1.track', trackKey); }, [trackKey]);
  useEffect(() => { localStorage.setItem('f1.speed', String(speedMs)); }, [speedMs]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = result ? result.sectorSnapshots.length : 0;

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // Playback: avança snapIdx a cada speedMs enquanto playing.
  useEffect(() => {
    if (!playing || !result) { stopTimer(); return; }
    timerRef.current = setInterval(() => {
      setSnapIdx(i => {
        if (i < result.sectorSnapshots.length - 1) return i + 1;
        setPlaying(false);
        return i;
      });
    }, speedMs);
    return stopTimer;
  }, [playing, result, speedMs, stopTimer]);

  const handleRun = () => {
    const seed = Math.floor(Math.random() * 0xFFFFFFFF); // seed reproduzível (I1)
    raceSeed.current = seed;
    savedFor.current = null;                             // nova corrida → pode salvar de novo
    const t0 = performance.now();
    const r = runRace(trackKey, seed);
    const ms = performance.now() - t0;
    const ticks = r.track.laps * 3 * 9;
    setResult(r);
    setSnapIdx(0);
    setPlaying(false);     // fica parado no grid até a contagem terminar
    setPerf({
      ms, ticks, ups: Math.round(ticks / (ms / 1000)),
      laps: `${r.track.laps} voltas · ${r.sectorSnapshots.length} setores`,
    });

    // "Arrasta a âncora": rola suavemente até a pista, para a largada ficar em foco.
    requestAnimationFrame(() =>
      trackWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));

    // Largada estilo F1 (semáforo): 5 luzes vermelhas acendem uma a uma (~1s
    // cada), seguram um instante, e então TODAS apagam de uma vez → corrida
    // começa (o clássico "lights out and away we go").
    countdownTimers.current.forEach(clearTimeout);
    countdownTimers.current = [];
    for (let n = 1; n <= 5; n++) {
      countdownTimers.current.push(setTimeout(() => setLights(n), n * 900));
    }
    // segura as 5 luzes acesas por ~1.1s, depois apaga tudo e larga
    const outAt = 5 * 900 + 1100;
    countdownTimers.current.push(setTimeout(() => setLights('out'), outAt));
    countdownTimers.current.push(setTimeout(() => {
      setLights(null);
      setPlaying(true);
    }, outAt + 600));
  };

  // Botões +/-: passa para a velocidade adjacente na lista (lenta → rápida).
  const idxSpeed = SPEED_VALUES.indexOf(speedMs);
  const canFaster = idxSpeed < SPEED_VALUES.length - 1 && idxSpeed !== -1;
  const canSlower = idxSpeed > 0;
  const stepFaster = () => { if (canFaster) setSpeedMs(SPEED_VALUES[idxSpeed + 1]); };
  const stepSlower = () => { if (canSlower) setSpeedMs(SPEED_VALUES[idxSpeed - 1]); };

  const handleReset = () => {
    stopTimer();
    countdownTimers.current.forEach(clearTimeout);
    countdownTimers.current = [];
    setLights(null);
    setResult(null);
    setSnapIdx(0);
    setPlaying(false);
    setPerf(null);
    setSelected(null);
    setShowRanking(false);
  };

  // Cancela timers da contagem ao desmontar (sem vazamento).
  useEffect(() => () => { countdownTimers.current.forEach(clearTimeout); }, []);

  // Atalhos de teclado: espaço = play/pause, ← → = passo a passo (pausa antes).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!result) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying(p => { if (!p && snapIdx >= total - 1) setSnapIdx(0); return !p; });
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault(); setPlaying(false); setSnapIdx(i => Math.max(0, i - 1));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault(); setPlaying(false); setSnapIdx(i => Math.min(total - 1, i + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, snapIdx, total]);

  const frame = result ? result.sectorSnapshots[snapIdx] : null;
  const leader = frame ? frame[0] : null;
  const lapNum = leader ? leader.lap + 1 : 0;
  const sectorNum = leader ? leader.sector + 1 : 0;
  const minisDone = leader ? leader.curMiniTimesPerSector.reduce((a, arr) => a + arr.length, 0) : 0;
  const pct = total ? ((snapIdx + 1) / total) * 100 : 0;
  const perfClass = perf ? (perf.ms < 50 ? 'good' : perf.ms < 200 ? 'warn' : '') : '';

  // Resumo da corrida: aparece quando o playback chega ao último frame.
  const atEnd = !!result && snapIdx >= total - 1;
  let summary: { podium: { code: string; gap: number }[]; fl: { code: string; time: number } } | null = null;
  if (result && atEnd) {
    const podium = result.finalState.slice(0, 3).map(d => ({ code: d.code, gap: d.gapToLeader }));
    let fl = { code: result.finalState[0].code, time: Infinity };
    for (const d of result.finalState) {
      if (d.bestLapTime != null && d.bestLapTime < fl.time) fl = { code: d.code, time: d.bestLapTime };
    }
    summary = { podium, fl };
  }

  // Salva o resultado na temporada quando a corrida termina — uma vez por corrida
  // (guard savedFor evita re-salvar a cada re-render enquanto atEnd continua true).
  useEffect(() => {
    if (!result || !atEnd || savedFor.current === result) return;
    savedFor.current = result;
    addResult(buildRaceRecord(result, trackKey, new Date().toISOString(), raceSeed.current));
  }, [result, atEnd, trackKey, addResult]);

  return (
    <>
      <div className="header">
        <h1>F1 Race Simulation</h1>
        <p>22 pilotos · tick fixo · simulação instantânea</p>
      </div>

      <div className="controls">
        <div className="field">
          <label>Pista</label>
          <select style={{ width: 'auto' }} value={trackKey}
                  onChange={e => setTrackKey(e.target.value)}>
            <option value="monaco">🇲🇨 Monaco — Difícil</option>
            <option value="spa">🇧🇪 Spa — Médio</option>
            <option value="interlagos">🇧🇷 Interlagos — Fácil</option>
          </select>
        </div>
        <button className="btn btn-primary" id="btnRun" onClick={handleRun}>▶ Simular Corrida</button>
        <button className="btn btn-ghost" id="btnReset" onClick={handleReset}>↺ Resetar</button>
        <div className={`det-badge ${result ? 'ok' : 'pending'}`}>
          {result ? '🎲 Seed por piloto — cada corrida é única' : 'Aguardando simulação'}
        </div>
      </div>

      <TrackPanel track={TRACKS[trackKey]} />

      <div className="progress-row">
        <span>{result ? `Volta ${lapNum} · Setor ${sectorNum}  (mini ${minisDone}/27)` : '—'}</span>
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="perf-row">
        <div className="perf-card"><div className="plabel">Tempo de execução</div>
          <div className={`pval ${perfClass}`}>{perf ? `${perf.ms.toFixed(1)} ms` : '—'}</div></div>
        <div className="perf-card"><div className="plabel">Total de ticks</div>
          <div className="pval">{perf ? perf.ticks.toLocaleString('pt-BR') : '—'}</div></div>
        <div className="perf-card"><div className="plabel">Updates / segundo real</div>
          <div className="pval">{perf ? perf.ups.toLocaleString('pt-BR') : '—'}</div></div>
        <div className="perf-card"><div className="plabel">Voltas simuladas</div>
          <div className="pval">{perf ? perf.laps : '—'}</div></div>
      </div>

      {result && (
        <div className="lap-nav" style={{ display: 'flex' }}>
          <button id="btnPlayPause" onClick={() => setPlaying(p => {
            if (!p && snapIdx >= total - 1) setSnapIdx(0);
            return !p;
          })}>{playing ? '⏸ Pausar' : '▶ Play'}</button>
          <button id="btnLapPrev" disabled={snapIdx === 0}
                  onClick={() => { setPlaying(false); setSnapIdx(i => Math.max(0, i - 1)); }}>◀</button>
          <span className="lap-label">{`Volta ${lapNum} · S${sectorNum} · ${minisDone}/27 mini`}</span>
          <button id="btnLapNext" disabled={snapIdx >= total - 1}
                  onClick={() => { setPlaying(false); setSnapIdx(i => Math.min(total - 1, i + 1)); }}>▶</button>
          <div className="speed-ctl">
            <button id="btnSlower" className="speed-step" disabled={!canSlower}
                    title="Mais devagar" onClick={stepSlower}>🐢 −</button>
            <select id="speedSelect" value={speedMs}
                    onChange={e => setSpeedMs(parseInt(e.target.value))}>
              {SPEEDS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
            <button id="btnFaster" className="speed-step" disabled={!canFaster}
                    title="Mais rápido" onClick={stepFaster}>＋ 🐇</button>
          </div>
        </div>
      )}

      {summary && (
        <div className="race-summary">
          <div className="rs-podium">
            {summary.podium.map((d, i) => (
              <div key={d.code} className={`rs-pos rs-p${i + 1}`}>
                <span className="rs-medal">{i === 0 ? '🏆' : i + 1}</span>
                <span className="rs-bar" style={{ background: DRIVER_COLOR[d.code] || '#888' }} />
                <span className="rs-code">{d.code}</span>
                <span className="rs-gap">{i === 0 ? 'VENCEDOR' : fmtGap(d.gap)}</span>
              </div>
            ))}
          </div>
          <div className="rs-fl">
            <span className="rs-fl-label">VOLTA MAIS RÁPIDA</span>
            <span className="rs-fl-code">{summary.fl.code}</span>
            <span className="rs-fl-time">{fmtTime(summary.fl.time)}</span>
          </div>
          <button className="rank-btn" id="btnRanking" onClick={() => setShowRanking(true)}>
            📋 Ver classificação completa
          </button>
        </div>
      )}

      {showRanking && result && (
        <RaceRanking
          trackName={result.track.name}
          classification={result.finalState.map((d, i) => ({
            pos: i + 1, code: d.code, gapToLeader: d.gapToLeader, bestLapTime: d.bestLapTime,
          }))}
          fastestLap={summary ? summary.fl : null}
          onClose={() => setShowRanking(false)}
        />
      )}

      {result && (
        <div className="track-wrap" ref={trackWrapRef}>
          <TrackMap result={result} snapIdx={snapIdx} playing={playing} speedMs={speedMs}
                    selected={selected} onSelect={setSelected} />
          {lights !== null && (
            <div className={`lights-overlay ${lights === 'out' ? 'out' : ''}`}>
              <div className="lights-gantry">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i}
                       className={`light-post ${lights !== 'out' && i < lights ? 'on' : ''}`}>
                    <span className="light-bulb top" />
                    <span className="light-bulb bottom" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <TimingTable frame={frame} result={result} selected={selected} onSelect={setSelected} />
    </>
  );
}
