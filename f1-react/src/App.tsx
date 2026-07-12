import { useRef } from 'react';
import { fmtTime, fmtGap } from './lib/engine/format';
import { TRACKS } from './lib/data/tracks';
import { DRIVER_COLOR } from './lib/data/drivers';
import { TrackPanel } from './components/TrackPanel';
import { TimingTable } from './components/TimingTable';
import { TrackMap } from './components/TrackMap';
import { RaceRanking } from './components/RaceRanking';
import { useRaceStore, SPEEDS, SPEED_VALUES } from './lib/stores/raceStore';
import { usePlayback } from './hooks/usePlayback';
import { useRaceStartLights } from './hooks/useRaceStartLights';
import { useAutoSaveResult } from './hooks/useAutoSaveResult';
import { useKeyboardControls } from './hooks/useKeyboardControls';

export default function App() {
  // Estado de domínio vem do raceStore; efeitos imperativos ficam em hooks.
  const trackKey    = useRaceStore(s => s.trackKey);
  const result      = useRaceStore(s => s.result);
  const snapIdx     = useRaceStore(s => s.snapIdx);
  const playing     = useRaceStore(s => s.playing);
  const speedMs     = useRaceStore(s => s.speedMs);
  const selected    = useRaceStore(s => s.selected);
  const perf        = useRaceStore(s => s.perf);
  const lights      = useRaceStore(s => s.lights);
  const showRanking = useRaceStore(s => s.showRanking);

  const setTrackKey  = useRaceStore(s => s.setTrackKey);
  const run          = useRaceStore(s => s.run);
  const reset        = useRaceStore(s => s.reset);
  const stepNext     = useRaceStore(s => s.stepNext);
  const stepPrev     = useRaceStore(s => s.stepPrev);
  const togglePlay   = useRaceStore(s => s.togglePlay);
  const setSpeed     = useRaceStore(s => s.setSpeed);
  const stepFaster   = useRaceStore(s => s.stepFaster);
  const stepSlower   = useRaceStore(s => s.stepSlower);
  const setSelected  = useRaceStore(s => s.setSelected);
  const openRanking  = useRaceStore(s => s.openRanking);
  const closeRanking = useRaceStore(s => s.closeRanking);

  const trackWrapRef = useRef<HTMLDivElement>(null);   // âncora p/ scroll suave até a pista
  const startLights = useRaceStartLights();            // sequência do semáforo (imperativo)

  usePlayback();                                       // avança snapIdx enquanto playing
  useAutoSaveResult();                                 // salva o resultado ao terminar
  useKeyboardControls();                               // espaço/setas

  const total = result ? result.sectorSnapshots.length : 0;

  const handleRun = () => {
    run();                                             // gera a corrida (store)
    requestAnimationFrame(() =>                        // "arrasta a âncora" até a pista
      trackWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    startLights.start();                               // 5 luzes → largada → playing
  };

  const handleReset = () => { startLights.cancel(); reset(); };

  const frame = result ? result.sectorSnapshots[snapIdx] : null;
  const leader = frame ? frame[0] : null;
  const lapNum = leader ? leader.lap + 1 : 0;
  const sectorNum = leader ? leader.sector + 1 : 0;
  const minisDone = leader ? leader.curMiniTimesPerSector.reduce((a, arr) => a + arr.length, 0) : 0;
  const pct = total ? ((snapIdx + 1) / total) * 100 : 0;
  const perfClass = perf ? (perf.ms < 50 ? 'good' : perf.ms < 200 ? 'warn' : '') : '';

  const idxSpeed = SPEED_VALUES.indexOf(speedMs);
  const canFaster = idxSpeed < SPEED_VALUES.length - 1 && idxSpeed !== -1;
  const canSlower = idxSpeed > 0;

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
          <button id="btnPlayPause" onClick={togglePlay}>{playing ? '⏸ Pausar' : '▶ Play'}</button>
          <button id="btnLapPrev" disabled={snapIdx === 0} onClick={stepPrev}>◀</button>
          <span className="lap-label">{`Volta ${lapNum} · S${sectorNum} · ${minisDone}/27 mini`}</span>
          <button id="btnLapNext" disabled={snapIdx >= total - 1} onClick={stepNext}>▶</button>
          <div className="speed-ctl">
            <button id="btnSlower" className="speed-step" disabled={!canSlower}
                    title="Mais devagar" onClick={stepSlower}>🐢 −</button>
            <select id="speedSelect" value={speedMs}
                    onChange={e => setSpeed(parseInt(e.target.value))}>
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
          <button className="rank-btn" id="btnRanking" onClick={openRanking}>
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
          onClose={closeRanking}
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
