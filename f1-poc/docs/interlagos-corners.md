# Interlagos — Mapeamento de curvas → mini-setores

## Objetivo

O traçado hoje usa tipos de mini-setor **genéricos**, sem relação com as curvas reais do circuito. Isso deixa o perfil de velocidade (freia/acelera) irreal. Este documento associa **cada uma das 15 curvas reais do Interlagos** a um mini-setor, para que o `miniSectors` em `tracks.js` reflita o circuito de verdade.

- **Circuito:** Autódromo José Carlos Pace (Interlagos), sentido anti-horário, ~4.309 km, ~71s de volta.
- **27 mini-setores** = 3 setores × 9. Cada mini ≈ 1/27 da volta (por tempo).
- **`sectorRatio` atual:** `[0.33, 0.38, 0.29]` — S2 (miolo sinuoso) é o mais longo. Bate com a realidade.

## Tipos disponíveis e velocidade relativa (só visual, `MINI_SPEED` em index.html)

| Tipo | Velocidade | Uso |
|---|---|---|
| `straight` | 1.00 | Retas (largada, Reta Oposta, subida) |
| `fast_corner` | 0.82 | Curvas de alta (Curva do Sol, Arquibancadas) |
| `medium_corner` | 0.60 | Curvas de média (S do Senna, Ferradura) |
| `braking` | 0.48 | Zonas de frenagem forte |
| `slow_corner` | 0.38 | Curvas lentas (Junção, Bico de Pato) |

---

## Layout real (volta completa, anti-horário) — validado por pesquisa web

Configuração atual: **15 curvas**, sentido **anti-horário**, 4.309 km, 71 voltas.
Fonte: Wikipedia (EN/PT/Simple) — ver seção Fontes no fim.

| # | Curva (nome) | Direção / tipo real | Setor |
|---|---|---|---|
| — | Reta de largada/meta (subida) → S do Senna | reta, subida | S1 |
| T1 | **S do Senna** (entrada, esq.) | frenagem forte + média, descida | S1 |
| T2 | **S do Senna** (saída, dir.) | média, descida | S1 |
| T3 | **Curva do Sol** (esq. ampla) | rápida (quase a fundo), subida na saída | S1 |
| — | **Reta Oposta** (a mais longa do circuito) | reta longa | S1→S2 |
| T4 | **Descida do Lago** (esq.) | frenagem + média, descida | S2 |
| T5 | **Descida do Lago** (esq.) | média | S2 |
| T6 | **Ferradura** (dir.) | média | S2 |
| T7 | **Ferradura** (dir.) | média | S2 |
| T8 | **Laranjinha** (dir.) | lenta | S2 |
| T9 | **Pinheirinho** (esq.) | lenta | S2 |
| T10 | **Bico de Pato** (dir. apertada) | frenagem + lenta | S2 |
| T11 | **Mergulho** (esq.) | lenta/média | S2 |
| T12 | **Junção** (esq.) | frenagem + lenta → início da subida | S3 |
| T13 | **Café** (esq. leve, kink) | rápida (full-throttle) | S3 |
| T14 | **Subida dos Boxes** (esq. longa, subida) | rápida / tratada como reta | S3 |
| T15 | **Arquibancadas** (esq., subida) → reta | rápida → reta | S3 |

**Ponto-chave (validado):** o trecho **Junção (T12) → Café → Subida dos Boxes → Arquibancadas → reta de largada → até a S do Senna** é feito em **aceleração total** — uma das seções full-throttle mais longas do calendário. Logo, o S3 é quase todo `straight`/`fast_corner`, com uma única frenagem lenta na Junção.


---

## Mapeamento proposto — 9 mini-setores por setor

### Setor 1 (0.33 · largada → S do Senna → Curva do Sol → Reta Oposta)

| Mini | Trecho real | Tipo |
|---|---|---|
| 0 | Reta de largada (subida) | `straight` |
| 1 | Frenagem forte para o T1 | `braking` |
| 2 | T1 — S do Senna (esq.) | `medium_corner` |
| 3 | T2 — S do Senna (dir.) | `medium_corner` |
| 4 | Ligação p/ Curva do Sol | `straight` |
| 5 | T3 — Curva do Sol (esq. ampla) | `fast_corner` |
| 6 | Saída da Curva do Sol (subida) | `fast_corner` |
| 7 | Reta Oposta (início) | `straight` |
| 8 | Reta Oposta (a mais longa) | `straight` |

`['straight','braking','medium_corner','medium_corner','straight','fast_corner','fast_corner','straight','straight']`

### Setor 2 (0.38 · fim da Reta Oposta → miolo técnico T4–T11)

| Mini | Trecho real | Tipo |
|---|---|---|
| 0 | Reta Oposta (continuação) | `straight` |
| 1 | Frenagem forte p/ Descida do Lago | `braking` |
| 2 | T4 — Descida do Lago (esq.) | `medium_corner` |
| 3 | T5 — Descida do Lago (esq.) | `medium_corner` |
| 4 | T6 — Ferradura (dir.) | `medium_corner` |
| 5 | T7 — Ferradura (dir.) | `medium_corner` |
| 6 | T8 — Laranjinha (dir.) | `slow_corner` |
| 7 | T9 — Pinheirinho (esq.) | `slow_corner` |
| 8 | T10 Bico de Pato + T11 Mergulho | `slow_corner` |

`['straight','braking','medium_corner','medium_corner','medium_corner','medium_corner','slow_corner','slow_corner','slow_corner']`

### Setor 3 (0.29 · Junção → subida full-throttle → Arquibancadas → linha)

| Mini | Trecho real | Tipo |
|---|---|---|
| 0 | Frenagem p/ Junção | `braking` |
| 1 | T12 — Junção (esq., mais lenta) | `slow_corner` |
| 2 | Saída da Junção (acelerando) | `straight` |
| 3 | T13 — Café (kink, full-throttle) | `fast_corner` |
| 4 | Subida dos Boxes (T14) | `straight` |
| 5 | Subida dos Boxes (continuação) | `straight` |
| 6 | T15 — Arquibancadas (esq., subida) | `fast_corner` |
| 7 | Saída p/ reta de largada | `straight` |
| 8 | Reta de largada (subida) | `straight` |

`['braking','slow_corner','straight','fast_corner','straight','straight','fast_corner','straight','straight']`


---

## Resumo do que muda

- **`tracks.js` → `TRACKS.interlagos.miniSectors`**: substituir os 3 arrays pelos acima.
- Nada mais muda: `MINI_SPEED`, `buildSpeedWarp`, `warpLapFraction` já consomem esses tipos.
- Efeito esperado no mapa: carro **dispara** na Reta Oposta e na Subida dos Boxes, **freia** forte no fim da reta e na Junção/Bico de Pato, passa **rápido** pela Curva do Sol e Arquibancadas, **médio** no S do Senna e Ferradura.

## Contagem por tipo (proposto, validado)

| Tipo | Qtd | % da volta (por tempo) |
|---|---|---|
| `straight` | 11 | 41% |
| `medium_corner` | 6 | 22% |
| `slow_corner` | 4 | 15% |
| `fast_corner` | 4 | 15% |
| `braking` | 3 | 11% |

_(41% em reta reflete o Interlagos real: a longa Reta Oposta + a seção full-throttle Junção→largada.)_

---

## Observações / limitações

- O **formato do traçado** vem do SVG real (`svgPath`), então já é geograficamente correto. Este mapeamento afeta só **onde** o carro acelera/freia ao longo desse traçado.
- A **posição exata** de cada mini no desenho é aproximada (dividimos por tempo, não por marcos físicos), então o ponto de frenagem pode não cair no pixel exato da curva — mas a *sensação* de ritmo fica correta.
- **Limites de setor** não são oficialmente documentados nas fontes; usamos o consenso das transmissões de F1 (S1 até Descida do Lago, S2 no miolo técnico, S3 na subida full-throttle).
- Monaco e Spa (sem SVG/mapa) podem receber o mesmo tratamento no futuro, com seus próprios layouts.

## Fontes (validação web)

- Autódromo José Carlos Pace — Wikipedia (EN/PT/Simple): 15 curvas, anti-horário, nomes T1–T15, Reta Oposta a mais longa, seção full-throttle Junção→T1.
- São Paulo Grand Prix — Wikipedia (EN): 4.309 km, 71 voltas.
