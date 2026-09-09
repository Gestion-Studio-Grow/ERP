#!/usr/bin/env node
/**
 * CLI de demostración: resuelve un subjuego de river y lo imprime legible.
 *
 * Uso:
 *   node bin/resolver-river.mjs
 *   node bin/resolver-river.mjs --board Ah7d2c9sKh --oop "QQ+, AK, A7s" --ip "TT-JJ, AQ, 76s" \
 *        --pote 100 --stack 150 --iteraciones 800
 *
 * La idea de que exista: el jugador no lee Float64Array. Si el output del solver
 * no se puede estudiar, el solver no sirve para subir el winrate — que es todo
 * el punto del pedido.
 */

import { resolverRiver, reporteNodo, frecuenciasAgregadas, OOP, IP } from '../src/river.mjs';
import { cardToString } from '../src/cards.mjs';

function leerArgumentos(argv) {
  const cfg = {
    board: 'Ah7d2c9sKh',
    rangoOOP: 'QQ+, AKo, AQs, A7s, 76s, 65s',
    rangoIP: 'TT-JJ, AQo, AJs, KQs, 98s, 87s, 54s',
    pote: 100,
    stack: 150,
    iteraciones: 600,
  };
  const alias = {
    '--board': 'board', '--oop': 'rangoOOP', '--ip': 'rangoIP',
    '--pote': 'pote', '--stack': 'stack', '--iteraciones': 'iteraciones',
  };
  for (let i = 2; i < argv.length; i += 2) {
    const clave = alias[argv[i]];
    if (!clave) throw new Error(`argumento desconocido: ${argv[i]}`);
    const valor = argv[i + 1];
    if (valor === undefined) throw new Error(`falta el valor de ${argv[i]}`);
    cfg[clave] = ['pote', 'stack', 'iteraciones'].includes(clave) ? Number(valor) : valor;
  }
  return cfg;
}

const pct = (x) => `${(x * 100).toFixed(1)}%`.padStart(6);

function imprimirNodo(solucion, nodo, titulo) {
  const reporte = reporteNodo(solucion, nodo, { limite: 12 });
  const quien = nodo.jugador === OOP ? 'OOP' : 'IP ';
  console.log(`\n── ${titulo}  ·  habla ${quien}`);
  console.log('   agregado: ' + frecuenciasAgregadas(solucion, nodo)
    .map((f) => `${f.accion} ${pct(f.frecuencia).trim()}`).join('  |  '));
  const ancho = Math.max(...reporte.acciones.map((a) => a.length), 8);
  console.log('   ' + 'mano'.padEnd(6) + 'fuerza'.padEnd(20)
    + reporte.acciones.map((a) => a.slice(0, ancho).padStart(ancho + 2)).join(''));
  for (const fila of reporte.filas) {
    console.log('   ' + fila.clase.padEnd(6) + fila.mano.padEnd(20)
      + fila.frecuencias.map((f) => pct(f).padStart(ancho + 2)).join(''));
  }
}

const cfg = leerArgumentos(process.argv);
console.log('Resolviendo river exacto (sin abstracción de cartas)');
console.log(`  board: ${cfg.board}   pote: ${cfg.pote}   stack efectivo: ${cfg.stack}`);
console.log(`  OOP: ${cfg.rangoOOP}`);
console.log(`  IP : ${cfg.rangoIP}`);

const arranque = Date.now();
const solucion = resolverRiver({ ...cfg, cada: Math.max(1, Math.floor(cfg.iteraciones / 4)) });
const segundos = ((Date.now() - arranque) / 1000).toFixed(2);

console.log(`\n  combos OOP: ${solucion.rangos[OOP].combos.length}`
  + `   combos IP: ${solucion.rangos[IP].combos.length}`
  + `   board: ${solucion.board.map(cardToString).join(' ')}`);
console.log(`  ${cfg.iteraciones} iteraciones en ${segundos}s`);
console.log(`  EV de OOP: ${solucion.valorJugador0.toFixed(3)} fichas/mano`
  + `  (relativo a repartir el pote)`);
console.log(`  explotabilidad: ${solucion.explotabilidad.toFixed(4)} fichas`
  + ` = ${solucion.explotabilidadPorcentualDelPote.toFixed(3)}% del pote`
  + `  ${solucion.explotabilidadPorcentualDelPote < 0.3 ? '← resuelto' : '← todavía flojo, subí iteraciones'}`);

if (solucion.historial.length) {
  console.log('\n  convergencia:');
  for (const h of solucion.historial) {
    console.log(`    iter ${String(h.iteracion).padStart(5)}  `
      + `explotabilidad ${(h.explotabilidad / cfg.pote * 100).toFixed(3)}% del pote`);
  }
}

imprimirNodo(solucion, solucion.arbol.raiz, 'RAÍZ');

// Los dos nodos que más se estudian: la respuesta de IP a un check, y la
// respuesta de OOP frente a la apuesta de IP.
const trasPaso = solucion.arbol.raiz.acciones[0]?.hijo;
if (trasPaso?.tipo === 'decision') {
  imprimirNodo(solucion, trasPaso, 'OOP pasó');
  const frenteApuesta = trasPaso.acciones.find((a) => a.nombre.startsWith('apostar'))?.hijo;
  if (frenteApuesta?.tipo === 'decision') {
    imprimirNodo(solucion, frenteApuesta, `OOP pasó · IP ${frenteApuesta.etiqueta}`);
  }
}

console.log('\nAlcance: esto resuelve el RIVER de forma exacta (no vienen más cartas, así que');
console.log('no hay abstracción y no hay error de abstracción). NO resuelve flop ni turn.');
console.log('— Elaborado por GSG\n');
