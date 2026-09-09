#!/usr/bin/env node
/**
 * CLI de demostración: resuelve un subjuego de river y lo imprime legible.
 *
 * La idea de que exista: el jugador no lee Float64Array. Si el output del solver
 * no se puede estudiar, el solver no sirve para subir el winrate — que es todo
 * el punto del pedido.
 *
 * Dos reglas de presentación que NO son cosméticas:
 *  - Nada de códigos de color: la información crítica va en palabras, así se lee
 *    igual en una terminal sin color, con lector de pantalla o redirigido a un archivo.
 *  - La tabla entra en 80 columnas. Una grilla de 155 columnas se parte en dos y
 *    deja de ser una tabla.
 */

import { resolverRiver, reporteNodo, frecuenciasAgregadas, OOP } from '../src/river.mjs';
import { cardToString, parseCards } from '../src/cards.mjs';
import { parseRange } from '../src/range.mjs';

const USO = `
Resolvedor exacto de subjuegos de river — Gestión Studio Grow

  node bin/resolver-river.mjs [opciones]

Opciones
  --board <5 naipes>   board del river, p.ej. Ah7d2c9sKh        (por defecto: Ah7d2c9sKh)
  --oop <rango>        rango del que habla primero              (fuera de posición)
  --ip <rango>         rango del que habla último               (en posición)
  --pote <fichas>      pote al empezar el river                 (por defecto: 100)
  --stack <fichas>     stack efectivo de cada jugador           (por defecto: 150)
  --iteraciones <n>    más iteraciones = menos explotabilidad   (por defecto: 600)
  --help, -h           esto

Notación de rangos
  QQ            el par             QQ+        el par y hacia arriba
  AKs / AKo     suited / offsuit   AK         los 16 combos
  A2s+          A2s hasta AKs      T9s-76s    mismo gap, hacia abajo
  AhKh          un combo puntual   76s:0.5    con peso parcial (mezcla)

  Las cartas del board se descuentan solas del rango (card removal).

Ejemplo
  node bin/resolver-river.mjs --board Ah7d2c9sKh --oop "QQ+, AKo, 76s" \\
    --ip "TT-JJ, AQo, 98s" --pote 100 --stack 150 --iteraciones 800

Alcance: resuelve el RIVER de forma exacta. NO resuelve flop ni turn, y es una
herramienta de estudio FUERA DE MESA: no hay asistencia en tiempo real.
`;

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
  const numericas = new Set(['pote', 'stack', 'iteraciones']);

  for (let i = 2; i < argv.length; i += 2) {
    if (argv[i] === '--help' || argv[i] === '-h') return null;
    const clave = alias[argv[i]];
    if (!clave) {
      throw new Error(`no conozco la opción ${argv[i]}. Probá --help para ver las que hay.`);
    }
    const valor = argv[i + 1];
    if (valor === undefined) throw new Error(`falta el valor de ${argv[i]}`);
    if (numericas.has(clave)) {
      const n = Number(valor);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`${argv[i]} necesita un número positivo, vino "${valor}"`);
      }
      cfg[clave] = n;
    } else {
      cfg[clave] = valor;
    }
  }
  return cfg;
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

/**
 * Nombre corto para la cabecera de la tabla. El nombre completo va en la línea
 * agregada de arriba, que hace de referencia.
 */
function abreviar(nombre) {
  if (nombre.startsWith('apostar all-in')) return 'all-in';
  if (nombre.startsWith('subir all-in')) return 'sub a-in';
  const apuesta = nombre.match(/^apostar \d+(?:\.\d+)? \((\d+)% pote\)$/);
  if (apuesta) return `ap ${apuesta[1]}%`;
  const subida = nombre.match(/^subir \d+(?:\.\d+)? \((\d+)% pote\)$/);
  if (subida) return `sub ${subida[1]}%`;
  return nombre;
}

const ANCHO_CLASE = 6;
const ANCHO_FUERZA = 18;

function imprimirNodo(solucion, nodo, titulo) {
  const reporte = reporteNodo(solucion, nodo, { limite: 14 });
  const quien = nodo.jugador === OOP ? 'OOP (habla primero)' : 'IP (habla último)';
  console.log(`\n── ${titulo}  ·  ${quien}`);
  console.log('   del rango entero:');
  // Una línea por acción: con cuatro o cinco tamaños de apuesta, los nombres
  // completos pasan las 150 columnas y la línea se parte sola donde no conviene.
  for (const f of frecuenciasAgregadas(solucion, nodo)) {
    console.log(`     ${pct(f.frecuencia).padStart(6)}  ${f.accion}  [${abreviar(f.accion)}]`);
  }

  const cortos = reporte.acciones.map(abreviar);
  const ancho = Math.max(8, ...cortos.map((c) => c.length + 2));
  const cabecera = '   ' + 'mano'.padEnd(ANCHO_CLASE) + 'fuerza'.padEnd(ANCHO_FUERZA)
    + cortos.map((c) => c.padStart(ancho)).join('');
  console.log(cabecera);
  console.log('   ' + '-'.repeat(cabecera.length - 3));
  for (const fila of reporte.filas) {
    console.log('   ' + fila.clase.padEnd(ANCHO_CLASE) + fila.mano.padEnd(ANCHO_FUERZA)
      + fila.frecuencias.map((f) => pct(f).padStart(ancho)).join(''));
  }
}

/** Falla temprano y con un mensaje que dice qué arreglar, no dónde explotó. */
function validarSpot(cfg) {
  const board = parseCards(cfg.board);
  if (board.length !== 5) {
    throw new Error(`el board del river son 5 naipes, escribiste ${board.length}`
      + ` (${cfg.board}). Ejemplo: Ah7d2c9sKh`);
  }
  for (const [etiqueta, texto] of [['--oop', cfg.rangoOOP], ['--ip', cfg.rangoIP]]) {
    let rango;
    try {
      rango = parseRange(texto, board);
    } catch (error) {
      throw new Error(`el rango de ${etiqueta} no se entiende: ${error.message}`);
    }
    if (!rango.combos.length) {
      throw new Error(`el rango de ${etiqueta} ("${texto}") queda vacío después de`
        + ' descontar las cartas del board');
    }
  }
  if (cfg.stack <= 0) throw new Error('el stack efectivo tiene que ser mayor que cero');
}

function principal() {
  const cfg = leerArgumentos(process.argv);
  if (cfg === null) {
    console.log(USO.trim());
    return;
  }

  // Validar ANTES de imprimir una sola línea. Si no, un board mal escrito deja
  // media cabecera en pantalla y el error abajo, y el usuario no sabe si el
  // resultado que ve arriba vale o no.
  validarSpot(cfg);

  console.log('Resolviendo river exacto (sin abstracción de cartas)');
  console.log(`  board: ${cfg.board}   pote: ${cfg.pote}   stack efectivo: ${cfg.stack}`);
  console.log(`  OOP: ${cfg.rangoOOP}`);
  console.log(`  IP : ${cfg.rangoIP}`);

  const arranque = Date.now();
  const solucion = resolverRiver({ ...cfg, cada: Math.max(1, Math.floor(cfg.iteraciones / 4)) });
  const segundos = ((Date.now() - arranque) / 1000).toFixed(2);

  console.log(`\n  combos OOP: ${solucion.rangos[0].combos.length}`
    + `   combos IP: ${solucion.rangos[1].combos.length}`
    + `   board: ${solucion.board.map(cardToString).join(' ')}`);
  console.log(`  ${cfg.iteraciones} iteraciones en ${segundos}s`);
  console.log(`  EV de OOP: ${solucion.valorJugador0.toFixed(3)} fichas/mano`
    + '  (relativo a repartir el pote)');
  const relativa = solucion.explotabilidadPorcentualDelPote;
  console.log(`  explotabilidad: ${solucion.explotabilidad.toFixed(4)} fichas`
    + ` = ${relativa.toFixed(3)}% del pote`);
  // El umbral de 0,3% es criterio PROPIO de GSG para "sirve para estudiar", no una
  // convención citable de la industria. Se declara acá para que nadie lo tome como ley.
  console.log(relativa < 0.3
    ? '  → resuelto (criterio GSG: por debajo de 0,3% del pote)'
    : '  → todavía flojo: subí las iteraciones');

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
      imprimirNodo(solucion, frenteApuesta, 'OOP pasó · IP apostó');
    }
  }

  console.log('\nAlcance: esto resuelve el RIVER de forma exacta (no vienen más cartas, así que');
  console.log('no hay abstracción y no hay error de abstracción). NO resuelve flop ni turn.');
  console.log('Herramienta de estudio fuera de mesa: sin asistencia en tiempo real.');
  console.log('— Elaborado por Gestión Studio Grow (GSG)\n');
}

// El CLI no le vomita un stack trace al usuario: el mensaje ya viene escrito en
// criollo desde las librerías, así que se imprime eso y se sale con código 1.
try {
  principal();
} catch (error) {
  console.error(`\nNo pude resolver el spot: ${error.message}\n`);
  console.error('Probá "node bin/resolver-river.mjs --help" para ver las opciones.\n');
  process.exitCode = 1;
}
