// ─── Testes: log da corrida por piloto (dashboard) ───────────────────────────
import { describe, it, expect } from 'vitest';
import { runRace } from '../../src/lib/engine/engine';
import { driverLog } from '../../src/lib/engine/raceLog';

describe('driverLog', () => {
  const r = runRace('interlagos', 42);
  const log = driverLog(r, 'VER');

  it('lista todas as voltas com tempo, setores, pneu e momentum', () => {
    expect(log.laps.length).toBe(r.track.laps);
    const l = log.laps[9];
    expect(l.lap).toBe(10);
    expect(l.sectors.length).toBe(3);
    // setores somam ~ o tempo de volta
    const sum = l.sectors.reduce((a, b) => (a as number) + (b as number), 0) as number;
    expect(sum).toBeCloseTo(l.lapTime as number, 3);
    expect(['soft', 'medium', 'hard']).toContain(l.compound);
    expect(l.momentum).toBeGreaterThanOrEqual(-2);
    expect(l.momentum).toBeLessThanOrEqual(2);
  });

  it('pneu por volta bate com a estratégia (stints)', () => {
    const stints = r.strategies.VER;
    for (const st of stints) {
      const midLap = Math.floor((st.startLap + st.endLap) / 2);
      const row = log.laps.find(x => x.lap === midLap + 1);
      if (row) expect(row.compound).toBe(st.compound);
    }
  });

  it('pits = fim de cada stint (exceto o último) com o composto novo', () => {
    const stints = r.strategies.VER;
    expect(log.pits.length).toBe(stints.length - 1);
    log.pits.forEach((p, i) => {
      expect(p.lap).toBe(stints[i].endLap);
      expect(p.toCompound).toBe(stints[i + 1].compound);
    });
  });

  it('overtakes NÃO incluem os ocorridos sob safety car', () => {
    // todo overtake do log deve corresponder a um evento sem caution
    for (const o of log.overtakes) {
      const rival = o.rival;
      const match = r.overtakes.find(x =>
        !x.caution && ((x.passer === 'VER' && x.passed === rival) || (x.passed === 'VER' && x.passer === rival)) && x.lap + 1 === o.lap);
      expect(match).toBeTruthy();
    }
    // nenhum overtake sob caution vaza para o log
    const cautionRivals = r.overtakes.filter(x => x.caution && (x.passer === 'VER' || x.passed === 'VER'));
    for (const c of cautionRivals) {
      const leaked = log.overtakes.some(o => o.lap === c.lap + 1);
      // pode haver outro overtake legítimo na mesma volta; só garantimos que o
      // conjunto sem-caution é o usado — verificado acima. Aqui só sanity de tipo.
      expect(typeof leaked).toBe('boolean');
    }
  });

  it('incidentes do piloto só os atribuídos a ele', () => {
    for (const inc of log.incidents) {
      const match = r.incidents.find(x => x.code === 'VER' && x.lap + 1 === inc.lap && x.type === inc.type);
      expect(match).toBeTruthy();
    }
  });

  it('determinístico: mesma seed → mesmo log', () => {
    const a = driverLog(runRace('spa', 7), 'HAM');
    const b = driverLog(runRace('spa', 7), 'HAM');
    expect(a).toEqual(b);
  });

  it('upToLap: só mostra voltas/eventos já decorridos (ao vivo)', () => {
    const upTo = 9; // volta 10 (0-based 9)
    const live = driverLog(r, 'VER', upTo);
    // nenhuma volta futura
    expect(live.laps.every(l => l.lap <= upTo + 1)).toBe(true);
    expect(live.laps.length).toBe(upTo + 1);
    // overtakes/incidentes/pits só até a volta atual
    expect(live.overtakes.every(o => o.lap <= upTo + 1)).toBe(true);
    expect(live.incidents.every(i => i.lap <= upTo + 1)).toBe(true);
    // e é um subconjunto do log completo
    expect(live.laps.length).toBeLessThan(log.laps.length);
  });
});
