# CLAUDE.md — Guia de Contribuição e Validação

Este documento define **o padrão obrigatório** para adicionar ou migrar qualquer feature
neste projeto. Vale para código escrito por humanos e por IA (Claude). O objetivo é
manter qualidade, determinismo e testabilidade enquanto migramos para **React + TypeScript**.

---

## 0. Filosofia do projeto

1. **Simulação ≠ Apresentação.** O motor (`src/race`, `src/core`, `src/map/geometry`)
   produz **dados puros** e nunca toca no DOM. A UI só lê esses dados. Nunca misture.
2. **Determinismo é sagrado.** Dada a mesma entrada (seed + track), o motor produz o
   mesmo resultado. Qualquer feature que quebre isso precisa de justificativa explícita.
3. **Nada entra sem teste.** Toda função de lógica tem teste unitário; todo fluxo de UI
   tem teste e2e. Cobertura não pode cair.
4. **Arquivos pequenos, uma responsabilidade.** Se um arquivo passa de ~250 linhas ou
   faz mais de uma coisa, quebre em módulos (veja a estrutura de `src/`).

---

## 1. Stack alvo

| Camada | Hoje (POC) | Alvo (MVP) |
|---|---|---|
| Motor de simulação | JS puro (`src/`) | **TypeScript** (portar, adicionar tipos) |
| UI | `index.html` + DOM manual | **React 18** + componentes funcionais + hooks |
| Estado (carreira) | globais | **Zustand** (store central) |
| Build | nenhum | **Vite** |
| Testes lógica | Node + `vm` | **Vitest** |
| Testes e2e | Playwright | **Playwright** (mantém) |
| Save/load | nenhum | localStorage (MVP) |

> **React funcional com hooks.** Componentes puros que leem dados do motor/store.
> A animação do mapa (`requestAnimationFrame`) fica em `useEffect` com cleanup.
> Memoize (`useMemo`) cálculos derivados pesados dos snapshots quando necessário —
> mas nunca recalcule a simulação na UI (ela vem pronta do motor).

---

## 2. Gate de validação — TODA feature nova ou migrada DEVE passar

Execute na ordem. Se qualquer passo falhar, a feature **não entra**.

### 2.1 Lógica pura (motor, helpers)
- [ ] Função é **pura** quando possível (sem efeito colateral, sem DOM, sem `Date.now`/`Math.random` fora de seed)
- [ ] Tem **teste unitário** cobrindo: caso normal, bordas, e entrada degenerada (÷0, vazio, null)
- [ ] Se toca no motor: **teste de determinismo** (mesma seed → resultado idêntico)
- [ ] `npm run coverage` passa os thresholds (100% stmts/funcs/lines, ≥95% branch)

### 2.2 UI (componentes React)
- [ ] Componente só **lê** dados do motor/store — não recalcula simulação
- [ ] Tem **teste e2e** (Playwright) do fluxo principal
- [ ] Zero erros no console (o e2e já falha se houver `console.error`/`pageerror`)
- [ ] Layout **estável**: nada "treme" ao re-renderizar (larguras fixas, sem reflow por dado)
- [ ] `requestAnimationFrame`/timers em `useEffect` com **cleanup** (sem leak ao desmontar)

### 2.3 Regressão
- [ ] Bugs já corrigidos têm teste que impede a volta (ver seção "REGRESSÃO" em `test-unit.js`)
- [ ] `npm run test:all` verde (unit + e2e)

### 2.4 Estrutura
- [ ] Arquivo no diretório certo (ver §4); nenhum passa de ~250 linhas
- [ ] Sem lixo: screenshots vão para `screenshots/` (gitignored), nada solto na raiz

---

## 3. Regras específicas para MIGRAR uma feature (JS → React/TS)

Migração NÃO é reescrita. Siga este processo para garantir paridade:

1. **Congele o comportamento atual com teste.** Antes de migrar, garanta que a feature
   tem teste no `test-unit.js`/`test.js`. Se não tiver, escreva ANTES de migrar.
2. **Porte o motor primeiro, sem tocar na lógica.** `src/race`, `src/core`,
   `src/map/geometry` viram `.ts` com tipos — a lógica é a MESMA. Os testes unitários
   existentes devem passar com mudança mínima (só o import).
3. **Prove paridade numérica.** Um teste deve comparar a saída do motor portado com a
   saída conhecida do motor antigo (mesma seed → mesmos tempos). Determinismo é o oráculo.
4. **Só então migre a UI.** O componente React consome o motor portado. O teste e2e
   valida que a tela faz a mesma coisa que fazia no `index.html`.
5. **Remova o código antigo só quando o novo passar em tudo.** Nunca deixe os dois vivos.

> **Regra de ouro da migração:** o motor determinístico é o contrato. Se `runRace(seed)`
> dá os mesmos números antes e depois, a migração está correta por construção.

---

## 3.5. Passos difíceis exigem um `.md` de manutenção (OBRIGATÓRIO)

**Toda vez que um passo se provar difícil** — algo que exigiu investigação, tentativa e
erro, calibração manual, uma âncora de validação, ou um script de uso único para chegar
ao valor certo — **crie um documento em `docs/` explicando como fazer a manutenção**.
Não deixe o conhecimento só no código nem só no histórico do chat: o próximo (humano ou
IA) vai repetir o sofrimento sem ele.

O gatilho é simples: **se você errou pelo menos uma vez antes de acertar, documente.**

O doc de manutenção deve conter:
- [ ] **O problema** — por que é traiçoeiro (a armadilha que fez errar).
- [ ] **A solução** — o método que de fato funcionou, passo a passo, reproduzível.
- [ ] **Como validar** — a âncora/oráculo que prova que o resultado está certo antes de confiar.
- [ ] **Scripts de uso único** — cole o script inline no `.md` (marque "apague depois de usar"); não deixe `.cjs` solto no repo.
- [ ] **Valores atuais** — tabela com os valores calibrados e como foram obtidos.
- [ ] **Armadilhas conhecidas** — a lista de "não caia nisto de novo".

Adicione um link para o novo doc no `README`/índice de `docs/` quando fizer sentido.

**Exemplo de referência:** `f1-react/docs/track-start-finish-line.md` — como posicionar a
linha de largada (`startFrac`) num traçado GeoJSON. A armadilha (fração por índice de
vértice vs. arc-length) e a âncora de validação (a curva mais fechada e única do circuito)
estão documentadas exatamente porque custaram várias tentativas erradas.

---

## 4. Estrutura de diretórios

### Hoje (POC)
```
src/
  core/    rng.js, format.js          — utilitários puros
  data/    tracks.js, drivers.js      — dados do jogo
  race/    constants, skills,
           timeline, engine           — motor de simulação
  map/     geometry, mapgraph         — geometria/velocidade do mapa 2D
index.html                            — UI (a ser migrada)
tests/     test-unit.js, test.js      — unit (vm) + e2e (Playwright)
docs/      *.md                       — especificações
```

### Alvo (MVP React + Vite) — proposta
```
src/
  lib/
    engine/     (core, race, map — motor portado p/ TS, sem mudança de lógica)
    data/       (tracks, drivers — TS)
    stores/     (career, championship, save — Zustand)
  components/   (Timing.tsx, TrackMap.tsx, Standings.tsx, Controls.tsx, ...)
  hooks/        (usePlayback.ts, useRaceAnimation.ts)
  pages/        (telas: calendário, corrida, garagem, mercado)
  App.tsx, main.tsx
tests/
  unit/         (Vitest — importa de src/lib/engine)
  e2e/          (Playwright)
```

---

## 5. Comandos

```bash
npm test           # testes unitários (lógica)
npm run test:e2e   # testes de UI (Playwright)
npm run test:all   # tudo — rode ANTES de considerar uma feature pronta
npm run coverage   # cobertura + valida thresholds

npx serve          # roda o projeto localmente
```

Após migração para Vite, adicionar: `npm run dev`, `npm run build`, `npm run preview`.

---

## 6. Invariantes do motor (nunca podem quebrar)

Testes que travam o contrato da simulação — se algum falhar, a mudança está errada:

- Mesma seed → resultado idêntico (determinismo)
- Todos os 20 pilotos completam todas as voltas
- `finalState` ordenado por tempo total; líder com gap 0; gaps crescentes
- `bestLapTime ≤ lastLapTime` para todo piloto
- Gaps monotônicos em todo frame de snapshot
- Playback não congela quando o líder termina (fase tail cobre os retardatários)
- Cores no modelo F1 live: roxo = recorde da corrida, verde = PB próprio, amarelo = atrás do PB
- `sectorRatio` de cada pista soma 1.0; `miniSectors` = 3×9 de tipos válidos

---

## 7. Sobre IA (Claude) neste projeto

- **React + TS foi escolhido por confiabilidade.** Claude tem ampla base de treino de
  React funcional + hooks, então a taxa de acerto é alta. Ainda assim, a rede de segurança
  é **teste + `npm run test:all` verde** antes de qualquer feature ser considerada pronta.
- Ao gerar componente React: funcional, hooks, tipos explícitos nas props.
- `requestAnimationFrame`/timers sempre em `useEffect` com função de cleanup.
- Nunca recalcule a simulação na UI — os dados vêm prontos do motor (`runRace`).
- Não introduza dependências novas sem necessidade clara (o motor é TS puro, sem libs).
