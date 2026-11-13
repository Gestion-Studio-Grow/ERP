// ============================================================================
// DELIVERY LOCAL · LOS MENSAJES — lo que el local le manda al repartidor por WhatsApp. PURA.
// ============================================================================
//
// El repartidor es DEL COMERCIO (o un independiente que el comercio contrata): la plataforma no lo
// asigna, no lo califica ni le fija tarifa. El local toca «Mandar al repartidor» y sale un WhatsApp
// armado con lo justo para entregar: número, cliente, teléfono, dirección, ubicación, qué cobrar y
// el vuelto. Sin número del repartidor, `wa.me/?text=` deja elegir a quién mandarlo.

import { centavosDe } from "@/lib/dinero/redondeo";
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
  /** El link firmado de «Entregué» (src/lib/delivery-local/entrega.ts); null si no se pudo armar. */
  linkEntrega?: string | null;
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

/** Lo que escribió el cliente va en UNA línea: un salto de línea no puede fingir un renglón del sistema. */
export function enUnaLinea(t: string): string {
  return t.replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function textoParaElRepartidor(p: PedidoParaElRepartidor): string {
  // La línea de cobro va PRIMERO y en negrita: lo que venga después es texto del pedido.
  const r = [
    `*Pedido #${p.code}* · ${enUnaLinea(p.negocio)}`,
    `*${cobroParaElRepartidor(p)}*`,
    "",
    `${enUnaLinea(p.cliente)} · ${enUnaLinea(p.telefono)}`,
    p.direccion ? `Dirección: ${enUnaLinea(p.direccion)}` : null,
    p.nota ? `Nota del pedido: ${enUnaLinea(p.nota)}` : null,
    "",
    ...p.renglones.map((l) => `• ${cantidad(l.cantidad)} × ${enUnaLinea(l.nombre)}`),
    ...renglonDeEntrega(p.linkEntrega),
  ];
  return r.filter((x): x is string => x !== null).join("\n");
}

const cantidad = (n: number) => (n % 1 === 0 ? String(n) : String(n).replace(".", ","));

function renglonDeEntrega(link: string | null | undefined): string[] {
  return link ? ["", `Cuando lo entregues, tocá «Entregué»: ${link}`] : [];
}

// ── Viaje con varios pedidos ─────────────────────────────────────────────────────────────────────

const MAPA_DE_LA_NOTA = /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=(-?\d{1,2}(?:\.\d{1,8})?),(-?\d{1,3}(?:\.\d{1,8})?)/;

/**
 * El mapa de la parada: las coordenadas que el sistema dejó en la nota («Ubicación: <link>»),
 * re-armadas desde los números (el texto del cliente no puede meter otro dominio); sin ellas, la
 * búsqueda de la dirección en Google Maps. Sin ninguna de las dos, null.
 */
export function mapaDeLaParada(direccion: string | null, nota: string | null): string | null {
  const m = nota ? MAPA_DE_LA_NOTA.exec(nota) : null;
  if (m) return `https://www.google.com/maps/search/?api=1&query=${m[1]},${m[2]}`;
  const d = direccion ? enUnaLinea(direccion) : "";
  return d ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d)}` : null;
}

export type EfectivoDelViaje = {
  /** Lo que el repartidor cobra en efectivo, sumado. */
  cobrar: number;
  /** El vuelto que tiene que llevar, sumado. */
  vuelto: number;
  /** Paradas sin pagar y sin efectivo elegido (transferencia sin acreditar, o sin dato). */
  sinConfirmar: number;
};

/** La plata del viaje, en centavos enteros para que la suma no arrastre decimales. */
export function efectivoDelViaje(paradas: readonly Pick<PedidoParaElRepartidor, "total" | "pagado" | "medio" | "pagaCon">[]): EfectivoDelViaje {
  let cobrar = 0;
  let vuelto = 0;
  let sinConfirmar = 0;
  for (const p of paradas) {
    if (p.pagado) continue;
    if (p.medio !== "efectivo") {
      sinConfirmar += 1;
      continue;
    }
    cobrar += centavosDe(p.total);
    const v = vueltoALlevar(p.total, p.pagaCon);
    if (v !== null) vuelto += centavosDe(v);
  }
  return { cobrar: cobrar / 100, vuelto: vuelto / 100, sinConfirmar };
}

/** UN WhatsApp con todas las paradas del viaje y el total de efectivo arriba de todo. */
export function textoDelViaje(negocio: string, paradas: readonly PedidoParaElRepartidor[]): string {
  const plata = efectivoDelViaje(paradas);
  const r: (string | null)[] = [
    `*Viaje de ${paradas.length} pedidos* · ${enUnaLinea(negocio)}`,
    `*TOTAL A COBRAR EN EFECTIVO: ${pesos(plata.cobrar)}*`,
    plata.vuelto > 0 ? `*Llevar ${pesos(plata.vuelto)} de cambio en total*` : null,
    plata.sinConfirmar > 0
      ? `*${plata.sinConfirmar === 1 ? "1 pedido" : `${plata.sinConfirmar} pedidos`} sin pago confirmado: consultá al local antes de salir*`
      : null,
  ];
  paradas.forEach((p, i) => {
    const mapa = mapaDeLaParada(p.direccion, p.nota);
    r.push(
      "",
      `*Parada ${i + 1} · Pedido #${p.code}*`,
      `*${cobroParaElRepartidor(p)}*`,
      `${enUnaLinea(p.cliente)} · ${enUnaLinea(p.telefono)}`,
      p.direccion ? `Dirección: ${enUnaLinea(p.direccion)}` : null,
      mapa ? `Mapa: ${mapa}` : null,
      p.nota ? `Nota del pedido: ${enUnaLinea(p.nota)}` : null,
      p.renglones.length ? `Lleva: ${p.renglones.map((l) => `${cantidad(l.cantidad)} × ${enUnaLinea(l.nombre)}`).join(" · ")}` : null,
      p.linkEntrega ? `Al entregarlo, tocá «Entregué»: ${p.linkEntrega}` : null,
    );
  });
  return r.filter((x): x is string => x !== null).join("\n");
}

/** Link de WhatsApp sin destinatario: el teléfono del local elige el chat del repartidor. */
export function waSinDestinatario(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
