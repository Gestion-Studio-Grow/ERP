import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../src/cards.mjs';
import { crearMesaShowdown } from '../src/showdown.mjs';
import { nodoDecision, nodoFold, nodoShowdown, resolver, estrategiaPromedio } from '../src/cfr.mjs';
import {
  resolverRiver, construirArbolRiver, frecuenciasAgregadas, reporteNodo, claseDeMano, OOP, IP,
} from '../src/river.mjs';

/**
 * EL JUEGO DEL CLARIVIDENTE — segundo patrón de calibración, ahora con naipes reales.
 *
 * Kuhn valida el motor CFR en abstracto. Este test valida la CADENA COMPLETA
 * (evaluador + rangos + showdown con bloqueos + CFR) contra una solución
 * analítica cerrada, que es la única forma de saber que el river no está
 * devolviendo decimales lindos.
 *
 * Montaje clásico: OOP está polarizado (mitad nuts, mitad aire), IP tiene un
 * bluff-catcher puro, una sola apuesta posible. Con pote P y apuesta B:
 *   - OOP apuesta TODO el valor y farolea el aire con masa b tal que b/V = B/(P+B)
 *   - IP paga con frecuencia P/(P+B)
 * Con P=100 y B=50: los faroles son 1/3 del valor y IP paga 2/3.
 */
test('juego del clarividente: el river reproduce la solución analítica cerrada', () => {
  const board = parseCards('AhKd9c4s2h'); // arcoíris a efectos prácticos: no hay color posible
  const POTE = 100;
  const APUESTA = 50;

  // Elegimos combos explícitos para que NINGUNO comparta naipe con otro: así los
  // bloqueos no distorsionan la solución analítica que queremos comparar.
  const combosOOP = [parseCards('AsAc'), parseCards('7s6s')]; // trío de ases / carta alta
  const combosIP = [parseCards('KsKc')];                      // trío de reyes: le gana al aire, pierde con el trío de ases

  const mesa = crearMesaShowdown(combosOOP, combosIP, board);
  const pesos = [Float64Array.from([1, 1]), Float64Array.from([1])];

  const noBloqueada = mesa.masaNoBloqueada(pesos[IP], OOP);
  let normalizador = 0;
  for (let h = 0; h < combosOOP.length; h++) normalizador += pesos[OOP][h] * noBloqueada[h];

  const juego = {
    nCombos: [combosOOP.length, combosIP.length],
    pesos,
    masaNoBloqueada: mesa.masaNoBloqueada,
    masaShowdown: mesa.masaShowdown,
    normalizador,
  };

  // Árbol a mano: OOP pasa (showdown) o apuesta; IP foldea o paga. Sin la opción
  // de que IP apueste detrás, que es el montaje del juego clásico.
  const mitad = POTE / 2;
  const ipFrenteApuesta = nodoDecision(IP, [
    { nombre: 'foldear', hijo: nodoFold(OOP, mitad) },
    { nombre: 'pagar', hijo: nodoShowdown(mitad + APUESTA) },
  ], combosIP.length);
  const raiz = nodoDecision(OOP, [
    { nombre: 'pasar', hijo: nodoShowdown(mitad) },
    { nombre: 'apostar', hijo: ipFrenteApuesta },
  ], combosOOP.length);

  const salida = resolver(raiz, juego, { iteraciones: 8000 });
  const [, apostar] = estrategiaPromedio(raiz);
  const [, pagar] = estrategiaPromedio(ipFrenteApuesta);

  const NUTS = 0, AIRE = 1;
  assert.ok(apostar[NUTS] > 0.995, `el trío de ases apuesta siempre, dio ${apostar[NUTS].toFixed(4)}`);

  // b/V = B/(P+B) = 50/150 = 1/3. Como V y aire pesan igual, el aire farolea 1/3.
  const faroleoEsperado = APUESTA / (POTE + APUESTA);
  assert.ok(
    Math.abs(apostar[AIRE] - faroleoEsperado) < 0.02,
    `el aire debe farolear ${faroleoEsperado.toFixed(4)}, dio ${apostar[AIRE].toFixed(4)}`,
  );

  // IP paga P/(P+B) = 2/3.
  const pagoEsperado = POTE / (POTE + APUESTA);
  assert.ok(
    Math.abs(pagar[0] - pagoEsperado) < 0.02,
    `IP debe pagar ${pagoEsperado.toFixed(4)}, dio ${pagar[0].toFixed(4)}`,
  );

  assert.ok(salida.explotabilidad < 0.05, `explotabilidad ${salida.explotabilidad}`);
});

test('el spot de ejemplo converge y la explotabilidad queda bajo 0,1% del pote', () => {
  const s = resolverRiver({
    board: 'Ah7d2c9sKh',
    rangoOOP: 'QQ+, AKo, AQs, A7s, 76s, 65s',
    rangoIP: 'TT-JJ, AQo, AJs, KQs, 98s, 87s, 54s',
    pote: 100,
    stack: 150,
    iteraciones: 600,
  });
  assert.ok(s.explotabilidad >= -1e-9, 'la explotabilidad no puede ser negativa');
  assert.ok(
    s.explotabilidadPorcentualDelPote < 0.1,
    `dejó ${s.explotabilidadPorcentualDelPote.toFixed(3)}% del pote sobre la mesa`,
  );
});

test('la ventaja de rango se refleja en el EV, con el signo correcto', () => {
  const base = { board: 'Ah7d2c9sKh', pote: 100, stack: 100, iteraciones: 400 };
  // OOP con el rango que aplasta: tríos y dobles pares contra aire.
  const aplastando = resolverRiver({ ...base, rangoOOP: 'AA, KK, AKo', rangoIP: '54s, 65s, 43s' });
  assert.ok(aplastando.valorJugador0 > 40, `OOP debería ganar casi todo el pote, dio ${aplastando.valorJugador0.toFixed(2)}`);
  // Y al revés: el mismo spot con los rangos invertidos tiene que dar simétrico.
  const aplastado = resolverRiver({ ...base, rangoOOP: '54s, 65s, 43s', rangoIP: 'AA, KK, AKo' });
  assert.ok(aplastado.valorJugador0 < -40, `OOP debería perder casi todo, dio ${aplastado.valorJugador0.toFixed(2)}`);
});

test('check-down con rangos idénticos: el EV es exactamente cero', () => {
  // Sin ninguna acción de apuesta, el spot es un showdown puro. Con el MISMO rango
  // para los dos, la matriz de enfrentamientos es antisimétrica, así que el EV
  // tiene que ser 0 exacto. Es el test que fija que el signo del showdown y la
  // normalización estén bien: cualquier error de media ficha aparece acá.
  const s = resolverRiver({
    board: 'Ah7d2c9sKh',
    rangoOOP: 'QQ, JJ, TT, 98s, 87s',
    rangoIP: 'QQ, JJ, TT, 98s, 87s',
    pote: 100,
    stack: 100,
    tamanosApuesta: [],
    tamanosSubida: [],
    maxSubidas: 0,
    iteraciones: 200,
  });
  assert.ok(Math.abs(s.valorJugador0) < 1e-9, `esperaba 0 exacto, dio ${s.valorJugador0}`);
  assert.ok(Math.abs(s.explotabilidad) < 1e-9, 'sin decisiones no hay nada que explotar');
});

test('con desventaja de rango, el solver tiende una TRAMPA con las nuts', () => {
  // Spot deliberado: OOP tiene AA (3 combos) + QQ (6) + 65s (4), y las dos manos
  // que no son AA pierden contra CASI todo el rango de IP (KK y AQo le ganan a QQ
  // y al aire). O sea: OOP está en desventaja de rango severa, gana con 3 de 13
  // combos.
  //
  // Lo interesante es lo que hace el solver: NO apuesta AA. Apostar con un rango
  // capado es transparente — IP foldea y AA cobra apenas el pote. En cambio pasa
  // con todo, deja que IP (que tiene la ventaja de rango) apueste, y paga. Es una
  // trampa, y es la jugada correcta. Si alguna vez alguien "arregla" el motor para
  // que apueste las nuts, este test se cae, y hace bien.
  const s = resolverRiver({
    board: 'Ah7d2c9sKh',
    rangoOOP: 'AA, QQ, 65s',
    rangoIP: 'KK, AQo, 54s',
    pote: 100,
    stack: 100,
    tamanosApuesta: [1.0],
    maxSubidas: 0,
    iteraciones: 4000,
  });

  // Primero: que la solución esté convergida. Sin esto, afirmar cualquier cosa
  // sobre las frecuencias es leer la borra del café.
  assert.ok(
    s.explotabilidadPorcentualDelPote < 0.01,
    `no convergió: deja ${s.explotabilidadPorcentualDelPote.toFixed(4)}% del pote`,
  );
  assert.ok(s.valorJugador0 < 0, `con desventaja de rango, OOP tiene que perder EV: ${s.valorJugador0.toFixed(2)}`);

  const pasar = frecuenciasAgregadas(s, s.arbol.raiz).find((f) => f.accion === 'pasar');
  assert.ok(pasar.frecuencia > 0.95, `OOP debería pasar casi siempre, pasa ${pasar.frecuencia.toFixed(3)}`);

  // El nodo que importa: IP apostó tras el paso, OOP decide. Ojo — hay que mirar
  // nodos ALCANZADOS: en una rama que el equilibrio nunca juega, la estrategia no
  // está determinada y afirmar algo sobre ella no prueba nada.
  const trasPaso = s.arbol.raiz.acciones[0].hijo;
  const ipApuesta = frecuenciasAgregadas(s, trasPaso).find((f) => f.accion.startsWith('apostar'));
  assert.ok(ipApuesta.frecuencia > 0.5, `IP con ventaja de rango tiene que apostar, apuesta ${ipApuesta.frecuencia.toFixed(3)}`);

  const oopFrente = trasPaso.acciones.find((a) => a.nombre.startsWith('apostar')).hijo;
  const sigma = estrategiaPromedio(oopFrente);
  const iFoldear = oopFrente.acciones.findIndex((a) => a.nombre === 'foldear');
  const iPagar = oopFrente.acciones.findIndex((a) => a.nombre === 'pagar');
  const rango = s.rangos[OOP];

  const porClase = new Map();
  for (let h = 0; h < rango.combos.length; h++) {
    const clase = claseDeMano(rango.combos[h]);
    if (!porClase.has(clase)) porClase.set(clase, { n: 0, pagar: 0, foldear: 0 });
    const f = porClase.get(clase);
    f.n++;
    f.pagar += sigma[iPagar][h];
    f.foldear += sigma[iFoldear][h];
  }
  const frec = (clase, accion) => porClase.get(clase)[accion] / porClase.get(clase).n;

  assert.ok(frec('AA', 'pagar') > 0.99, `AA nunca foldea la trampa, paga ${frec('AA', 'pagar').toFixed(3)}`);
  assert.ok(frec('65s', 'foldear') > 0.99, `el aire foldea, foldea ${frec('65s', 'foldear').toFixed(3)}`);

  // QQ es el bluff-catcher: en el equilibrio es INDIFERENTE entre pagar y foldear,
  // así que tiene que mezclar. Una frecuencia pura acá sería la señal de que el
  // motor no encontró el equilibrio.
  const qqPaga = frec('QQ', 'pagar');
  assert.ok(qqPaga > 0.1 && qqPaga < 0.9, `QQ tiene que mezclar, paga ${qqPaga.toFixed(3)}`);
});

test('el árbol de apuestas no repite tamaños ni ofrece apuestas imposibles', () => {
  const arbol = construirArbolRiver({
    pote: 100,
    stack: 60,                        // el all-in pisa varios tamaños
    tamanosApuesta: [0.33, 0.75, 1.25, 2.0],
    tamanosSubida: [1.0],
    maxSubidas: 1,
    nCombos: [5, 5],
  });
  for (const nodo of arbol.decisiones) {
    const nombres = nodo.acciones.map((a) => a.nombre);
    assert.equal(new Set(nombres).size, nombres.length, `acciones duplicadas en ${nodo.etiqueta}: ${nombres}`);
    assert.ok(nombres.length >= 2, `un nodo de decisión con una sola acción no es una decisión: ${nodo.etiqueta}`);
    const allIn = nombres.filter((x) => x.includes('all-in'));
    assert.ok(allIn.length <= 1, `el all-in aparece ${allIn.length} veces en ${nodo.etiqueta}`);
  }
});

test('el reporte por clase de mano suma 1 en cada fila y ordena por fuerza', () => {
  const s = resolverRiver({
    board: 'Ah7d2c9sKh',
    rangoOOP: 'AA, KK, AKo, QQ, 65s',
    rangoIP: 'AQo, JJ, 54s',
    pote: 100, stack: 100, iteraciones: 200,
  });
  const reporte = reporteNodo(s, s.arbol.raiz);
  assert.ok(reporte.filas.length >= 4);
  for (const fila of reporte.filas) {
    const suma = fila.frecuencias.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(suma - 1) < 1e-9, `la fila ${fila.clase} suma ${suma}`);
  }
  for (let i = 1; i < reporte.filas.length; i++) {
    assert.ok(
      reporte.filas[i - 1].fuerza >= reporte.filas[i].fuerza,
      'las filas tienen que venir de la mano más fuerte a la más débil',
    );
  }
  const agregado = frecuenciasAgregadas(s, s.arbol.raiz);
  const total = agregado.reduce((a, f) => a + f.frecuencia, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `las frecuencias agregadas suman ${total}`);
});

test('resolver dos veces el mismo spot da exactamente lo mismo (determinista)', () => {
  const spot = {
    board: 'Ah7d2c9sKh', rangoOOP: 'AA, QQ, 65s', rangoIP: 'KK, 54s',
    pote: 100, stack: 100, iteraciones: 300,
  };
  const a = resolverRiver(spot);
  const b = resolverRiver(spot);
  assert.equal(a.valorJugador0, b.valorJugador0);
  assert.equal(a.explotabilidad, b.explotabilidad);
});

test('los spots mal formados fallan ruidoso en vez de devolver basura', () => {
  const base = { rangoOOP: 'AA', rangoIP: 'KK', pote: 100, stack: 100, iteraciones: 10 };
  assert.throws(() => resolverRiver({ ...base, board: 'Ah7d2c9s' }), /5 naipes/);
  // Rango que se anula entero con el board.
  assert.throws(
    () => resolverRiver({ ...base, board: 'AhAdAcAs2h', rangoOOP: 'AA' }),
    /vac[íi]o/,
  );
});
