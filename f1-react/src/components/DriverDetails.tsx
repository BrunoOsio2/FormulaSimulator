import { useEffect, useState, type MouseEvent } from 'react';
import type { RaceResult, DriverCode } from '../lib/engine/types';
import { driverLog } from '../lib/engine/raceLog';
import { DRIVER_COLOR, DRIVER_FLAG } from '../lib/data/drivers';
import { COMPOUND_COLOR, COMPOUNDS, type Compound } from '../lib/engine/tyres';
import { fmtTime, fmtSec } from '../lib/engine/format';

interface Props {
  result: RaceResult;
  code: DriverCode;
  upToLap?: number;   // volta atual do playback (0-based); ausente/Infinity = corrida toda
  onClose: () => void;
}

type Tab = 'laps' | 'overtakes' | 'incidents';

const MOM = (m: number) => {
  const map: Record<number, { a: string; c: string }> = {
    [2]: { a: '▲', c: '#24d15e' }, [1]: { a: '△', c: '#6ee88a' }, [0]: { a: '▬', c: '#f5c518' },
    [-1]: { a: '▽', c: '#ff9d3a' }, [-2]: { a: '▼', c: '#e1483a' },
  };
  return map[m] ?? map[0];
};

function TyreDot({ c }: { c: Compound }) {
  return <span className="dd-tyre" style={{ borderColor: COMPOUND_COLOR[c] }}>{COMPOUNDS[c].label}</span>;
}

// Dashboard de detalhes do piloto: 3 tabs (Voltas / Ultrapassagens / Incidentes & Pit).
export function DriverDetails({ result, code, upToLap = Infinity, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('laps');
  const log = driverLog(result, code, upToLap);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div className="dd-overlay" onClick={onClose}>
      <div className="dd-panel" onClick={stop} role="dialog" aria-label={`Detalhes de ${code}`}>
        <div className="dd-head">
          <span className="dd-flag">{DRIVER_FLAG[code]}</span>
          <span className="dd-code" style={{ color: DRIVER_COLOR[code] }}>{code}</span>
          <span className="dd-sub">detalhes da corrida</span>
          <button className="dd-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="dd-tabs">
          <button className={tab === 'laps' ? 'on' : ''} onClick={() => setTab('laps')}>Voltas</button>
          <button className={tab === 'overtakes' ? 'on' : ''} onClick={() => setTab('overtakes')}>Ultrapassagens</button>
          <button className={tab === 'incidents' ? 'on' : ''} onClick={() => setTab('incidents')}>Incidentes &amp; Pit</button>
        </div>

        <div className="dd-body">
          {tab === 'laps' && (
            <table className="dd-table">
              <thead><tr><th>V</th><th>PNEU</th><th>S1</th><th>S2</th><th>S3</th><th>VOLTA</th><th>FORMA</th></tr></thead>
              <tbody>
                {log.laps.map(l => {
                  const m = MOM(l.momentum);
                  return (
                    <tr key={l.lap}>
                      <td>{l.lap}</td>
                      <td><TyreDot c={l.compound} /></td>
                      <td>{fmtSec(l.sectors[0])}</td>
                      <td>{fmtSec(l.sectors[1])}</td>
                      <td>{fmtSec(l.sectors[2])}</td>
                      <td className="dd-laptime">{fmtTime(l.lapTime)}</td>
                      <td style={{ color: m.c, fontWeight: 800 }}>{m.a}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {tab === 'overtakes' && (
            log.overtakes.length === 0
              ? <div className="dd-empty">Nenhuma ultrapassagem (fora de safety car).</div>
              : <table className="dd-table">
                  <thead><tr><th>VOLTA</th><th>EVENTO</th><th>RIVAL</th></tr></thead>
                  <tbody>
                    {log.overtakes.map((o, i) => (
                      <tr key={i}>
                        <td>{o.lap}</td>
                        <td className={o.kind === 'passou' ? 'dd-gain' : 'dd-loss'}>
                          {o.kind === 'passou' ? '▲ passou' : '▼ ultrapassado'}
                        </td>
                        <td style={{ color: DRIVER_COLOR[o.rival] }}>{o.rival}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          )}

          {tab === 'incidents' && (
            <div className="dd-incidents">
              <div className="dd-section-title">Pit stops</div>
              {log.pits.length === 0
                ? <div className="dd-empty">Nenhuma parada.</div>
                : <table className="dd-table">
                    <thead><tr><th>VOLTA</th><th>TROCOU PARA</th></tr></thead>
                    <tbody>
                      {log.pits.map((p, i) => (
                        <tr key={i}><td>{p.lap}</td><td><TyreDot c={p.toCompound} /> {p.toCompound}</td></tr>
                      ))}
                    </tbody>
                  </table>}
              <div className="dd-section-title">Incidentes</div>
              {log.incidents.length === 0
                ? <div className="dd-empty">Nenhum incidente.</div>
                : <table className="dd-table">
                    <thead><tr><th>VOLTA</th><th>TIPO</th></tr></thead>
                    <tbody>
                      {log.incidents.map((inc, i) => (
                        <tr key={i}>
                          <td>{inc.lap}</td>
                          <td>{inc.type === 'light' ? 'Erro (leve)' : inc.type === 'vsc' ? 'Causou VSC' : 'Causou Safety Car'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
