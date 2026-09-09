#!/usr/bin/env node
/**
 * Banco de medición reproducible.
 *
 * Existe por una lección concreta (MP-15 del registro de GSG): un número publicado
 * que no se puede reproducir no es evidencia. La primera medición de este proyecto
 * salió 3× más lenta de lo real por medir sin calentar el JIT de V8, y el número
 * llegó a un documento. Así que la medición dejó de ser un script suelto y pasó a
 * ser parte del entregable.
 *
 * Uso: node bin/medir.mjs
 */

import { crearMesaShowdown, crearMesaShowdownFuerzaBruta } from '../src/showdown.mjs';
import { parseRange } from '../src/range.mjs';
import { parseCards } from '../src/cards.mjs';
import { resolverRiver } from '../src/river.mjs';

const CALENTAMIENTO = 50;   // V8 necesita ver el código varias veces antes de optimizarlo
const REPETICIONES = 500;

function medir(fn, repeticiones, calentamiento) {
  for (let i = 0; i < calentamiento; i++) fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < repeticiones; i++) fn();
  return Number(process.hrtime.bigint() - t0) / 1e6 / repeticiones;
}

const board = parseCards('Ah7d2c9sKh');

const RANGOS = {
  'medio (615)': '22+, A2s+, A2o+, K2s+, K2o+, Q2s+, Q5o+, J4s+, J8o+, T5s+, T8o+, 95s+, 96o+, 84s+, 74s+, 63s+, 53s+, 43s',
  'completo (1081)': '22+, A2s+, A2o+, K2s+, K2o+, Q2s+, Q2o+, J2s+, J2o+, T2s+, T2o+, 92s+, 92o+, 82s+, 82o+, 72s+, 72o+, 62s+, 62o+, 52s+, 52o+, 42s+, 42o+, 32s, 32o',
};

console.log('Masa de showdown con card removal — rápida (O(n log n)) vs fuerza bruta (O(n·m))');
console.log(`Condiciones: Node ${process.version}, ${CALENTAMIENTO} corridas de calentamiento,`);
console.log(`promedio sobre ${REPETICIONES} repeticiones (5 para la fuerza bruta, que es lenta).\n`);
console.log('rango             combos    rápida    bruta    factor   coincidencia');
console.log('-'.repeat(72));

for (const [etiqueta, texto] of Object.entries(RANGOS)) {
  const r = parseRange(texto, board);
  const n = r.combos.length;
  const rapida = crearMesaShowdown(r.combos, r.combos, board);
  const bruta = crearMesaShowdownFuerzaBruta(r.combos, r.combos, board);
  const reach = Float64Array.from(r.pesos);

  // Antes de medir: confirmar que las dos dan lo MISMO. Un benchmark de dos cosas
  // que no calculan lo mismo no mide nada.
  const a = rapida.masaShowdown(reach, 0);
  const b = bruta.masaShowdown(reach, 0);
  let maxDif = 0;
  for (let i = 0; i < n; i++) {
    maxDif = Math.max(maxDif, Math.abs(a.gana[i] - b.gana[i]), Math.abs(a.pierde[i] - b.pierde[i]));
  }

  const tr = medir(() => rapida.masaShowdown(reach, 0), REPETICIONES, CALENTAMIENTO);
  const tb = medir(() => bruta.masaShowdown(reach, 0), 5, 2);

  console.log(
    etiqueta.padEnd(18) + String(n).padStart(6)
    + (tr.toFixed(4) + 'ms').padStart(10)
    + (tb.toFixed(2) + 'ms').padStart(9)
    + (Math.round(tb / tr) + '×').padStart(10)
    + ('dif ' + maxDif.toExponential(1)).padStart(15),
  );
}

console.log('\nSolve completo de river (tres tamaños de apuesta más all-in, una subida)');
console.log('rango             combos   iters    tiempo   explotabilidad');
console.log('-'.repeat(62));
const ancho = RANGOS['medio (615)'];
for (const iteraciones of [200, 800, 2000]) {
  const t0 = Date.now();
  const s = resolverRiver({
    board: 'Ah7d2c9sKh', rangoOOP: ancho, rangoIP: ancho,
    pote: 100, stack: 150, iteraciones,
  });
  console.log(
    'medio'.padEnd(18) + String(s.rangos[0].combos.length).padStart(6)
    + String(iteraciones).padStart(8)
    + (((Date.now() - t0) / 1000).toFixed(2) + 's').padStart(10)
    + (s.explotabilidadPorcentualDelPote.toFixed(3) + '% del pote').padStart(20),
  );
}
console.log('\n— Elaborado por Gestión Studio Grow (GSG)');
