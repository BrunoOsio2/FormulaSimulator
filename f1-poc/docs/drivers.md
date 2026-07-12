# Driver Attributes — Design Spec

All attributes are rated 1–99. They interact with track attributes to produce lap time modifiers per sector.

---

## Pace Attributes
_Affect raw lap time on a clear track._

### Cornering `1–99`
How much speed the driver carries through corners.

| Track attribute | Interaction |
|---|---|
| `lowSpeedCorners` | High value = big gain in slow hairpins (Monaco S1) |
| `mediumSpeedCorners` | Moderate contribution across flowing layouts |
| `highSpeedCorners` | Critical at Spa — confidence at Eau Rouge, Blanchimont |
| `technicality` | Multiplies cornering impact — complex circuits reward this more |

> **Sim effect:** reduces sector time proportionally to cornering × corner density of that sector.

---

### Braking `1–99`
How late and cleanly the driver brakes into corners.

| Track attribute | Interaction |
|---|---|
| `lowSpeedCorners` | Most braking zones are before slow corners — biggest impact |
| `bumpiness` | Bumpy tracks punish late brakers more (lock-up risk) |
| `technicality` | Technical layouts have more and trickier braking zones |

> **Sim effect:** reduces S1 time (where most heavy braking happens) and reduces `control`-based error probability.

---

### Reactions `1–99`
Reflex speed at the start and out of tight corners.

| Track attribute | Interaction |
|---|---|
| `lowSpeedCorners` | Acceleration out of slow corners, especially a chicane sequence |
| `straights` | Matters on lap 1 — reaction from standing start affects first corner battle |

> **Sim effect:** used at race start to determine initial position changes; minor S3 modifier (exit of final sector).

---

## Consistency Attributes
_Affect how reliably the driver delivers their pace over a race distance._

### Control `1–99`
Reduces unforced errors — spins, lock-ups, contact.

| Track attribute | Interaction |
|---|---|
| `technicality` | More complex = more opportunities to make mistakes |
| `bumpiness` | Rough surfaces destabilise the car and punish low control |
| `safetyCarProbability` | Low control drivers increase SC probability at high-incident tracks |

> **Sim effect:** governs the probability of a "mistake tick" — a sector where the driver loses extra time (0.3–1.5s). Higher control = lower chance and lower magnitude.

---

### Accuracy `1–99`
How closely the driver follows the optimal racing line.

| Track attribute | Interaction |
|---|---|
| `technicality` | On technical tracks, deviating from the line costs more time |
| `highSpeedCorners` | Running slightly wide at Eau Rouge is much more costly than at a slow corner |
| `trackEvolution` | Early in the weekend, low accuracy means more off-line running (less rubber = less grip) |

> **Sim effect:** scales the `variation` window. A driver with high accuracy has a narrower random spread — their sector times cluster closer to the base time.

---

### Smoothness `1–99`
How gently the driver treats their tyres.

| Track attribute | Interaction |
|---|---|
| `tireDegradation` | High degradation tracks (Interlagos) punish rough drivers severely |
| `thermalStress` | Tracks that spike tyre temps punish hard chargers |
| `surfaceAbrasion` | Abrasive surfaces amplify the difference between smooth and rough drivers |

> **Sim effect:** controls the pace drop-off per lap as tyre life decreases. A smoother driver starts degrading later and degrades more slowly. _(Relevant when tyre deg is implemented.)_

---

## Racecraft Attributes
_Govern driver behaviour in traffic._

### Overtaking `1–99`
Ability to pass other cars.

| Track attribute | Interaction |
|---|---|
| `overtakingOpportunities` | More opportunities = more attempts per lap; overtaking skill determines success rate |
| `straights` | Long straights create the space — but skill determines execution |
| `defensiveDifficulty` | High defensive difficulty tracks (Monaco) reduce the number of attempts regardless of overtaking skill |

> **Sim effect:** when driver A is within `overtakingWindow` of driver B, overtaking stat vs defending stat resolves whether the position changes. Monaco's `overtakingOpportunities: 1` means barely any attempts trigger at all.

---

### Defending `1–99`
Ability to protect position under pressure.

| Track attribute | Interaction |
|---|---|
| `defensiveDifficulty` | High difficulty (Monaco) amplifies the defender's advantage |
| `overtakingOpportunities` | Few passing zones = defender only needs to cover one or two points |

> **Sim effect:** used as the opposing roll in overtaking resolution. High defending + high `defensiveDifficulty` of track = very hard to pass.

---

### Adaptability `1–99`
Performance in changing or wet conditions.

| Track attribute | Interaction |
|---|---|
| `rainProbability` | High rain chance = this stat matters more often |
| `weatherVariability` | Quick changes punish low adaptability more — not enough time to adjust |
| `temperatureRange` | Wide temp swings affect setup window; high adaptability drivers manage this better |

> **Sim effect:** when a rain event triggers, all lap times get a multiplier. Low adaptability drivers get a larger penalty. High adaptability drivers can even gain time on low-adaptability rivals.

---

## Development

### Growth Potential `1–99`
How fast the driver improves with training and race mileage.

- Younger drivers (high potential) gain attribute points after race weekends
- Older drivers (low potential) regress slowly over seasons
- Not a sim modifier — affects the career/management layer only

### Training
Assigned focus by the player (e.g. "improve cornering", "improve smoothness"). Accelerates growth in the target attribute. Requires sim facility upgrades to be effective.

---

## Handicap `1–99` _(higher = worse)_
Represents structural disadvantages the driver must overcome — physical limitations, lack of experience with the car, communication barriers with engineers.

Unlike all other attributes, **a higher value is worse.**

| Effect |
|---|
| Applies a flat multiplier that reduces the effectiveness of all other attributes |
| `effectiveAttribute = attribute × (1 - handicap / 200)` |
| A driver with Handicap 80 only uses 60% of their skill ceiling |
| Does not affect `Growth Potential` — a handicapped driver can still develop |

---

## Attribute × Track Matrix

Quick reference: which driver stat matters most per track.

| Track | Most important | Least important |
|---|---|---|
| **Monaco** | Cornering, Braking, Accuracy, Control | Overtaking, Adaptability |
| **Spa** | Cornering (high-speed), Adaptability, Reactions | Smoothness |
| **Interlagos** | Smoothness, Overtaking, Adaptability | Accuracy |

---

## Sim Implementation Plan

Each sector time will be computed as:

```
sectorTime = baseSectorTime
           × (1 + variationRoll)          -- track RNG window, narrowed by Accuracy
           × corneringModifier(sector)     -- Cornering × corner density of this sector
           × brakingModifier(sector)       -- Braking × braking zones in this sector
           - handicapPenalty               -- flat reduction to all gains
```

Overtaking resolves at the end of each lap when two drivers are within a threshold gap:

```
if (gap < overtakingWindow && rng > defenseRoll(defender, track))
  → swap positions
```
