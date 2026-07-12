# F1 Race Simulation — Manager

Simulador determinístico de corridas de F1 com motor de tick fixo, mapa 2D animado
e timing ao vivo. Base para um futuro jogo de manager (26 corridas + modo carreira).

Stack: **React 18 + TypeScript + Vite**. Motor de simulação em TS puro, testável e
determinístico (ver [CLAUDE.md](../f1-poc/CLAUDE.md) para o padrão do projeto).

---

## Como rodar

Pré-requisito: **Node 18+**.

```bash
cd f1-react
npm install        # instala dependências (primeira vez)
npm run dev        # inicia o servidor de desenvolvimento
```

Abra a URL que aparecer (padrão: **http://localhost:5173**).

Para testar no **celular** (mesma rede Wi-Fi):
```bash
npm run dev -- --host      # expõe na rede
ipconfig getifaddr en0     # descobre o IP do Mac → http://SEU-IP:5173
```

### Usando o app
1. Escolha a **pista** (Interlagos tem mapa 2D; Monaco/Spa mostram só o timing).
2. Clique **▶ Simular Corrida**.
3. Use os controles de playback: **Play/Pausa**, **◀ ▶** (passo a passo) e o
   seletor de velocidade (de "Muito lento" a "Muito rápido").

---

## Scripts

```bash
npm run dev         # servidor de desenvolvimento (Vite)
npm run build       # build de produção (typecheck + bundle)
npm run preview     # serve o build de produção localmente

npm test            # testes unitários do motor (Vitest)
npm run test:e2e    # testes de UI (Playwright)
npm run test:all    # unitários + e2e
npm run coverage    # cobertura do motor
```

---

## Estrutura

```
src/
  lib/
    engine/   rng, format, skills, timeline, engine, types  — motor de simulação (TS puro)
    data/     tracks, drivers                                — dados do jogo
    map/      geometry, mapgraph                             — geometria e velocidade do mapa 2D
  components/ TrackPanel, TimingTable, TrackMap              — UI React
  App.tsx     orquestra estado + playback
  main.tsx    entrada
  index.css   estilos
tests/
  unit/       Vitest — motor + teste de PARIDADE com o POC original
  e2e/        Playwright — fluxos de UI
```

---

## Como funciona

- **Determinístico:** cada corrida é pré-computada em timelines por piloto (27
  mini-setores por volta). Seed aleatória por piloto → cada corrida é única, mas
  reprodutível dado o mesmo estado.
- **Simulação ≠ Apresentação:** o motor produz dados puros (`runRace`); a UI só os
  desenha. Isso mantém o motor testável e portável.
- **Cores (modelo F1 live):** roxo = recorde da corrida no setor · verde = melhor
  pessoal · amarelo = atrás do próprio melhor.
- **Mapa 2D:** traçado real do Interlagos (extraído de SVG), carros deslizam com
  velocidade variável por curvatura (freiam nas curvas, aceleram nas retas).

Migrado 1:1 do POC em JS puro (`../f1-poc`), com **teste de paridade numérica**
garantindo que a lógica não mudou.
