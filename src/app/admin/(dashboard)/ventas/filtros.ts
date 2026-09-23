// Ventas del día: los filtros de la URL y el resumen de arriba, decididos sin base. PURO: lo
// usan la página y los tests.

import { round2 } from "@/lib/round";
import { leerMedioDeCobro, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import { fmtMoneyARS } from "@/components/ui/format";

export type CanalDeVenta = "COUNTER" | "ONLINE";

export type FiltrosDeVentas = {
  /** Día del negocio (AAAA-MM-DD). */
  dia: string;
  medio: MedioDeCobro | null;
  canal: CanalDeVenta | null;
};

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaReal(s: string): boolean {
  if (!RE_DIA.test(s)) return false;
  const d = new Date(`${s}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Los filtros que llegan en la URL, sin confiar en ellos. PURA.
 *
 * EL DÍA: recepción ve SÓLO hoy (anula lo de hoy y con motivo; lo de otros días es de la
 * dueña). Aunque teclee `?dia=2026-09-01` en la URL, ve hoy: el límite lo pone el servidor, no
 * el formulario. Quien puede ver otros días no puede pedir uno futuro ni una fecha que no
 * existe: cae a hoy. Medio y canal desconocidos = sin filtro.
 */
export function leerFiltros(
  sp: { dia?: string | string[]; medio?: string | string[]; canal?: string | string[] },
  opts: { hoy: string; otrosDias: boolean },
): FiltrosDeVentas {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const diaPedido = uno(sp.dia).trim();
  const dia = opts.otrosDias && diaReal(diaPedido) && diaPedido <= opts.hoy ? diaPedido : opts.hoy;
  const canalTxt = uno(sp.canal).trim();
  return {
    dia,
    medio: leerMedioDeCobro(uno(sp.medio)),
    canal: canalTxt === "COUNTER" || canalTxt === "ONLINE" ? canalTxt : null,
  };
}

/**
 * Cuántas ventas vigentes, cuánto suman y el ticket promedio. PURA. Sin ventas, el promedio
 * es `null` (no hay promedio de nada), no 0.
 */
export function resumenDeVentas(ventas: readonly { total: number }[]): {
  cantidad: number;
  total: number;
  promedio: number | null;
} {
  const total = round2(ventas.reduce((s, v) => s + v.total, 0));
  return { cantidad: ventas.length, total, promedio: ventas.length > 0 ? round2(total / ventas.length) : null };
}

/**
 * La nota "Descuento de $X (10 %), lo aplicó Y." de una venta de la lista. PURA.
 *
 * El monto y el % salen del PEDIDO, no de la auditoría del alta: si el pedido se pesó y ajustó
 * antes de cobrarlo, el descuento a mano acompañó al peso con el mismo % (`totalesDelAjuste`) y
 * el monto del alta ya no es el que se cobró. De la auditoría sale sólo quién lo aplicó.
 * Sin descuento en el pedido, no hay nota.
 */
export function notaDeDescuento(o: { subtotal: number; discount: number }, por: string | null): string | null {
  if (!(o.discount > 0)) return null;
  const pct = o.subtotal > 0 ? String(round2((o.discount / o.subtotal) * 100)).replace(".", ",") : null;
  return `Descuento de ${fmtMoneyARS(o.discount)}${pct ? ` (${pct} %)` : ""}${por ? `, lo aplicó ${por}` : ""}.`;
}

/**
 * Las ventas A CUENTA de la lista: saldadas contra la cuenta corriente del cliente, sin medio
 * (`paid` y `paymentMethod` vacío). Son ventas —van en la lista y en la cuenta de arriba, igual
 * que en el número del Inicio— pero su plata no entró: se dicen aparte. PURA.
 */
export function resumenACuenta(ventas: readonly { total: number; paid?: boolean; paymentMethod: string | null }[]): {
  cantidad: number;
  total: number;
} {
  const aCuenta = ventas.filter((v) => v.paid !== false && !v.paymentMethod);
  return { cantidad: aCuenta.length, total: round2(aCuenta.reduce((s, v) => s + v.total, 0)) };
}

/**
 * La nota "Cupón VERANO10: −$1.250." de una venta. PURA. El código sale del alta; el monto, del
 * PEDIDO cuando se lo pasan (`descuentoDelPedido`), por la misma razón que `notaDeDescuento`: si
 * se pesó y ajustó antes de cobrarlo, el cupón se recalculó (`descuentoDelAjuste`) y el monto
 * del alta ya no es el que se cobró. Un cupón y un descuento a mano no se suman, así que el
 * descuento del pedido ES el del cupón.
 */
export function notaDeCupon(cupon: unknown, descuentoDelPedido?: number): string | null {
  if (!cupon || typeof cupon !== "object") return null;
  const c = cupon as { codigo?: unknown; monto?: unknown };
  if (typeof c.codigo !== "string" || !c.codigo) return null;
  const importe = descuentoDelPedido != null ? descuentoDelPedido : c.monto;
  const monto = typeof importe === "number" && importe > 0 ? `: −${fmtMoneyARS(importe)}` : "";
  return `Cupón ${c.codigo}${monto}.`;
}
