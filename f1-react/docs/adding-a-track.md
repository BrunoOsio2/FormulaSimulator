# Como adicionar uma nova pista

Guia passo a passo para adicionar um circuito ao simulador. **Não precisa de IA
nem de código novo** — o sistema é data-driven: uma pista é um objeto em
`src/lib/data/tracks.ts`. O único passo que exige atenção manual é extrair a
string do traçado (`svgPath`) de dentro do arquivo SVG.

TL;DR: **~10 minutos por pista**, tudo em `tracks.ts`.

---

## Visão geral do que uma pista precisa

Cada pista é uma entrada em `TRACKS` (`src/lib/data/tracks.ts`) com 3 grupos:

1. **Parâmetros de simulação** (obrigatórios) — afetam os tempos e a corrida.
2. **Atributos descritivos** (obrigatórios) — preenchem o painel de atributos na UI.
3. **`svgPath`** (opcional) — a string do traçado. **Se presente, a pista ganha o
   mapa 2D animado; se ausente, a pista funciona normalmente mas sem mapa.**

> O mapa é 100% opcional. Uma pista sem `svgPath` roda a simulação e o timing
> perfeitamente — só não desenha o circuito.

---

## Passo 1 — Copiar um bloco existente

Abra `src/lib/data/tracks.ts` e duplique o bloco de uma pista parecida (ex:
copie `spa` para uma pista de média/alta velocidade). Renomeie a chave:

```ts
export const TRACKS: Record<string, Track> = {
  // ... monaco, spa, interlagos ...
  monza: {
    name: 'Monza',
    country: 'Italy',
    difficulty: 'medium',      // 'easy' | 'medium' | 'hard'
    laps: 53,
    // ...continua abaixo
  },
};
```

Depois adicione a opção no seletor da UI (`src/App.tsx`, array/JSX do `<select>`
de pista) — uma linha: `<option value="monza">🇮🇹 Monza — Médio</option>`.

---

## Passo 2 — Parâmetros de simulação

```ts
baseLap:     80.0,              // tempo de referência (pole de um piloto 99), em segundos
gapPerPos:   0.18,              // separação base entre posições (legado, pouco usado)
sectorRatio: [0.34, 0.33, 0.33],// fração de cada setor (DEVE somar 1.0)
variation:   0.007,             // ±% de ruído por setor (menor = mais consistente)
trackWeight: 7,                 // 1–10: quanto a habilidade do piloto pesa aqui
sectorProfile: [                // peso de cada atributo por setor (informativo)
  { cornering: 0.4, braking: 0.4, reactions: 0.2 },
  { cornering: 0.5, braking: 0.3, reactions: 0.2 },
  { cornering: 0.4, braking: 0.3, reactions: 0.3 },
],
```

**Invariante crítico:** `sectorRatio` tem que somar exatamente 1.0 (há teste que
falha se não somar).

---

## Passo 3 — Mini-setores (27 por volta)

`miniSectors` é um array de **3 setores × 9 mini-setores**, cada um com um tipo:

```ts
miniSectors: [
  ['straight','braking','fast_corner','straight','medium_corner','straight','braking','slow_corner','straight'], // S1
  ['straight','fast_corner','fast_corner','braking','medium_corner','straight','braking','slow_corner','medium_corner'], // S2
  ['straight','braking','medium_corner','fast_corner','straight','medium_corner','braking','slow_corner','straight'], // S3
],
```

Tipos válidos (e o que significam para o motor + mapa):

| Tipo | Atributo do piloto | Velocidade no mapa |
|---|---|---|
| `straight` | reactions | rápido |
| `fast_corner` | cornering | rápido-médio |
| `medium_corner` | cornering | médio |
| `braking` | braking | lento |
| `slow_corner` | cornering | mais lento |

Não precisa ser milimétrico — descreva o ritmo de cada trecho da volta. Se quiser
fidelidade (como fizemos no Interlagos), mapeie curva a curva; senão, uma
distribuição plausível já dá um bom resultado.

---

## Passo 4 — Atributos descritivos (painel da UI)

Valores 1–10 para o painel de atributos. São só visuais (não afetam a sim, exceto
os do Passo 2):

```ts
lowSpeedCorners: 3, mediumSpeedCorners: 5, highSpeedCorners: 7,
straights: 8, elevationChanges: 4, technicality: 5,
trackGrip: 7, surfaceAbrasion: 6, bumpiness: 4,
overtakingOpportunities: 8, defensiveDifficulty: 4, pitLaneTimeLoss: 20,
rainProbability: 5, weatherVariability: 5, temperatureRange: 6,
tireDegradation: 6, thermalStress: 6, fuelSensitivity: 7,
averageSpeed: 9, safetyCarProbability: 4, trackEvolution: 6,
```

---

## Passo 5 — Gerar o `svgPath` (traçado do mapa)

> **Método recomendado: GeoJSON + script (automático).** Descobrimos que extrair
> de SVG é frágil (ver "Alternativa" abaixo). O caminho confiável é o GeoJSON do
> repo [`bacinger/f1-circuits`](https://github.com/bacinger/f1-circuits) (MIT), que
> tem as **coordenadas reais lat/long** do traçado de todos os circuitos de F1.
> O arquivo já está salvo em `public/track-images/f1-circuits.geojson`.

### 5.1 — Rodar o script de extração

```bash
node scripts/extract-track.mjs "Monaco"
# imprime:  svgPath: "M 493.26,195.38 L ... Z",
```

O script (`scripts/extract-track.mjs`):
1. acha o circuito no GeoJSON pelo nome (case-insensitive),
2. projeta lat/long → x/y (equiretangular local, preciso na escala de um circuito),
3. normaliza para ~1000 de largura,
4. imprime a linha `svgPath: "..."` pronta para colar.

Se o nome não existir, o script lista todos os disponíveis. São 41 circuitos de F1
no GeoJSON — a maioria das pistas do calendário sai com um comando.

### 5.2 — Colar em tracks.ts

Cole a linha impressa dentro do bloco da pista (ex: após `trackEvolution`):

```ts
svgPath: "M 493.26,195.38 L 491.61,185.10 ... Z",
```

Pronto — o mapa 2D passa a funcionar. O traçado vem como linha (`M`+`L`+`Z`), já
fechado, e o app o renormaliza e rotaciona 90° automaticamente
(`computeMapTransform`).

### 5.3 — Posicionar a linha de largada (`startFrac`)

O GeoJSON começa num ponto **arbitrário** do traçado, não na largada. Se a bandeira
quadriculada (e o grid) ficarem no lugar errado, calibre `startFrac` seguindo o guia
dedicado: [`track-start-finish-line.md`](./track-start-finish-line.md). Interlagos não
precisa (seu path já começa na reta de largada).

### Alternativa — extrair de um arquivo SVG (frágil, evite)

Só use se a pista não estiver no GeoJSON. **Testamos e é problemático:** SVGs de
circuito da Wikipedia costumam ter o traçado **fragmentado em dezenas de `<path>`**
(grid, prédios, run-off) e dependem de `transform` de grupo que o `getPointAtLength`
não aplica — o resultado sai incompleto ou torto. O Interlagos original funcionou
só porque, por sorte, tinha o circuito inteiro num único `<path>` limpo.

Se precisar mesmo:
```bash
grep -c '<path' arquivo.svg              # muitos paths = provável fragmentação
grep -n 'stroke-width' arquivo.svg       # o traçado costuma ser o de maior width
```
Abra no navegador, inspecione qual `<path>` é a linha da pista, copie o `d`, e
**achate os transforms no Inkscape** (Edit → Select All → Object → Transform, ou
"Save as Optimized SVG") antes de usar. `buildTrackPathFromSVG` aceita qualquer
comando SVG (`M/L/C/S/Q/A/Z`), mas o path precisa ser a linha de corrida completa.

---

## Passo 6 — Validar

```bash
npm run dev        # abre, seleciona a nova pista, clica Simular
npm test           # invariantes do motor (sectorRatio soma 1, 3×9 minis, etc.)
```

Checklist visual:
- [ ] A pista aparece no seletor.
- [ ] Simular roda sem erro; tabela com 20 pilotos.
- [ ] Painel de atributos preenchido.
- [ ] (Se tem `svgPath`) o mapa desenha o traçado reconhecível e os carros deslizam.

Adicione a nova pista aos testes que iteram as 3 pistas (`tests/unit/engine.test.ts`,
constante `TRACK_KEYS`) — assim os invariantes passam a cobri-la.

---

## É escalável? Resumo honesto

| Aspecto | Situação |
|---|---|
| Adicionar pista sem mapa | **Trivial** — só um objeto em `tracks.ts` |
| Adicionar pista com mapa | **Fácil** — `node scripts/extract-track.mjs "Nome"` + colar |
| Precisa de IA? | **Não.** É config + um script de conversão |
| Fonte do traçado | GeoJSON `bacinger/f1-circuits` (41 circuitos de F1, coords reais) |
| Extração de SVG | Frágil (testado) — só como último recurso; ver "Alternativa" |

**Conclusão:** o sistema é data-driven e escalável. **As 3 pistas (Interlagos,
Monaco, Spa) já têm mapa funcionando** via GeoJSON. Para adicionar mais qualquer
uma das 41 do GeoJSON: rode o script, cole o `svgPath`, preencha os atributos.

### Histórico / por que GeoJSON
Tentamos primeiro extrair o traçado dos SVGs da Wikipedia. O Interlagos funcionou
(circuito num único `<path>` limpo), mas Monaco (45 paths) e Spa (39 paths) saíram
fragmentados/tortos — o traçado estava espalhado em vários paths com transforms de
grupo. A pesquisa apontou o GeoJSON do `bacinger/f1-circuits` como fonte confiável:
coordenadas lat/long reais, um LineString fechado por circuito. Convertê-las para
`svgPath` (projeção + normalização) é determinístico e resolve qualquer pista do
calendário. Daí o `scripts/extract-track.mjs`.
