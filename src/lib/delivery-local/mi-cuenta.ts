// ============================================================================
// PEDÍ LOCAL · «MI CUENTA» EN EL DISPOSITIVO — historial, direcciones y «Repetir pedido». PURA.
// ============================================================================
//
// Sin login y sin datos nuevos en el servidor: lo que la persona pidió desde ESTE teléfono queda en
// su navegador (localStorage, una clave por negocio: `claveDeLaCuenta`). Acá vive sólo la lógica
// sobre ese registro; leer y escribir el navegador (con try/catch) es de
// src/app/tienda/local/cuenta-del-dispositivo.ts.
//
//   · `leerCuenta`: el texto guardado → una cuenta válida. Lo roto o ajeno se descarta, nunca rompe.
//   · `guardarPedido`: al mandar, el pedido queda «sin confirmar» con su clave anti-duplicado.
//   · `asociarCodigo` / `asociarSeguimiento`: cuando el servidor contesta (número por WhatsApp) o
//     cuando se abre el seguimiento (token del link), el pedido guardado se completa.
//   · `recordarDireccion`: las últimas direcciones, sin repetidas, para prellenar el checkout.
//   · `repetirBolsa`: los mismos productos y cantidades contra la carta de HOY (el precio es el del
//     servidor; lo que ya no está o no tiene stock se avisa y no se suma).
//
// Sin React, sin DOM, sin reloj propio: `ahora` entra por parámetro (tests deterministas).

import { claveDeLinea } from "./opciones";

export const VERSION_CUENTA = 1;
export const TOPE_PEDIDOS = 20;
export const TOPE_DIRECCIONES = 5;
/** Un pedido «sin confirmar» (el servidor nunca contestó) se olvida después de esto. */
export const VIDA_SIN_CONFIRMAR_MS = 2 * 24 * 60 * 60 * 1000;
/** El seguimiento que se abre hasta este tiempo después de mandar se asocia al último sin número. */
export const VENTANA_SEGUIMIENTO_MS = 30 * 60 * 1000;
const LARGO_DIRECCION = 200;
const LARGO_NOMBRE = 120;

export type ItemGuardado = {
  productId: string;
  nombre: string;
  cantidad: number;
  saleUnit: "UNIT" | "WEIGHT";
  /** Las opciones elegidas, codificadas (opciones.ts). Sin opciones, no está. */
  opciones?: string;
};

export type PedidoGuardado = {
  /** La clave anti-duplicado con que se mandó (idempotencyKey). Identifica el pedido en el dispositivo. */
  clave: string;
  /** ISO 8601 de cuando se mandó. */
  fecha: string;
  /** Número del pedido (#ABC123) si ya se sabe. */
  code: string | null;
  /** Token del link de seguimiento si ya se abrió en este dispositivo. */
  token: string | null;
  items: ItemGuardado[];
  /** Total que se vio al mandar (el del servidor puede diferir: es orientativo). */
  total: number;
  fulfillment: "PICKUP" | "DELIVERY";
  /** Último estado visto en el seguimiento («En camino»), si se abrió. */
  estado: string | null;
  terminado: boolean;
};

export type DireccionGuardada = { texto: string; usada: string };

export type CuentaLocal = { v: typeof VERSION_CUENTA; pedidos: PedidoGuardado[]; direcciones: DireccionGuardada[] };

export const CUENTA_VACIA: CuentaLocal = Object.freeze({ v: VERSION_CUENTA, pedidos: [], direcciones: [] }) as CuentaLocal;

/** La clave de localStorage de un negocio. Una por slug: dos negocios en el mismo origen no se mezclan. */
export function claveDeLaCuenta(slug: string): string {
  return `pedi-local:v${VERSION_CUENTA}:${slug}`;
}

const esTexto = (x: unknown, max = 400): x is string => typeof x === "string" && x.length > 0 && x.length <= max;
const esFecha = (x: unknown): x is string => typeof x === "string" && Number.isFinite(Date.parse(x));
const esNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function leerItem(x: unknown): ItemGuardado | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!esTexto(o.productId, 100) || !esTexto(o.nombre, LARGO_NOMBRE) || !esNumero(o.cantidad) || o.cantidad <= 0) return null;
  if (o.saleUnit !== "UNIT" && o.saleUnit !== "WEIGHT") return null;
  const item: ItemGuardado = { productId: o.productId, nombre: o.nombre, cantidad: o.cantidad, saleUnit: o.saleUnit };
  if (esTexto(o.opciones, 300)) item.opciones = o.opciones;
  return item;
}

function leerPedido(x: unknown): PedidoGuardado | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!esTexto(o.clave, 100) || !esFecha(o.fecha) || !Array.isArray(o.items)) return null;
  const items = o.items.map(leerItem).filter((i): i is ItemGuardado => i !== null);
  if (items.length === 0) return null;
  return {
    clave: o.clave,
    fecha: o.fecha,
    code: esTexto(o.code, 40) ? o.code : null,
    token: esTexto(o.token, 400) ? o.token : null,
    items,
    total: esNumero(o.total) && o.total >= 0 ? o.total : 0,
    fulfillment: o.fulfillment === "PICKUP" ? "PICKUP" : "DELIVERY",
    estado: esTexto(o.estado, 120) ? o.estado : null,
    terminado: o.terminado === true,
  };
}

/** Lo guardado (texto de localStorage, o null) → una cuenta válida. Nunca tira: lo roto es cuenta vacía. */
export function leerCuenta(raw: string | null | undefined): CuentaLocal {
  if (!raw) return CUENTA_VACIA;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return CUENTA_VACIA;
  }
  if (!o || typeof o !== "object" || (o as { v?: unknown }).v !== VERSION_CUENTA) return CUENTA_VACIA;
  const c = o as { pedidos?: unknown; direcciones?: unknown };
  const pedidos = (Array.isArray(c.pedidos) ? c.pedidos : []).map(leerPedido).filter((p): p is PedidoGuardado => p !== null);
  const direcciones = (Array.isArray(c.direcciones) ? c.direcciones : [])
    .filter((d): d is DireccionGuardada => !!d && typeof d === "object" && esTexto((d as DireccionGuardada).texto, LARGO_DIRECCION) && esFecha((d as DireccionGuardada).usada))
    .map((d) => ({ texto: d.texto, usada: d.usada }));
  return { v: VERSION_CUENTA, pedidos: pedidos.slice(0, TOPE_PEDIDOS), direcciones: direcciones.slice(0, TOPE_DIRECCIONES) };
}

const confirmado = (p: PedidoGuardado) => p.code !== null || p.token !== null;

/** Saca los «sin confirmar» vencidos y deja el tope. El más nuevo primero. */
function ordenar(pedidos: PedidoGuardado[], ahora: Date): PedidoGuardado[] {
  const t = ahora.getTime();
  return pedidos
    .filter((p) => confirmado(p) || t - Date.parse(p.fecha) < VIDA_SIN_CONFIRMAR_MS)
    .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))
    .slice(0, TOPE_PEDIDOS);
}

export type PedidoAGuardar = Pick<PedidoGuardado, "clave" | "items" | "total" | "fulfillment">;

/**
 * El pedido recién mandado, «sin confirmar». Si la misma clave ya estaba (un reintento tras un
 * rechazo), se reemplaza sin perder el número ni el token que ya tuviera.
 */
export function guardarPedido(c: CuentaLocal, p: PedidoAGuardar, ahora: Date): CuentaLocal {
  const items = p.items.map((i) => ({ ...i, nombre: i.nombre.slice(0, LARGO_NOMBRE) })).filter((i) => i.cantidad > 0);
  if (!p.clave || items.length === 0) return c;
  const previo = c.pedidos.find((x) => x.clave === p.clave);
  const nuevo: PedidoGuardado = {
    clave: p.clave,
    fecha: ahora.toISOString(),
    code: previo?.code ?? null,
    token: previo?.token ?? null,
    items,
    total: Number.isFinite(p.total) && p.total >= 0 ? p.total : 0,
    fulfillment: p.fulfillment,
    estado: previo?.estado ?? null,
    terminado: previo?.terminado ?? false,
  };
  return { ...c, pedidos: ordenar([nuevo, ...c.pedidos.filter((x) => x.clave !== p.clave)], ahora) };
}

/** El servidor rechazó el pedido: si todavía no tenía número, no se guarda (no es un pedido). */
export function descartarSinConfirmar(c: CuentaLocal, clave: string): CuentaLocal {
  const p = c.pedidos.find((x) => x.clave === clave);
  if (!p || confirmado(p)) return c;
  return { ...c, pedidos: c.pedidos.filter((x) => x.clave !== clave) };
}

/** El servidor contestó con el número (pedido por WhatsApp). */
export function asociarCodigo(c: CuentaLocal, clave: string, code: string): CuentaLocal {
  const i = c.pedidos.findIndex((x) => x.clave === clave);
  if (i < 0 || !code || c.pedidos[i].code === code) return c;
  const pedidos = c.pedidos.slice();
  pedidos[i] = { ...pedidos[i], code: code.slice(0, 40) };
  return { ...c, pedidos };
}

export type SeguimientoVisto = { token: string; code: string; estado: string; terminado: boolean };

/**
 * Se abrió el seguimiento de un pedido en este dispositivo. ¿De cuál de los guardados es?
 *   1. el que ya tiene ese token (se actualiza el estado);
 *   2. el que tiene ese número y todavía no tiene token (se le pone);
 *   3. el último sin número ni token mandado hace menos de 30 minutos: es el que acaba de
 *      redirigir el alta (el pedido por la tienda va directo al seguimiento).
 * Si no es ninguno (un link reenviado por otra persona), no se guarda nada.
 */
export function asociarSeguimiento(c: CuentaLocal, v: SeguimientoVisto, ahora: Date): CuentaLocal {
  if (!v.token) return c;
  let i = c.pedidos.findIndex((x) => x.token === v.token);
  if (i < 0) i = c.pedidos.findIndex((x) => x.token === null && x.code === v.code);
  if (i < 0) {
    const t = ahora.getTime();
    i = c.pedidos.findIndex((x) => !confirmado(x) && t - Date.parse(x.fecha) >= 0 && t - Date.parse(x.fecha) < VENTANA_SEGUIMIENTO_MS);
  }
  if (i < 0) return c;
  const p = c.pedidos[i];
  const estado = v.estado.slice(0, 120) || null;
  if (p.token === v.token && p.code === v.code && p.estado === estado && p.terminado === v.terminado) return c;
  const pedidos = c.pedidos.slice();
  pedidos[i] = { ...p, token: v.token, code: v.code || p.code, estado, terminado: v.terminado };
  return { ...c, pedidos };
}

const plano = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** La dirección usada, primera de la lista, sin repetidas (sin importar tildes, mayúsculas ni espacios). */
export function recordarDireccion(c: CuentaLocal, texto: string, ahora: Date): CuentaLocal {
  const limpio = texto.replace(/\s+/g, " ").trim().slice(0, LARGO_DIRECCION);
  if (limpio.length < 5) return c;
  const k = plano(limpio);
  const direcciones = [{ texto: limpio, usada: ahora.toISOString() }, ...c.direcciones.filter((d) => plano(d.texto) !== k)].slice(0, TOPE_DIRECCIONES);
  return { ...c, direcciones };
}

export function olvidarDireccion(c: CuentaLocal, texto: string): CuentaLocal {
  const k = plano(texto);
  return { ...c, direcciones: c.direcciones.filter((d) => plano(d.texto) !== k) };
}

type ProductoDeHoy = { id: string; name: string; saleUnit: "UNIT" | "WEIGHT"; disponibilidad?: string | null };

export type BolsaRepetida = { bolsa: Record<string, number>; faltan: string[] };

/**
 * Los mismos productos y cantidades contra la carta de hoy. Se busca por id y, si el local lo
 * volvió a cargar, por nombre. Lo que ya no está o está sin stock va a `faltan` (se avisa).
 * La bolsa sólo lleva cantidades: el precio lo pone la carta del servidor, el de HOY.
 */
export function repetirBolsa(items: readonly ItemGuardado[], productos: readonly ProductoDeHoy[]): BolsaRepetida {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const porNombre = new Map(productos.map((p) => [plano(p.name), p]));
  const bolsa: Record<string, number> = {};
  const faltan: string[] = [];
  for (const it of items) {
    const p = porId.get(it.productId) ?? porNombre.get(plano(it.nombre));
    if (!p || p.disponibilidad === "sin-stock" || p.saleUnit !== it.saleUnit) {
      faltan.push(it.nombre);
      continue;
    }
    const cantidad = p.saleUnit === "UNIT" ? Math.max(1, Math.round(it.cantidad)) : Math.round(it.cantidad * 100) / 100; // no-es-plata: cantidad (unidades o kilos), no un importe
    const clave = claveDeLinea(p.id, it.opciones ?? "");
    bolsa[clave] = Math.round(((bolsa[clave] ?? 0) + cantidad) * 100) / 100; // no-es-plata: cantidad (unidades o kilos), no un importe
  }
  return { bolsa, faltan };
}
