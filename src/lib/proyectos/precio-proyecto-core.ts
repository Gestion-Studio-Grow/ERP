/**
 * MIA T07 (GSG-MIA-149) · el precio «por total» de un proyecto: el tablero con las comisiones de las funciones del negocio,
 * los porcentajes del proyecto contra el rango del negocio (O15), el reparto por persona y concepto (O50) y lo que se
 * congela en la foto de la aprobación del cliente (O18). PURO: no lee la base ni el reloj.
 *
 * La aritmética es la del motor de T04 (`precio-core.ts`), sin copiarla: las comisiones salen de `multiplicarPorPuntos`
 * sobre la rentabilidad del motor, y el IIB y GA, el redondeo y el tope, de una segunda pasada del motor sobre el subtotal
 * (con todos los demás porcentajes en 0, el subtotal del motor es su costo, y el resto de los renglones sale igual).
 * Con tres funciones mapeadas a productor 1, productor 2 y comercial da lo mismo que `calcularPrecio` (test).
 */
import { aPuntosBasicos, calcularPrecio, multiplicarPorPuntos, type Centavos, type TopeRedondeo } from "./precio-core";
import { EMPRESA, type ConId, type ConRango } from "./parametros/catalogo";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";

/** Los porcentajes que el proyecto puede cambiar, en puntos (30 = 30 %). La comisión, por id de función. */
export interface PorcentajesProyecto {
  rentabilidad: number;
  margenError: number;
  iibGa: number;
  comision: Record<string, number>;
}

/** El rango del negocio de cada porcentaje (O15). */
export interface RangosProyecto {
  rentabilidad: ConRango;
  margenError: ConRango;
  iibGa: ConRango;
  comision: Record<string, ConRango>;
}

/** Lo del catálogo que lee el precio. Se pasa así para que el núcleo no dependa de cómo se leyó (R8). */
export interface ParametrosPrecio {
  "precio.modo": string;
  "precio.rentabilidad": ConRango;
  "precio.comision": Record<string, ConRango>;
  "precio.margenError": ConRango;
  "precio.iibbGa": ConRango;
  "precio.redondeo.tope": number;
  "precio.redondeo.medida": string;
  "precio.redondeo.accion": string;
  "reparto.conceptos": ConId[];
  "reparto.matriz": Record<string, Record<string, number>>;
  "equipo.funciones": ConId[];
}

export const POR_TOTAL = "POR_TOTAL";
/** El redondeo no se reparte: queda 100 % en la empresa (Dis. § 2.6). Ni el catálogo ni el equipo lo pueden asignar. */
export const REDONDEO = "REDONDEO";
export const ACCION_DIRECCION = "AVISA_APRUEBA_DIRECCION";
export const ACCION_FRENA = "FRENA";

export function rangosDelNegocio(v: ParametrosPrecio): RangosProyecto {
  return { rentabilidad: v["precio.rentabilidad"], margenError: v["precio.margenError"], iibGa: v["precio.iibbGa"], comision: v["precio.comision"] };
}

/** Los porcentajes del negocio: el valor de cada rango. Rigen mientras el proyecto no tenga los suyos. */
export function porcentajesDelNegocio(v: ParametrosPrecio): PorcentajesProyecto {
  const r = rangosDelNegocio(v);
  return { rentabilidad: r.rentabilidad.valor, margenError: r.margenError.valor, iibGa: r.iibGa.valor, comision: Object.fromEntries(Object.entries(r.comision).map(([k, c]) => [k, c.valor])) };
}

export function topeDelNegocio(v: ParametrosPrecio): TopeRedondeo {
  return { pct: v["precio.redondeo.tope"], medidoSobre: v["precio.redondeo.medida"] === "NETO" ? "neto" : "bruto" };
}

/** Lo guardado en el proyecto, completado con lo del negocio: una función nueva del negocio entra con su valor. */
export function porcentajesVigentes(guardados: unknown, negocio: PorcentajesProyecto): PorcentajesProyecto {
  const g = leerPorcentajes(guardados);
  if (!g) return negocio;
  const comision: Record<string, number> = {};
  for (const id of Object.keys(negocio.comision)) comision[id] = g.comision[id] ?? negocio.comision[id];
  return { rentabilidad: g.rentabilidad, margenError: g.margenError, iibGa: g.iibGa, comision };
}

/** Un JSON de la base, validado: null si no tiene la forma (no se confía en lo guardado). */
export function leerPorcentajes(v: unknown): PorcentajesProyecto | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
  if (!ok(o.rentabilidad) || !ok(o.margenError) || !ok(o.iibGa) || !o.comision || typeof o.comision !== "object") return null;
  const comision: Record<string, number> = {};
  for (const [k, n] of Object.entries(o.comision as Record<string, unknown>)) if (ok(n)) comision[k] = n;
  return { rentabilidad: o.rentabilidad, margenError: o.margenError, iibGa: o.iibGa, comision };
}

export interface FueraDeRango {
  clave: string;
  nombre: string;
  valor: number;
  min: number;
  max: number;
}

/** Los porcentajes que quedan fuera del rango del negocio. Vacío: se aplican. Con algo: esperan a Dirección (O15). */
export function fueraDeRango(p: PorcentajesProyecto, r: RangosProyecto, funciones: readonly ConId[]): FueraDeRango[] {
  const salida: FueraDeRango[] = [];
  const mirar = (clave: string, nombre: string, valor: number, rango: ConRango | undefined) => {
    if (rango && (valor < rango.min || valor > rango.max)) salida.push({ clave, nombre, valor, min: rango.min, max: rango.max });
  };
  mirar("rentabilidad", "Rentabilidad", p.rentabilidad, r.rentabilidad);
  mirar("margenError", "Margen de error", p.margenError, r.margenError);
  mirar("iibGa", "IIB y GA", p.iibGa, r.iibGa);
  for (const f of funciones) mirar(`comision.${f.id}`, `Comisión ${f.nombre}`, p.comision[f.id] ?? 0, r.comision[f.id]);
  return salida;
}

/** Cada porcentaje entre 0 y 100 con hasta dos decimales, y el IIB y GA menor que 100. Devuelve el error o null. */
export function errorDePorcentajes(p: PorcentajesProyecto): string | null {
  try {
    for (const n of [p.rentabilidad, p.margenError, p.iibGa, ...Object.values(p.comision)]) aPuntosBasicos(n);
  } catch (e) {
    return e instanceof RangeError ? e.message : "Un porcentaje no se entiende.";
  }
  return p.iibGa >= 100 ? "IIB y GA tiene que ser menor que 100 %." : null;
}

export interface Tablero {
  costoOriginal: Centavos;
  adicionales: Centavos;
  rentabilidad: Centavos;
  /** Por id de función, en el orden de las funciones del negocio. */
  comisiones: Record<string, Centavos>;
  margenError: Centavos;
  subtotal: Centavos;
  iibGa: Centavos;
  totalVenta: Centavos | null;
  redondeoBruto: Centavos | null;
  redondeoNeto: Centavos | null;
  redondeoPuntos: number | null;
  totalMenorAlSubtotal: boolean;
  /** Como en el motor: true = el redondeo SE PASA del tope del negocio. */
  pasaTope: boolean;
}

const SIN_PORCENTAJES = { productor1: 0, productor2: 0, comercial: 0, rentabilidad: 0, margenError: 0, iibGa: 0 };

/** El tablero «por total» (Dis. § 1.4) con una comisión por función del negocio. Plata en centavos enteros. */
export function calcularTablero(e: { costoOriginal: Centavos; adicionales: Centavos; porcentajes: PorcentajesProyecto; funciones: readonly ConId[]; totalVenta: Centavos | null; tope: TopeRedondeo }): Tablero {
  const p = e.porcentajes;
  // Rentabilidad y margen de error (el margen no depende de las comisiones: (CO + R) × %).
  const base = calcularPrecio({ costoOriginal: e.costoOriginal, adicionales: e.adicionales, porcentajes: { ...SIN_PORCENTAJES, rentabilidad: p.rentabilidad, margenError: p.margenError }, totalVenta: null, tope: e.tope });
  const comisiones: Record<string, Centavos> = {};
  let sumaComisiones = 0;
  for (const f of e.funciones) {
    comisiones[f.id] = multiplicarPorPuntos(base.rentabilidad, aPuntosBasicos(p.comision[f.id] ?? 0));
    sumaComisiones += comisiones[f.id];
  }
  const subtotal = base.subtotal + sumaComisiones;
  // Segunda pasada: con sólo el IIB y GA, el subtotal del motor es `subtotal` y salen IIB y GA, redondeos y tope.
  const cierre = calcularPrecio({ costoOriginal: subtotal, adicionales: 0, porcentajes: { ...SIN_PORCENTAJES, iibGa: p.iibGa }, totalVenta: e.totalVenta, tope: e.tope });
  return {
    costoOriginal: e.costoOriginal,
    adicionales: e.adicionales,
    rentabilidad: base.rentabilidad,
    comisiones,
    margenError: base.margenError,
    subtotal,
    iibGa: cierre.iibGa,
    totalVenta: cierre.totalVenta,
    redondeoBruto: cierre.redondeoBruto,
    redondeoNeto: cierre.redondeoNeto,
    redondeoPuntos: cierre.redondeoPuntos,
    totalMenorAlSubtotal: cierre.totalMenorAlSubtotal,
    pasaTope: cierre.pasaTope,
  };
}

/** Qué hace el tablero con un total: rechazarlo, guardarlo esperando a Dirección o guardarlo. (O14, decisión 5 A.) */
export function decisionDelTotal(t: Tablero, accion: string): { rechazo: string } | { esperaDireccion: boolean } {
  if (t.totalVenta === null) return { esperaDireccion: false };
  if (t.totalMenorAlSubtotal) return { rechazo: "El total de venta no puede ser menor que el subtotal del tablero." };
  if (!t.pasaTope) return { esperaDireccion: false };
  if (accion === ACCION_FRENA) return { rechazo: "El redondeo pasa el tope del negocio: bajá el total." };
  return { esperaDireccion: accion === ACCION_DIRECCION };
}

// ── Reparto por persona y concepto (O50) ────────────────────────────────────

export interface MiembroEquipo {
  id: string;
  personaId: string;
  nombre: string;
  funcion: string;
}

/** Por concepto, el porcentaje de cada persona (por id de ProyectoEquipo). La empresa es el resto. */
export type RepartoProyecto = Record<string, Record<string, number>>;

/** El reparto inicial: el % de cada función de la matriz del negocio va a la primera persona con esa función. */
export function repartoInicial(matriz: ParametrosPrecio["reparto.matriz"], conceptos: readonly ConId[], equipo: readonly MiembroEquipo[]): RepartoProyecto {
  const salida: RepartoProyecto = {};
  for (const c of conceptos) {
    salida[c.id] = {};
    for (const [funcion, pct] of Object.entries(matriz[c.id] ?? {})) {
      if (funcion === EMPRESA || !(pct > 0)) continue;
      const quien = equipo.find((m) => m.funcion === funcion);
      if (quien) salida[c.id][quien.id] = (salida[c.id][quien.id] ?? 0) + pct;
    }
  }
  return salida;
}

/**
 * Valida un reparto escrito: conceptos del negocio (nunca el redondeo), personas del equipo, porcentajes de 0 a 100 con
 * hasta dos decimales, y la suma: las personas no pasan 100 y, si viene el de la empresa, todo suma exactamente 100.
 * Devuelve las filas en puntos básicos (sin las de 0) o el error.
 */
export function validarReparto(
  entrada: Record<string, Record<string, number>>,
  conceptos: readonly ConId[],
  equipo: readonly MiembroEquipo[],
): { ok: true; filas: { equipoId: string; concepto: string; puntos: number }[] } | { ok: false; error: string } {
  const filas: { equipoId: string; concepto: string; puntos: number }[] = [];
  const ids = new Set(equipo.map((m) => m.id));
  for (const [concepto, porQuien] of Object.entries(entrada)) {
    const def = conceptos.find((c) => c.id === concepto);
    if (concepto.toUpperCase() === REDONDEO) {
      if (Object.entries(porQuien).some(([quien, pct]) => quien !== EMPRESA && pct > 0)) return { ok: false, error: "El redondeo no se reparte: queda 100 % en la empresa." };
      continue;
    }
    if (!def) return { ok: false, error: `«${concepto}» no es un concepto que se reparta en este negocio.` };
    let suma = 0;
    let empresa: number | null = null;
    for (const [quien, pct] of Object.entries(porQuien)) {
      let pb: number;
      try {
        pb = aPuntosBasicos(pct);
      } catch {
        return { ok: false, error: `${def.nombre}: cada porcentaje va de 0 a 100, con hasta 2 decimales.` };
      }
      if (quien === EMPRESA) {
        empresa = pb;
        continue;
      }
      if (!ids.has(quien)) return { ok: false, error: `${def.nombre}: esa persona no está en el equipo del proyecto.` };
      suma += pb;
      if (pb > 0) filas.push({ equipoId: quien, concepto, puntos: pb });
    }
    if (suma > 10_000) return { ok: false, error: `${def.nombre}: las personas suman más de 100 %.` };
    if (empresa !== null && suma + empresa !== 10_000) return { ok: false, error: `${def.nombre}: los porcentajes suman ${((suma + empresa) / 100).toLocaleString("es-AR")} % y tienen que sumar 100.` };
  }
  return { ok: true, filas };
}

/** Las funciones que cobran algo (comisión o un % de la matriz) y no tienen a nadie en el equipo: así no se envía. */
export function funcionesSinPersona(porcentajes: PorcentajesProyecto, matriz: ParametrosPrecio["reparto.matriz"], funciones: readonly ConId[], equipo: readonly MiembroEquipo[]): ConId[] {
  return funciones.filter((f) => {
    const cobra = (porcentajes.comision[f.id] ?? 0) > 0 || Object.values(matriz).some((fila) => (fila[f.id] ?? 0) > 0);
    return cobra && !equipo.some((m) => m.funcion === f.id);
  });
}

// ── La foto de la aprobación del cliente (O18) ──────────────────────────────

export interface ParticipanteFoto {
  equipoId: string | null;
  personaId: string | null;
  nombre: string;
  funcion: string | null;
  /** % de la rentabilidad, el de su función (sólo la primera persona de cada función cobra la comisión). */
  comisionPct: number;
  /** Por concepto, su porcentaje. La empresa lleva el resto y el 100 % del redondeo. */
  reparto: Record<string, number>;
}

/** Los participantes que se congelan: cada persona con su función, su comisión y su reparto; la empresa con el resto. */
export function participantesDeLaFoto(equipo: readonly MiembroEquipo[], reparto: RepartoProyecto, conceptos: readonly ConId[], porcentajes: PorcentajesProyecto, nombreEmpresa: string): ParticipanteFoto[] {
  const conComision = new Set<string>();
  const personas: ParticipanteFoto[] = equipo.map((m) => {
    const cobra = !!m.funcion && !conComision.has(m.funcion) && (porcentajes.comision[m.funcion] ?? 0) > 0;
    if (cobra) conComision.add(m.funcion);
    return {
      equipoId: m.id,
      personaId: m.personaId,
      nombre: m.nombre,
      funcion: m.funcion || null,
      comisionPct: cobra ? porcentajes.comision[m.funcion] : 0,
      reparto: Object.fromEntries(conceptos.map((c) => [c.id, reparto[c.id]?.[m.id] ?? 0])),
    };
  });
  const empresa: ParticipanteFoto = {
    equipoId: null,
    personaId: null,
    nombre: nombreEmpresa,
    funcion: EMPRESA,
    comisionPct: 0,
    reparto: {
      ...Object.fromEntries(conceptos.map((c) => [c.id, (10_000 - personas.reduce((s, p) => s + aPuntosBasicos(p.reparto[c.id] ?? 0), 0)) / 100])),
      [REDONDEO]: 100,
    },
  };
  return [...personas, empresa];
}

// ── La propuesta pública con precio por total (O17) ──

export const SIN_PRECIO_POR_ITEM = "TOTAL_SIN_PRECIO_POR_ITEM";
export const CON_IVA = "CON_IVA";

/** Cómo sale la propuesta de un negocio que cotiza por total. `neto` null = todavía no hay total escrito: va la suma de los ítems. */
export interface ModoPropuesta {
  neto: number | null;
  sinPrecioPorItem: boolean;
  conIva: boolean;
}

export function modoPropuesta(valores: Pick<ParametrosPrecio, "precio.modo"> & { "precio.propuesta.detalle": string; "precio.propuesta.iva": string }, neto: number | null): ModoPropuesta | null {
  if (valores["precio.modo"] !== POR_TOTAL) return null;
  return { neto, sinPrecioPorItem: valores["precio.propuesta.detalle"] === SIN_PRECIO_POR_ITEM, conIva: valores["precio.propuesta.iva"] === CON_IVA };
}

/** Lo que el cliente ve de cada ítem: nunca costo, margen ni proveedor; el precio, sólo si el modo lo deja. */
export function itemsParaElCliente<I extends { id: string; rubro: string; descripcion: string; unidad: string; cantidad: number; precio: number; visibleCliente: boolean }>(
  items: readonly I[],
  modo: ModoPropuesta | null,
): { id: string; rubro: string; descripcion: string; unidad: string; cantidad: number; precio: number | null }[] {
  const visibles = items.filter((i) => i.visibleCliente).map(({ id, rubro, descripcion, unidad, cantidad, precio }) => ({ id, rubro, descripcion, unidad, cantidad, precio: modo?.sinPrecioPorItem ? null : precio }));
  // Sin precio por ítem, un ítem oculto simplemente no se nombra: no hay plata que sumar en pantalla.
  if (modo?.sinPrecioPorItem) return visibles;
  // Un ítem oculto no se detalla, pero se cobra: suma a «Otros conceptos» de su rubro, y el total sigue cerrando.
  const otros = new Map<string, number>();
  for (const i of items) if (!i.visibleCliente) otros.set(i.rubro, redondearAlCentavo((otros.get(i.rubro) ?? 0) + i.cantidad * i.precio));
  return [...visibles, ...[...otros].map(([rubro, precio]) => ({ id: `otros:${rubro}`, rubro, descripcion: "Otros conceptos", unidad: "global", cantidad: 1, precio }))];
}

/** El total por total con su IVA, con la misma regla que `totales` de la ficha (al centavo). */
export function totalesDelNeto(neto: number, ivaPct: number): { neto: number; iva: number; total: number } {
  const n = redondearAlCentavo(neto);
  const iva = redondearAlCentavo((n * ivaPct) / 100);
  return { neto: n, iva, total: redondearAlCentavo(n + iva) };
}
