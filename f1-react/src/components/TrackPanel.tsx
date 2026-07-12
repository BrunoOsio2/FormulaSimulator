import type { Track } from '../lib/engine/types';
import { fmtTime } from '../lib/engine/format';

const ATTR_GROUPS: { title: string; attrs: [string, string][] }[] = [
  { title: 'Layout', attrs: [
    ['lowSpeedCorners', 'Curvas lentas'], ['mediumSpeedCorners', 'Curvas médias'],
    ['highSpeedCorners', 'Curvas rápidas'], ['straights', 'Retas'],
    ['elevationChanges', 'Desnível'], ['technicality', 'Tecnicidade'],
  ]},
  { title: 'Grip & Superfície', attrs: [
    ['trackGrip', 'Grip da pista'], ['surfaceAbrasion', 'Abrasão'], ['bumpiness', 'Irregularidade'],
  ]},
  { title: 'Ultrapassagem', attrs: [
    ['overtakingOpportunities', 'Oportunidades'], ['defensiveDifficulty', 'Dificuldade defesa'],
  ]},
  { title: 'Clima', attrs: [
    ['rainProbability', 'Chuva'], ['weatherVariability', 'Variabilidade'], ['temperatureRange', 'Amplitude térmica'],
  ]},
  { title: 'Pneus', attrs: [
    ['tireDegradation', 'Degradação'], ['thermalStress', 'Estresse térmico'], ['fuelSensitivity', 'Sensib. combustível'],
  ]},
  { title: 'Corrida', attrs: [
    ['averageSpeed', 'Velocidade média'], ['safetyCarProbability', 'Safety Car'], ['trackEvolution', 'Evolução da pista'],
  ]},
];

function barColor(v: number): string {
  if (v <= 3) return '#22c55e';
  if (v <= 6) return '#facc15';
  return '#ef4444';
}

const DIFF_LABEL: Record<string, string> = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };

export function TrackPanel({ track }: { track: Track }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="track-panel">
        <div className="track-header">
          <span className="track-name">{track.name}</span>
          <span className="track-country">{track.country}</span>
          <span className={`difficulty-badge ${track.difficulty}`}>{DIFF_LABEL[track.difficulty]}</span>
          <span className="track-laps">{track.laps} voltas · base {fmtTime(track.baseLap)}</span>
        </div>
        <div className="track-groups">
          {ATTR_GROUPS.map(g => (
            <div className="attr-group" key={g.title}>
              <div className="attr-group-title">{g.title}</div>
              {g.attrs.map(([key, label]) => {
                const v = track[key] as number;
                return (
                  <div className="attr-row" key={key}>
                    <span className="attr-label">{label}</span>
                    <div className="attr-bar-wrap">
                      <div className="attr-bar" style={{ width: `${v * 10}%`, background: barColor(v) }} />
                    </div>
                    <span className="attr-val">{v}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
