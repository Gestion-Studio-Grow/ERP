// ============================================================================
// COBRO DEL CAJÓN — vuelto en efectivo y «Listo ✓» con comprobante (Venta y agenda simples, T2).
// ============================================================================
//
// Puro (sin base ni navegador). Las cuentas de plata son las del pie de cobro
// (`estadoDelEfectivo` / `billetesSugeridos`, al centavo con `@/lib/dinero/redondeo`): acá no se
// redondea nada nuevo. El vuelto SÓLO se muestra: no toca el cobro (el medio cobra el total exacto).
// El comprobante es texto + link `wa.me` que abre la recepción (nada de despachos ni webhooks).

import { billetesSugeridos, estadoDelEfectivo } from "@/lib/cobro/pie-de-cobro-core";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import { linkWhatsApp, mensajeCobro, medioEnTexto, pesosEnTexto } from "./mensajes-whatsapp";

/** Los billetes que se ofrecen para «Paga con» (los mismos del pie de cobro). */
export function billetesDelCajon(total: number): number[] {
  return billetesSugeridos(total);
}

export type VueltoDelCajon =
  | { estado: "vuelto"; vuelto: number; texto: string }
  | { estado: "justo"; vuelto: 0; texto: string }
  | { estado: "falta"; falta: number; texto: string }
  | null;

/**
 * «Paga con $30.000 → vuelto $3.000» · «Paga justo, sin vuelto» · «Con $20.000 te faltan $7.000».
 * `null` si no se dijo con cuánto paga o lo tipeado no es un monto.
 */
export function vueltoDelCajon(total: number, pagaCon: number | string | null | undefined): VueltoDelCajon {
  const e = estadoDelEfectivo(total, pagaCon);
  if (e.estado === "sin-dato" || e.estado === "invalido") return null;
  if (e.estado === "justo") return { estado: "justo", vuelto: 0, texto: "Paga justo, sin vuelto" };
  const con = sumarAlCentavo([total, e.estado === "vuelto" ? e.vuelto : -e.falta]);
  if (e.estado === "vuelto") return { estado: "vuelto", vuelto: e.vuelto, texto: `Paga con ${pesosEnTexto(con)} → vuelto ${pesosEnTexto(e.vuelto)}` };
  return { estado: "falta", falta: e.falta, texto: `Con ${pesosEnTexto(con)} te faltan ${pesosEnTexto(e.falta)}` };
}

/** Lo que quedó cobrado (lo arma el cajón con el monto que grabó el servidor). */
export type CobroHecho = {
  clienta: string;
  telefono: string | null | undefined;
  servicio?: string | null;
  /** Lo cobrado; null si el servidor no lo devolvió (entonces no hay comprobante). */
  monto: number | null;
  medio: string;
  /** El momento del cobro (ISO o Date). */
  cuando: string | Date;
  /** Vuelto que se dio en efectivo, si se usó «Paga con». */
  vuelto?: number | null;
};

export type ListoDelCobro = {
  /** «$27.000 en efectivo · vuelto $3.000». */
  linea: string;
  /** El link `wa.me` con el comprobante, o null (sin celular o sin monto): la tecla no aparece. */
  wa: string | null;
};

export function listoDelCobro(c: CobroHecho): ListoDelCobro {
  const monto = typeof c.monto === "number" && Number.isFinite(c.monto) && c.monto > 0 ? c.monto : null;
  const medio = medioEnTexto(c.medio);
  const vuelto = c.medio.toUpperCase() === "EFECTIVO" && typeof c.vuelto === "number" && c.vuelto > 0 ? c.vuelto : null;
  const linea = [monto != null ? `${pesosEnTexto(monto)}${medio ? ` ${medio}` : ""}` : medio ? `Cobrado ${medio}` : "Cobrado", vuelto != null && `vuelto ${pesosEnTexto(vuelto)}`]
    .filter(Boolean)
    .join(" · ");
  const texto = monto != null ? mensajeCobro({ clienta: c.clienta, monto, medio: c.medio, servicio: c.servicio, cuando: c.cuando }) : "";
  return { linea, wa: texto ? linkWhatsApp(c.telefono, texto) : null };
}
