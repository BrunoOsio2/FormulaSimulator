import { useEffect, type MouseEvent } from 'react';
import type { ResultRow } from '../lib/stores/raceRecord';
import { DRIVER_COLOR } from '../lib/data/drivers';
import { fmtGap, fmtTime } from '../lib/engine/format';

interface Props {
  trackName: string;
  classification: ResultRow[];
  fastestLap: { code: string; time: number } | null;
  onClose: () => void;
}

// Modal com a classificação completa da corrida (todas as posições). Pódio
// destacado; fecha no X, no backdrop ou com Esc.
export function RaceRanking({ trackName, classification, fastestLap, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div className="ranking-overlay" onClick={onClose}>
      <div className="ranking-panel" onClick={stop} role="dialog" aria-label="Classificação da corrida">
        <div className="ranking-head">
          <span className="ranking-title">CLASSIFICAÇÃO — {trackName}</span>
          <button className="ranking-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="ranking-cols">
          <span className="rc-pos">POS</span>
          <span className="rc-driver">PILOTO</span>
          <span className="rc-grid">LARGOU</span>
          <span className="rc-delta">+/−</span>
          <span className="rc-gap">GAP</span>
          <span className="rc-best">MELHOR</span>
        </div>
        <div className="ranking-list">
          {classification.map((r) => {
            const isFL = fastestLap?.code === r.code;
            const delta = r.startPos - r.pos;   // >0 ganhou posições, <0 perdeu
            const deltaCls = delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'even';
            const deltaTxt = delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '–';
            return (
              <div key={r.code} className={`rank-row ${r.pos <= 3 ? `rank-p${r.pos}` : ''}`}>
                <span className="rank-pos">{r.pos}</span>
                <span className="rank-bar" style={{ background: DRIVER_COLOR[r.code] || '#888' }} />
                <span className="rank-code">{r.code}</span>
                <span className="rank-grid" title="Posição de largada">P{r.startPos}</span>
                <span className={`rank-delta ${deltaCls}`} title="Posições ganhas/perdidas">{deltaTxt}</span>
                <span className="rank-gap">{r.pos === 1 ? 'VENCEDOR' : fmtGap(r.gapToLeader)}</span>
                <span className={`rank-best ${isFL ? 'fl' : ''}`}>
                  {fmtTime(r.bestLapTime)}{isFL ? ' ⏱' : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
