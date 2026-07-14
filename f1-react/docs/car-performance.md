# M5 — Força do Carro por Equipe

> **Status:** planejado · **Dependências:** E1/E2 (pneus/pit) ✅ · **Prioridade:** alta

## Contexto

Hoje todos os 22 carros partem do mesmo `baseMini` (só a pista define o ritmo base) e o
`SPREAD` do piloto foi mantido propositalmente baixo (`0.15` em `skills.ts`) para deixar
espaço ao carro. Resultado: VER vence pela habilidade pura, mas um HAD mediano num Red Bull
bom deveria conseguir bater um SAI excepcional num Williams fraco — o que não acontece hoje.

Este item adiciona um **fator de performance por equipe** que multiplica o `baseMini` de
cada piloto antes do cálculo de pace, fechando o tripé:

```
ritmo = baseMini × carFactor × (1 + variation) × skillModifier × tyreModifier
```

---

## Sistema de peças estilo Forza Horizon (brainstorm → implementação futura)

A ideia é que cada ponto de performance do carro corresponda a uma **peça real da F1**.
No modo carreira (M4), o jogador compra e melhora peças individuais; os pontos abstratos
sobem conforme as peças evoluem. Para o MVP (agora) os pontos são fixos por equipe.

### Mapeamento peça F1 → ponto abstrato

| Peça real F1 | Ponto abstrato | Efeito no ritmo |
|---|---|---|
| **Unidade de potência (PU/ICE)** | `engine` (1–99) | velocidade de ponta, aceleração saída de curva lenta, ERS |
| **Asa dianteira + traseira + fundo plano/difusor** | `aero` (1–99) | downforce em curvas rápidas, arrasto na reta |
| **Suspensão (braços, molas, amortecedores)** | `suspension` (1–99) | tração em curvas lentas/medianas, estabilidade em frenagem |
| **Sistema de freios (discos, paquímetros)** | `brakes` (1–99) | eficiência de frenagem, aproveitamento de frenagem tardia |
| **Chassis / monocoque** | `chassis` (1–99) | rigidez estrutural, base amplificadora dos outros componentes |
| **Pneus (Pirelli)** | — | já coberto pelo E1/E2; iguais para todos |
| **Câmbio / transmissão** | parte de `chassis` | tempo de mudança, saída de curva lenta |
| **ERS (MGU-K, MGU-H, bateria)** | parte de `engine` | boost na largada e em ultrapassagem |

### `CarPerf` — 5 pontos abstratos (1–99)

```ts
export interface CarPerf {
  engine:     number;   // potência / PU
  aero:       number;   // downforce vs drag
  suspension: number;   // geometria / amortecedor
  brakes:     number;   // sistema de frenagem
  chassis:    number;   // estrutura base
}
```

### Como os pontos se traduzem em pace por setor

Cada setor da pista é dominado por características diferentes do carro:

```
S0 (retas + frenagem pesada)       → engine 50% + brakes 30% + chassis 20%
S1 (curvas rápidas + medianas)     → aero 50% + suspension 30% + chassis 20%
S2 (curvas lentas + saídas)        → chassis 40% + suspension 30% + engine 30%
```

Fórmula:

```
rawScore(sector)  = média ponderada dos pontos (0..1, onde 99 = 1.0)
carFactor(sector) = 1 - (rawScore - REF_SCORE) × CAR_SPREAD
```

- `REF_SCORE ≈ 0.75` (carro médio do grid)
- `CAR_SPREAD` calibrado para ~0.3–0.5 s/volta de spread entre melhor e pior carro
- fator < 1 = mais rápido que a referência; fator > 1 = mais lento

---

## Grid 2026 — pontos estimados (MVP, valores calibráveis)

| Equipe | Pilotos | engine | aero | suspension | brakes | chassis | tier |
|---|---|---|---|---|---|---|---|
| Red Bull | VER, HAD | 93 | 95 | 92 | 94 | 93 | elite |
| McLaren | NOR, PIA | 90 | 96 | 91 | 91 | 92 | elite |
| Ferrari | LEC, HAM | 94 | 90 | 89 | 93 | 90 | forte |
| Mercedes | RUS, ANT | 91 | 88 | 90 | 90 | 88 | forte |
| Aston Martin | ALO, STR | 88 | 84 | 85 | 87 | 84 | médio-alto |
| Audi | HUL, BOR | 80 | 82 | 80 | 80 | 80 | médio |
| Alpine | GAS, COL | 78 | 80 | 78 | 78 | 76 | médio |
| Williams | ALB, SAI | 90 ¹ | 75 | 76 | 76 | 76 | motor ok, aero fraca |
| Haas | OCO, BEA | 76 | 74 | 74 | 75 | 73 | médio-baixo |
| Racing Bulls | LAW, LIN | 93 ¹ | 72 | 73 | 74 | 72 | motor RB, chassis pequeno |
| Cadillac | PER, BOT | 72 | 68 | 70 | 70 | 68 | estreante |

¹ Williams usa PU Mercedes; Racing Bulls usa PU Red Bull.

---

## Implementação — o que criar/alterar

### Arquivos novos

**`src/lib/data/cars.ts`**
- `CAR_PERF: Record<TeamId, CarPerf>` — os 11 objetos da tabela acima
- `DRIVER_TEAM: Record<DriverCode, TeamId>` — mapeamento dos 22 pilotos
- `carPaceFactor(car: CarPerf, sector: 0|1|2, track: Track): number` — a fórmula acima

### Arquivos modificados

**`src/lib/engine/skills.ts`** → `buildDrivers`
- Hoje: `baseMini = track.baseLap × sectorRatio[s] / 9` (igual para todos)
- Depois: `baseMini[s] = baseMiniBase[s] × carPaceFactor(team, s, track)` por setor

**`src/lib/engine/types.ts`** (opcional)
- Expor `TeamId` como tipo público se necessário

### UI (opcional, incremento visual)
- No painel de detalhes do piloto (DriverDetails ou TrackPanel), mostrar as 5 barras
  de performance do carro como já é feito para os atributos da pista no TrackPanel.
- No mapa, opcional: mostrar o nome da equipe no tooltip do carro.

---

## Calibração

Medir com script tsx após implementar:

```ts
// spread de pace esperado: Red Bull ~0.3-0.5s/volta mais rápido que Cadillac
const rbFactor  = carPaceFactor(CAR_PERF['Red Bull'], 0, TRACKS.interlagos);
const cadFactor = carPaceFactor(CAR_PERF['Cadillac'], 0, TRACKS.interlagos);
const deltaPerMini = (cadFactor - rbFactor) × baseMini[0];
console.log('spread/volta estimado:', deltaPerMini × 27, 's');
```

Ajustar `CAR_SPREAD` até o spread ficar ~0.4s/volta (realista para 2026).

---

## Mecânica de manager — brainstorm para M4 (modo carreira)

Quando o modo carreira existir, o `CAR_PERF` passa a ser **estado mutável** do jogo:

- **Créditos** ganhos por posição em cada corrida
- **Peças** têm nível 1–5 e custo crescente; cada nível incrementa o ponto correspondente
- **Tokens de desenvolvimento** (limitados por temporada, como a F1 real): melhorias gastam
  tokens além de créditos
- **Fiabilidade**: peça de nível 5 tem chance de falha → integra com C4 (incidentes)
- **Rivais** melhoram as próprias peças a cada temporada → corrida tecnológica
- **Homologação**: peças escolhidas para a temporada são bloqueadas (como FIA)
- `CAR_PERF` do MVP vira o estado inicial da temporada 1

---

## Testes

- `cars.test.ts`: `carPaceFactor` elite < 1.0 < fraco; spread RB→Cadillac dentro da faixa
- `engine.test.ts`: ajustar threshold "VER dominante" se necessário; seed reproduzível intacto
- `npm test` + `npm run test:e2e` verdes

---

## Fora de escopo (agora)

- Compra/melhoria de peças (depende de M4 modo carreira)
- Balanceamento competitivo por raça (atualizações de desenvolvimento mid-season)
- DRS (C3) — muda como `engine`/`aero` interagem na reta; pode vir junto
