// ============================================================================
// SUBIR PRECIOS DE SERVICIOS — el aumento en bloque de la dueña (reingeniería CH, Tanda 3 · 3-D).
// ============================================================================
//
// POR QUÉ EXISTE. Con la inflación, la dueña de un centro de estética sube los precios cada uno o
// dos meses. Hasta acá era servicio por servicio desde el catálogo (12 depilaciones = 12 fichas
// abiertas, 12 cuentas a mano). Acá son cuatro pasos: qué servicios, cuánto, cómo se redondea y la
// vista previa con el antes y el después de cada uno (CH-039).
//
// ADAPTADOR DE `aumento-core.ts`. La cuenta es la MISMA que la de los productos (`leerPorcentaje`,
// `precioConPorcentaje`, `pideConfirmacionExtra`): centavos enteros y redondeo siempre para arriba en
// un aumento. Cambia lo que se elige y lo que se toca:
//   · se elige por CATEGORÍA del catálogo (Depilación, Faciales…), todos, o uno por uno;
//   · se toca `Service.price` y, si la dueña lo pide, también la seña (`depositAmount`, D4: monto
//     fijo) y el precio vecina (`residentPrice`, ADR-013). Lo que no tiene seña o precio vecina
//     sigue sin tenerlo;
//   · el redondeo de un servicio va a $100, $500 o $1.000 (los productos van a $1…$100).
//   · sólo SUBE: una baja de servicios no es una tarea de todos los meses y no se ofrece.
//
// LO QUE NO TOCA. Un turno guarda el precio con el que se dio (`Appointment.priceAtBooking`): subir
// el catálogo no le cambia el precio ni el saldo a ningún turno ya dado (CH-051). Este archivo no
// conoce los turnos; la acción sólo escribe `Service`.
//
// LA HUELLA. La vista previa y el «Aplicar» corren esta misma función: en la pantalla con lo que
// trajo la página, y en el servidor con el catálogo releído ADENTRO de la transacción que escribe.
// La huella resume los precios de HOY de cada servicio elegido (precio, seña y vecina) y lo que se
// pidió: si alguien cambió un precio entre la vista previa y el «Aplicar», la huella no coincide y no
// se escribe nada («El catálogo cambió, volvé a mirar»).
//
// INVARIANTES DEL CATÁLOGO que el aumento respeta (catalog-actions.ts `parseResidentPrice` /
// `parseDepositAmount`): el precio vecina y la seña son MENORES que el precio. Si con el redondeo
// alguno quedaría igual o más caro que el precio general, el plan se niega y dice cuál.
//
// PURO: sin base, sin React, sin Prisma de valor. Lo usan la pantalla, la acción y los tests.

import type { Prisma } from "@/generated/prisma/client";
import { centavosDe } from "@/lib/dinero/redondeo";
import {
  DESVIO_POR_REDONDEO,
  UMBRAL_CONFIRMACION,
  leerPorcentaje,
  pideConfirmacionExtra,
  precioConPorcentaje,
  type PasoRedondeo,
} from "./aumento-core";
import { normalizarNombre } from "./planilla-core";

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Un servicio del catálogo con lo que hace falta para elegirlo y subirle el precio. */
export type ServicioParaAumento = {
  id: string;
  name: string;
  active: boolean;
  categoryId: string | null;
  /** Nombre de la categoría (para la pantalla); null = sin categoría. */
  categoria: string | null;
  price: number;
  residentPrice: number | null;
  depositAmount: number | null;
};

/** El `categoryId` con el que se eligen los servicios que no tienen categoría. */
export const SIN_CATEGORIA = "sin-categoria";

/** Qué servicios toca el aumento. */
export type AlcanceServicios =
  | { tipo: "todos" }
  | { tipo: "categoria"; categoryId: string }
  | { tipo: "tildados"; ids: readonly string[] };

/** Pasos de redondeo de un servicio, en pesos. */
export const PASOS_REDONDEO_SERVICIOS = [100, 500, 1000] as const;
export type PasoServicios = (typeof PASOS_REDONDEO_SERVICIOS)[number];
/** $500: lo que pidió la dueña en el relevamiento (CH-039). */
export const REDONDEO_POR_DEFECTO: PasoServicios = 500;

/** Más servicios que esto en un solo aumento es casi seguro un error (CH tiene ~40). */
export const MAX_SERVICIOS = 300;

export { UMBRAL_CONFIRMACION };

/** Lo que pide la dueña. `porcentaje` llega como lo tipeó ("8", "8,5"). */
export type PedidoAumentoServicios = {
  alcance: AlcanceServicios;
  porcentaje: string;
  redondeo: PasoServicios;
  /** ¿Sube también la seña de los que la tienen? */
  senia: boolean;
  /** ¿Sube también el precio vecina de los que lo tienen? */
  vecina: boolean;
};

export type CambioDeImporte = { antes: number; despues: number };

export type FilaAumentoServicio = {
  serviceId: string;
  nombre: string;
  categoria: string | null;
  pausado: boolean;
  precio: CambioDeImporte;
  /** null = no tiene precio vecina, o no se pidió subirlo. */
  vecina: CambioDeImporte | null;
  /** null = no tiene seña, o no se pidió subirla. */
  senia: CambioDeImporte | null;
  /** Cambio real del precio, en porcentaje con un decimal (el redondeo lo mueve). */
  efectivo: number;
  /** El redondeo lo aleja del porcentaje pedido más de `DESVIO_POR_REDONDEO` puntos. */
  porRedondeo: boolean;
};

export type PlanAumentoServicios = {
  /** Qué impide aplicar (porcentaje ilegible, nada elegido, una seña que quedaría igual al precio). */
  error: string | null;
  porcentaje: number | null;
  redondeo: PasoServicios;
  senia: boolean;
  vecina: boolean;
  /** Cuántos servicios eligió el alcance (con y sin precio). */
  elegidos: number;
  /** Los que cambian, en el orden del catálogo. */
  filas: FilaAumentoServicio[];
  /** Elegidos con precio $0: no hay nada que aumentar. No se tocan. */
  sinPrecio: { id: string; nombre: string }[];
  /** Pasa el 30 %: la pantalla pide confirmar dos veces y el servidor lo exige. */
  pideConfirmacion: boolean;
  /** Los precios de hoy de los elegidos + lo pedido. Ver «LA HUELLA» arriba. */
  huella: string;
};

// ── Elegir ───────────────────────────────────────────────────────────────────

/** Los servicios que elige el alcance, en el orden del catálogo. Los pausados entran. PURA. */
export function elegirServicios(servicios: readonly ServicioParaAumento[], alcance: AlcanceServicios): ServicioParaAumento[] {
  switch (alcance.tipo) {
    case "todos":
      return [...servicios];
    case "categoria":
      return servicios.filter((s) =>
        alcance.categoryId === SIN_CATEGORIA ? s.categoryId === null : s.categoryId === alcance.categoryId,
      );
    case "tildados": {
      const ids = new Set(alcance.ids);
      return servicios.filter((s) => ids.has(s.id));
    }
  }
}

/** Las categorías que tienen servicios, con cuántos, en el orden en que aparecen. PURA. */
export function categoriasConServicios(servicios: readonly ServicioParaAumento[]): { id: string; nombre: string; n: number }[] {
  const porId = new Map<string, { id: string; nombre: string; n: number }>();
  for (const s of servicios) {
    const id = s.categoryId ?? SIN_CATEGORIA;
    const actual = porId.get(id);
    if (actual) actual.n++;
    else porId.set(id, { id, nombre: s.categoryId ? (s.categoria?.trim() || "Sin nombre") : "Sin categoría", n: 1 });
  }
  return [...porId.values()];
}

/** Busca por nombre de servicio o de categoría, sin mayúsculas ni acentos. PURA. */
export function buscarServicios<T extends { name: string; categoria?: string | null }>(servicios: readonly T[], q: string): T[] {
  const buscado = normalizarNombre(q);
  if (!buscado) return [...servicios];
  return servicios.filter((s) => normalizarNombre(`${s.name} ${s.categoria ?? ""}`).includes(buscado));
}

// ── La cuenta ────────────────────────────────────────────────────────────────

/**
 * El importe con el porcentaje aplicado y redondeado para ARRIBA al paso, en pesos. Es la cuenta de
 * `precioConPorcentaje` (centavos enteros): sólo cambia el paso, que para un servicio es $100, $500
 * o $1.000. PURA.
 */
export function subirImporte(importe: number, porcentaje: number, paso: PasoServicios): number {
  // `precioConPorcentaje` está tipada con los pasos de los productos, pero la cuenta vale para
  // cualquier paso entero de pesos (pasoCentavos = paso × 100): se le pasa el de los servicios.
  return precioConPorcentaje(importe, porcentaje, "subir", paso as unknown as PasoRedondeo);
}

const conUnDecimal = (n: number) => Math.round(n * 10) / 10;
const positivo = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const pasoValido = (v: unknown): v is PasoServicios => (PASOS_REDONDEO_SERVICIOS as readonly unknown[]).includes(v);

/** FNV-1a de 32 bits: alcanza para una huella de igualdad (no es seguridad, la guardia es la tx). */
function fnv1a(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * La huella del plan: los precios de HOY de cada elegido (en centavos, ordenados por id) y lo que se
 * pidió. Si cambia un precio, una seña o un precio vecina de un elegido, o entra/sale un servicio de
 * la categoría, cambia la huella. PURA.
 */
export function huellaDelAumento(
  elegidos: readonly ServicioParaAumento[],
  pedido: { porcentaje: number | null; redondeo: number; senia: boolean; vecina: boolean },
): string {
  const filas = [...elegidos]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((s) => [
      s.id,
      centavosDe(s.price),
      s.residentPrice == null ? null : centavosDe(s.residentPrice),
      s.depositAmount == null ? null : centavosDe(s.depositAmount),
    ]);
  const cuerpo = JSON.stringify({ p: [pedido.porcentaje, pedido.redondeo, pedido.senia ? 1 : 0, pedido.vecina ? 1 : 0], s: filas });
  return `${elegidos.length}-${fnv1a(cuerpo)}`;
}

function planVacio(pedido: PedidoAumentoServicios, error: string, extra: Partial<PlanAumentoServicios> = {}): PlanAumentoServicios {
  return {
    error,
    porcentaje: null,
    redondeo: pedido.redondeo,
    senia: pedido.senia === true,
    vecina: pedido.vecina === true,
    elegidos: 0,
    filas: [],
    sinPrecio: [],
    pideConfirmacion: false,
    huella: "vacio",
    ...extra,
  };
}

const lista = (nombres: readonly string[]) =>
  nombres.length <= 3 ? nombres.map((n) => `"${n}"`).join(", ") : `${nombres.slice(0, 3).map((n) => `"${n}"`).join(", ")} y ${nombres.length - 3} más`;

/**
 * Arma el plan del aumento contra el catálogo. PURA: no escribe nada. La misma función para la vista
 * previa (en la pantalla) y para el «Aplicar» (en el servidor, adentro de la transacción).
 */
export function planificarAumentoServicios(
  servicios: readonly ServicioParaAumento[],
  pedido: PedidoAumentoServicios,
): PlanAumentoServicios {
  if (!pasoValido(pedido.redondeo)) return planVacio(pedido, "Elegí cómo redondear: a $100, a $500 o a $1.000.");
  const lectura = leerPorcentaje(pedido.porcentaje, "subir");
  if (lectura.estado === "vacio") return planVacio(pedido, "Escribí cuánto suben, en porcentaje.");
  if (lectura.estado === "invalido") return planVacio(pedido, lectura.mensaje);
  const porcentaje = lectura.valor;

  const elegidos = elegirServicios(servicios, pedido.alcance);
  if (elegidos.length === 0) return planVacio(pedido, "Todavía no elegiste servicios.", { porcentaje });
  if (elegidos.length > MAX_SERVICIOS) {
    return planVacio(pedido, `Son ${elegidos.length} servicios; el máximo por vez es ${MAX_SERVICIOS}.`, { porcentaje, elegidos: elegidos.length });
  }

  const senia = pedido.senia === true;
  const vecina = pedido.vecina === true;
  const filas: FilaAumentoServicio[] = [];
  const sinPrecio: { id: string; nombre: string }[] = [];
  const vecinaNoBaja: string[] = [];
  const seniaNoBaja: string[] = [];

  for (const s of elegidos) {
    if (!positivo(s.price)) {
      sinPrecio.push({ id: s.id, nombre: s.name });
      continue;
    }
    const precio = { antes: s.price, despues: subirImporte(s.price, porcentaje, pedido.redondeo) };
    const filaVecina = vecina && positivo(s.residentPrice) ? { antes: s.residentPrice, despues: subirImporte(s.residentPrice, porcentaje, pedido.redondeo) } : null;
    const filaSenia = senia && positivo(s.depositAmount) ? { antes: s.depositAmount, despues: subirImporte(s.depositAmount, porcentaje, pedido.redondeo) } : null;
    // Lo que queda sin tocar también tiene que seguir por debajo del precio nuevo (lo está: el precio
    // sólo sube). Lo que se sube, se controla.
    if (filaVecina && centavosDe(filaVecina.despues) >= centavosDe(precio.despues)) vecinaNoBaja.push(s.name);
    if (filaSenia && centavosDe(filaSenia.despues) >= centavosDe(precio.despues)) seniaNoBaja.push(s.name);
    const efectivo = conUnDecimal(((precio.despues - precio.antes) / precio.antes) * 100);
    filas.push({
      serviceId: s.id,
      nombre: s.name,
      categoria: s.categoria,
      pausado: !s.active,
      precio,
      vecina: filaVecina,
      senia: filaSenia,
      efectivo,
      porRedondeo: Math.abs(efectivo - porcentaje) > DESVIO_POR_REDONDEO,
    });
  }

  const base: PlanAumentoServicios = {
    error: null,
    porcentaje,
    redondeo: pedido.redondeo,
    senia,
    vecina,
    elegidos: elegidos.length,
    filas,
    sinPrecio,
    pideConfirmacion: pideConfirmacionExtra(porcentaje),
    huella: huellaDelAumento(elegidos, { porcentaje, redondeo: pedido.redondeo, senia, vecina }),
  };

  if (vecinaNoBaja.length > 0) {
    return {
      ...base,
      error:
        `Con el redondeo de $${pedido.redondeo.toLocaleString("es-AR")}, el precio vecina de ${lista(vecinaNoBaja)} quedaría igual o más caro que el precio general. ` +
        "Elegí un redondeo más chico o no subas el precio vecina.",
    };
  }
  if (seniaNoBaja.length > 0) {
    return {
      ...base,
      error:
        `Con el redondeo de $${pedido.redondeo.toLocaleString("es-AR")}, la seña de ${lista(seniaNoBaja)} quedaría igual o más cara que el servicio. ` +
        "Elegí un redondeo más chico o no subas la seña.",
    };
  }
  if (filas.length === 0) return { ...base, error: "Ninguno de los elegidos tiene precio: no hay nada que subir." };
  return base;
}

/** ¿Se puede aplicar? Sin error y con algo para escribir. */
export function aumentoServiciosAplicable(p: PlanAumentoServicios): boolean {
  return p.error === null && p.filas.length > 0;
}

/** "+8 %". */
export function textoDelAumento(porcentaje: number): string {
  return `+${porcentaje.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
}

// ── Lo que llega del navegador ───────────────────────────────────────────────

const ID_VALIDO = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 64;

/**
 * El pedido tal como llegó a la acción del servidor, validado campo por campo (una acción es un
 * endpoint: lo que manda el navegador puede traer cualquier cosa). `null` si no tiene la forma.
 */
export function pedidoServiciosDesdeAfuera(v: unknown): PedidoAumentoServicios | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const a = o.alcance as Record<string, unknown> | null | undefined;
  if (!a || typeof a !== "object") return null;
  let alcance: AlcanceServicios;
  if (a.tipo === "todos") alcance = { tipo: "todos" };
  else if (a.tipo === "categoria" && ID_VALIDO(a.categoryId)) alcance = { tipo: "categoria", categoryId: a.categoryId };
  else if (a.tipo === "tildados" && Array.isArray(a.ids) && a.ids.length <= MAX_SERVICIOS && a.ids.every(ID_VALIDO)) {
    alcance = { tipo: "tildados", ids: a.ids as string[] };
  } else return null;
  if (typeof o.porcentaje !== "string" || o.porcentaje.length > 20) return null;
  if (!pasoValido(o.redondeo)) return null;
  if (typeof o.senia !== "boolean" || typeof o.vecina !== "boolean") return null;
  return { alcance, porcentaje: o.porcentaje, redondeo: o.redondeo, senia: o.senia, vecina: o.vecina };
}

/** La clave de idempotencia que manda la pantalla (un UUID por «Aplicar»). `null` si no sirve. */
export function claveDesdeAfuera(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : null;
}

// ── Auditoría: una fila por servicio ─────────────────────────────────────────
//
// Cada servicio que cambia deja UNA fila en AuditLog (`cambio-de-precio`, entidad `Service`), en la
// MISMA transacción que escribe el precio: si el aumento se deshace, el registro también. Doce
// depilaciones son doce filas con su antes y su después («este precio no lo cambié yo» se contesta
// mirando la fila de ese servicio). Todas las filas del aumento llevan el mismo `lote`: su `id` es la
// clave de idempotencia (un doble envío encuentra el lote ya escrito y no aplica dos veces), y
// `porcentaje` / `redondeo` alimentan «Último aumento». `antes`/`despues` en la raíz son los del
// precio general: así /admin/auditoria la lee con el mismo resumen que la de los productos
// (`resumenDeFilaDePrecio`: «Piernas completas: $14.000 → $15.500»).

export const ENTIDAD_SERVICIO = "Service";
export const ACCION_CAMBIO_DE_PRECIO_SERVICIO = "cambio-de-precio";
export const ORIGEN_SUBIR_PRECIOS_SERVICIOS = "subir-precios-servicios";

export type LoteAumentoServicios = { id: string; porcentaje: number; redondeo: number; senia: boolean; vecina: boolean };

/** Las filas de AuditLog de un aumento de servicios. PURA. */
export function filasAuditoriaAumentoServicios(args: {
  tenantId: string;
  actor: string;
  lote: LoteAumentoServicios;
  filas: readonly FilaAumentoServicio[];
}): Prisma.AuditLogCreateManyInput[] {
  return args.filas.map((f) => ({
    tenantId: args.tenantId,
    actor: args.actor,
    action: ACCION_CAMBIO_DE_PRECIO_SERVICIO,
    entity: ENTIDAD_SERVICIO,
    entityId: f.serviceId,
    channel: "admin",
    changes: {
      origen: ORIGEN_SUBIR_PRECIOS_SERVICIOS,
      nombre: f.nombre,
      forma: "u",
      antes: f.precio.antes,
      despues: f.precio.despues,
      ...(f.vecina ? { vecina: { antes: f.vecina.antes, despues: f.vecina.despues } } : {}),
      ...(f.senia ? { senia: { antes: f.senia.antes, despues: f.senia.despues } } : {}),
      lote: { ...args.lote },
    },
  }));
}

/** El `where` de las filas de los aumentos de servicios de un negocio (para «Último aumento»). */
export function whereAumentosDeServicios(tenantId: string) {
  return {
    tenantId,
    entity: ENTIDAD_SERVICIO,
    action: ACCION_CAMBIO_DE_PRECIO_SERVICIO,
    changes: { path: ["origen"], equals: ORIGEN_SUBIR_PRECIOS_SERVICIOS },
  } satisfies Prisma.AuditLogWhereInput;
}

/** Días de calendario entre dos fechas AAAA-MM-DD. PURA. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)));
  const b = Date.UTC(Number(hasta.slice(0, 4)), Number(hasta.slice(5, 7)) - 1, Number(hasta.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

export type UltimoAumentoServicios = { dias: number; porcentaje: number | null };

/**
 * La fila más reciente de `whereAumentosDeServicios` → cuántos días pasaron y de cuánto fue. PURA.
 * `diaDelCambio` es la fecha de esa fila en la zona del negocio (AAAA-MM-DD).
 */
export function resumirUltimoAumentoServicios(
  fila: { diaDelCambio: string; changes: unknown } | null,
  hoy: string,
): UltimoAumentoServicios | null {
  if (!fila) return null;
  const c = (fila.changes && typeof fila.changes === "object" ? fila.changes : {}) as Record<string, unknown>;
  const lote = (c.lote && typeof c.lote === "object" ? c.lote : {}) as Record<string, unknown>;
  const porcentaje = typeof lote.porcentaje === "number" && Number.isFinite(lote.porcentaje) ? lote.porcentaje : null;
  return { dias: Math.max(0, diasEntre(fila.diaDelCambio, hoy)), porcentaje };
}

/** «Último aumento: hace 0 días (+8 %).» / «Todavía no subiste precios desde acá.» PURA. */
export function textoUltimoAumentoServicios(u: UltimoAumentoServicios | null): string {
  if (!u) return "Todavía no subiste precios en bloque desde acá.";
  const hace = `hace ${u.dias} ${u.dias === 1 ? "día" : "días"}`;
  return `Último aumento: ${hace}${u.porcentaje !== null ? ` (${textoDelAumento(u.porcentaje)})` : ""}.`;
}
