// ============================================================================
// DELIVERY LOCAL · LOS MENSAJES — lo que el local le manda al repartidor por WhatsApp. PURA.
// ============================================================================
//
// El repartidor es DEL COMERCIO (o un independiente que el comercio contrata): la plataforma no lo
// asigna, no lo califica ni le fija tarifa. El local toca «Mandar al repartidor» y sale un WhatsApp
// armado con lo justo para entregar: número, cliente, teléfono, dirección, ubicación, qué cobrar y
// el vuelto. Sin número del repartidor, `wa.me/?text=` deja elegir a quién mandarlo.

import { vueltoALlevar, type MedioPreferido } from "./pago";

export type PedidoParaElRepartidor = {
  code: number;
  negocio: string;
  cliente: string;
  telefono: string;
  direccion: string | null;
  /** La nota del pedido tal cual (trae «Ubicación: <link>», la zona y lo que escribió el cliente). */
  nota: string | null;
  total: number;
  pagado: boolean;
  medio: MedioPreferido | null;
  pagaCon: number | null;
  renglones: { nombre: string; cantidad: number }[];
};

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

/** Qué hace el repartidor con la plata. */
export function cobroParaElRepartidor(p: Pick<PedidoParaElRepartidor, "total" | "pagado" | "medio" | "pagaCon">): string {
  if (p.pagado) return "YA PAGÓ — no cobrar";
  if (p.medio === "efectivo") {
    const vuelto = vueltoALlevar(p.total, p.pagaCon);
    return vuelto !== null ? `COBRAR ${pesos(p.total)} en efectivo · paga con ${pesos(p.pagaCon!)} · llevar ${pesos(vuelto)} de vuelto` : `COBRAR ${pesos(p.total)} en efectivo`;
  }
  return `COBRAR ${pesos(p.total)} (todavía no figura pagado: consultá al local antes de salir)`;
}

export function textoParaElRepartidor(p: PedidoParaElRepartidor): string {
  const r = [
    `*Pedido #${p.code}* · ${p.negocio}`,
    `${p.cliente} · ${p.telefono}`,
    p.direccion ? `Dirección: ${p.direccion}` : null,
    p.nota ? p.nota : null,
    "",
    ...p.renglones.map((l) => `• ${l.cantidad % 1 === 0 ? l.cantidad : String(l.cantidad).replace(".", ",")} × ${l.nombre}`),
    "",
    cobroParaElRepartidor(p),
  ];
  return r.filter((x): x is string => x !== null).join("\n");
}

/** Link de WhatsApp sin destinatario: el teléfono del local elige el chat del repartidor. */
export function waSinDestinatario(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
