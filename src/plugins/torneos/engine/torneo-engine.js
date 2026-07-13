/*!
 * WPETorneo — Motor de torneo para Circuito WPE Padel
 * Sistema "Zona + Llave Final (Zonas x4 x3) - FAP".
 *
 * JS puro ES2018, sin dependencias, UMD (browser -> window.WPETorneo, Node -> module.exports).
 * Determinístico bajo semilla: PRNG propio mulberry32. PROHIBIDO Math.random() sin semilla.
 *
 * Contratos: CONTRATO.md (motor) + CONTRATO-GESTION.md (gestión en curso) · Datos: ../DATOS-REALES.md
 *
 * Diseño del algoritmo (resumen — el detalle vive en INFORME-PRUEBAS.md):
 *  - Reparto de zonas: maximizar zonas de 4, resto en zonas de 3; nunca <3.
 *    n=5 es el único n>=3 no expresable como 4a+3b -> fallback documentado: 1 zona de 5.
 *  - Siembra: 'patron' (serpentina/snake por ranking), 'azar' (shuffle con semilla),
 *    'manual' (zonas dadas, validadas).
 *  - Llave: potencia de 2 >= clasificados; byes a los mejores 1º (surge natural del sembrado
 *    estándar: los seeds altos reciben rival fantasma); 1º y 2º de la misma zona en mitades
 *    opuestas (mapeo explícito de runner-up a semilla de la mitad contraria).
 *  - Programación: greedy con invariantes duros (0 doble-booking, descanso, precedencia de llave,
 *    zona en una sola sede+día). Chequeo de capacidad ANTES de programar.
 */
(function (root, factory) {
  'use strict';
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.WPETorneo = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.1.0';

  // ---------------------------------------------------------------------------
  // PRNG determinístico (mulberry32) + helpers de aleatoriedad sembrada
  // ---------------------------------------------------------------------------

  /** Hashea un string a un uint32 (para derivar sub-semillas por categoría/fase). */
  function hashStr(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** mulberry32: PRNG rápido y determinístico. Devuelve función () -> [0,1). */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Deriva un PRNG a partir de una semilla numérica y una sal de texto. */
  function rngFrom(semilla, salt) {
    return mulberry32((hashStr(String(semilla) + '::' + salt)) >>> 0);
  }

  /** Fisher-Yates sembrado (no muta el original). */
  function shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // ---------------------------------------------------------------------------
  // Utilidades de tiempo (slots de juego)
  // ---------------------------------------------------------------------------

  function parseHM(hm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm).trim());
    if (!m) throw new Error('Hora inválida: "' + hm + '" (formato HH:MM)');
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }
  function fmtHM(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /** Slots de inicio válidos de un día: cada slotMin, el partido debe TERMINAR antes de `hasta`. */
  function slotsDeDia(dia, slotMin) {
    var d = parseHM(dia.desde), h = parseHM(dia.hasta);
    var out = [];
    for (var t = d; t + slotMin <= h; t += slotMin) out.push(t);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Categorías: abreviatura para códigos de partido (estilo real "CA7-018")
  // ---------------------------------------------------------------------------

  function abreviarCategoria(cat) {
    var g = /damas|femenin/i.test(cat) ? 'DA' : 'CA';
    var divM = cat.match(/(\d+)\s*(?:ra|da|ta|va|ma|na|º|°)?/i);
    var div = divM ? divM[1] : 'X';
    var edadM = cat.match(/\+\s*(\d+)/);
    var edad = edadM ? edadM[1] : '';
    return g + div + (edad ? '+' + edad : '');
  }

  function pad3(n) { return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }

  // ---------------------------------------------------------------------------
  // Reparto de zonas: maximizar zonas de 4, resto zonas de 3. Nunca <3.
  //   4a + 3b = n, maximizar a (minimizar b). Único n>=3 sin solución: n=5.
  // ---------------------------------------------------------------------------

  function repartoZonas(n) {
    if (n < 3) throw new Error('No se pueden armar zonas con ' + n + ' pareja(s): mínimo 3 por categoría.');
    if (n === 5) return [5]; // fallback documentado: 1 zona de 5 (round robin de 10, clasifican 2 -> final directa)
    var r = n % 4, z4, z3;
    if (r === 0) { z4 = n / 4; z3 = 0; }
    else if (r === 1) { z4 = (n - 9) / 4; z3 = 3; }   // n>=9 garantizado (n=5 ya tratado)
    else if (r === 2) { z4 = (n - 6) / 4; z3 = 2; }
    else { z4 = (n - 3) / 4; z3 = 1; }
    var sizes = [];
    for (var i = 0; i < z4; i++) sizes.push(4);
    for (var j = 0; j < z3; j++) sizes.push(3);
    return sizes;
  }

  // ---------------------------------------------------------------------------
  // Round robin (método del círculo). Devuelve rondas: [[ [a,b], ... ], ...]
  //   k=4 -> 3 rondas x 2 = 6 · k=3 -> 3 rondas x 1 = 3 · k=5 -> 5 rondas x 2 = 10
  // ---------------------------------------------------------------------------

  function roundRobin(members) {
    var arr = members.slice();
    if (arr.length % 2 !== 0) arr.push('__BYE__');
    var nn = arr.length;
    var fixed = arr[0];
    var rot = arr.slice(1);
    var rounds = [];
    for (var r = 0; r < nn - 1; r++) {
      var line = [fixed].concat(rot);
      var round = [];
      for (var i = 0; i < nn / 2; i++) {
        var a = line[i], b = line[nn - 1 - i];
        if (a !== '__BYE__' && b !== '__BYE__') round.push([a, b]);
      }
      rounds.push(round);
      rot.unshift(rot.pop()); // rotación
    }
    return rounds;
  }

  // ---------------------------------------------------------------------------
  // Siembra de zonas
  // ---------------------------------------------------------------------------

  var LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function letraZona(i) {
    // A, B, ... Z, AA, AB, ... (soporta >26 zonas)
    if (i < 26) return LETRAS[i];
    return LETRAS[Math.floor(i / 26) - 1] + LETRAS[i % 26];
  }

  /** Ordena parejas por ranking asc (mejor primero); tie-break por id estable. */
  function ordenarPorRanking(parejas) {
    return parejas.slice().sort(function (p, q) {
      var pr = (p.ranking == null ? Infinity : p.ranking);
      var qr = (q.ranking == null ? Infinity : q.ranking);
      if (pr !== qr) return pr - qr;
      return String(p.id) < String(q.id) ? -1 : String(p.id) > String(q.id) ? 1 : 0;
    });
  }

  /** Serpentina (snake) por ranking sobre zonas de tamaños dados. */
  function siembraPatron(parejasOrdenadas, sizes) {
    var zones = sizes.map(function () { return []; });
    var order = sizes.map(function (_, i) { return i; });
    var idx = 0, round = 0;
    while (idx < parejasOrdenadas.length) {
      var seq = round % 2 === 0 ? order : order.slice().reverse();
      for (var s = 0; s < seq.length && idx < parejasOrdenadas.length; s++) {
        var z = seq[s];
        if (zones[z].length < sizes[z]) zones[z].push(parejasOrdenadas[idx++]);
      }
      round++;
    }
    return zones;
  }

  /** Azar: shuffle sembrado y relleno por capacidad. */
  function siembraAzar(parejas, sizes, rnd) {
    var pool = shuffle(parejas, rnd);
    var zones = sizes.map(function () { return []; });
    var idx = 0;
    for (var z = 0; z < sizes.length; z++) {
      for (var k = 0; k < sizes[z]; k++) zones[z].push(pool[idx++]);
    }
    return zones;
  }

  /** Manual: valida que las zonas dadas usen exactamente todas las parejas una vez. */
  function siembraManual(parejas, zonasIds, cat) {
    if (!Array.isArray(zonasIds)) {
      throw new Error('Modo manual: falta config.manual["' + cat + '"] (array de zonas).');
    }
    var byId = {};
    parejas.forEach(function (p) { byId[p.id] = p; });
    var vistos = {};
    var zones = [];
    for (var z = 0; z < zonasIds.length; z++) {
      var grp = zonasIds[z];
      if (!Array.isArray(grp)) throw new Error('Modo manual ("' + cat + '"): la zona ' + letraZona(z) + ' no es un array.');
      if (grp.length < 3) throw new Error('Modo manual ("' + cat + '"): la zona ' + letraZona(z) + ' tiene ' + grp.length + ' pareja(s); mínimo 3.');
      var zoneParejas = [];
      for (var i = 0; i < grp.length; i++) {
        var id = grp[i];
        if (!byId[id]) throw new Error('Modo manual ("' + cat + '"): la pareja "' + id + '" (zona ' + letraZona(z) + ') no existe en la categoría.');
        if (vistos[id]) throw new Error('Modo manual ("' + cat + '"): la pareja "' + id + '" está repetida (aparece en más de una zona).');
        vistos[id] = true;
        zoneParejas.push(byId[id]);
      }
      zones.push(zoneParejas);
    }
    // Ninguna pareja sin ubicar
    for (var j = 0; j < parejas.length; j++) {
      if (!vistos[parejas[j].id]) {
        throw new Error('Modo manual ("' + cat + '"): la pareja "' + parejas[j].id + '" quedó sin zona asignada.');
      }
    }
    return zones;
  }

  // ---------------------------------------------------------------------------
  // Llave: sembrado estándar (potencia de 2) + byes + mitades opuestas
  // ---------------------------------------------------------------------------

  function nextPow2(n) { var p = 1; while (p < n) p <<= 1; return p; }

  /** Posiciones de sembrado estándar: seeds[pos] = número de semilla (1-indexado). */
  function seedPositions(B) {
    var seeds = [1, 2];
    while (seeds.length < B) {
      var n = seeds.length * 2, next = [];
      for (var i = 0; i < seeds.length; i++) { next.push(seeds[i]); next.push(n + 1 - seeds[i]); }
      seeds = next;
    }
    return seeds;
  }

  /** Nombre de ronda de llave según cantidad de partidos de esa ronda. */
  function nombreRondaLlave(nMatches) {
    if (nMatches === 1) return 'FINAL';
    if (nMatches === 2) return 'SEMIFINAL';
    if (nMatches === 4) return '4º DE FINAL';
    if (nMatches === 8) return '8º DE FINAL';
    if (nMatches === 16) return '16º DE FINAL';
    return nMatches + 'avos DE FINAL'; // 32avos, 64avos...
  }

  // ---------------------------------------------------------------------------
  // Generador de parejas de demo (nombres ficticios realistas argentinos)
  // ---------------------------------------------------------------------------

  var NOMBRES_M = ['Juan', 'Martín', 'Diego', 'Nicolás', 'Lucas', 'Matías', 'Facundo', 'Santiago', 'Federico', 'Gonzalo', 'Ramiro', 'Ignacio', 'Tomás', 'Franco', 'Emiliano', 'Bruno', 'Agustín', 'Julián', 'Sebastián', 'Maximiliano', 'Leandro', 'Ezequiel', 'Cristian', 'Damián', 'Gastón'];
  var NOMBRES_F = ['María', 'Sofía', 'Valentina', 'Camila', 'Lucía', 'Martina', 'Julieta', 'Florencia', 'Agustina', 'Micaela', 'Carla', 'Daniela', 'Rocío', 'Belén', 'Antonella', 'Paula', 'Luciana', 'Mariana', 'Carolina', 'Gabriela', 'Victoria', 'Milagros', 'Ayelén', 'Brenda', 'Romina'];
  var APELLIDOS = ['González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Pérez', 'García', 'Sánchez', 'Romero', 'Díaz', 'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Benítez', 'Acosta', 'Medina', 'Herrera', 'Aguirre', 'Gómez', 'Sosa', 'Molina', 'Castro', 'Ortiz', 'Silva', 'Núñez', 'Rojas', 'Vega', 'Cabrera', 'Ferreyra', 'Godoy', 'Vera', 'Ojeda', 'Bianchi', 'Luna', 'Ponce', 'Cardozo', 'Ríos', 'Peralta'];

  /**
   * generarParejas(n, categorias, semilla)
   *  - n: cantidad total de parejas
   *  - categorias: array de nombres de categoría (o mapa {cat: peso})
   *  - semilla: determinismo
   * Reparte n entre categorías con pesos realistas (más volumen en 6ta/7ma).
   */
  function generarParejas(n, categorias, semilla) {
    if (semilla == null) semilla = 42;
    var rnd = rngFrom(semilla, 'gen-parejas');
    var cats, pesos;
    var pesosDefault = {
      '3ra': 0.5, '4ta': 0.8, '5ta': 1.0, '6ta': 1.6, '7ma': 2.0, '8va': 1.2
    };
    function pesoDe(cat) {
      var m = cat.match(/(\d+)\s*(?:ra|da|ta|va|ma)/i);
      var base = m ? (pesosDefault[m[1] + ({ 3: 'ra', 4: 'ta', 5: 'ta', 6: 'ta', 7: 'ma', 8: 'va' }[m[1]] || '')] || 1) : 1;
      if (/damas/i.test(cat)) base *= 0.55;      // menos volumen en damas
      if (/\+\s*\d+/.test(cat)) base *= 0.6;       // categorías de edad, menor volumen
      return base;
    }
    if (Array.isArray(categorias)) {
      cats = categorias.slice();
      pesos = cats.map(pesoDe);
    } else {
      cats = Object.keys(categorias);
      pesos = cats.map(function (c) { return categorias[c]; });
    }
    var total = pesos.reduce(function (a, b) { return a + b; }, 0);
    // reparto proporcional con redondeo + ajuste de resto
    var cupos = pesos.map(function (p) { return Math.floor(n * p / total); });
    var asign = cupos.reduce(function (a, b) { return a + b; }, 0);
    var i = 0;
    while (asign < n) { cupos[i % cupos.length]++; asign++; i++; }

    var parejas = [];
    var counter = 1;
    for (var c = 0; c < cats.length; c++) {
      var cat = cats[c];
      var damas = /damas/i.test(cat);
      var nombres = damas ? NOMBRES_F : NOMBRES_M;
      var rankBase = 1;
      for (var k = 0; k < cupos[c]; k++) {
        parejas.push({
          id: 'P' + pad3(counter++),
          categoria: cat,
          j1: { nombre: nombres[Math.floor(rnd() * nombres.length)], apellido: APELLIDOS[Math.floor(rnd() * APELLIDOS.length)] },
          j2: { nombre: nombres[Math.floor(rnd() * nombres.length)], apellido: APELLIDOS[Math.floor(rnd() * APELLIDOS.length)] },
          ranking: rankBase++
        });
      }
    }
    return parejas;
  }

  // ---------------------------------------------------------------------------
  // Programación (scheduler) — greedy con invariantes duros
  // ---------------------------------------------------------------------------

  function Scheduler(config) {
    this.config = config;
    this.slotMin = config.slotMin;
    this.descanso = config.descansoMin;
    this.dias = config.dias;
    this.booking = Object.create(null);     // 'sede|cancha|diaIdx|min' -> partidoId
    this.parejaBusy = Object.create(null);  // parejaId -> [{diaIdx,start,end}]
    this.slotsCache = {};
    this.errores = [];
    var self = this;
    this.sedesById = {};
    config.sedes.forEach(function (s) { self.sedesById[s.id] = s; });
  }
  Scheduler.prototype.slots = function (diaIdx) {
    if (!this.slotsCache[diaIdx]) this.slotsCache[diaIdx] = slotsDeDia(this.dias[diaIdx], this.slotMin);
    return this.slotsCache[diaIdx];
  };
  Scheduler.prototype.canchaLibre = function (sedeId, cancha, diaIdx, min) {
    return !this.booking[sedeId + '|' + cancha + '|' + diaIdx + '|' + min];
  };
  Scheduler.prototype.parejaLibre = function (parejaId, diaIdx, start) {
    var busy = this.parejaBusy[parejaId];
    if (!busy) return true;
    var end = start + this.slotMin;
    for (var i = 0; i < busy.length; i++) {
      var b = busy[i];
      if (b.diaIdx !== diaIdx) continue;
      // solapamiento o descanso insuficiente
      if (start < b.end + this.descanso && b.start < end + this.descanso) return false;
    }
    return true;
  };
  Scheduler.prototype.ocupar = function (partido, sedeId, cancha, diaIdx, start) {
    this.booking[sedeId + '|' + cancha + '|' + diaIdx + '|' + start] = partido.id;
    partido.sede = sedeId;
    partido.cancha = cancha;
    partido.dia = this.dias[diaIdx].fecha;
    partido.hora = fmtHM(start);
    partido._diaIdx = diaIdx;
    partido._start = start;
    partido._end = start + this.slotMin;
    var parejas = partido._parejasReales || [];
    for (var i = 0; i < parejas.length; i++) {
      if (!this.parejaBusy[parejas[i]]) this.parejaBusy[parejas[i]] = [];
      this.parejaBusy[parejas[i]].push({ diaIdx: diaIdx, start: start, end: start + this.slotMin });
    }
  };

  /**
   * Ubica un partido buscando el primer slot factible.
   * opts: { diasPref:[idx], sedesPref:[sedeId], sedeFija?, diaFija?, minStartPorDia?:{diaIdx:min}, minStartAbs? }
   * Respeta: cancha libre (0 doble-booking) + parejas libres con descanso.
   * Devuelve true si ubicó; false si no hubo lugar.
   */
  Scheduler.prototype.ubicar = function (partido, opts) {
    var dias = opts.diaFija != null ? [opts.diaFija] : opts.diasPref;
    var sedes = opts.sedeFija != null ? [opts.sedeFija] : opts.sedesPref;
    var parejas = partido._parejasReales || [];
    for (var di = 0; di < dias.length; di++) {
      var diaIdx = dias[di];
      var slots = this.slots(diaIdx);
      var minStart = opts.minStartAbs || 0;
      if (opts.minStartPorDia && opts.minStartPorDia[diaIdx] != null) {
        minStart = Math.max(minStart, opts.minStartPorDia[diaIdx]);
      }
      for (var si = 0; si < slots.length; si++) {
        var start = slots[si];
        if (start < minStart) continue;
        // parejas libres?
        var ok = true;
        for (var p = 0; p < parejas.length; p++) {
          if (!this.parejaLibre(parejas[p], diaIdx, start)) { ok = false; break; }
        }
        if (!ok) continue;
        // cancha libre en alguna sede preferida?
        for (var se = 0; se < sedes.length; se++) {
          var sede = this.sedesById[sedes[se]];
          if (!sede) continue;
          for (var c = 1; c <= sede.canchas; c++) {
            if (this.canchaLibre(sede.id, c, diaIdx, start)) {
              this.ocupar(partido, sede.id, c, diaIdx, start);
              return true;
            }
          }
        }
      }
    }
    return false;
  };

  // ---------------------------------------------------------------------------
  // Construcción del torneo
  // ---------------------------------------------------------------------------

  function validarConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Config inválida: se esperaba un objeto.');
    if (!config.categorias || typeof config.categorias !== 'object') throw new Error('Config inválida: falta "categorias".');
    if (!Array.isArray(config.sedes) || config.sedes.length === 0) throw new Error('Config inválida: falta "sedes" (al menos una).');
    config.sedes.forEach(function (s) {
      if (!s.id || !(s.canchas > 0)) throw new Error('Config inválida: sede "' + (s.id || '?') + '" necesita id y canchas>0.');
    });
    if (!Array.isArray(config.dias) || config.dias.length === 0) throw new Error('Config inválida: falta "dias".');
    if (!(config.slotMin > 0)) throw new Error('Config inválida: "slotMin" debe ser > 0.');
    if (config.descansoMin == null || config.descansoMin < 0) throw new Error('Config inválida: "descansoMin" debe ser >= 0.');
    var modo = config.modo || 'patron';
    if (['patron', 'azar', 'manual'].indexOf(modo) < 0) throw new Error('Config inválida: modo "' + modo + '" desconocido (patron|azar|manual).');
    var nd = config.dias.length;
    var zd = config.zonaDias || [0, Math.min(1, nd - 1)];
    var ld = config.llaveDias || (nd > 2 ? [2, nd - 1] : [nd - 1]);
    zd.concat(ld).forEach(function (idx) {
      if (idx < 0 || idx >= nd) throw new Error('Config inválida: índice de día ' + idx + ' fuera de rango (hay ' + nd + ' días).');
    });
    return { modo: modo, zonaDias: zd, llaveDias: ld };
  }

  function crearTorneo(config) {
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var meta = validarConfig(config);
    var modo = config.modo || meta.modo;
    var semilla = config.semilla == null ? 42 : config.semilla;
    var clasifican = config.clasificanPorZona == null ? 2 : config.clasificanPorZona;
    var zonaDias = config.zonaDias || meta.zonaDias;
    var llaveDias = config.llaveDias || meta.llaveDias;

    var torneo = {
      config: config,
      zonas: {},
      llaves: {},
      partidos: {},
      stats: null
    };

    var cats = Object.keys(config.categorias);
    var globalId = 0;
    var advertencias = [];

    function nuevoPartido(fields) {
      globalId++;
      var p = {
        id: globalId, codigo: fields.codigo, categoria: fields.categoria, fase: fields.fase,
        zona: fields.zona || null, ronda: fields.ronda,
        parejaA: fields.parejaA, parejaB: fields.parejaB,
        sede: null, cancha: null, dia: null, hora: null,
        resultado: null
      };
      // refs internas para propagación/scheduling (no rompen el contrato)
      p._origenA = fields.origenA != null ? fields.origenA : fields.parejaA;
      p._origenB = fields.origenB != null ? fields.origenB : fields.parejaB;
      p._parejasReales = fields.parejasReales || [];
      torneo.partidos[p.id] = p;
      return p;
    }

    // --- PASO 1: zonas de todas las categorías (ids continuos primero) ---
    var perCatState = {}; // cat -> { zonasParejas, zonaObjs, corr, abbr, letraDe }
    for (var ci = 0; ci < cats.length; ci++) {
      var cat = cats[ci];
      var parejas = config.categorias[cat] || [];
      if (parejas.length === 0) { advertencias.push('Categoría "' + cat + '" sin inscriptos: no abre.'); continue; }
      if (parejas.length < 3) throw new Error('Categoría "' + cat + '" tiene ' + parejas.length + ' pareja(s): se necesitan al menos 3 para abrir zonas.');

      var abbr = abreviarCategoria(cat);
      var corr = { n: 0 };
      var zonasParejas;
      if (modo === 'manual') {
        zonasParejas = siembraManual(parejas, (config.manual || {})[cat], cat);
      } else {
        var sizes = repartoZonas(parejas.length);
        if (modo === 'patron') zonasParejas = siembraPatron(ordenarPorRanking(parejas), sizes);
        else zonasParejas = siembraAzar(parejas, sizes, rngFrom(semilla, 'zonas-' + cat));
      }

      var zonaObjs = [];
      for (var z = 0; z < zonasParejas.length; z++) {
        var members = zonasParejas[z].map(function (p) { return p.id; });
        var zonaNombre = 'Grupo ' + letraZona(z);
        var rounds = roundRobin(members);
        var partidoIds = [];
        for (var r = 0; r < rounds.length; r++) {
          for (var mm = 0; mm < rounds[r].length; mm++) {
            var pair = rounds[r][mm];
            corr.n++;
            var pt = nuevoPartido({
              codigo: abbr + '-' + pad3(corr.n), categoria: cat, fase: 'zona',
              zona: zonaNombre, ronda: 'RONDA ' + (r + 1),
              parejaA: pair[0], parejaB: pair[1],
              parejasReales: [pair[0], pair[1]]
            });
            partidoIds.push(pt.id);
          }
        }
        zonaObjs.push({ nombre: zonaNombre, parejas: members, partidos: partidoIds });
      }
      torneo.zonas[cat] = zonaObjs;
      perCatState[cat] = { zonasParejas: zonasParejas, zonaObjs: zonaObjs, corr: corr, abbr: abbr, clasifican: clasifican };
    }

    // --- PASO 2: llaves de todas las categorías (ids continúan tras las zonas) ---
    for (var ci2 = 0; ci2 < cats.length; ci2++) {
      var cat2 = cats[ci2];
      var st = perCatState[cat2];
      if (!st) continue; // categoría sin abrir
      torneo.llaves[cat2] = construirLlave(cat2, st, clasifican, nuevoPartido);
    }

    // Enlaces de llave: cada alimentador conoce su partido siguiente (gestión en curso).
    Object.keys(torneo.partidos).forEach(function (pid) {
      var pl = torneo.partidos[pid];
      if (pl._feeders) {
        pl._feeders.forEach(function (fid) { torneo.partidos[fid]._next = pl.id; });
      }
    });

    // --- PASO 3: chequeo de capacidad ANTES de programar ---
    var scheduler = new Scheduler({
      slotMin: config.slotMin, descansoMin: config.descansoMin, dias: config.dias, sedes: config.sedes
    });
    chequearCapacidad(torneo, config, scheduler, zonaDias, llaveDias);

    // --- PASO 4: programación ---
    programar(torneo, config, scheduler, zonaDias, llaveDias, perCatState);

    // --- PASO 5: stats ---
    torneo.stats = calcularStats(torneo, config, scheduler, zonaDias, llaveDias);
    torneo._meta = { zonaDias: zonaDias, llaveDias: llaveDias, clasifican: clasifican, modo: modo, semilla: semilla };
    var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    torneo.stats.msGeneracion = Math.round((t1 - t0) * 100) / 100;
    if (advertencias.length) torneo.stats.advertencias = advertencias;
    return torneo;
  }

  /** Construye la llave de una categoría (seeds, byes, mitades opuestas, rondas). */
  function construirLlave(cat, st, clasifican, nuevoPartido) {
    var abbr = st.abbr;
    var corr = st.corr;
    var Z = st.zonaObjs.length;
    var C = clasifican * Z; // clasificados
    // ranking de zonas por fuerza (menor ranking presente = zona más fuerte)
    var zonaRank = st.zonaObjs.map(function (zo, i) {
      var minR = Infinity;
      st.zonasParejas[i].forEach(function (p) { var rr = (p.ranking == null ? Infinity : p.ranking); if (rr < minR) minR = rr; });
      return { i: i, letra: zo.nombre.replace('Grupo ', ''), minR: minR };
    }).sort(function (a, b) { return a.minR - b.minR || a.i - b.i; });

    if (C < 2) {
      // p.ej. clasifican=1 y Z=1 -> no hay llave (el único partido decide en zona)
      return { rondas: [], byes: [], _entradas: {} };
    }

    var B = nextPow2(C);
    var pos = seedPositions(B); // pos[posición] = número de semilla
    var halfOf = {};            // semilla -> 'top'|'bottom'
    for (var pI = 0; pI < B; pI++) halfOf[pos[pI]] = pI < B / 2 ? 'top' : 'bottom';

    // Asignar semillas 1..Z a los ganadores (zona más fuerte -> semilla 1)
    var entradaPorSemilla = {}; // semilla -> {ref:{seed}, real?:parejaId, zonaIdx}
    var byes = [];

    if (clasifican === 2) {
      // ganadores: semilla = rank+1
      var runnerTop = [], runnerBottom = [];
      for (var s = Z + 1; s <= 2 * Z; s++) {
        if (halfOf[s] === 'top') runnerTop.push(s); else runnerBottom.push(s);
      }
      runnerTop.sort(function (a, b) { return a - b; });
      runnerBottom.sort(function (a, b) { return a - b; });
      for (var k = 0; k < Z; k++) {
        var zr = zonaRank[k];
        var wSeed = k + 1;
        entradaPorSemilla[wSeed] = { seed: '1' + zr.letra, zonaIdx: zr.i, pos: 1 };
        // runner-up a la mitad OPUESTA del ganador
        var rSeed = (halfOf[wSeed] === 'top') ? runnerBottom.shift() : runnerTop.shift();
        entradaPorSemilla[rSeed] = { seed: '2' + zr.letra, zonaIdx: zr.i, pos: 2 };
      }
    } else {
      // clasifican != 2: sembrado estándar por (rankZona, posición) sin restricción de mitades
      var seedN = 0;
      for (var pp = 1; pp <= clasifican; pp++) {
        for (var kk = 0; kk < Z; kk++) {
          seedN++;
          if (seedN > C) break;
          var zrk = zonaRank[kk];
          entradaPorSemilla[seedN] = { seed: pp + zrk.letra, zonaIdx: zrk.i, pos: pp };
        }
      }
    }

    // --- Ronda 1: emparejar posiciones (2i, 2i+1). Semilla > C => BYE (fantasma). ---
    var rondas = [];
    var round1 = [];
    var matchesRound = B / 2;
    for (var i = 0; i < matchesRound; i++) {
      var sa = pos[2 * i], sb = pos[2 * i + 1];
      var ea = entradaPorSemilla[sa], eb = entradaPorSemilla[sb];
      var refA = ea ? { seed: ea.seed } : 'BYE';
      var refB = eb ? { seed: eb.seed } : 'BYE';
      corr.n++;
      var esBye = (refA === 'BYE' || refB === 'BYE');
      var pt = nuevoPartido({
        codigo: abbr + '-' + pad3(corr.n), categoria: cat, fase: 'llave',
        ronda: nombreRondaLlave(matchesRound),
        parejaA: refA, parejaB: refB, origenA: refA, origenB: refB,
        parejasReales: []
      });
      pt._esBye = esBye;
      if (esBye) {
        var seedGanador = (refA !== 'BYE') ? refA : refB;
        byes.push(seedGanador.seed);
      }
      round1.push(pt.id);
    }
    rondas.push({ nombre: nombreRondaLlave(matchesRound), partidos: round1 });

    // --- Rondas siguientes: ganadorDe alimentadores ---
    var prev = round1;
    while (prev.length > 1) {
      var cur = [];
      var nMatches = prev.length / 2;
      for (var j = 0; j < nMatches; j++) {
        var fA = prev[2 * j], fB = prev[2 * j + 1];
        corr.n++;
        var ptn = nuevoPartido({
          codigo: abbr + '-' + pad3(corr.n), categoria: cat, fase: 'llave',
          ronda: nombreRondaLlave(nMatches),
          parejaA: { ganadorDe: fA }, parejaB: { ganadorDe: fB },
          origenA: { ganadorDe: fA }, origenB: { ganadorDe: fB },
          parejasReales: []
        });
        ptn._feeders = [fA, fB];
        cur.push(ptn.id);
      }
      rondas.push({ nombre: nombreRondaLlave(nMatches), partidos: cur });
      prev = cur;
    }

    // Mitades del cuadro por seed (para verificar 1º y 2º de misma zona en mitades opuestas)
    var mitades = {}; // letra -> {p1:'top'|'bottom', p2:'top'|'bottom'}
    Object.keys(entradaPorSemilla).forEach(function (sn) {
      var e = entradaPorSemilla[sn];
      var letra = e.seed.slice(1);
      if (!mitades[letra]) mitades[letra] = {};
      mitades[letra]['p' + e.pos] = halfOf[sn];
    });

    return { rondas: rondas, byes: byes, _entradas: entradaPorSemilla, _mitades: mitades, _B: B, _C: C, _Z: Z, cuadro: mitades };
  }

  /** Chequeo de capacidad (aggregate) por fase: lanza error accionable si no entra. */
  function chequearCapacidad(torneo, config, scheduler, zonaDias, llaveDias) {
    // Partidos de zona: todos necesitan slot.
    var zonaNeed = 0, llaveNeed = 0;
    Object.keys(torneo.partidos).forEach(function (id) {
      var p = torneo.partidos[id];
      if (p.fase === 'zona') zonaNeed++;
      else if (p.fase === 'llave' && !p._esBye) llaveNeed++;
    });
    var totalCanchas = config.sedes.reduce(function (a, s) { return a + s.canchas; }, 0);
    function capacidad(dias) {
      var cap = 0;
      dias.forEach(function (d) { cap += totalCanchas * scheduler.slots(d).length; });
      return cap;
    }
    var zonaCap = capacidad(zonaDias);
    var llaveCap = capacidad(llaveDias);
    if (zonaNeed > zonaCap) {
      throw new Error('Capacidad insuficiente en FASE DE ZONAS: se necesitan ' + zonaNeed +
        ' slots y hay ' + zonaCap + ' (' + totalCanchas + ' canchas × ' +
        zonaDias.map(function (d) { return scheduler.slots(d).length; }).join('+') +
        ' slots en ' + zonaDias.length + ' día(s)). Sumá canchas, sedes, días o franjas horarias (faltan ' + (zonaNeed - zonaCap) + ').');
    }
    if (llaveNeed > llaveCap) {
      throw new Error('Capacidad insuficiente en FASE DE LLAVE: se necesitan ' + llaveNeed +
        ' slots y hay ' + llaveCap + '. Sumá canchas, sedes, días o franjas (faltan ' + (llaveNeed - llaveCap) + ').');
    }
  }

  /** Programa zonas (cada zona en 1 sede + 1 día) y luego la llave (precedencia). */
  function programar(torneo, config, scheduler, zonaDias, llaveDias, perCatState) {
    // Sede "Complejo Sede" (semis/final): la que matchee, si no la primera.
    var complejo = config.sedes.filter(function (s) {
      return /gran willy|complejo sede/i.test(s.nombre || s.id) || s.complejoSede;
    })[0] || config.sedes[0];

    // Bins de zona: (sedeIdx, diaIdx) con capacidad restante en slots.
    // Para agrupar categorías en pocas sedes, asignamos zonas de una categoría
    // reutilizando bins ya usados por esa categoría mientras tengan lugar.
    var bins = [];
    zonaDias.forEach(function (diaIdx) {
      config.sedes.forEach(function (sede) {
        bins.push({ sedeId: sede.id, diaIdx: diaIdx, restante: sede.canchas * scheduler.slots(diaIdx).length, usadaPor: {} });
      });
    });

    // Fase 1: PIN — asignar cada zona a un bin (sede+día) por bin-packing con agrupación de categoría.
    var cats = Object.keys(torneo.zonas);
    var zonasPend = []; // {zona, cat, need, rounds:[[pid...]]}
    for (var ci = 0; ci < cats.length; ci++) {
      var cat = cats[ci];
      var zonaObjs = torneo.zonas[cat];
      for (var z = 0; z < zonaObjs.length; z++) {
        var zona = zonaObjs[z];
        // agrupar partidos por ronda (para intercalar rondas al programar)
        var byRound = {}, orden = [];
        for (var pi = 0; pi < zona.partidos.length; pi++) {
          var pp = torneo.partidos[zona.partidos[pi]];
          if (!byRound[pp.ronda]) { byRound[pp.ronda] = []; orden.push(pp.ronda); }
          byRound[pp.ronda].push(pp.id);
        }
        var rounds = orden.map(function (o) { return byRound[o]; });
        var item = { zona: zona, cat: cat, need: zona.partidos.length, rounds: rounds, bin: null };
        zonasPend.push(item);
        // PIN: preferir bin ya usado por la categoría con lugar; si no, el más libre con lugar.
        var elegido = null, mejor = -1;
        for (var b = 0; b < bins.length; b++) {
          if (bins[b].restante < item.need) continue;
          var score = bins[b].restante + (bins[b].usadaPor[cat] ? 1000000 : 0);
          if (score > mejor) { mejor = score; elegido = bins[b]; }
        }
        if (elegido) { item.bin = elegido; elegido.usadaPor[cat] = true; elegido.restante -= item.need; }
      }
    }

    // Fase 2: PROGRAMAR intercalando rondas (todas las zonas su RONDA 1, luego RONDA 2, ...).
    var maxR = 0;
    zonasPend.forEach(function (it) { if (it.rounds.length > maxR) maxR = it.rounds.length; });
    for (var r = 0; r < maxR; r++) {
      for (var zi = 0; zi < zonasPend.length; zi++) {
        var it = zonasPend[zi];
        if (r >= it.rounds.length) continue;
        if (!it.bin) continue; // sin bin -> se marca abajo
        for (var mi = 0; mi < it.rounds[r].length; mi++) {
          var pm = torneo.partidos[it.rounds[r][mi]];
          var ok = scheduler.ubicar(pm, { sedeFija: it.bin.sedeId, diaFija: it.bin.diaIdx });
          if (!ok) {
            scheduler.errores.push('Partido ' + pm.codigo + ' (' + pm.zona + ', ' + pm.categoria + ') SIN DEFINIR: no entró en ' + it.bin.sedeId + ' el ' + config.dias[it.bin.diaIdx].fecha + '.');
            pm.dia = 'SIN DEFINIR';
          }
        }
      }
    }
    // Zonas sin bin: marcar SIN DEFINIR con mensaje accionable.
    zonasPend.forEach(function (it) {
      if (!it.bin) marcarSinDefinir(scheduler, it.zona, torneo, 'Zona ' + it.zona.nombre + ' de "' + it.cat + '" sin sede/día: fase de zonas saturada (sumá canchas/sedes/días).');
    });

    // Llave: ronda por ronda (precedencia natural: alimentadores ya programados).
    var catsL = Object.keys(torneo.llaves);
    // Programar por índice de ronda global (todas las categorías R1, luego R2, ...)
    var maxRondas = 0;
    catsL.forEach(function (c) { maxRondas = Math.max(maxRondas, torneo.llaves[c].rondas.length); });
    var otrasSedes = config.sedes.map(function (s) { return s.id; });

    for (var ri = 0; ri < maxRondas; ri++) {
      for (var cj = 0; cj < catsL.length; cj++) {
        var llave = torneo.llaves[catsL[cj]];
        if (ri >= llave.rondas.length) continue;
        var ronda = llave.rondas[ri];
        var esFinalFase = (llave.rondas.length - ri) <= 2; // SEMIFINAL o FINAL
        for (var pi = 0; pi < ronda.partidos.length; pi++) {
          var p = torneo.partidos[ronda.partidos[pi]];
          if (p._esBye) continue; // los byes no ocupan slot
          // minStart por precedencia: después del fin de sus alimentadores + descanso
          var minPorDia = {};
          var feederDiaMax = {};
          if (p._feeders) {
            for (var f = 0; f < p._feeders.length; f++) {
              var fp = torneo.partidos[p._feeders[f]];
              if (fp && fp._end != null) {
                var fd = fp._diaIdx;
                feederDiaMax[fd] = Math.max(feederDiaMax[fd] || 0, fp._end + scheduler.descanso);
              }
            }
          }
          // días candidatos: llaveDias en orden; para semis/final preferir el último
          var diasCand = esFinalFase ? llaveDias.slice().reverse() : llaveDias.slice();
          // aplicar minStart: si el alimentador está el mismo día, respetar su fin+descanso;
          // si está un día anterior, sin restricción horaria.
          var minStartPorDia = {};
          diasCand.forEach(function (d) {
            var mx = 0;
            Object.keys(feederDiaMax).forEach(function (fd) {
              if (parseInt(fd, 10) === d) mx = Math.max(mx, feederDiaMax[fd]);
              else if (parseInt(fd, 10) > d) mx = Infinity; // alimentador es posterior: este día no sirve
            });
            minStartPorDia[d] = mx;
          });
          var sedesPref = esFinalFase ? [complejo.id] : otrasSedes;
          var ok = scheduler.ubicar(p, { diasPref: diasCand, sedesPref: sedesPref, minStartPorDia: minStartPorDia });
          if (!ok && esFinalFase) {
            // fallback: cualquier sede si el complejo estaba lleno
            ok = scheduler.ubicar(p, { diasPref: diasCand, sedesPref: otrasSedes, minStartPorDia: minStartPorDia });
          }
          if (!ok) {
            scheduler.errores.push('Partido ' + p.codigo + ' (' + p.categoria + ', ' + p.ronda + ') quedó SIN DEFINIR: sin slot disponible respetando precedencia/descanso.');
            p.dia = 'SIN DEFINIR';
          }
        }
      }
    }
  }


  function marcarSinDefinir(scheduler, zona, torneo, msg) {
    scheduler.errores.push(msg);
    for (var i = 0; i < zona.partidos.length; i++) torneo.partidos[zona.partidos[i]].dia = 'SIN DEFINIR';
  }

  function calcularStats(torneo, config, scheduler, zonaDias, llaveDias) {
    var totalPartidos = 0, programados = 0, byes = 0, porCategoria = {};
    Object.keys(torneo.partidos).forEach(function (id) {
      var p = torneo.partidos[id];
      totalPartidos++;
      if (!porCategoria[p.categoria]) porCategoria[p.categoria] = { zona: 0, llave: 0, byes: 0 };
      if (p.fase === 'zona') porCategoria[p.categoria].zona++;
      else porCategoria[p.categoria].llave++;
      if (p._esBye) { byes++; porCategoria[p.categoria].byes++; }
      else if (p._start != null) programados++;
    });
    var totalCanchas = config.sedes.reduce(function (a, s) { return a + s.canchas; }, 0);
    var capacidadSlots = 0;
    zonaDias.concat(llaveDias).forEach(function (d) { capacidadSlots += totalCanchas * scheduler.slots(d).length; });
    return {
      totalPartidos: totalPartidos,
      partidosProgramados: programados,
      byes: byes,
      porCategoria: porCategoria,
      capacidadSlots: capacidadSlots,
      slotsUsados: programados,
      ocupacionPct: capacidadSlots ? Math.round(programados / capacidadSlots * 1000) / 10 : 0,
      erroresProgramacion: scheduler.errores.slice()
    };
  }

  // ---------------------------------------------------------------------------
  // Simulación de resultados + propagación de la llave
  // ---------------------------------------------------------------------------

  /** Genera un set realista. Devuelve [a,b] con un ganador según fuerza relativa. */
  function generarSet(favorA, rnd) {
    // favorA en [0,1]: prob de que gane A el set
    var aGana = rnd() < favorA;
    var perdedor = Math.floor(rnd() * 5); // 0..4
    if (rnd() < 0.12) {
      // tie-break 7/6
      return aGana ? [7, 6] : [6, 7];
    }
    var gan = 6, per = perdedor;
    return aGana ? [gan, per] : [per, gan];
  }

  function jugarPartido(rnd, rankA, rankB, permitirWO) {
    // favor según ranking (menor = mejor). Si faltan, 50/50.
    var favorA = 0.5;
    if (rankA != null && rankB != null) {
      var diff = rankB - rankA; // positivo => A mejor
      favorA = 1 / (1 + Math.pow(10, -diff / 8));
    }
    if (permitirWO && rnd() < 0.03) {
      // W.O.: ~3%. Gana quien no abandona (aleatorio sembrado).
      var aGana = rnd() < favorA;
      return { sets: aGana ? [[6, 0], [6, 0]] : [[0, 6], [0, 6]], wo: true, ganador: aGana ? 'A' : 'B' };
    }
    var sets = [], winA = 0, winB = 0;
    while (winA < 2 && winB < 2) {
      var s = generarSet(favorA, rnd);
      sets.push(s);
      if (s[0] > s[1]) winA++; else winB++;
    }
    return { sets: sets, ganador: winA > winB ? 'A' : 'B' };
  }

  /**
   * Tabla de posiciones de una zona a partir de los resultados cargados.
   * `salt` hace el sorteo final DETERMINÍSTICO y estable entre recálculos
   * (clave para la gestión en curso: recalcular no cambia un desempate ya resuelto).
   */
  function tablaZona(torneo, zona, salt) {
    var stats = {};
    zona.parejas.forEach(function (pid) {
      stats[pid] = { id: pid, Pts: 0, PJ: 0, PG: 0, PP: 0, SF: 0, SC: 0, GF: 0, GC: 0 };
    });
    zona.partidos.forEach(function (mid) {
      var p = torneo.partidos[mid];
      if (!p.resultado) return;
      var A = p.parejaA, B = p.parejaB;
      var sa = stats[A], sb = stats[B];
      var setsA = 0, setsB = 0, gamesA = 0, gamesB = 0;
      p.resultado.sets.forEach(function (s) {
        gamesA += s[0]; gamesB += s[1];
        if (s[0] > s[1]) setsA++; else setsB++;
      });
      sa.PJ++; sb.PJ++;
      sa.SF += setsA; sa.SC += setsB; sb.SF += setsB; sb.SC += setsA;
      sa.GF += gamesA; sa.GC += gamesB; sb.GF += gamesB; sb.GC += gamesA;
      var ganA = p.resultado.ganador === 'A';
      if (p.resultado.wo) {
        // V=2 ganador, W.O.=0 al que no se presenta
        if (ganA) { sa.Pts += 2; sa.PG++; sb.PP++; } else { sb.Pts += 2; sb.PG++; sa.PP++; }
      } else {
        if (ganA) { sa.Pts += 2; sa.PG++; sb.Pts += 1; sb.PP++; }
        else { sb.Pts += 2; sb.PG++; sa.Pts += 1; sa.PP++; }
      }
    });
    var arr = Object.keys(stats).map(function (k) {
      var s = stats[k];
      s.DS = s.SF - s.SC; s.DG = s.GF - s.GC;
      s.pctGames = (s.GF + s.GC) ? s.GF / (s.GF + s.GC) : 0;
      return s;
    });
    // Desempate: Pts -> DS -> DG -> %games -> sorteo sembrado
    arr.sort(function (a, b) {
      if (b.Pts !== a.Pts) return b.Pts - a.Pts;
      if (b.DS !== a.DS) return b.DS - a.DS;
      if (b.DG !== a.DG) return b.DG - a.DG;
      if (b.pctGames !== a.pctGames) return b.pctGames - a.pctGames;
      // sorteo determinístico y ESTABLE: hash(salt + id) — no depende del orden de recálculo
      return hashStr(String(salt) + '|' + a.id) - hashStr(String(salt) + '|' + b.id);
    });
    return arr;
  }

  /** Sal del sorteo de tabla: semilla del torneo + categoría + zona (estable entre recálculos). */
  function saltTabla(torneo, cat, zona) {
    var s = (torneo._meta && torneo._meta.semilla != null) ? torneo._meta.semilla : 0;
    return s + '|' + cat + '|' + zona.nombre;
  }

  function simularResultados(torneo, semilla) {
    if (semilla == null) semilla = (torneo._meta && torneo._meta.semilla != null) ? torneo._meta.semilla : 7;
    var parejasById = {};
    Object.keys(torneo.config.categorias).forEach(function (cat) {
      (torneo.config.categorias[cat] || []).forEach(function (p) { parejasById[p.id] = p; });
    });
    function rankOf(pid) { return parejasById[pid] ? parejasById[pid].ranking : null; }

    var cats = Object.keys(torneo.zonas);
    for (var ci = 0; ci < cats.length; ci++) {
      var cat = cats[ci];
      var rnd = rngFrom(semilla, 'sim-' + cat);
      // 1) jugar zonas
      torneo.zonas[cat].forEach(function (zona) {
        zona.partidos.forEach(function (mid) {
          var p = torneo.partidos[mid];
          p.resultado = jugarPartido(rnd, rankOf(p.parejaA), rankOf(p.parejaB), true);
        });
      });
      // 2) tablas -> clasificados por zona
      var clasif = {}; // seed string '1A' -> parejaId
      torneo.zonas[cat].forEach(function (zona) {
        var letra = zona.nombre.replace('Grupo ', '');
        var tabla = tablaZona(torneo, zona, saltTabla(torneo, cat, zona));
        zona._tabla = tabla;
        var clasN = (torneo._meta ? torneo._meta.clasifican : 2);
        for (var pos = 0; pos < clasN && pos < tabla.length; pos++) {
          clasif[(pos + 1) + letra] = tabla[pos].id;
        }
      });
      // 3) resolver y jugar la llave, propagando ganadores
      var llave = torneo.llaves[cat];
      if (!llave) continue;
      for (var ri = 0; ri < llave.rondas.length; ri++) {
        llave.rondas[ri].partidos.forEach(function (mid) {
          var p = torneo.partidos[mid];
          var A = resolverLado(torneo, p._origenA, clasif);
          var B = resolverLado(torneo, p._origenB, clasif);
          p._resueltoA = A; p._resueltoB = B;
          if (A === 'BYE' && B === 'BYE') { p._ganadorPareja = null; return; }
          if (A === 'BYE') { p._ganadorPareja = B; p.resultado = { sets: [], bye: true, ganador: 'B' }; return; }
          if (B === 'BYE') { p._ganadorPareja = A; p.resultado = { sets: [], bye: true, ganador: 'A' }; return; }
          var res = jugarPartido(rnd, rankOf(A), rankOf(B), true);
          p.resultado = res;
          p._ganadorPareja = res.ganador === 'A' ? A : B;
        });
      }
      // Normalizar estado (tablas, _completa, _parejasReales de llave) con la maquinaria de gestión.
      resolverCategoria(torneo, cat);
    }
    return torneo;
  }

  /** Resuelve un lado de partido de llave a un parejaId concreto (o 'BYE'). */
  function resolverLado(torneo, origen, clasif) {
    if (origen === 'BYE') return 'BYE';
    if (origen && origen.seed != null) return clasif[origen.seed] != null ? clasif[origen.seed] : 'BYE';
    if (origen && origen.ganadorDe != null) {
      var fp = torneo.partidos[origen.ganadorDe];
      return fp ? (fp._ganadorPareja || 'BYE') : 'BYE';
    }
    return origen; // ya es un parejaId
  }

  // ---------------------------------------------------------------------------
  // Validación de invariantes
  // ---------------------------------------------------------------------------

  function validar(torneo) {
    var errores = [], advertencias = [];
    var config = torneo.config;
    var slotMin = config.slotMin, descanso = config.descansoMin;

    // 1) Cada pareja en exactamente una zona por categoría; zonas de tamaño válido
    Object.keys(torneo.zonas).forEach(function (cat) {
      var seen = {};
      var totalCat = (config.categorias[cat] || []).length;
      var enZonas = 0;
      torneo.zonas[cat].forEach(function (zona) {
        var sz = zona.parejas.length;
        if (sz < 3) errores.push('Zona ' + zona.nombre + ' de "' + cat + '" tiene ' + sz + ' parejas (mínimo 3).');
        if (sz !== 3 && sz !== 4 && sz !== 5) errores.push('Zona ' + zona.nombre + ' de "' + cat + '" tiene tamaño ' + sz + ' (se esperaba 3, 4 o excepción 5).');
        zona.parejas.forEach(function (pid) {
          if (seen[pid]) errores.push('Pareja ' + pid + ' aparece en más de una zona en "' + cat + '".');
          seen[pid] = true; enZonas++;
        });
      });
      if (enZonas !== totalCat) errores.push('Categoría "' + cat + '": ' + enZonas + ' parejas en zonas vs ' + totalCat + ' inscriptas.');
      // conteo de partidos de zona por fórmula
      torneo.zonas[cat].forEach(function (zona) {
        var sz = zona.parejas.length;
        var esperado = sz === 4 ? 6 : sz === 3 ? 3 : sz === 5 ? 10 : (sz * (sz - 1) / 2);
        if (zona.partidos.length !== esperado) {
          errores.push('Zona ' + zona.nombre + ' de "' + cat + '": ' + zona.partidos.length + ' partidos, se esperaban ' + esperado + '.');
        }
      });
    });

    // 2) Conteo de partidos de llave = clasificados + byes - 1 = B - 1
    Object.keys(torneo.llaves).forEach(function (cat) {
      var ll = torneo.llaves[cat];
      if (!ll.rondas.length) return;
      var total = 0;
      ll.rondas.forEach(function (r) { total += r.partidos.length; });
      var B = ll._B;
      if (total !== B - 1) errores.push('Llave "' + cat + '": ' + total + ' partidos, se esperaban ' + (B - 1) + ' (B-1).');
      // byes a los mejores 1º: byes = seeds más fuertes (1..B-C). Si byes>Z, alguno cae en un 2º
      // (inevitable) -> advertencia informativa, no error.
      ll.byes.forEach(function (seed) {
        if (!/^1/.test(seed)) advertencias.push('Bye en semilla ' + seed + ' (no es un 1º): byes (' + ll.byes.length + ') > zonas (' + ll._Z + ') en "' + cat + '".');
      });
      // 1º y 2º de la misma zona en mitades opuestas del cuadro (sólo aplica a clasifican=2)
      if (ll._mitades) {
        Object.keys(ll._mitades).forEach(function (letra) {
          var mm = ll._mitades[letra];
          if (mm.p1 && mm.p2 && mm.p1 === mm.p2) {
            errores.push('Cuadro "' + cat + '": 1' + letra + ' y 2' + letra + ' en la misma mitad (' + mm.p1 + '); deben ir en mitades opuestas.');
          }
        });
      }
    });

    // 3) 0 doble-booking de cancha (por solapamiento de intervalos, no solo inicio exacto)
    var court = {};
    Object.keys(torneo.partidos).forEach(function (id) {
      var p = torneo.partidos[id];
      if (p._start == null || p.sede == null) return;
      var key = p.sede + '|' + p.cancha + '|' + p._diaIdx;
      (court[key] = court[key] || []).push(p);
    });
    Object.keys(court).forEach(function (key) {
      var arr = court[key].sort(function (a, b) { return a._start - b._start; });
      for (var i = 1; i < arr.length; i++) {
        if (arr[i]._start < arr[i - 1]._end) {
          errores.push('Doble-booking: cancha ' + arr[i].sede + ' C' + arr[i].cancha + ' el ' + arr[i].dia + ': ' +
            arr[i - 1].codigo + ' (' + arr[i - 1].hora + ') se solapa con ' + arr[i].codigo + ' (' + arr[i].hora + ').');
        }
      }
    });

    // 4) 0 parejas en 2 partidos solapados + descanso
    var busy = {};
    Object.keys(torneo.partidos).forEach(function (id) {
      var p = torneo.partidos[id];
      if (p._start == null) return;
      (p._parejasReales || []).forEach(function (pid) {
        if (!busy[pid]) busy[pid] = [];
        busy[pid].push({ diaIdx: p._diaIdx, start: p._start, end: p._end, cod: p.codigo });
      });
    });
    Object.keys(busy).forEach(function (pid) {
      var iv = busy[pid].sort(function (a, b) { return a.diaIdx - b.diaIdx || a.start - b.start; });
      for (var i = 1; i < iv.length; i++) {
        var prev = iv[i - 1], curr = iv[i];
        if (prev.diaIdx !== curr.diaIdx) continue;
        if (curr.start < prev.end) errores.push('Pareja ' + pid + ' solapada: ' + prev.cod + ' y ' + curr.cod + ' se pisan.');
        else if (curr.start - prev.end < descanso) errores.push('Pareja ' + pid + ' con descanso insuficiente entre ' + prev.cod + ' y ' + curr.cod + ' (' + (curr.start - prev.end) + '<' + descanso + ' min).');
      }
    });

    // 5) Precedencia de llave: partido después de sus alimentadores + descanso
    Object.keys(torneo.partidos).forEach(function (id) {
      var p = torneo.partidos[id];
      if (p.fase !== 'llave' || !p._feeders || p._start == null) return;
      p._feeders.forEach(function (fid) {
        var fp = torneo.partidos[fid];
        if (!fp || fp._start == null) return;
        // alimentador debe terminar antes (y con descanso) del inicio de p
        var finF = fp._diaIdx * 100000 + fp._end; // orden temporal global aproximado por día
        var iniP = p._diaIdx * 100000 + p._start;
        if (iniP < finF) errores.push('Precedencia violada: ' + p.codigo + ' (' + p.ronda + ') no puede ir antes que su alimentador ' + fp.codigo + '.');
        else if (fp._diaIdx === p._diaIdx && (p._start - fp._end) < descanso) {
          errores.push('Precedencia con descanso insuficiente: ' + p.codigo + ' arranca ' + (p._start - fp._end) + ' min tras ' + fp.codigo + '.');
        }
      });
    });

    // 6) Partidos de una misma zona: misma sede y mismo día
    Object.keys(torneo.zonas).forEach(function (cat) {
      torneo.zonas[cat].forEach(function (zona) {
        var sede = null, dia = null;
        zona.partidos.forEach(function (mid) {
          var p = torneo.partidos[mid];
          if (p._start == null) return;
          if (sede == null) { sede = p.sede; dia = p._diaIdx; }
          else {
            if (p.sede !== sede) errores.push('Zona ' + zona.nombre + ' de "' + cat + '" dispersa en sedes (' + sede + ' y ' + p.sede + ').');
            if (p._diaIdx !== dia) errores.push('Zona ' + zona.nombre + ' de "' + cat + '" dispersa en días.');
          }
        });
      });
    });

    // 7) totalPartidos == programados + byes + sinDefinir(=0 ideal)
    var totalPartidos = Object.keys(torneo.partidos).length;
    var programados = 0, byes = 0, sinDefinir = 0;
    Object.keys(torneo.partidos).forEach(function (id) {
      var p = torneo.partidos[id];
      if (p._esBye) byes++;
      else if (p._start != null) programados++;
      else sinDefinir++;
    });
    if (sinDefinir > 0) errores.push(sinDefinir + ' partido(s) quedaron SIN DEFINIR (sin sede/hora asignada).');
    if (totalPartidos !== programados + byes + sinDefinir) errores.push('Inconsistencia de conteo: total ' + totalPartidos + ' != programados ' + programados + ' + byes ' + byes + ' + sinDefinir ' + sinDefinir + '.');

    // incorporar errores de programación registrados
    if (torneo.stats && torneo.stats.erroresProgramacion) {
      torneo.stats.erroresProgramacion.forEach(function (e) { if (errores.indexOf(e) < 0) errores.push(e); });
    }

    return {
      ok: errores.length === 0,
      errores: errores,
      advertencias: advertencias,
      stats: {
        totalPartidos: totalPartidos,
        partidosProgramados: programados,
        byes: byes,
        sinDefinir: sinDefinir
      }
    };
  }

  // ===========================================================================
  // INCREMENTO 2 — GESTIÓN DE TORNEO EN CURSO (CONTRATO-GESTION.md)
  // ===========================================================================

  /**
   * Resuelve un lado (para gestión): 'BYE' | parejaId | null (aún no definido).
   * A diferencia de resolverLado (simulación completa), acá lo desconocido es null.
   */
  function resolverLadoGestion(torneo, origen, clasif) {
    if (origen === 'BYE') return 'BYE';
    if (origen && origen.seed != null) return clasif[origen.seed] != null ? clasif[origen.seed] : null;
    if (origen && origen.ganadorDe != null) {
      var fp = torneo.partidos[origen.ganadorDe];
      return fp ? (fp._ganadorPareja || null) : null;
    }
    return origen; // parejaId directo (fase de zona no pasa por acá)
  }

  /**
   * Recalcula TODO el estado derivado de una categoría a partir de los resultados:
   * tablas de zona, zonas completas -> clasificados (seeds), resolución de la llave
   * (incluye avance automático de byes) y _parejasReales de los partidos de llave.
   * Devuelve {ok:false, error} si una re-resolución contradice un partido YA JUGADO
   * (p.ej. una corrección de zona que cambia un clasificado que ya jugó la llave).
   */
  function resolverCategoria(torneo, cat) {
    var zonas = torneo.zonas[cat] || [];
    var clasifN = (torneo._meta && torneo._meta.clasifican != null) ? torneo._meta.clasifican : 2;
    var clasif = {};
    for (var zi = 0; zi < zonas.length; zi++) {
      var zona = zonas[zi];
      zona._tabla = tablaZona(torneo, zona, saltTabla(torneo, cat, zona));
      var completa = zona.partidos.every(function (mid) { return !!torneo.partidos[mid].resultado; });
      zona._completa = completa;
      if (completa) {
        var letra = zona.nombre.replace('Grupo ', '');
        for (var pos = 0; pos < clasifN && pos < zona._tabla.length; pos++) {
          clasif[(pos + 1) + letra] = zona._tabla[pos].id;
        }
      }
    }
    var llave = torneo.llaves[cat];
    if (!llave || !llave.rondas.length) return { ok: true };
    for (var ri = 0; ri < llave.rondas.length; ri++) {
      var ronda = llave.rondas[ri];
      for (var mi = 0; mi < ronda.partidos.length; mi++) {
        var p = torneo.partidos[ronda.partidos[mi]];
        var A = resolverLadoGestion(torneo, p._origenA, clasif);
        var B = resolverLadoGestion(torneo, p._origenB, clasif);
        if (p.resultado && !p.resultado.bye) {
          var prevA = p._resueltoA, prevB = p._resueltoB;
          if ((prevA && prevA !== 'BYE' && A !== prevA) || (prevB && prevB !== 'BYE' && B !== prevB)) {
            return {
              ok: false,
              error: 'La modificación cambia quién juega ' + p.codigo + ' (' + p.ronda + ' de ' + cat +
                '), que ya tiene resultado cargado: borrá primero ese resultado.'
            };
          }
        }
        p._resueltoA = A; p._resueltoB = B;
        var reales = [];
        if (A && A !== 'BYE') reales.push(A);
        if (B && B !== 'BYE') reales.push(B);
        p._parejasReales = reales;
        if (p._esBye) {
          // avance automático: el lado real (si ya se conoce) pasa de ronda
          var ladoReal = (p._origenA === 'BYE') ? 'B' : 'A';
          var real = ladoReal === 'A' ? A : B;
          if (real && real !== 'BYE') {
            p._ganadorPareja = real;
            p.resultado = { sets: [], bye: true, ganador: ladoReal };
          } else {
            p._ganadorPareja = null;
            p.resultado = null;
          }
        } else if (p.resultado) {
          p._ganadorPareja = p.resultado.ganador === 'A' ? A : B;
        } else {
          p._ganadorPareja = null;
        }
      }
    }
    return { ok: true };
  }

  // --- Snapshot / restore: las mutaciones NO mutan si !ok -------------------

  var CAMPOS_MUTABLES = ['resultado', 'sede', 'cancha', 'dia', 'hora', '_diaIdx', '_start', '_end',
    '_resueltoA', '_resueltoB', '_ganadorPareja'];

  function snapshotTorneo(torneo) {
    var parts = {};
    Object.keys(torneo.partidos).forEach(function (id) {
      var p = torneo.partidos[id], s = {};
      CAMPOS_MUTABLES.forEach(function (f) { s[f] = p[f]; });
      s._parejasReales = (p._parejasReales || []).slice();
      parts[id] = s;
    });
    var zs = {};
    Object.keys(torneo.zonas).forEach(function (cat) {
      zs[cat] = torneo.zonas[cat].map(function (z) { return { _tabla: z._tabla, _completa: z._completa }; });
    });
    return { parts: parts, zs: zs };
  }

  function restaurarTorneo(torneo, snap) {
    Object.keys(snap.parts).forEach(function (id) {
      var p = torneo.partidos[id], s = snap.parts[id];
      CAMPOS_MUTABLES.forEach(function (f) { p[f] = s[f]; });
      p._parejasReales = s._parejasReales;
    });
    Object.keys(snap.zs).forEach(function (cat) {
      torneo.zonas[cat].forEach(function (z, i) {
        z._tabla = snap.zs[cat][i]._tabla;
        z._completa = snap.zs[cat][i]._completa;
      });
    });
  }

  /** Cierre común de mutación: re-resolver + validar; rollback si algo se rompió. */
  function finalizarMutacion(torneo, snap, advertencias, cat) {
    var res = resolverCategoria(torneo, cat);
    if (!res.ok) {
      restaurarTorneo(torneo, snap);
      return { ok: false, errores: [res.error], advertencias: [], torneo: torneo };
    }
    var v = validar(torneo);
    if (!v.ok) {
      restaurarTorneo(torneo, snap);
      return { ok: false, errores: v.errores, advertencias: [], torneo: torneo };
    }
    return { ok: true, errores: [], advertencias: advertencias || [], torneo: torneo };
  }

  function errorMutacion(torneo, msgs) {
    return { ok: false, errores: Array.isArray(msgs) ? msgs : [msgs], advertencias: [], torneo: torneo };
  }

  // --- Validación de resultados (sets legales de pádel) ----------------------

  /**
   * Sets legales: ganador del set con 6 y diferencia >=2 (6/0..6/4), 7/5 o 7/6.
   * Partido al mejor de 3: 2-0 en dos sets, o 2-1 en tres (3er set solo si 1-1).
   */
  function validarResultadoInput(res) {
    if (!res || typeof res !== 'object') {
      return { ok: false, errores: ['Resultado inválido: se esperaba {sets, wo?, ganador?}.'] };
    }
    if (res.wo) {
      if (res.ganador !== 'A' && res.ganador !== 'B') {
        return { ok: false, errores: ['W.O.: falta indicar el ganador ("A" o "B").'] };
      }
      return { ok: true, normalizado: { sets: Array.isArray(res.sets) ? res.sets.map(function (s) { return s.slice(); }) : [], wo: true, ganador: res.ganador } };
    }
    var errores = [];
    var sets = res.sets;
    if (!Array.isArray(sets) || sets.length < 2 || sets.length > 3) {
      errores.push('Un partido se define al mejor de 3 sets: se esperaban 2 o 3 sets y llegaron ' + (Array.isArray(sets) ? sets.length : 0) + '.');
      return { ok: false, errores: errores };
    }
    var winners = [];
    for (var i = 0; i < sets.length; i++) {
      var s = sets[i];
      if (!Array.isArray(s) || s.length !== 2 || typeof s[0] !== 'number' || typeof s[1] !== 'number') {
        errores.push('Set ' + (i + 1) + ' inválido: formato esperado [gamesA, gamesB].');
        continue;
      }
      var hi = Math.max(s[0], s[1]), lo = Math.min(s[0], s[1]);
      var legal = (hi === 6 && hi - lo >= 2) || (hi === 7 && (lo === 5 || lo === 6));
      if (!legal) {
        errores.push('Set ' + (i + 1) + ' ilegal: ' + s[0] + '/' + s[1] + ' (válidos: 6 con diferencia ≥2, 7/5 o 7/6).');
        continue;
      }
      winners.push(s[0] > s[1] ? 'A' : 'B');
    }
    if (errores.length) return { ok: false, errores: errores };
    if (sets.length === 2 && winners[0] !== winners[1]) {
      return { ok: false, errores: ['Falta el 3er set: los dos primeros están 1-1 (' + fmtSets(sets) + ').'] };
    }
    if (sets.length === 3 && winners[0] === winners[1]) {
      return { ok: false, errores: ['Sobra el 3er set: el partido ya estaba definido 2-0 (' + fmtSets(sets) + ').'] };
    }
    var wa = winners.filter(function (w) { return w === 'A'; }).length;
    var ganCalc = wa >= 2 ? 'A' : 'B';
    if (res.ganador && res.ganador !== ganCalc) {
      return { ok: false, errores: ['El ganador indicado (' + res.ganador + ') no coincide con los sets (' + fmtSets(sets) + ' lo gana ' + ganCalc + ').'] };
    }
    return { ok: true, normalizado: { sets: sets.map(function (s) { return s.slice(); }), ganador: ganCalc } };
  }

  function fmtSets(sets) {
    return sets.map(function (s) { return s[0] + '/' + s[1]; }).join(' ');
  }

  // --- Mutaciones -------------------------------------------------------------

  /** Carga (o corrige) un resultado. Zona: recalcula tabla. Llave: propaga ganador. */
  function cargarResultado(torneo, partidoId, resultado) {
    var p = torneo && torneo.partidos ? torneo.partidos[partidoId] : null;
    if (!p) return errorMutacion(torneo, 'No existe el partido ' + partidoId + ' en este torneo.');
    if (p._esBye) return errorMutacion(torneo, 'El partido ' + p.codigo + ' es un BYE: avanza automáticamente, no admite carga de resultado.');
    var val = validarResultadoInput(resultado);
    if (!val.ok) return errorMutacion(torneo, val.errores);

    var advertencias = [];
    if (p.fase === 'llave') {
      // asegurar resolución fresca antes de chequear (idempotente)
      resolverCategoria(torneo, p.categoria);
      var A = p._resueltoA, B = p._resueltoB;
      if (!A || !B || A === 'BYE' || B === 'BYE') {
        return errorMutacion(torneo, 'Todavía no están definidas las dos parejas de ' + p.codigo + ' (' + p.ronda + ' de ' + p.categoria + '): falta completar las zonas o los partidos anteriores de la llave.');
      }
      var next = p._next ? torneo.partidos[p._next] : null;
      if (next && next.resultado && !next.resultado.bye) {
        return errorMutacion(torneo, 'No se puede cargar/modificar ' + p.codigo + ': el partido siguiente ' + next.codigo + ' (' + next.ronda + ') ya tiene resultado. Borralo primero.');
      }
    }
    if (p.resultado && !p.resultado.bye) advertencias.push('Se reemplazó un resultado ya cargado en ' + p.codigo + '.');

    var snap = snapshotTorneo(torneo);
    p.resultado = val.normalizado;
    return finalizarMutacion(torneo, snap, advertencias, p.categoria);
  }

  /** Atajo: W.O. — pierde `perdedor`, gana el otro (V=2 / W.O.=0 en zona; propaga en llave). */
  function marcarWO(torneo, partidoId, perdedor) {
    if (perdedor !== 'A' && perdedor !== 'B') {
      return errorMutacion(torneo, 'marcarWO: indicá el perdedor como "A" o "B".');
    }
    return cargarResultado(torneo, partidoId, { sets: [], wo: true, ganador: perdedor === 'A' ? 'B' : 'A' });
  }

  /** Borra un resultado. En llave, solo si el partido siguiente no se jugó. */
  function borrarResultado(torneo, partidoId) {
    var p = torneo && torneo.partidos ? torneo.partidos[partidoId] : null;
    if (!p) return errorMutacion(torneo, 'No existe el partido ' + partidoId + ' en este torneo.');
    if (p._esBye) return errorMutacion(torneo, 'El partido ' + p.codigo + ' es un BYE: su avance es automático, no hay resultado que borrar.');
    if (!p.resultado) return errorMutacion(torneo, 'El partido ' + p.codigo + ' no tiene resultado cargado.');
    if (p.fase === 'llave') {
      var next = p._next ? torneo.partidos[p._next] : null;
      if (next && next.resultado && !next.resultado.bye) {
        return errorMutacion(torneo, 'No se puede borrar el resultado de ' + p.codigo + ': el partido siguiente ' + next.codigo + ' (' + next.ronda + ') ya se jugó. Borrá primero ese resultado.');
      }
    }
    var snap = snapshotTorneo(torneo);
    p.resultado = null;
    p._ganadorPareja = null;
    return finalizarMutacion(torneo, snap, [], p.categoria);
  }

  /** Reprograma un partido re-chequeando TODOS los invariantes afectados. */
  function reprogramarPartido(torneo, partidoId, destino) {
    var p = torneo && torneo.partidos ? torneo.partidos[partidoId] : null;
    if (!p) return errorMutacion(torneo, 'No existe el partido ' + partidoId + ' en este torneo.');
    if (p._esBye) return errorMutacion(torneo, 'El partido ' + p.codigo + ' es un BYE: no se juega, no se puede reprogramar.');
    if (!destino || typeof destino !== 'object') return errorMutacion(torneo, 'reprogramarPartido: falta destino {sede, cancha, dia, hora}.');

    var config = torneo.config;
    // sede: por id o por nombre
    var sede = null;
    for (var si = 0; si < config.sedes.length; si++) {
      var s = config.sedes[si];
      if (s.id === destino.sede || (s.nombre && s.nombre.toLowerCase() === String(destino.sede).toLowerCase())) { sede = s; break; }
    }
    if (!sede) return errorMutacion(torneo, 'La sede "' + destino.sede + '" no existe en el torneo (sedes: ' + config.sedes.map(function (x) { return x.id; }).join(', ') + ').');
    var cancha = parseInt(destino.cancha, 10);
    if (!(cancha >= 1 && cancha <= sede.canchas)) {
      return errorMutacion(torneo, 'La sede ' + (sede.nombre || sede.id) + ' tiene ' + sede.canchas + ' canchas: no existe la C' + destino.cancha + '.');
    }
    var diaIdx = -1;
    for (var di = 0; di < config.dias.length; di++) if (config.dias[di].fecha === destino.dia) { diaIdx = di; break; }
    if (diaIdx < 0) {
      return errorMutacion(torneo, 'El día "' + destino.dia + '" no es un día de juego del torneo (días: ' + config.dias.map(function (d) { return d.fecha; }).join(', ') + ').');
    }
    // fase correcta de días
    var meta = torneo._meta || {};
    var diasFase = p.fase === 'zona' ? (meta.zonaDias || []) : (meta.llaveDias || []);
    if (diasFase.indexOf(diaIdx) < 0) {
      var fechasFase = diasFase.map(function (d) { return config.dias[d].fecha; }).join(', ');
      return errorMutacion(torneo, 'El partido ' + p.codigo + ' es de fase de ' + (p.fase === 'zona' ? 'zonas' : 'llave') + ': debe jugarse en ' + fechasFase + ', no el ' + destino.dia + '.');
    }
    var start;
    try { start = parseHM(destino.hora); } catch (e) { return errorMutacion(torneo, e.message); }
    var end = start + config.slotMin;
    var diaObj = config.dias[diaIdx];
    if (start < parseHM(diaObj.desde) || end > parseHM(diaObj.hasta)) {
      return errorMutacion(torneo, 'El horario ' + destino.hora + ' no entra en la franja del ' + destino.dia + ' (' + diaObj.desde + '–' + diaObj.hasta + ', partidos de ' + config.slotMin + "').");
    }
    // cancha ocupada (solapamiento de intervalos)
    var ids = Object.keys(torneo.partidos);
    for (var qi = 0; qi < ids.length; qi++) {
      var q = torneo.partidos[ids[qi]];
      if (q === p || q._start == null) continue;
      if (q.sede === sede.id && q.cancha === cancha && q._diaIdx === diaIdx && start < q._end && q._start < end) {
        return errorMutacion(torneo, (sede.nombre || sede.id) + ' C' + cancha + ' ya tiene el partido ' + q.codigo + ' a las ' + q.hora + ' del ' + q.dia + '.');
      }
    }
    // solape / descanso de las parejas del partido
    var descanso = config.descansoMin;
    var reales = p._parejasReales || [];
    for (var ri2 = 0; ri2 < reales.length; ri2++) {
      var pid = reales[ri2];
      for (var qj = 0; qj < ids.length; qj++) {
        var q2 = torneo.partidos[ids[qj]];
        if (q2 === p || q2._start == null || q2._diaIdx !== diaIdx) continue;
        if ((q2._parejasReales || []).indexOf(pid) < 0) continue;
        if (start < q2._end && q2._start < end) {
          return errorMutacion(torneo, 'La pareja ' + pid + ' ya juega ' + q2.codigo + ' a las ' + q2.hora + ' del ' + q2.dia + ': el horario se solapa.');
        }
        var gap = start >= q2._end ? start - q2._end : q2._start - end;
        if (gap < descanso) {
          return errorMutacion(torneo, 'Descanso insuficiente para la pareja ' + pid + ': quedarían ' + gap + ' min entre ' + q2.codigo + ' (' + q2.hora + ') y ' + p.codigo + ' (' + destino.hora + '); mínimo ' + descanso + ' min.');
        }
      }
    }
    var advertencias = [];
    if (p.resultado && !p.resultado.bye) advertencias.push('El partido ' + p.codigo + ' ya estaba jugado: se corrige el dato histórico de programación.');

    var snap = snapshotTorneo(torneo);
    p.sede = sede.id;
    p.cancha = cancha;
    p.dia = diaObj.fecha;
    p.hora = fmtHM(start);
    p._diaIdx = diaIdx;
    p._start = start;
    p._end = end;
    // validar() re-chequea precedencia de llave y cohesión de zona (misma sede+día); rollback si rompe.
    return finalizarMutacion(torneo, snap, advertencias, p.categoria);
  }

  // --- Estado y consultas ------------------------------------------------------

  /** Resumen de estado para el backoffice. */
  function estadoTorneo(torneo) {
    var jugados = 0, pendientes = 0, anyRes = false, zonasPendientes = false;
    var playedArr = [], pendArr = [];
    Object.keys(torneo.partidos).forEach(function (id) {
      var p = torneo.partidos[id];
      if (p._esBye) return;
      if (p.resultado) { jugados++; playedArr.push(p); anyRes = true; }
      else {
        pendientes++;
        if (p._start != null) pendArr.push(p);
        if (p.fase === 'zona') zonasPendientes = true;
      }
    });
    function keyCrono(p) { return p._diaIdx != null ? p._diaIdx * 100000 + p._start : Infinity; }
    pendArr.sort(function (a, b) { return keyCrono(a) - keyCrono(b) || a.id - b.id; });
    playedArr.sort(function (a, b) { return keyCrono(b) - keyCrono(a) || b.id - a.id; });

    var campeones = {}, allFinals = true, anyFinal = false;
    Object.keys(torneo.llaves).forEach(function (cat) {
      var ll = torneo.llaves[cat];
      if (!ll.rondas.length) { campeones[cat] = null; return; }
      anyFinal = true;
      var fp = torneo.partidos[ll.rondas[ll.rondas.length - 1].partidos[0]];
      campeones[cat] = (fp && fp._ganadorPareja) ? fp._ganadorPareja : null;
      if (!campeones[cat]) allFinals = false;
    });
    var fase = !anyRes ? 'inscripcion'
      : (anyFinal && allFinals) ? 'finalizado'
        : !zonasPendientes ? 'llave'
          : 'zonas';
    return {
      fase: fase,
      partidosJugados: jugados,
      partidosPendientes: pendientes,
      proximosPartidos: pendArr.slice(0, 20).map(function (p) { return p.id; }),
      ultimosResultados: playedArr.slice(0, 20).map(function (p) { return p.id; }),
      campeonesPorCategoria: campeones
    };
  }

  // --- Torneo EN CURSO (demo con corte temporal coherente) ----------------------

  /**
   * crearTorneo + jugar hasta un punto de corte. `avance` (0..1) se mapea sobre el
   * CALENDARIO REAL del evento (del primer al último día, incluyendo la semana entre
   * findes): 0.5–0.6 cae entre los dos fines de semana -> zonas completas, llave
   * programada sin jugar; >0.75 ya juega parte de la llave; 1 = finalizado.
   * Coherencia temporal dura: se juega todo partido que TERMINA antes de "ahora".
   */
  function generarTorneoEnCurso(config, avance, semilla) {
    if (avance == null) avance = 0.6;
    if (typeof avance !== 'number' || !(avance >= 0 && avance <= 1)) {
      throw new Error('generarTorneoEnCurso: "avance" debe ser un número entre 0 y 1 (llegó ' + avance + ').');
    }
    var torneo = crearTorneo(config);
    if (semilla == null) semilla = torneo._meta.semilla;

    // línea de tiempo real del evento
    var dayMs = [];
    var minT = Infinity, maxT = -Infinity;
    config.dias.forEach(function (d, i) {
      var base = Date.parse(d.fecha + 'T00:00:00');
      dayMs[i] = base;
      minT = Math.min(minT, base + parseHM(d.desde) * 60000);
      maxT = Math.max(maxT, base + parseHM(d.hasta) * 60000);
    });
    var ahora = minT + avance * (maxT - minT);

    var parejasById = {};
    Object.keys(config.categorias).forEach(function (cat) {
      (config.categorias[cat] || []).forEach(function (pp) { parejasById[pp.id] = pp; });
    });
    function rankOf(pid) { return parejasById[pid] ? parejasById[pid].ranking : null; }

    // partidos programados en orden cronológico
    var lista = Object.keys(torneo.partidos).map(function (id) { return torneo.partidos[id]; })
      .filter(function (p) { return p._start != null && !p._esBye; })
      .sort(function (a, b) {
        var ta = dayMs[a._diaIdx] + a._start * 60000, tb = dayMs[b._diaIdx] + b._start * 60000;
        return ta - tb || a.id - b.id;
      });

    var rngs = {};
    lista.forEach(function (p) {
      var fin = dayMs[p._diaIdx] + p._end * 60000;
      if (fin > ahora) return; // todavía no se jugó
      var cat = p.categoria;
      if (!rngs[cat]) rngs[cat] = rngFrom(semilla, 'encurso-' + cat);
      var A, B;
      if (p.fase === 'zona') { A = p.parejaA; B = p.parejaB; }
      else {
        resolverCategoria(torneo, cat); // clasificados/alimentadores al día
        A = p._resueltoA; B = p._resueltoB;
        if (!A || !B || A === 'BYE' || B === 'BYE') return; // no jugable aún (no debería ocurrir en cronología)
      }
      p.resultado = jugarPartido(rngs[cat], rankOf(A), rankOf(B), true);
      if (p.fase === 'llave') p._ganadorPareja = p.resultado.ganador === 'A' ? A : B;
    });
    // normalización final (tablas, byes, _parejasReales)
    Object.keys(torneo.zonas).forEach(function (cat) { resolverCategoria(torneo, cat); });

    torneo._enCurso = { avance: avance, ahora: new Date(ahora).toISOString(), semilla: semilla };
    return torneo;
  }

  // --- Serialización (localStorage del front) -----------------------------------

  var SCHEMA = 'wpe-torneo@1';

  /** JSON estable para persistir (excluye msGeneracion, que es timing y no estado). */
  function serializar(torneo) {
    if (!torneo || !torneo.partidos || !torneo.config) {
      throw new Error('serializar: se esperaba un Torneo generado por crearTorneo/generarTorneoEnCurso.');
    }
    return JSON.stringify({ _schema: SCHEMA, torneo: torneo }, function (key, value) {
      return key === 'msGeneracion' ? undefined : value;
    });
  }

  /** Deserializa con validación de esquema; error claro si el string está corrupto. */
  function deserializar(str) {
    if (typeof str !== 'string' || !str.length) {
      throw new Error('deserializar: se esperaba un string JSON no vacío.');
    }
    var obj;
    try { obj = JSON.parse(str); }
    catch (e) { throw new Error('deserializar: JSON inválido o corrupto (' + e.message + ').'); }
    if (!obj || obj._schema !== SCHEMA) {
      throw new Error('deserializar: el contenido no es un torneo WPE serializado (falta _schema "' + SCHEMA + '").');
    }
    var t = obj.torneo;
    if (!t || typeof t !== 'object' || !t.config || !t.config.categorias || !t.partidos || !t.zonas || !t.llaves) {
      throw new Error('deserializar: torneo incompleto (faltan config/partidos/zonas/llaves).');
    }
    var ids = Object.keys(t.partidos);
    for (var i = 0; i < ids.length; i++) {
      var p = t.partidos[ids[i]];
      if (!p || p.id == null || !p.codigo || !p.categoria || !p.fase) {
        throw new Error('deserializar: el partido ' + ids[i] + ' está corrupto (faltan id/codigo/categoria/fase).');
      }
    }
    return t;
  }

  // --- CONFIG_DEMO: dataset publicado (QA y front usan EXACTAMENTE esto) ---------

  var CATS_DEMO = [
    'Caballeros 3ra', 'Caballeros 4ta', 'Caballeros 5ta', 'Caballeros 5ta +35', 'Caballeros 5ta +45',
    'Caballeros 6ta', 'Caballeros 6ta +35', 'Caballeros 6ta +45', 'Caballeros 7ma', 'Caballeros 8va',
    'Damas 3ra', 'Damas 4ta', 'Damas 5ta', 'Damas 6ta', 'Damas 6ta +30', 'Damas 7ma', 'Damas 8va'
  ];

  // 13 complejos reales del circuito (canchas de los 6 adicionales: provisional a confirmar).
  var SEDES_DEMO = [
    { id: 'granwilly', nombre: 'Gran Willy', canchas: 6, complejoSede: true },
    { id: 'breakpoint', nombre: 'Break Point', canchas: 5 },
    { id: 'elsolar', nombre: 'El Solar', canchas: 4 },
    { id: 'laesquina', nombre: 'La Esquina', canchas: 4 },
    { id: 'lafabrica', nombre: 'La Fábrica Padel', canchas: 5 },
    { id: 'kuro', nombre: 'KURO', canchas: 4 },
    { id: 'duomo', nombre: 'DUOMO', canchas: 5 },
    { id: 'memphis', nombre: 'Memphis Complejo Deportivo', canchas: 5 },
    { id: 'niceplace', nombre: 'Nice Place', canchas: 4 },
    { id: 'worldpadel', nombre: 'World Padel Center', canchas: 6 },
    { id: 'airepuro', nombre: 'Aire Puro', canchas: 4 },
    { id: 'urano', nombre: 'Urano Complejo Deportivo', canchas: 4 },
    { id: 'distrito', nombre: 'Distrito Padel', canchas: 5 }
  ];

  /** Config completa del escenario estrella publicado: 600 parejas / 13 complejos / semilla 2026. */
  function construirConfigDemo() {
    var parejas = generarParejas(600, CATS_DEMO, 2026);
    var categorias = {};
    CATS_DEMO.forEach(function (c) { categorias[c] = []; });
    parejas.forEach(function (p) { categorias[p.categoria].push(p); });
    return {
      categorias: categorias,
      sedes: SEDES_DEMO.map(function (s) {
        return { id: s.id, nombre: s.nombre, canchas: s.canchas, complejoSede: !!s.complejoSede };
      }),
      dias: [
        { fecha: '2026-08-01', desde: '08:00', hasta: '23:30' },
        { fecha: '2026-08-02', desde: '08:00', hasta: '23:30' },
        { fecha: '2026-08-08', desde: '08:00', hasta: '23:30' },
        { fecha: '2026-08-09', desde: '08:00', hasta: '23:30' }
      ],
      slotMin: 90,
      descansoMin: 90,
      clasificanPorZona: 2,
      zonaDias: [0, 1],
      llaveDias: [2, 3],
      modo: 'patron',
      semilla: 2026
    };
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  var api = {
    version: VERSION,
    generarParejas: generarParejas,
    crearTorneo: crearTorneo,
    simularResultados: simularResultados,
    validar: validar,
    // gestión en curso (CONTRATO-GESTION.md)
    generarTorneoEnCurso: generarTorneoEnCurso,
    cargarResultado: cargarResultado,
    borrarResultado: borrarResultado,
    reprogramarPartido: reprogramarPartido,
    marcarWO: marcarWO,
    estadoTorneo: estadoTorneo,
    serializar: serializar,
    deserializar: deserializar,
    // utilidades expuestas para tests / UI
    _util: {
      repartoZonas: repartoZonas,
      roundRobin: roundRobin,
      seedPositions: seedPositions,
      nombreRondaLlave: nombreRondaLlave,
      abreviarCategoria: abreviarCategoria,
      mulberry32: mulberry32,
      slotsDeDia: slotsDeDia,
      nextPow2: nextPow2,
      validarResultadoInput: validarResultadoInput,
      resolverCategoria: resolverCategoria
    }
  };
  // CONFIG_DEMO: getter que devuelve una config FRESCA en cada acceso (nadie puede
  // corromper el dataset publicado mutando una referencia compartida).
  Object.defineProperty(api, 'CONFIG_DEMO', { enumerable: true, get: construirConfigDemo });
  return api;
});
