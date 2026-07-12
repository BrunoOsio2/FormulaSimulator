import type { Track } from '../engine/types';

// ─── Track definitions ────────────────────────────────────────────────────────
// Each track defines:
//   baseLap      — pole position lap time in seconds (reference: 99-rated driver)
//   gapPerPos    — gap between consecutive grid positions (base, before skills)
//   sectorRatio  — how lap time is split across S1/S2/S3 (must sum to 1.0)
//   variation    — ±% RNG window per sector, narrowed by driver Accuracy
//
//   sectorProfile — per-sector weights for driver attributes.
//     Each sector has weights for: cornering, braking, reactions.
//     Weights sum to 1.0 per sector. They determine how much each
//     pace attribute contributes to the sector time modifier.
//
//   trackWeight — how much the driver skill system matters on this circuit.
//     Higher = bigger spread between good and bad drivers.
//     Monaco (10) rewards skill heavily. Interlagos (6) is more forgiving.

export const TRACKS: Record<string, Track> = {
  monaco: {
    name: 'Monaco',
    country: 'Monte Carlo',
    difficulty: 'hard',
    laps: 78,

    // Simulation params
    baseLap:     74.260,   // 1:14.260 — reference pole time
    gapPerPos:   0.095,    // small gaps — very hard to overtake
    sectorRatio: [0.41, 0.35, 0.24],
    variation:   0.012,    // ±1.2% per sector — high error margin, tight walls

    // ── Sim params ──────────────────────────────────────────────────────────
    trackWeight: 10, // skills matter a lot — technical, no overtaking to recover

    // S1: Sainte Devote uphill to Casino — heavy braking, slow corners
    // S2: Mirabeau to tunnel — tight technical sequence, cornering dominant
    // S3: Swimming pool chicane to Rascasse — exit reactions matter
    sectorProfile: [
      { cornering: 0.35, braking: 0.50, reactions: 0.15 }, // S1
      { cornering: 0.50, braking: 0.35, reactions: 0.15 }, // S2
      { cornering: 0.40, braking: 0.30, reactions: 0.30 }, // S3
    ],

    // 9 mini-sectors per sector — fixed order, equal time weight (sectorTime/9 each)
    // Types: straight | braking | slow_corner | medium_corner | fast_corner
    miniSectors: [
      ['braking','slow_corner','slow_corner','medium_corner','braking','slow_corner','slow_corner','straight','slow_corner'],   // S1
      ['slow_corner','braking','slow_corner','slow_corner','medium_corner','slow_corner','braking','slow_corner','straight'],   // S2
      ['medium_corner','braking','slow_corner','slow_corner','straight','braking','slow_corner','medium_corner','slow_corner'], // S3
    ],

    // ── Layout ──────────────────────────────────────────────
    // How the physical circuit is designed
    lowSpeedCorners:    9,  // Loews hairpin, Mirabeau, Casino, etc.
    mediumSpeedCorners: 4,  // Massenet, Portier
    highSpeedCorners:   1,  // Only the tunnel section
    straights:          2,  // Pit straight, tunnel exit — both short
    elevationChanges:   7,  // Steep uphill from Sainte Devote, drop to port
    technicality:      10,  // Most technical circuit on the calendar

    // ── Grip & Surface ──────────────────────────────────────
    trackGrip:         6,  // Low baseline — streets rarely used for racing
    surfaceAbrasion:   4,  // Soft surface, low abrasion
    bumpiness:         7,  // Uneven street surface, manhole covers

    // ── Overtaking ──────────────────────────────────────────
    overtakingOpportunities: 1,  // Almost impossible — single-file racing
    defensiveDifficulty:     9,  // Easy to block — nowhere to go around
    pitLaneTimeLoss:        22,  // Slow pit lane, long pit road

    // ── Weather ─────────────────────────────────────────────
    rainProbability:    5,  // Mediterranean climate, occasional showers
    weatherVariability: 4,  // Usually stable once it starts
    temperatureRange:   6,  // Moderate variation through the day

    // ── Tires ───────────────────────────────────────────────
    tireDegradation:   3,  // Very low — slow circuit, low energy input
    thermalStress:     5,  // Moderate — stop-go nature stresses fronts
    fuelSensitivity:   6,  // Notable — heavy car struggles through slow corners

    // ── Race characteristics ────────────────────────────────
    averageSpeed:          4,  // Slowest race on the calendar (~160 km/h avg)
    safetyCarProbability:  8,  // High — any incident blocks the whole track
    trackEvolution:        9,  // Large grip swing across the weekend

    // Traçado real (GeoJSON bacinger/f1-circuits → projeção equiretangular)
    svgPath: "M 493.26,195.38 L 491.61,185.10 493.92,175.85 499.87,163.16 505.48,154.25 522.98,132.08 611.90,11.31 618.09,2.63 627.25,0.00 638.40,3.20 646.16,9.60 651.77,19.65 652.93,30.96 653.17,40.33 654.08,47.99 658.70,57.13 664.07,64.10 674.06,78.15 680.83,90.61 683.47,98.15 686.86,102.61 692.22,104.09 698.41,102.26 703.04,97.46 704.44,90.61 701.38,84.78 693.54,79.07 670.34,49.59 667.04,42.50 666.96,35.65 668.78,30.39 671.25,25.48 682.15,19.88 698.99,15.54 708.15,12.11 717.57,8.34 730.61,3.77 744.81,2.74 752.32,6.51 755.13,18.17 752.49,86.27 742.00,156.31 731.10,200.87 718.97,232.63 698.17,268.97 674.22,299.70 639.55,337.52 589.94,367.92 560.38,382.43 503.42,409.05 465.11,422.30 408.56,435.67 372.16,441.38 352.84,445.04 349.54,450.64 349.29,455.55 348.13,461.27 345.66,466.86 337.48,469.72 325.93,471.66 313.13,464.35 306.11,463.89 204.24,477.26 153.63,484.57 107.07,491.89 94.19,493.83 85.61,495.32 79.42,501.71 69.68,520.91 61.42,539.53 54.82,558.16 51.93,571.41 48.87,594.49 48.62,634.03 49.04,643.85 51.93,650.59 57.71,657.11 70.50,666.48 79.09,674.36 82.80,682.82 84.29,695.04 98.82,779.14 102.53,793.88 103.69,798.56 103.36,804.84 99.64,809.87 91.47,815.59 83.30,819.58 81.40,825.30 82.97,837.29 92.30,864.60 100.80,885.17 109.47,901.39 124.33,922.65 142.98,941.50 156.69,949.38 172.04,956.58 179.72,960.01 183.60,964.35 188.06,977.72 185.91,984.80 178.98,988.92 148.19,997.03 131.01,999.77 119.70,1000.00 109.63,998.51 103.28,993.72 99.40,989.72 99.23,980.35 97.74,972.81 94.77,963.55 77.44,942.18 64.72,921.73 54.82,906.42 44.33,877.40 21.13,796.62 14.78,770.57 10.32,742.69 4.54,702.01 0.00,649.11 0.00,614.60 1.49,588.21 4.38,560.79 9.49,541.70 15.27,524.57 18.08,514.05 19.48,504.80 18.82,490.74 18.57,482.06 21.38,476.92 28.56,473.49 46.07,469.26 61.67,468.58 83.05,465.95 112.85,462.18 139.27,457.50 206.47,437.73 244.03,427.45 278.46,421.85 302.07,419.90 320.48,413.28 373.73,388.03 397.09,378.43 431.18,370.77 459.66,366.77 486.83,362.20 502.10,356.83 520.67,345.18 536.77,328.38 545.85,314.21 549.90,299.36 549.24,283.82 546.59,269.20 540.82,253.09 533.14,237.77 521.09,228.40 509.53,217.55 503.91,212.64 498.71,207.38 493.26,195.38 Z",
    startFrac: 0.72, // linha real (Bd Albert 1er) — fração por arc-length no traçado GeoJSON
    // Perfil de velocidade do mapa: Monaco é lento e técnico — mais contraste entre
    // reta e curva, curvas bem mais devagar. (janela de freio curta p/ não achatar as
    // retas curtas; ganho alto p/ frear forte; piso baixo nas curvas fechadas.)
    speedWarp: { minVel: 0.26, curvGain: 2.4, brakeWindow: 4, maxAccel: 0.022, minWeight: 0.5 },
  },

  spa: {
    name: 'Spa-Francorchamps',
    country: 'Belgium',
    difficulty: 'medium',
    laps: 44,

    baseLap:     104.701,  // 1:44.701
    gapPerPos:   0.180,
    sectorRatio: [0.36, 0.32, 0.32],
    variation:   0.007,    // ±0.7% — balanced, but weather creates big swings

    // ── Sim params ──────────────────────────────────────────────────────────
    trackWeight: 7,

    // S1: La Source + Eau Rouge/Raidillon — braking into La Source, high-speed cornering up the hill
    // S2: Kemmel + Les Combes — straight speed, braking into chicane, flowing Pouhon
    // S3: Blanchimont + Bus Stop — high-speed confidence, reactions out of chicane
    sectorProfile: [
      { cornering: 0.45, braking: 0.35, reactions: 0.20 }, // S1
      { cornering: 0.35, braking: 0.40, reactions: 0.25 }, // S2
      { cornering: 0.50, braking: 0.25, reactions: 0.25 }, // S3
    ],

    miniSectors: [
      ['braking','fast_corner','fast_corner','medium_corner','straight','braking','medium_corner','fast_corner','medium_corner'], // S1
      ['straight','straight','braking','medium_corner','medium_corner','fast_corner','braking','medium_corner','straight'],        // S2
      ['fast_corner','fast_corner','medium_corner','straight','braking','slow_corner','braking','medium_corner','fast_corner'],    // S3
    ],

    // ── Layout ──────────────────────────────────────────────
    lowSpeedCorners:    3,  // La Source, Bus Stop chicane
    mediumSpeedCorners: 6,  // Pouhon, Bruxelles, Campus
    highSpeedCorners:   7,  // Eau Rouge/Raidillon, Blanchimont, Pouhon fast
    straights:          7,  // Kemmel straight is one of the longest in F1
    elevationChanges:   9,  // Most dramatic elevation on the calendar
    technicality:       7,  // Complex but learnable

    // ── Grip & Surface ──────────────────────────────────────
    trackGrip:         7,
    surfaceAbrasion:   6,
    bumpiness:         5,

    // ── Overtaking ──────────────────────────────────────────
    overtakingOpportunities: 6,  // Kemmel/Bus Stop, La Source
    defensiveDifficulty:     5,
    pitLaneTimeLoss:        19,

    // ── Weather ─────────────────────────────────────────────
    rainProbability:    8,  // Famous for mixed conditions — can rain only on sector
    weatherVariability: 9,  // Rain can hit one sector while another is dry
    temperatureRange:   7,

    // ── Tires ───────────────────────────────────────────────
    tireDegradation:   6,
    thermalStress:     7,  // High-speed corners heat up rears aggressively
    fuelSensitivity:   7,

    // ── Race characteristics ────────────────────────────────
    averageSpeed:          8,  // One of the fastest circuits (~230 km/h avg)
    safetyCarProbability:  5,
    trackEvolution:        6,

    // Traçado real (GeoJSON bacinger/f1-circuits → projeção equiretangular)
    svgPath: "M 186.15,106.05 L 131.14,9.93 130.56,5.61 133.00,1.78 138.08,0.00 143.75,1.56 161.86,10.68 205.80,31.77 226.93,44.77 248.92,61.06 268.64,77.57 284.28,94.61 368.28,194.78 374.19,200.39 384.32,206.70 402.43,218.40 410.37,226.28 417.07,236.96 421.36,246.67 424.21,257.57 426.65,277.68 428.06,284.81 430.50,291.39 435.17,300.02 476.68,366.42 503.10,408.60 510.42,424.35 515.09,436.05 520.59,454.88 553.74,570.58 604.59,746.26 616.38,788.50 617.00,795.35 615.76,802.96 611.70,809.05 605.79,814.18 598.27,818.22 593.80,822.54 590.75,827.61 588.31,835.27 588.72,842.87 598.89,888.40 598.68,896.27 597.07,903.39 591.57,911.27 585.04,916.61 469.15,996.71 461.84,999.78 454.52,1000.00 446.79,997.73 440.47,993.15 436.00,986.57 434.18,979.93 433.77,972.81 436.00,966.18 440.05,959.33 445.96,954.53 496.61,923.24 502.10,917.63 505.13,912.02 506.36,905.44 505.75,897.30 484.79,835.75 478.29,810.62 463.45,733.05 456.13,688.55 454.52,680.94 450.84,672.80 445.96,666.16 438.64,659.04 430.50,653.70 421.57,650.14 412.19,648.63 381.89,646.58 370.31,647.88 359.72,650.90 348.97,655.48 340.21,661.36 330.04,670.75 323.55,680.13 316.43,693.62 287.75,765.36 262.11,829.17 256.62,839.10 250.12,845.95 241.19,851.02 232.22,853.55 223.91,853.82 215.56,852.04 208.45,848.75 196.63,841.09 188.90,837.80 179.55,836.29 170.21,837.32 161.65,840.07 154.33,845.19 149.66,851.02 143.96,858.89 96.99,932.63 92.32,936.94 86.62,940.02 79.71,941.53 71.98,941.04 65.28,937.97 33.53,914.83 14.84,901.13 10.17,895.03 5.29,887.64 2.44,880.52 0.41,872.11 0.00,863.48 1.41,853.07 4.67,844.17 8.93,832.73 15.25,815.42 26.21,795.84 38.24,778.79 56.52,758.24 87.03,728.46 104.93,714.49 120.18,705.59 198.69,664.65 210.06,657.53 220.85,649.12 230.81,639.73 239.34,629.54 247.27,618.86 257.85,599.33 266.41,580.51 285.92,537.03 289.36,527.59 291.42,517.45 291.80,504.72 289.77,493.28 278.19,463.51 265.58,430.71 250.33,389.77 246.45,374.56 242.81,356.49 240.57,339.72 239.13,325.48 234.66,259.61 235.49,255.30 238.13,252.23 242.19,251.20 249.09,252.23 256.24,252.23 261.12,251.20 264.35,247.64 265.17,243.59 263.15,238.25 238.13,197.31 186.15,106.05 Z",
    startFrac: 0.85, // reta dos boxes junto à La Source (T1 ancora em 0.87 no traçado)
  },

  interlagos: {
    name: 'Interlagos',
    country: 'Brazil',
    difficulty: 'easy',
    laps: 71,

    baseLap:     71.861,   // 1:11.861
    gapPerPos:   0.210,    // larger gaps — more overtaking, bigger spread
    sectorRatio: [0.33, 0.38, 0.29],
    variation:   0.005,    // ±0.5% — consistent surface, predictable

    // ── Sim params ──────────────────────────────────────────────────────────
    trackWeight: 6,

    // S1: Senna S + Descida do Lago — reactions at S, flowing medium corners
    // S2: Ferradura + Laranjinha — medium/slow sequence, balance of all three
    // S3: Mergulho + Junção + main straight — high-speed exits, reactions out
    sectorProfile: [
      { cornering: 0.35, braking: 0.30, reactions: 0.35 }, // S1
      { cornering: 0.45, braking: 0.35, reactions: 0.20 }, // S2
      { cornering: 0.40, braking: 0.25, reactions: 0.35 }, // S3
    ],

    miniSectors: [
      // S1: largada → S do Senna (T1-T2) → Curva do Sol (T3) → Reta Oposta
      ['straight','braking','medium_corner','medium_corner','straight','fast_corner','fast_corner','straight','straight'],           // S1
      // S2: fim da Reta Oposta → Descida do Lago (T4-T5) → Ferradura (T6-T7) → Laranjinha/Pinheirinho/Bico de Pato/Mergulho (T8-T11)
      ['straight','braking','medium_corner','medium_corner','medium_corner','medium_corner','slow_corner','slow_corner','slow_corner'],// S2
      // S3: Junção (T12) → subida full-throttle: Café/Subida dos Boxes/Arquibancadas (T13-T15) → reta de largada
      ['braking','slow_corner','straight','fast_corner','straight','straight','fast_corner','straight','straight'],                  // S3
    ],

    // ── Layout ──────────────────────────────────────────────
    lowSpeedCorners:    4,  // Senna S, Laranjinha
    mediumSpeedCorners: 7,  // Descida do Lago, Ferradura
    highSpeedCorners:   5,  // Mergulho, Junção, Subida dos Boxes
    straights:          5,  // Main straight + Reta Oposta
    elevationChanges:   6,  // Decent elevation, but less dramatic than Spa
    technicality:       5,  // Accessible for drivers at all levels

    // ── Grip & Surface ──────────────────────────────────────
    trackGrip:         8,
    surfaceAbrasion:   7,  // High rubber build-up, aggressive degradation
    bumpiness:         6,

    // ── Overtaking ──────────────────────────────────────────
    overtakingOpportunities: 7,  // Senna S, Reta Oposta, main straight
    defensiveDifficulty:     4,
    pitLaneTimeLoss:        18,

    // ── Weather ─────────────────────────────────────────────
    rainProbability:    7,  // Tropical climate, common late afternoon showers
    weatherVariability: 8,  // Can change very quickly
    temperatureRange:   8,  // Large swing between morning and afternoon

    // ── Tires ───────────────────────────────────────────────
    tireDegradation:   7,  // High — abrasive surface + tropical temps
    thermalStress:     8,
    fuelSensitivity:   6,

    // ── Race characteristics ────────────────────────────────
    averageSpeed:          7,
    safetyCarProbability:  6,
    trackEvolution:        7,

    // ── Traçado real (vetor extraído do 2014_Interlagos_circuit_map.svg,
    //    path5074 — loop fechado de curvas de Bézier no viewBox 1000×1000) ──
    svgPath: "m 222.2228,551.89246 95.86637,402.09942 c 5.26259,22.07326 10.80201,39.17756 21.97282,55.72832 4.45187,6.5959 10.10345,13.078 17.32144,16.4286 7.39298,3.4318 16.36684,4.5454 24.30357,2.6902 6.14916,-1.4373 12.77575,-6.5416 15.95476,-10.2151 11.09917,-12.8255 16.20963,-16.9964 25.93433,-26.32466 4.08925,-3.9225 9.94081,-6.7409 15.68743,-7.5662 8.12949,-1.1675 16.1691,1.531 23.22607,5.148 22.38774,11.47456 34.11879,21.40376 53.37598,25.91056 15.78549,3.6944 32.56694,2.5414 48.63456,0.3824 12.1795,-1.6365 24.28623,-4.9434 35.48161,-10.0111 12.58603,-5.6973 25.17868,-12.60926 34.77847,-22.54456 17.15365,-17.75323 27.12782,-36.76368 38.12646,-63.49168 4.06266,-9.87276 7.53483,-21.16812 10.03281,-30.41598 L 816.20143,396.28359 c 4.9418,-18.2952 -1.01535,-52.36818 -28.01924,-60.55319 -2.13561,-0.64731 -9.09544,-2.80698 -15.89286,-4.10714 l -47.86765,-9.15573 c -9.99185,-1.91116 -22.75889,-4.40117 -30.66044,-4.0892 -10.36306,0.40916 -16.70118,1.28624 -27.38271,4.21175 -11.2479,3.08063 -16.18949,5.75556 -25.60225,11.53843 -9.53493,5.85793 -23.02609,15.86498 -30.49981,26.81853 0,0 -100.83013,136.10368 -168.04441,228.12192 -5.80739,7.95048 -17.30624,20.63842 -26.9915,26.18701 -22.20368,12.72028 -73.91798,14.42051 -105.19125,-11.24692 -14.23472,-11.6831 -23.26024,-33.65849 -25.91818,-44.57647 -7.33749,-30.14016 -12.04546,-53.13897 -13.17628,-62.92661 -1.26917,-10.98523 -2.33595,-32.94324 0.43111,-43.64976 1.74746,-6.76142 5.81917,-13.05383 11.53318,-17.06888 5.28015,-3.71018 17.73777,-5.50903 26.57868,-0.27575 17.61143,10.42489 18.18663,14.03401 30.02846,21.88724 7.93802,5.26431 18.96125,5.78497 28.30357,3.92858 7.74307,-1.53861 14.89395,-6.35077 20.43148,-11.97734 4.37536,-4.44572 7.73276,-10.231 9.20495,-16.29242 1.77884,-7.32402 1.32809,-15.38035 -0.85325,-22.59474 -2.20649,-7.29755 -8.82743,-16.44516 -11.9448,-19.50453 -17.07819,-16.76047 -22.52682,-22.33031 -36.30267,-36.86312 -13.85469,-14.61598 -29.0077,-43.21147 -32.33757,-62.19374 l -6.0863,-34.69554 c -1.89157,-10.78304 -1.15577,-15.52243 0.0681,-20.18447 1.11228,-4.23705 3.82439,-8.30159 7.36059,-10.88714 3.80879,-2.78486 8.90649,-4.65823 13.57841,-3.99838 7.33481,1.03596 13.59162,5.85674 18.74539,11.93583 l 46.66631,55.04498 c 11.99105,14.14398 25.12825,24.63716 41.51884,29.48797 39.5011,11.69037 85.71748,-5.34643 109.5041,-43.52737 l 74.6954,-119.89683 c 4.93307,-7.91829 7.18592,-17.34823 3.68868,-25.5745 -2.8557,-6.71724 -10.47108,-12.80021 -15.93679,-15.21041 0,0 -20.06427,-9.07809 -29.20983,-12.63595 -15.33338,-5.965077 -28.61701,-11.067397 -44.97985,-16.092757 -7.30682,-2.24407 -15.08107,-2.881528 -22.7219,-3.089552 -8.11866,-0.221033 -16.27007,0.656222 -24.28572,1.964282 -19.79075,3.22963 -39.49882,6.33635 -58.64539,11.93891 -13.66163,3.997577 -26.79647,10.196877 -39.83675,15.382517 -12.35732,4.91406 -24.28272,10.90958 -35.98214,17.23215 -9.3041,5.02809 -14.74783,8.1364 -23.35479,14.28199 -10.91937,7.79672 -23.47195,19.28054 -31.90301,29.71792 -11.09249,13.73214 -23.92223,37.95064 -28.17838,55.08249 -18.17029,73.13902 -34.80949,141.74662 -41.38525,171.00688 -5.21063,23.1858 -12.29672,53.06052 -13.68873,76.65573 -1.35145,22.90781 -0.48547,46.48486 6.56382,76.0522 z",
  },
};
