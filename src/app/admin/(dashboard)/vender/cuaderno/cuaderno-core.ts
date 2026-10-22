// ============================================================================
// CARGAR VENTAS DEL CUADERNO — el núcleo puro (Magra, tanda 2 · 2E; E19, MG-060).
// ============================================================================
//
// Cuando vuelve la señal, el mostrador carga de una vez las ventas que anotó en el cuaderno:
// hora, corte(s), peso o cantidad, y cómo pagó. Cada venta se graba con el alta de SIEMPRE
// (`createOrder` → `insertOrder`): el precio sale de la base, el stock baja en la misma transacción
// y el asiento va al libro del día en que se vendió. Acá no se calcula plata que se grabe: lo que la
// pantalla muestra («da $X») es la cuenta de la base con la misma regla (`round2(cantidad × precio)`,
// la de `buildOrderLines`), sólo para comparar con lo anotado.
//
// La IDEMPOTENCIA: cada venta del cuaderno lleva su clave, generada UNA vez cuando se agrega el
// renglón en la pantalla y guardada con el borrador. Recargar la página, tocar «Cargar» dos veces o
// reintentar después de un corte manda la MISMA clave: el alta la encuentra y contesta «ya estaba»,
// sin grabar otra. El prefijo `cuaderno:` separa estas claves de las de Vender.
//
// Client-safe: sin Prisma ni nada de servidor (lo importan la pantalla, la acción y los tests).

import { leerCantidad } from "@/lib/pos-peso";
import { round2 } from "@/lib/round";
import { leerMedioDeCobro, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import { fmtMoneyARS } from "@/components/ui/format";
import type { OrderActionState } from "@/lib/order-actions";
import { CAMPO_HORA_DEL_CUADERNO, horaDelCuaderno } from "@/lib/cuaderno/hora-de-la-venta";

/** Cuántas ventas se cargan de una vez (un sábado sin señal; más es otra tanda). */
export const MAX_VENTAS_POR_CARGA = 40;
/** Cuántos cortes por venta del cuaderno. */
export const MAX_RENGLONES_POR_VENTA = 12;
/** El prefijo de la clave de idempotencia de una venta del cuaderno. */
export const PREFIJO_CLAVE_CUADERNO = "cuaderno:";

/** Un corte anotado: qué producto y cuánto («1,1» kg o «6» u, como está en el cuaderno). */
export type RenglonDelCuaderno = { productId: string; cantidad: string };

/** Una venta del cuaderno, como la manda la pantalla. */
export type VentaDelCuaderno = {
  /** La clave de la venta (sin el prefijo), generada una vez por renglón de la pantalla. */
  clave: string;
  /** "2026-10-22". */
  dia: string;
  /** "11:20". */
  hora: string;
  medio: MedioDeCobro;
  renglones: RenglonDelCuaderno[];
  /** Nombre del cliente si se anotó (opcional). */
  cliente?: string;
};

/** Cómo quedó cada venta después de cargar. */
export type EstadoDeLaCarga = "grabada" | "ya-estaba" | "rechazada" | "sin-confirmar";

export type ResultadoDeUnaVenta = {
  clave: string;
  estado: EstadoDeLaCarga;
  /** El texto para la persona (el motivo del rechazo, o «Venta #N · $X»). */
  mensaje: string;
  /** La venta grabada (número y total leídos de la base), si quedó. */
  venta?: { code: number; total: number };
};

export type ResultadoDelCuaderno = { ok: true; resultados: ResultadoDeUnaVenta[] } | { ok: false; error: string };

const CLAVE_VALIDA = /^[A-Za-z0-9-]{8,64}$/;
const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;
const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * ¿El texto de la hora es una hora de reloj? «11:20», «9.05» y, para el teclado numérico del
 * celular, «1120» o «905». Devuelve la normalizada («09:05»).
 */
export function leerHora(raw: string): string | null {
  const m = /^\s*(\d{1,2})[:.]?(\d{2})\s*$/.exec(raw);
  if (!m) return null;
  const h = `${m[1].padStart(2, "0")}:${m[2]}`;
  return HORA_VALIDA.test(h) ? h : null;
}

/**
 * Lee lo que llegó del navegador (no se confía en su forma): un arreglo de ventas con su clave, día,
 * hora, medio y renglones. Lo que no tiene forma es un error en palabras y no se carga nada.
 */
export function leerVentasDelCuaderno(crudo: unknown): { ok: true; ventas: VentaDelCuaderno[] } | { ok: false; error: string } {
  if (!Array.isArray(crudo) || crudo.length === 0) return { ok: false, error: "No hay ventas para cargar." };
  if (crudo.length > MAX_VENTAS_POR_CARGA) {
    return { ok: false, error: `Se cargan hasta ${MAX_VENTAS_POR_CARGA} ventas por vez: cargá estas en dos tandas.` };
  }
  const ventas: VentaDelCuaderno[] = [];
  const claves = new Set<string>();
  for (const x of crudo as unknown[]) {
    const v = (x ?? {}) as Record<string, unknown>;
    const clave = typeof v.clave === "string" ? v.clave : "";
    const dia = typeof v.dia === "string" ? v.dia : "";
    const hora = typeof v.hora === "string" ? leerHora(v.hora) : null;
    const medio = leerMedioDeCobro(v.medio);
    const renglones = Array.isArray(v.renglones) ? (v.renglones as unknown[]) : [];
    if (!CLAVE_VALIDA.test(clave) || claves.has(clave) || !DIA_VALIDO.test(dia) || !hora || !medio) {
      return { ok: false, error: "Una de las ventas llegó incompleta: recargá la pantalla y volvé a tocar «Cargar»." };
    }
    if (renglones.length === 0 || renglones.length > MAX_RENGLONES_POR_VENTA) {
      return { ok: false, error: "Una de las ventas llegó sin cortes o con demasiados: revisala." };
    }
    const leidos: RenglonDelCuaderno[] = [];
    for (const r of renglones) {
      const rr = (r ?? {}) as Record<string, unknown>;
      if (typeof rr.productId !== "string" || !rr.productId || rr.productId.length > 64 || typeof rr.cantidad !== "string") {
        return { ok: false, error: "Una de las ventas llegó con un corte incompleto: revisala." };
      }
      leidos.push({ productId: rr.productId, cantidad: rr.cantidad.slice(0, 20) });
    }
    claves.add(clave);
    const cliente = typeof v.cliente === "string" ? v.cliente.trim().slice(0, 80) : "";
    ventas.push({ clave, dia, hora, medio, renglones: leidos, ...(cliente ? { cliente } : {}) });
  }
  return { ok: true, ventas };
}

/** Las ventas en el orden en que se vendieron: los números de venta siguen el orden del cuaderno. */
export function ordenarPorHora<T extends { dia: string; hora: string }>(ventas: readonly T[]): T[] {
  return ventas
    .map((v, i) => ({ v, i }))
    .sort((a, b) => `${a.v.dia}T${a.v.hora}`.localeCompare(`${b.v.dia}T${b.v.hora}`) || a.i - b.i)
    .map((x) => x.v);
}

/**
 * El formulario de `createOrder` para una venta del cuaderno: mostrador, retiro en el local,
 * cobrada con UN medio, la clave de la venta y su hora real. Nada de precios: los pone la base.
 */
export function formularioDeLaVenta(v: VentaDelCuaderno): FormData {
  const fd = new FormData();
  fd.set("channel", "COUNTER");
  fd.set("fulfillment", "PICKUP");
  fd.set("customerName", v.cliente || "Mostrador");
  fd.set("customerPhone", "");
  fd.set("paid", "on");
  fd.set("paymentMethod", v.medio);
  fd.set("idempotencyKey", `${PREFIJO_CLAVE_CUADERNO}${v.clave}`);
  fd.set(CAMPO_HORA_DEL_CUADERNO, horaDelCuaderno(v.dia, v.hora));
  // La venta grabada vuelve leída de la base: su número y su total (lo que quedó, no lo calculado acá).
  fd.set("conTicket", "1");
  for (const r of v.renglones) {
    fd.append("productId", r.productId);
    fd.append("quantity", r.cantidad);
  }
  return fd;
}

/** Lo que contestó el alta, en el estado de la venta del cuaderno. */
export function resultadoDeLaVenta(clave: string, r: OrderActionState): ResultadoDeUnaVenta {
  if (!r) return { clave, estado: "sin-confirmar", mensaje: "No pudimos confirmar si se grabó: volvé a tocar «Cargar» (no se duplica)." };
  if (r.ok) {
    const venta = r.venta ? { code: r.venta.code, total: r.venta.total } : undefined;
    if (r.yaEstaba) {
      return {
        clave,
        estado: "ya-estaba",
        mensaje: venta ? `Ya estaba cargada (venta #${venta.code}): no se grabó de nuevo.` : "Ya estaba cargada: no se grabó de nuevo.",
        ...(venta ? { venta } : {}),
      };
    }
    return { clave, estado: "grabada", mensaje: venta ? `Venta #${venta.code} · ${fmtMoneyARS(venta.total)}` : "Cargada", ...(venta ? { venta } : {}) };
  }
  if (r.tipo === "sin-confirmar") return { clave, estado: "sin-confirmar", mensaje: r.error };
  // «ya-grabada-distinta»: con esta clave ya hay una venta y no es igual a lo cargado ahora. No se
  // grabó nada nuevo: se muestra cuál es y qué cambió.
  return { clave, estado: "rechazada", mensaje: r.error };
}

// ── Lo que ve y edita la pantalla (el borrador) ────────────────────────────────────────────────

/** Un producto del catálogo, lo justo para el cuaderno. */
export type ProductoDelCuaderno = {
  id: string;
  nombre: string;
  porPeso: boolean;
  /** Precio por kilo o por unidad, de la base. null = sin precio (no se vende suelto). */
  precio: number | null;
};

/** Una venta del borrador: lo que se tipeó, tal cual, y cómo quedó al cargarla. */
export type FilaDelCuaderno = {
  clave: string;
  hora: string;
  medio: MedioDeCobro | "";
  renglones: RenglonDelCuaderno[];
  cliente: string;
  /** Cómo quedó la última vez que se mandó (sin mandar: ausente). */
  resultado?: ResultadoDeUnaVenta;
};

export function filaNueva(clave: string): FilaDelCuaderno {
  return { clave, hora: "", medio: "", renglones: [{ productId: "", cantidad: "" }], cliente: "" };
}

/** ¿Esta fila ya quedó cargada? (grabada o «ya estaba»: no se vuelve a mandar ni se edita). */
export function filaCargada(f: FilaDelCuaderno): boolean {
  return f.resultado?.estado === "grabada" || f.resultado?.estado === "ya-estaba";
}

/** ¿La fila está vacía (recién agregada, sin nada tipeado)? Las vacías no se mandan ni frenan. */
export function filaVacia(f: FilaDelCuaderno): boolean {
  return !f.hora.trim() && !f.medio && f.renglones.every((r) => !r.productId && !r.cantidad.trim());
}

/**
 * Qué le falta a una fila para poder cargarla, en palabras; null si está completa. La misma
 * lectura de cantidades que el alta (`leerCantidad`).
 */
export function faltaEnLaFila(f: FilaDelCuaderno, productos: ReadonlyMap<string, ProductoDelCuaderno>): string | null {
  if (!leerHora(f.hora)) return "Falta la hora (como está en el cuaderno, por ejemplo 11:20).";
  const usados = f.renglones.filter((r) => r.productId || r.cantidad.trim());
  if (usados.length === 0) return "Falta qué se vendió.";
  for (const r of usados) {
    const p = productos.get(r.productId);
    if (!p) return "Elegí el corte de cada renglón.";
    if (p.precio === null) return `«${p.nombre}» no tiene precio cargado: cargalo en Vender con «Precio a mano».`;
    const c = leerCantidad(r.cantidad);
    if (c.estado !== "ok" || !(c.valor > 0)) return `Falta ${p.porPeso ? "el peso" : "la cantidad"} de «${p.nombre}».`;
  }
  if (!f.medio) return "Falta cómo pagó.";
  return null;
}

/**
 * Lo que da la venta con los precios de hoy (la misma cuenta que el alta): para compararla con lo
 * anotado. null si falta algo. No viaja al servidor.
 */
export function totalDeLaFila(f: FilaDelCuaderno, productos: ReadonlyMap<string, ProductoDelCuaderno>): number | null {
  let total = 0;
  for (const r of f.renglones) {
    if (!r.productId && !r.cantidad.trim()) continue;
    const p = productos.get(r.productId);
    const c = leerCantidad(r.cantidad);
    if (!p || p.precio === null || c.estado !== "ok" || !(c.valor > 0)) return null;
    total = round2(total + round2(c.valor * p.precio));
  }
  return total > 0 ? total : null;
}

/** La venta lista para mandar (sin los renglones vacíos). */
export function ventaDeLaFila(f: FilaDelCuaderno, dia: string): VentaDelCuaderno | null {
  const hora = leerHora(f.hora);
  if (!hora || !f.medio) return null;
  const renglones = f.renglones.filter((r) => r.productId && r.cantidad.trim());
  if (renglones.length === 0) return null;
  return { clave: f.clave, dia, hora, medio: f.medio, renglones, ...(f.cliente.trim() ? { cliente: f.cliente.trim() } : {}) };
}

/** El resumen de una carga, en una frase: «Se cargaron 4 de 5: revisá la que quedó en rojo». */
export function resumenDeLaCarga(resultados: readonly ResultadoDeUnaVenta[]): string {
  const bien = resultados.filter((r) => r.estado === "grabada" || r.estado === "ya-estaba").length;
  const total = resultados.length;
  if (bien === total) return total === 1 ? "La venta quedó cargada con su hora." : `Las ${total} ventas quedaron cargadas con su hora.`;
  const dudas = resultados.filter((r) => r.estado === "sin-confirmar").length;
  return (
    `Se cargaron ${bien} de ${total}. ` +
    (dudas > 0
      ? "Algunas no sabemos si entraron: volvé a tocar «Cargar» (las que ya estaban no se duplican)."
      : "Revisá las que quedaron marcadas: no se grabaron.")
  );
}

/** «$35.464» o «—», para la columna «Da». */
export function textoDelTotal(total: number | null): string {
  return total === null ? "—" : fmtMoneyARS(total);
}

// ── El borrador en el equipo (localStorage, conveniencia del que carga) ─────────────────────────
//
// Se guarda en el navegador, por negocio y por usuario: si se corta otra vez o se recarga, lo
// tipeado y las CLAVES siguen (por eso recargar no duplica). Todo acceso va con try/catch: en modo
// privado o con el almacén bloqueado, la pantalla anda igual (el borrador vive en memoria).

export type BorradorDelCuaderno = { v: 1; dia: string; filas: FilaDelCuaderno[] };

export function claveDelBorrador(negocio: string, usuario: string): string {
  return `gsg:vender:cuaderno:${negocio}:${usuario}`;
}

export function leerBorrador(crudo: string | null): BorradorDelCuaderno | null {
  if (!crudo) return null;
  try {
    const x = JSON.parse(crudo) as Partial<BorradorDelCuaderno>;
    if (x?.v !== 1 || typeof x.dia !== "string" || !Array.isArray(x.filas)) return null;
    const filas = x.filas.filter(
      (f): f is FilaDelCuaderno =>
        !!f &&
        typeof f.clave === "string" &&
        CLAVE_VALIDA.test(f.clave) &&
        typeof f.hora === "string" &&
        typeof f.cliente === "string" &&
        Array.isArray(f.renglones) &&
        f.renglones.every((r) => r && typeof r.productId === "string" && typeof r.cantidad === "string"),
    );
    return { v: 1, dia: x.dia, filas: filas.map((f) => ({ ...f, medio: leerMedioDeCobro(f.medio) ?? "" })) };
  } catch {
    return null;
  }
}
