# Ajustar aceleração/frenagem dos carros no mapa (`speedWarp` por pista)

Guia de manutenção para calibrar o **perfil de velocidade** dos carros no mapa 2D —
quão forte eles freiam nas curvas e aceleram nas retas — **por pista**.

## O que é

No mapa, a posição do carro vem de uma reparametrização **tempo → distância**
(`buildSpeedWarp` em `src/lib/map/mapgraph.ts`): cada ponto do traçado recebe uma
velocidade derivada da **curvatura** (curva fechada → lento; reta → rápido). Com isso,
para uma taxa de tempo constante, o carro cobre mais pista na reta e menos na curva.

O perfil é **puramente geométrico** (não mexe nos tempos de simulação nem no
determinismo — é só visual). Os parâmetros globais servem bem para pistas fluidas
(Interlagos), mas pistas lentas e técnicas (Monaco) precisam de **mais contraste**.

## Parâmetros (`track.speedWarp`, todos opcionais)

Definidos em `src/lib/data/tracks.ts` por pista. Sem o campo, usa os defaults globais
(constantes no topo de `mapgraph.ts`) — **e o resultado fica byte-a-byte idêntico ao
motor antigo** (ver armadilha do float abaixo).

| Campo | Default | O que faz | ↑ aumenta |
|---|---|---|---|
| `minVel` | `0.34` | piso de velocidade nas curvas mais fechadas | curvas mais **rápidas** |
| `curvGain` | `2.2` | sensibilidade da frenagem à curvatura | freia **mais forte** nas curvas |
| `brakeWindow` | `8` | amostras à frente/atrás que antecipam a frenagem | frenagem começa **mais cedo** e afeta mais pista (achata retas curtas) |
| `maxAccel` | `0.018` | teto de aceleração por amostra (saída de curva) | aceleração mais **abrupta** |
| `minWeight` | `0.7` | peso do mínimo-na-janela vs. velocidade local | frenagem **domina** mais |

⚠️ **`brakeWindow` alto achata as retas.** Em pista apertada (Monaco), janela grande
faz quase todo ponto ter uma curva dentro do alcance, então o termo de mínimo puxa as
**retas** para baixo também — some o contraste. Para pista técnica, **diminua a janela**
(4) e **aumente o ganho** (2.4) em vez de mexer só no piso.

## Como calibrar (método com dados, sem chute)

O erro comum é ajustar no olho e achar que "as curvas estão lentas" quando na verdade
**as retas também estão** (pouco contraste). Meça antes.

### 1. Perfil estático (distribuição de velocidade)

Script de uso único (apague depois). Roda na raiz de `f1-react`, replica exatamente o
algoritmo de `buildSpeedWarp` e imprime estatísticas de contraste para vários candidatos:

```js
// _prof.cjs — apague depois de usar
const { chromium } = require('playwright'); const fs = require('fs');
// extraia o svgPath da pista de src/lib/data/tracks.ts para /tmp/d.txt antes de rodar
const d = fs.readFileSync('/tmp/d.txt','utf8');
function profile(P, pts){
  const {MIN_VEL,CURV_GAIN,BRAKE_WINDOW,MAX_ACCEL,MINW} = P;
  const N = pts.length, curv = new Array(N);
  for (let i=0;i<N;i++){ const a=pts[(i-1+N)%N],b=pts[i],c=pts[(i+1)%N];
    let ang=Math.atan2(c[1]-b[1],c[0]-b[0])-Math.atan2(b[1]-a[1],b[0]-a[0]);
    while(ang>Math.PI)ang-=2*Math.PI; while(ang<-Math.PI)ang+=2*Math.PI; curv[i]=Math.abs(ang); }
  const vel = curv.map(k=>Math.max(MIN_VEL,1-k*CURV_GAIN/(Math.PI/8)));
  const s = new Array(N);
  for (let i=0;i<N;i++){ let m=1; for(let dd=-BRAKE_WINDOW;dd<=BRAKE_WINDOW;dd++)m=Math.min(m,vel[(i+dd+N)%N]); s[i]=m*MINW+vel[i]*(1-MINW); }
  for (let pass=0;pass<3;pass++)for(let i=0;i<N;i++){const prev=s[(i-1+N)%N];if(s[i]>prev+MAX_ACCEL)s[i]=prev+MAX_ACCEL;}
  return s;
}
function stats(s){ const N=s.length,mn=Math.min(...s),mx=Math.max(...s),avg=s.reduce((a,b)=>a+b)/N;
  return `min ${mn.toFixed(2)} max ${mx.toFixed(2)} avg ${avg.toFixed(2)} contraste ${(mx-mn).toFixed(2)}`; }
(async()=>{
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent('<svg xmlns="http://www.w3.org/2000/svg"><path id="p"/></svg>');
  const pts = await p.evaluate((d)=>{ const el=document.getElementById('p'); el.setAttribute('d',d);
    const len=el.getTotalLength(),N=300,out=[]; for(let i=0;i<N;i++){const q=el.getPointAtLength(len*i/N);out.push([q.x,q.y]);} return out; }, d);
  await b.close();
  console.log('ATUAL ', stats(profile({MIN_VEL:0.34,CURV_GAIN:2.2,BRAKE_WINDOW:8,MAX_ACCEL:0.018,MINW:0.7},pts)));
  console.log('cand  ', stats(profile({MIN_VEL:0.26,CURV_GAIN:2.4,BRAKE_WINDOW:4,MAX_ACCEL:0.022,MINW:0.5},pts)));
})();
```

Mire em **contraste** alto (retas rápidas, curvas lentas) sem o piso ficar tão baixo que
o carro pareça parar. Para Monaco, `contraste ≈ 0.48` (vs 0.37 do default) foi o alvo.

### 2. Validação dinâmica (deslocamento real no app)

Depois de aplicar, meça o deslocamento do líder por amostra via `window.__cars` (hook já
exposto por `TrackMap.tsx`) enquanto a corrida roda. A **razão max/min** prova o contraste:

- **Monaco** (técnica): razão ~4–5× entre reta e curva.
- **Interlagos** (fluida): razão ~1.9× — **não deve mudar** (não tem `speedWarp`).

(Veja o script `_anim.cjs` usado no commit; seleciona a pista, clica Simular, coleta
~50 amostras de `window.__cars`, filtra saltos de resync `>90` e paradas, e imprime
`min/max/ratio`.)

## Valores atuais

| Pista | `speedWarp` | Razão dinâmica | Nota |
|---|---|---|---|
| Monaco | `{minVel:0.26, curvGain:2.4, brakeWindow:4, maxAccel:0.022, minWeight:0.5}` | ~4.4× | lento e técnico, curvas bem mais devagar |
| Spa | *(ausente → default)* | — | fluido, default serve |
| Interlagos | *(ausente → default)* | ~1.9× | fluido, default serve |

## Armadilhas conhecidas

- **Paridade / float.** `minWeight` default é `0.7` e o peso local era o literal `0.3`.
  `1 - 0.7 = 0.30000000000000004` (≠ `0.3`), o que quebra a paridade byte-a-byte com o
  motor antigo por 1 ULP. Por isso `buildSpeedWarp` usa o literal `0.3` exato quando **não
  há** `speedWarp` na pista, e só calcula `1 - minWeight` quando há override. Não
  "simplifique" isso de volta para `1 - minWeight` sempre.
- **Teste de paridade espera divergência no Monaco.** `parity.test.ts` afirma que
  `timeFrac` **difere** do motor antigo para pistas com `speedWarp`, e é **idêntico** para
  as sem. `distFrac` (geometria pura) é sempre idêntico. Ao dar `speedWarp` a uma nova
  pista, o teste passa a exigir divergência nela também — é o comportamento correto.
- **Ajustar no olho.** Sempre meça contraste (script acima) antes/depois; "parece lento"
  engana quando reta e curva caem juntas.
- **Não é física.** Isto é só a camada visual do mapa. Tempos de volta/setor, cores da
  tabela e determinismo não mudam.

## Arquivos

- `src/lib/map/mapgraph.ts` — `buildSpeedWarp` lê `track.speedWarp` com fallback aos defaults.
- `src/lib/engine/types.ts` — interface `SpeedWarpParams` e campo `Track.speedWarp`.
- `src/lib/data/tracks.ts` — override por pista (só Monaco, hoje).
- `tests/unit/parity.test.ts` — garante paridade nas pistas sem override; divergência nas com.
