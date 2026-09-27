// ============================================================================
// EL TICKET QUE SE ARMA EN LA CAJA — renglones, promos en vivo y lo que se manda a cobrar.
// ============================================================================
//
// Lo usa la pantalla (estado del ticket mientras se pasa el lector) y lo prueban los tests. El
// importe de cada renglón se calcula con la MISMA regla que el alta de la venta (order-core.ts:
// cantidad × precio al centavo, o el importe de la etiqueta de balanza), y las promos con el
// MISMO motor: lo que ve el cajero es lo que cobra el servidor, salvo que un precio o una promo
// cambie en el medio (el servidor vuelve a decidir y lo dice).
//
// Y lo que se manda al servidor, con la forma que valida `cobroDesdeAfuera`.
//
// PURO: sin base, sin React.

import { round2 } from "@/lib/round";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import { aplicarPromociones, type ContextoDePromo, type Promocion, type ResultadoPromos } from "./promociones";
import type { ProductoDeCaja } from "./lectura";
import type { PagoIngresado } from "./pago-mixto";
import { leerMedioDeCobro } from "@/lib/caja/medio-cobro";

export interface RenglonDeCaja {
  /** Identifica el renglón en la pantalla (anular, ver su promo). */
  clave: string;
  productId: string;
  nombre: string;
  saleUnit: "UNIT" | "WEIGHT";
  seccion: string;
  /** Unidades o kilos. */
  cantidad: number;
  /** Precio de la unidad o del kilo. */
  precio: number;
  /** El importe de la etiqueta de balanza, si la trajo: se cobra ése. */
  importe: number | null;
  porBalanza: boolean;
}

/** Lo que vale el renglón sin promo: el importe de la etiqueta, o cantidad × precio al centavo. */
export function importeDelRenglon(r: Pick<RenglonDeCaja, "cantidad" | "precio" | "importe">): number {
  return r.importe != null ? round2(r.importe) : round2(r.cantidad * r.precio);
}

/**
 * Suma un renglón al ticket. Un producto por unidad que ya está (y no vino de la balanza) suma
 * cantidad en su renglón: pasar diez veces la misma gaseosa es un renglón "10 ×". Lo pesado es
 * siempre un renglón nuevo (cada etiqueta es un paquete). Devuelve el ticket nuevo y la clave
 * del renglón tocado. PURA.
 */
export function agregarAlTicket(
  ticket: readonly RenglonDeCaja[],
  nuevo: { producto: ProductoDeCaja; cantidad: number; importe: number | null; porBalanza: boolean },
  clave: string,
): { ticket: RenglonDeCaja[]; clave: string } {
  const p = nuevo.producto;
  const precio = (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
  if (p.saleUnit === "UNIT" && !nuevo.porBalanza) {
    const i = ticket.findIndex((r) => r.productId === p.id && r.saleUnit === "UNIT" && !r.porBalanza);
    if (i >= 0) {
      const t = [...ticket];
      t[i] = { ...t[i], cantidad: t[i].cantidad + nuevo.cantidad };
      return { ticket: t, clave: t[i].clave };
    }
  }
  const r: RenglonDeCaja = {
    clave,
    productId: p.id,
    nombre: p.name,
    saleUnit: p.saleUnit,
    seccion: p.seccion,
    cantidad: nuevo.cantidad,
    precio,
    importe: nuevo.importe,
    porBalanza: nuevo.porBalanza,
  };
  return { ticket: [...ticket, r], clave };
}

export function quitarDelTicket(ticket: readonly RenglonDeCaja[], clave: string): RenglonDeCaja[] {
  return ticket.filter((r) => r.clave !== clave);
}

export interface VistaDelTicket {
  /** Lo que vale todo sin promos. */
  bruto: number;
  ahorro: number;
  total: number;
  promos: ResultadoPromos;
  unidades: number;
}

/** El ticket con las promos aplicadas, como lo va a cobrar el servidor. PURA. */
export function vistaDelTicket(ticket: readonly RenglonDeCaja[], promos: readonly Promocion[], ctx: ContextoDePromo): VistaDelTicket {
  const importes = ticket.map((r) => importeDelRenglon(r));
  const resultado = aplicarPromociones(
    ticket.map((r, i) => ({
      clave: r.clave,
      productId: r.productId,
      seccion: r.seccion,
      saleUnit: r.saleUnit,
      cantidad: r.cantidad,
      precioUnitario: r.precio,
      importe: importes[i],
    })),
    promos,
    ctx,
  );
  const bruto = sumarAlCentavo(importes);
  const total = sumarAlCentavo(resultado.renglones.map((x) => x.neto));
  return {
    bruto,
    ahorro: resultado.totalDescuento,
    total,
    promos: resultado,
    unidades: ticket.reduce((s, r) => s + (r.saleUnit === "UNIT" ? r.cantidad : 1), 0),
  };
}

// ── Lo que viaja al servidor ─────────────────────────────────────────────────

export interface CobroDeCaja {
  /** Clave del ticket (idempotencia): la genera la pantalla una vez por ticket. */
  clave: string;
  renglones: { productId: string; cantidad: number; importe: number | null }[];
  pagos: PagoIngresado[];
  cliente: { nombre: string; telefono: string } | null;
}

export const MAX_RENGLONES = 300;

/** El cobro con la forma correcta, o null. El servidor no confía en lo que calculó la pantalla. */
export function cobroDesdeAfuera(v: unknown): CobroDeCaja | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.clave !== "string" || !/^[A-Za-z0-9_:-]{8,80}$/.test(o.clave)) return null;
  if (!Array.isArray(o.renglones) || o.renglones.length === 0 || o.renglones.length > MAX_RENGLONES) return null;
  const renglones: CobroDeCaja["renglones"] = [];
  for (const x of o.renglones) {
    const r = x as Record<string, unknown>;
    if (typeof r.productId !== "string" || !r.productId || r.productId.length > 64) return null;
    if (typeof r.cantidad !== "number" || !Number.isFinite(r.cantidad) || !(r.cantidad > 0) || r.cantidad > 9999) return null;
    const importe = r.importe === undefined || r.importe === null ? null : r.importe;
    if (importe !== null && (typeof importe !== "number" || !Number.isFinite(importe) || !(importe > 0) || importe > 1e9)) return null;
    renglones.push({ productId: r.productId, cantidad: r.cantidad, importe: importe as number | null });
  }
  if (!Array.isArray(o.pagos) || o.pagos.length === 0 || o.pagos.length > 4) return null;
  const pagos: PagoIngresado[] = [];
  for (const x of o.pagos) {
    const p = x as Record<string, unknown>;
    const medio = leerMedioDeCobro(p.medio);
    if (!medio || typeof p.monto !== "number" || !Number.isFinite(p.monto) || p.monto < 0 || p.monto > 1e10) return null;
    pagos.push({ medio, monto: p.monto });
  }
  let cliente: CobroDeCaja["cliente"] = null;
  if (o.cliente && typeof o.cliente === "object") {
    const c = o.cliente as Record<string, unknown>;
    const nombre = typeof c.nombre === "string" ? c.nombre.trim().slice(0, 80) : "";
    const telefono = typeof c.telefono === "string" ? c.telefono.trim().slice(0, 30) : "";
    if (nombre || telefono) cliente = { nombre, telefono };
  }
  return { clave: o.clave, renglones, pagos, cliente };
}

/**
 * Con UN medio que no es efectivo, se cobra el total exacto por ese medio (no hay vuelto): el
 * monto que mandó la pantalla no cuenta, el total lo decide el servidor. Con efectivo, el monto
 * es lo que entregó el cliente. PURA.
 */
export function pagosParaElTotal(pagos: readonly PagoIngresado[], total: number): PagoIngresado[] {
  const medios = new Set(pagos.map((p) => p.medio));
  if (medios.size === 1 && !medios.has("EFECTIVO")) return [{ medio: pagos[0].medio, monto: total }];
  return pagos.filter((p) => p.monto > 0);
}
