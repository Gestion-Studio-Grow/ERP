// Fixtures y helpers compartidos por la suite de pruebas del motor WPE.
import T from '../torneo-engine.js';

export const ENGINE = T;

// 17 categorías reales de ETAPA 4 MAJOR 2026 (DATOS-REALES.md)
export const CATS = [
  'Caballeros 3ra', 'Caballeros 4ta', 'Caballeros 5ta', 'Caballeros 5ta +35', 'Caballeros 5ta +45',
  'Caballeros 6ta', 'Caballeros 6ta +35', 'Caballeros 6ta +45', 'Caballeros 7ma', 'Caballeros 8va',
  'Damas 3ra', 'Damas 4ta', 'Damas 5ta', 'Damas 6ta', 'Damas 6ta +30', 'Damas 7ma', 'Damas 8va'
];

// 7 sedes titulares del evento (CONTRATO / BRIEF)
export const SEDES7 = [
  { id: 'granwilly', nombre: 'Gran Willy', canchas: 6, complejoSede: true },
  { id: 'breakpoint', nombre: 'Break Point', canchas: 5 },
  { id: 'elsolar', nombre: 'El Solar', canchas: 4 },
  { id: 'laesquina', nombre: 'La Esquina', canchas: 4 },
  { id: 'lafabrica', nombre: 'La Fábrica Padel', canchas: 5 },
  { id: 'kuro', nombre: 'KURO', canchas: 4 },
  { id: 'duomo', nombre: 'DUOMO', canchas: 5 }
];

// 13 complejos reales del circuito (DATOS-REALES.md) — usados para el mega-evento de 600 parejas,
// que excede la capacidad de las 7 sedes titulares (ver INFORME-PRUEBAS.md).
export const SEDES13 = SEDES7.concat([
  { id: 'memphis', nombre: 'Memphis Complejo Deportivo', canchas: 5 },
  { id: 'niceplace', nombre: 'Nice Place', canchas: 4 },
  { id: 'worldpadel', nombre: 'World Padel Center', canchas: 6 },
  { id: 'airepuro', nombre: 'Aire Puro', canchas: 4 },
  { id: 'urano', nombre: 'Urano Complejo Deportivo', canchas: 4 },
  { id: 'distrito', nombre: 'Distrito Padel', canchas: 5 }
]);

// Días reales de juego: 2 fines de semana (zonas finde 1, llave finde 2)
export const DIAS = [
  { fecha: '2026-08-01', desde: '08:00', hasta: '23:30' },
  { fecha: '2026-08-02', desde: '08:00', hasta: '23:30' },
  { fecha: '2026-08-08', desde: '08:00', hasta: '23:30' },
  { fecha: '2026-08-09', desde: '08:00', hasta: '23:30' }
];

/** Agrupa un array plano de parejas en {cat: Pareja[]}. */
export function agrupar(parejas) {
  const categorias = {};
  CATS.forEach(c => (categorias[c] = []));
  parejas.forEach(p => { (categorias[p.categoria] = categorias[p.categoria] || []).push(p); });
  return categorias;
}

/** Config base del evento con N parejas realistas. */
export function configEvento(N, opts = {}) {
  const parejas = T.generarParejas(N, CATS, opts.semillaGen == null ? 42 : opts.semillaGen);
  return {
    categorias: agrupar(parejas),
    sedes: opts.sedes || SEDES7,
    dias: opts.dias || DIAS,
    slotMin: opts.slotMin || 90,
    descansoMin: opts.descansoMin == null ? 90 : opts.descansoMin,
    clasificanPorZona: opts.clasificanPorZona || 2,
    zonaDias: opts.zonaDias || [0, 1],
    llaveDias: opts.llaveDias || [2, 3],
    modo: opts.modo || 'patron',
    semilla: opts.semilla == null ? 42 : opts.semilla,
    manual: opts.manual
  };
}

/** Config de una sola categoría con parejas dadas (para casos borde). */
export function configUnaCategoria(cat, parejas, opts = {}) {
  const categorias = {}; categorias[cat] = parejas;
  return {
    categorias,
    sedes: opts.sedes || SEDES7,
    dias: opts.dias || DIAS,
    slotMin: opts.slotMin || 90,
    descansoMin: opts.descansoMin == null ? 90 : opts.descansoMin,
    clasificanPorZona: opts.clasificanPorZona || 2,
    zonaDias: opts.zonaDias || [0, 1],
    llaveDias: opts.llaveDias || [2, 3],
    modo: opts.modo || 'patron',
    semilla: opts.semilla == null ? 42 : opts.semilla,
    manual: opts.manual
  };
}

/** Crea N parejas ficticias de una categoría con rankings 1..N. */
export function parejasCat(cat, n, offset = 0) {
  const arr = [];
  for (let i = 1; i <= n; i++) {
    arr.push({
      id: cat.replace(/\s+/g, '') + '-' + (i + offset),
      categoria: cat,
      j1: { nombre: 'J' + (i + offset) + 'a', apellido: 'Ap' + (i + offset) + 'a' },
      j2: { nombre: 'J' + (i + offset) + 'b', apellido: 'Ap' + (i + offset) + 'b' },
      ranking: i + offset
    });
  }
  return arr;
}
