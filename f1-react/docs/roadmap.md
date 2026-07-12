# Roadmap — Simulação de Corrida Completa (backlog de features)

> Mapa de tudo que falta para uma corrida de F1 completa e, além dela, um jogo de
> manager. Este documento é o **backlog** — não a ordem de execução. Cada feature
> terá seu próprio plano de implementação quando for priorizada.
>
> Estado atual (v1): motor de **pace determinístico por piloto** — cada carro corre
> contra o relógio, em paralelo. Posições mudam por diferença de ritmo, mas **não há
> interação entre carros** (ninguém ultrapassa, bloqueia ou é afetado por quem está
> à frente). Timing ao vivo, mapa 2D, grid de largada, semáforo. Ver README.

---

## Decisões já tomadas
- **Seed reproduzível**: `runRace(track, seed?)` vai aceitar seed opcional → mesma seed = corrida idêntica (base para salvar/recarregar e testes). Hoje é `Math.random()` puro.
- **Grid fixo por ora**: sem qualifying no MVP; grid segue a ordem pré-definida.

---

## Legenda
- 🎯 **Core de corrida** — sem isso não é "corrida", é time-trial paralelo
- ⚙️ **Estratégia** — dá profundidade de decisão
- 🌦️ **Variabilidade** — torna cada corrida diferente e imprevisível
- 🏆 **Meta / manager** — camada acima da corrida (temporada, carreira)
- 🧩 **Infra** — fundação técnica que habilita as outras

Cada item tem **dados já existentes?** (campos em `tracks.ts`/`drivers.ts` que já foram
projetados mas o motor ignora) e **complexidade** aproximada (baixa/média/alta).

---

## 🧩 Infra (fundação)

### I1. Seed reproduzível no motor
`runRace(trackKey, seed?)`. Deriva a seed de cada piloto da seed-mãe (não `Math.random()`).
Habilita: salvar/recarregar corrida, replay, testes determinísticos de corrida inteira.
- Dados existentes: N/A · Complexidade: **baixa** · Pré-requisito de quase tudo abaixo.

### I2. Estado de corrida rico (posição, intervalos, estado por piloto)
Hoje o snapshot é derivado do tempo. Uma corrida com interação precisa de um **estado
mutável por piloto por tick**: posição na pista, gap ao carro da frente, pneu atual,
combustível, status (correndo/pit/DNF). Refatorar o loop de `engine.ts` de "merge de
timelines independentes" para um **loop de tick com estado compartilhado**.
- Complexidade: **alta** · É o maior divisor de águas — habilita ultrapassagem, pit, SC, DNF.

### I3. Store de estado (Zustand) e separação corrida ↔ temporada
Hoje o App.tsx segura tudo em useState. Para carreira/temporada, mover para um store.
- Complexidade: **média** · Pré-requisito da camada manager.

---

## 🎯 Core de corrida

### C1. Ultrapassagem real (car-vs-car)
Quando A alcança B dentro de uma janela, resolve `overtaking(A)` vs `defending(B)`,
modulado por `overtakingOpportunities`/`defensiveDifficulty` da pista. Sucesso = troca
de posição; falha = A perde tempo preso atrás (dirty air).
- Dados existentes: ✅ `overtaking`, `defending` (pilotos); ✅ `overtakingOpportunities`,
  `defensiveDifficulty` (pista) — **todos já definidos e hoje ignorados**.
- Complexidade: **alta** · Depende de I2. É o coração de "corrida".

### C2. Efeito de tráfego / dirty air
Carro preso atrás de outro mais lento perde ritmo (não pode usar o pace pleno). Hoje um
carro lento nunca atrapalha quem vem atrás.
- Dados existentes: parcial (usa gaps) · Complexidade: **média** · Depende de I2.

### C3. DRS (zonas de ultrapassagem)
Dentro de 1s do carro da frente numa zona de DRS → bônus de velocidade na reta. Amplifica C1.
- Dados existentes: nenhum (precisa marcar zonas de DRS por pista) · Complexidade: **média**.

### C4. Incidentes e abandonos (DNF)
Probabilidade de erro/falha por tick, modulada por `control` do piloto e
`safetyCarProbability`/`bumpiness` da pista. Hoje todos terminam sempre
(`lapsCompleted: TOTAL_LAPS` hardcoded).
- Dados existentes: ✅ `control` (piloto), `safetyCarProbability`/`bumpiness` (pista) — ignorados.
- Complexidade: **média** · Depende de I2.

### C5. Erros de pilotagem (mistake ticks)
Um setor onde o piloto perde 0.3–1.5s por erro, com probabilidade inversa a `control`.
Já está **documentado como intenção** em `f1-poc/docs/drivers.md` mas nunca implementado.
- Dados existentes: ✅ `control` · Complexidade: **baixa/média**.

---

## ⚙️ Estratégia

### E1. Pneus (compostos + degradação)
Compostos (macio/médio/duro) com ritmo base e curva de degradação diferentes. O tempo do
mini-setor passa a incluir um fator de desgaste crescente.
- Dados existentes: ✅ `tireDegradation`, `thermalStress` (pista); ✅ `smoothness` (piloto — trata os pneus).
- Complexidade: **alta** · Base da estratégia de corrida.

### E2. Pit stops
Parar troca pneu (reseta desgaste) custando `pitLaneTimeLoss`. Estratégia de 1 vs 2 paradas.
- Dados existentes: ✅ `pitLaneTimeLoss` (pista) · Complexidade: **média** · Depende de E1 + I2.

### E3. Combustível (opcional / realismo)
Carro mais pesado no início, ganha ritmo conforme queima. `fuelSensitivity` da pista modula.
- Dados existentes: ✅ `fuelSensitivity` · Complexidade: **média** · F1 moderna não reabastece — efeito sutil.

### E4. Estratégia da IA + comandos do jogador
A IA de cada carro escolhe janela de pit; no modo manager, o jogador dá ordens
(ex.: "boxe agora", "segura posição", "ataca"). É onde o "manager" encosta na corrida.
- Complexidade: **alta** · Depende de E1/E2.

---

## 🌦️ Variabilidade

### V1. Clima dinâmico (seco → chuva)
Estado de pista (seco/úmido/molhado) que muda durante a corrida. Pace muda; `adaptability`
do piloto define quem sofre/ganha. Combina com E1 (pneus de chuva).
- Dados existentes: ✅ `adaptability` (piloto); ✅ `rainProbability`, `weatherVariability`,
  `temperatureRange` (pista) — ignorados.
- Complexidade: **alta** · Depende de I2 (+E1 para pneus de chuva).

### V2. Safety Car / VSC
Um incidente (C4) pode disparar SC: agrupa o pelotão, neutraliza gaps, abre janela de pit barato.
- Dados existentes: ✅ `safetyCarProbability` · Complexidade: **alta** · Depende de C4 + I2.

### V3. Bandeiras / penalidades
Track limits, largada antecipada, incidente → penalidade de tempo (+5s) ou drive-through.
- Complexidade: **média** · Depois do core.

### V4. Evolução da pista
A pista ganha grip ao longo do fim de semana (`trackEvolution`) — mais relevante com quali/treinos.
- Dados existentes: ✅ `trackEvolution` · Complexidade: **baixa** · Sutil sem quali.

---

## 🏆 Meta / Manager

### M1. Qualifying (define o grid)
Sessão que ordena o grid pela melhor volta, substituindo a ordem fixa. **Adiada** por decisão.
- Complexidade: **média**.

### M2. Pontuação e classificação (campeonato)
Pontos por posição (25-18-15…), tabela de pilotos e construtores acumulada por corrida.
- Complexidade: **baixa** · Depende de I3.

### M3. Calendário de temporada (26 corridas)
Sequência de corridas, progressão, estado persistido.
- Complexidade: **média** · Depende de I3 + M2.

### M4. Modo carreira (equipe, contratos, desenvolvimento)
Escolher/gerir equipe, `growth` dos pilotos evolui, orçamento, desenvolvimento do carro.
- Dados existentes: ✅ `growth` (piloto) — ignorado hoje · Complexidade: **muito alta**.

### M5. Força do carro (performance por equipe)
Hoje todos os carros têm o mesmo pace base; só o piloto diferencia. Adicionar um fator de
performance por equipe (aero/motor) — o `SPREAD` do piloto foi mantido baixo justamente
para deixar espaço a isto (ver comentário em `skills.ts`).
- Dados existentes: nenhum (precisa de stats de equipe) · Complexidade: **média** · Muda muito o realismo.

### M6. Persistência (salvar/carregar)
localStorage no MVP; depois back-end. Depende de I1 (seed) para reproduzir corridas.
- Complexidade: **média**.

---

## 💅 Apresentação / QoL (paralelo, incremental)
- Mapa 2D para Monaco/Spa já existe; garantir todos os traçados afinados.
- Painel de estratégia/pneu na tabela de timing.
- Replay / scrubbing na timeline da corrida.
- Rádio de equipe / narração de eventos (ultrapassagens, pits, incidentes).
- Gráfico de gaps por volta (histórico da corrida).
- Animação de pit stop no mapa.

---

## Dependências (visão rápida)

```
I1 seed ──────────────► tudo que precisa reproduzir
I2 estado de tick ────► C1, C2, C4, E2, V1, V2   (o grande gargalo)
I3 store ─────────────► M2, M3, M4, M6

C1 ultrapassagem ◄──── C2 tráfego, C3 DRS
E1 pneus ─────────────► E2 pit ──► E4 estratégia
C4 incidentes ────────► V2 safety car
```

## Ordem sugerida de fases (rascunho — a validar)
1. **Fundação**: I1 (seed) + I2 (estado de tick). Sem isso, o resto é remendo.
2. **Corrida de verdade**: C1 (ultrapassagem) + C2 (tráfego) + C5 (erros).
3. **Estratégia**: E1 (pneus) + E2 (pit).
4. **Imprevisibilidade**: C4 (DNF) + V2 (safety car) + V1 (clima).
5. **Manager**: M5 (força do carro) + M2 (pontos) + M3 (calendário) + M6 (save).
6. **Carreira**: M4, M1 (quali), refinamentos.
