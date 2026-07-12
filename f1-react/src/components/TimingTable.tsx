import { useState } from 'react';
import type { RaceResult, Snapshot } from '../lib/engine/types';
import { fmtTime, fmtGap, fmtSec } from '../lib/engine/format';
import { DRIVER_COLOR } from '../lib/data/drivers';

// Calcula a classe de cor de cada mini-setor de cada piloto no frame atual.
// Setor completo → cor consolidada (sectorColors); em andamento → neutro/vazio.
function miniColorsFor(rows: Snapshot, sectorColors: Record<string, string>): string[][][] {
  return rows.map(r => {
    const grid: string[][] = [[], [], []];
    for (let s = 0; s < 3; s++) {
      const sectorTime = r.curSectorTimes[s];
      if (sectorTime != null) {
        const cls = sectorColors[`${r.code}|${r.lap}|${s}`] || 'ms-mid';
        for (let m = 0; m < 9; m++) grid[s][m] = cls;
      } else {
        const arr = r.curMiniTimesPerSector[s];
        for (let m = 0; m < 9; m++) grid[s][m] = arr && arr[m] != null ? 'ms-run' : 'ms-empty';
      }
    }
    return grid;
  });
}

// Mapeia a classe do mini-setor para a classe de cor do texto do tempo de setor.
const TIME_COLOR: Record<string, string> = {
  'ms-fastest': 'st-purple',
  'ms-fast':    'st-green',
  'ms-mid':     'st-yellow',
};

// Seta de momentum/forma (C6): setas de TEXTO (respeitam cor CSS, ao contrário
// de emoji). Verde = boa, amarelo = neutra, vermelho = ruim.
const MOMENTUM_ARROW: Record<number, { arrow: string; cls: string; title: string }> = {
  [2]:  { arrow: '▲', cls: 'mom-up2',     title: 'Inspirado (forma ótima)' },
  [1]:  { arrow: '△', cls: 'mom-up1',     title: 'Em alta' },
  [0]:  { arrow: '▬', cls: 'mom-neutral', title: 'Neutro' },
  [-1]: { arrow: '▽', cls: 'mom-down1',   title: 'Em baixa' },
  [-2]: { arrow: '▼', cls: 'mom-down2',   title: 'Apagado (forma ruim)' },
};

interface Props {
  frame: Snapshot | null;
  result: RaceResult | null;
  selected: string | null;
  onSelect: (code: string | null) => void;
}

type GapMode = 'leader' | 'interval';

export function TimingTable({ frame, result, selected, onSelect }: Props) {
  // Modo da coluna de gap: ao líder (P1) ou intervalo para o carro da frente.
  const [gapMode, setGapMode] = useState<GapMode>('leader');

  if (!frame || !result) {
    return (
      <div className="table-wrap">
        <table id="timingTable">
          <thead><tr>
            <th>POS</th><th>PILOTO</th><th>FORMA</th><th>VOLTA</th><th>MELHOR VOLTA</th>
            <th>GAP LÍDER</th><th className="th-mini">MINI-SETORES</th><th>ÚLTIMA VOLTA</th>
          </tr></thead>
          <tbody id="timingBody">
            <tr><td colSpan={8} className="empty-state">Clique em "Simular Corrida" para começar</td></tr>
          </tbody>
        </table>
      </div>
    );
  }

  let fastestLap = Infinity;
  for (const r of frame) if (r.bestLapTime != null && r.bestLapTime < fastestLap) fastestLap = r.bestLapTime;
  const colors = miniColorsFor(frame, result.sectorColors);

  const toggleGap = () => setGapMode(m => (m === 'leader' ? 'interval' : 'leader'));

  return (
    <div className="table-wrap">
      <table id="timingTable">
        <colgroup>
          <col style={{ width: 46 }} /><col style={{ width: 74 }} /><col style={{ width: 52 }} />
          <col style={{ width: 54 }} /><col style={{ width: 96 }} /><col style={{ width: 96 }} />
          <col style={{ width: 360 }} /><col style={{ width: 96 }} />
        </colgroup>
        <thead><tr>
          <th>POS</th><th>PILOTO</th><th>FORMA</th><th>VOLTA</th><th>MELHOR VOLTA</th>
          <th className="th-gap-toggle" onClick={toggleGap} title="Clique para alternar entre gap ao líder e intervalo">
            {gapMode === 'leader' ? 'GAP LÍDER' : 'INTERVALO'} ⇅
          </th>
          <th className="th-mini">MINI-SETORES</th><th>ÚLTIMA VOLTA</th>
        </tr></thead>
        <tbody id="timingBody">
          {frame.map((r, i) => {
            const posClass = i === 0 ? 'pos-medal-1' : i === 1 ? 'pos-medal-2' : i === 2 ? 'pos-medal-3' : '';
            const bestClass = (r.bestLapTime != null && r.bestLapTime <= fastestLap + 1e-9)
              ? 'td-time td-fastest-lap' : 'td-time';

            // Intervalo = diferença de gap para o carro imediatamente à frente.
            const interval = i === 0 ? 0 : r.gapToLeader - frame[i - 1].gapToLeader;
            const gapValue = gapMode === 'leader' ? r.gapToLeader : interval;
            // Alerta de disputa: intervalo < 1s (só faz sentido fora do líder).
            const battle = i > 0 && interval > 0 && interval < 1;
            const gapCls = i === 0 ? 'td-gap leader' : (battle ? 'td-gap battle' : 'td-gap');

            return (
              <tr key={r.code}
                  className={r.code === selected ? 'row-selected' : undefined}
                  onClick={() => onSelect(selected === r.code ? null : r.code)}>
                <td className={`td-pos ${posClass}`}>{i + 1}{r.finished ? ' 🏁' : ''}</td>
                <td className="td-driver">
                  <span className="team-bar" style={{ background: DRIVER_COLOR[r.code] || '#888' }} />
                  {r.code}
                </td>
                {(() => {
                  const m = MOMENTUM_ARROW[r.momentum] || MOMENTUM_ARROW[0];
                  return <td className={`td-momentum ${m.cls}`} title={m.title}>{m.arrow}</td>;
                })()}
                <td className="td-lap">{r.lap}</td>
                <td className={bestClass}>{fmtTime(r.bestLapTime)}</td>
                <td className={gapCls}>{fmtGap(gapValue)}</td>
                <td className="td-mini">
                  <div className="mini-bar">
                    {[0, 1, 2].map(s => {
                      const done = r.curSectorTimes[s] != null;
                      const stCls = done ? (TIME_COLOR[colors[i][s][0]] || '') : '';
                      return (
                        <span key={s} style={{ display: 'contents' }}>
                          <div className="mini-bar-group">
                            {[0,1,2,3,4,5,6,7,8].map(m => (
                              <div key={m} className={`ms-cell ${colors[i][s][m] || 'ms-empty'}`} />
                            ))}
                          </div>
                          <span className={`sector-time ${stCls}`}>
                            {done ? fmtSec(r.curSectorTimes[s]) : ''}
                          </span>
                          {s < 2 && <div className="mini-bar-sep" />}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="td-time">{fmtTime(r.lastLapTime)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
