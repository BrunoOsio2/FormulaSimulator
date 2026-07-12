# Posicionar a linha de largada/chegada num traçado (`startFrac`)

Guia de manutenção para colocar a bandeira quadriculada (e alinhar os carros) no
ponto **real** de largada de um circuito no mapa 2D.

## O problema

Os traçados vêm do GeoJSON `bacinger/f1-circuits` (`public/track-images/f1-circuits.geojson`).
Cada circuito é uma `LineString` fechada que **começa num ponto arbitrário** — quase
nunca a linha de largada. Sem correção, a bandeira e o grid aparecem no lugar errado
(ex.: Monaco caía no complexo da piscina; Spa caía perto de Eau Rouge).

## A solução: `startFrac`

O tipo `Track` tem um campo opcional:

```ts
startFrac?: number; // fração [0,1] da linha de largada real, medida por arc-length
```

- **`TrackMap.tsx`** desenha a bandeira em `pointAtLapFraction(path, startFrac)`.
- **`TrackMap.tsx`** também desloca a posição dos carros: `warpLapFraction(...) + startFrac`,
  para que `frac=0` (início da timeline de cada piloto) coincida com a largada desenhada,
  não com o ponto-0 do GeoJSON. **Sempre ajuste os dois juntos** — bandeira e carros.

⚠️ **`startFrac` é fração por comprimento de arco (arc-length), não índice de vértice.**
Os vértices do GeoJSON não são igualmente espaçados. O app amostra o path com
`getPointAtLength` (`buildTrackPathFromSVG`), então a fração tem de ser medida do mesmo
jeito. Medir por "vértice mais próximo ÷ nº de vértices" dá um valor errado — foi o erro
que fez as primeiras tentativas de Monaco falharem.

## Como calcular o `startFrac` correto (método validado)

O truque é **não adivinhar a fração** e sim:
1. pegar a **coordenada geográfica real** da linha de largada (lon/lat),
2. projetá-la com a **mesma projeção** do `scripts/extract-track.mjs`,
3. achar a fração de arc-length do ponto do traçado mais próximo dela,
4. **validar** com uma curva inconfundível (âncora) antes de confiar.

### Passo 1 — Âncora de validação (curva inconfundível)

Escolha a curva mais fechada e única do circuito (Monaco → **Fairmont/Loews hairpin**;
Spa → **La Source**). A coordenada dela mapeando com `dist` pequeno prova que a projeção
está certa. Se a âncora bate, o `startFrac` calculado é confiável.

### Passo 2 — Script de cálculo

Rode isto na raiz de `f1-react` (precisa de `playwright`, já instalado; usa
`getPointAtLength` no headless Chromium para casar exatamente com o app):

```js
// _startfrac.cjs — apague depois de usar
const { chromium } = require('playwright'); const fs = require('fs');
const TRACK = /monaco/i;                       // ← regex do nome no GeoJSON
const LANDMARKS = {                            // ← lon,lat reais (Google Maps)
  'startline': [7.42122, 43.73473],            //   linha de largada
  'anchor(hairpin)': [7.42597, 43.73968],      //   curva inconfundível p/ validar
};
const g = JSON.parse(fs.readFileSync('public/track-images/f1-circuits.geojson','utf8'));
const feat = g.features.find(f => TRACK.test(f.properties.Name||''));
const coords = feat.geometry.type==='LineString' ? feat.geometry.coordinates : feat.geometry.coordinates[0];
// projeção equiretangular idêntica a extract-track.mjs
const latMed = coords.reduce((a,c)=>a+c[1],0)/coords.length;
const k = Math.cos(latMed*Math.PI/180);
let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
coords.forEach(([lon,lat])=>{const x=lon*k,y=-lat;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);});
const sc = 1000/Math.max(maxX-minX,maxY-minY);
const proj = ([lon,lat]) => [((lon*k-minX)*sc),((-lat-minY)*sc)];
// extraia o svgPath da pista de src/lib/data/tracks.ts para /tmp/d.txt antes de rodar
const d = fs.readFileSync('/tmp/d.txt','utf8');
(async()=>{
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent('<svg xmlns="http://www.w3.org/2000/svg"><path id="p"/></svg>');
  const res = await p.evaluate(({d,LM})=>{
    const el = document.getElementById('p'); el.setAttribute('d', d);
    const len = el.getTotalLength(); const N = 3000; const out = {};
    for (const [name,xy] of Object.entries(LM)) {
      let bf=0, bd=1e18;
      for (let i=0;i<N;i++){ const f=i/N; const q=el.getPointAtLength(len*f);
        const dd=(q.x-xy[0])**2+(q.y-xy[1])**2; if(dd<bd){bd=dd;bf=f;} }
      out[name] = { frac:+bf.toFixed(3), dist:+Math.sqrt(bd).toFixed(1) };
    }
    return out;
  }, { d, LM: Object.fromEntries(Object.entries(LANDMARKS).map(([k2,v])=>[k2,proj(v)])) });
  console.log(res); await b.close();
})();
```

### Passo 3 — Interpretar

- **`dist`** = distância (nas unidades do path ~1000) entre a coordenada projetada e o
  ponto mais próximo do traçado. **`dist` pequeno (< ~15) = a coordenada está sobre a
  linha, fração confiável.** `dist` grande = a coordenada geográfica está imprecisa
  (pegue outra do Google Maps sobre o asfalto, não sobre um prédio/barreira).
- Confirme a **âncora** primeiro. Se o hairpin dá `dist≈12`, a projeção está boa.
- Só então confie no `frac` da `startline`. Confira a **ordem**: a curva seguinte
  (ex.: Sainte-Dévote logo após a largada de Monaco) deve ter fração ligeiramente maior.

### Passo 4 — Aplicar e verificar

1. `startFrac: <frac>` em `src/lib/data/tracks.ts`.
2. Screenshot com Playwright logo após "Simular" (carros devem nascer sobre a bandeira)
   e alguns segundos depois (devem seguir na direção certa da pista).
3. `npm run test:all` verde.

## Valores atuais (validados)

| Pista | `startFrac` | Âncora usada (dist) |
|---|---|---|
| Monaco | `0.72` | linha real Bd Albert 1er (dist 8); Sainte-Dévote segue em 0.742 |
| Spa | `0.85` | La Source T1 âncora em 0.87 (dist 12) |
| Interlagos | *(ausente → 0)* | traçado SVG já começa na reta de largada |

## Armadilhas conhecidas

- **Índice de vértice ≠ arc-length.** Medir sempre por `getPointAtLength`.
- **Coordenada sobre prédio/porto.** Se `dist` for grande, a coordenada não está no
  asfalto. Pegue outra exatamente sobre a pista.
- **Esquecer de deslocar os carros.** Bandeira e carros usam o mesmo `startFrac` em
  `TrackMap.tsx`; mudar só um desalinha o grid da bandeira.
- **Interlagos não precisa** de `startFrac` porque seu path (SVG da Wikipedia, não
  GeoJSON) já começa na reta de largada.
