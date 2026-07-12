#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  Extrai o traçado de um circuito do GeoJSON (bacinger/f1-circuits) e imprime
//  a string `svgPath` pronta para colar em src/lib/data/tracks.ts.
//
//  Uso:
//    node scripts/extract-track.mjs "Monaco"
//    node scripts/extract-track.mjs "Spa"
//
//  Fonte dos dados: public/track-images/f1-circuits.geojson
//  (https://github.com/bacinger/f1-circuits — MIT). São LineStrings de lat/long
//  do traçado real de cada circuito de F1.
//
//  Por que GeoJSON e não SVG: os SVGs de circuito da Wikipedia têm o traçado
//  fragmentado em dezenas de <path> + transforms de grupo, difíceis de extrair.
//  O GeoJSON dá as coordenadas reais como pontos de linha — conversão trivial.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEOJSON = path.resolve(__dirname, '../public/track-images/f1-circuits.geojson');

const query = process.argv[2];
if (!query) {
  console.error('Uso: node scripts/extract-track.mjs "<nome do circuito>"');
  process.exit(1);
}

const gj = JSON.parse(fs.readFileSync(GEOJSON, 'utf8'));
const feat = gj.features.find(f => new RegExp(query, 'i').test(f.properties.Name || ''));
if (!feat) {
  console.error(`Circuito não encontrado: "${query}". Disponíveis:`);
  gj.features.forEach(f => console.error('  -', f.properties.Name));
  process.exit(1);
}

const g = feat.geometry;
const coords = g.type === 'LineString' ? g.coordinates : g.coordinates[0];

// Projeção equiretangular local: x = lon·cos(latMédia), y = -lat (norte p/ cima).
// Precisa o suficiente para a escala de um circuito (poucos km).
const latMed = coords.reduce((a, c) => a + c[1], 0) / coords.length;
const k = Math.cos(latMed * Math.PI / 180);
const pts = coords.map(([lon, lat]) => [lon * k, -lat]);

// Normaliza para ~1000 de largura (números legíveis; o app renormaliza de novo).
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
pts.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
const sc = 1000 / Math.max(maxX - minX, maxY - minY);
const P = pts.map(([x, y]) => [((x - minX) * sc).toFixed(2), ((y - minY) * sc).toFixed(2)]);

const d = 'M ' + P[0][0] + ',' + P[0][1] + ' L ' + P.slice(1).map(p => p[0] + ',' + p[1]).join(' ') + ' Z';

console.log(`// ${feat.properties.Name} — ${coords.length} pontos`);
console.log(`svgPath: ${JSON.stringify(d)},`);
