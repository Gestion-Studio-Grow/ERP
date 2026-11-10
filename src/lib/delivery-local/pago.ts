// ============================================================================
// DELIVERY LOCAL · CÓMO PAGA EL CLIENTE — transferencia, efectivo o link de Mercado Pago. PURA.
// ============================================================================
//
// La plataforma NO cobra ni toca la plata: el cliente le paga al comercio. Acá sólo se lee lo que
// eligió el cliente y se arma el renglón para el local y el repartidor:
//   · transferencia → el local la ve en su cuenta y recién ahí CONFIRMA el pedido (conciliación
//     manual: Pedido → Confirmado, desde la bandeja). El pedido nace sin cobrar (`paid:false`).
//   · efectivo → «paga con $X»: el repartidor sale con el vuelto justo.
//   · mercadopago → el local le manda el link de pago desde la bandeja (link-de-pago.ts); el aviso
//     de MP lo cobra solo. Sigue siendo opcional y a evaluar (token por despliegue).
//
// Nunca se graba `paymentMethod` en el alta: el medio real lo pone quien cobra (cobrarPedido), con
// las reglas de caja de siempre. Esto es una PREFERENCIA declarada por el cliente.

import { leerImporte } from "@/lib/dinero/leer";

export type MedioPreferido = "transferencia" | "efectivo" | "mercadopago";

export const MEDIOS_PREFERIDOS: readonly MedioPreferido[] = ["transferencia", "efectivo", "mercadopago"];

export const NOMBRE_MEDIO: Record<MedioPreferido, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  mercadopago: "Link de Mercado Pago",
};

export type LecturaPago =
  | { ok: true; medio: MedioPreferido | null; pagaCon: number | null }
  | { ok: false; error: string };

/** Tope de «paga con»: más que esto es un error de tipeo (y el repartidor no sale con ese vuelto). */
export const TOPE_PAGA_CON = 2_000_000;

export function leerPago(medioRaw: unknown, pagaConRaw: unknown, permitidos: readonly MedioPreferido[]): LecturaPago {
  const m = String(medioRaw ?? "").trim();
  if (m === "") return { ok: true, medio: null, pagaCon: null };
  if (!(MEDIOS_PREFERIDOS as readonly string[]).includes(m) || !permitidos.includes(m as MedioPreferido)) {
    return { ok: false, error: "Elegí cómo vas a pagar entre las opciones del local." };
  }
  const medio = m as MedioPreferido;
  if (medio !== "efectivo") return { ok: true, medio, pagaCon: null };
  const l = leerImporte(String(pagaConRaw ?? ""));
  if (l.estado === "vacio") return { ok: true, medio, pagaCon: null };
  if (l.estado === "invalida" || l.valor <= 0 || l.valor > TOPE_PAGA_CON) {
    return { ok: false, error: "Escribí con cuánto pagás en efectivo (por ejemplo 20.000), o dejalo vacío si pagás justo." };
  }
  return { ok: true, medio, pagaCon: l.valor };
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

/** El renglón de pago que viaja en la nota (lo ven el local y el repartidor). */
export function renglonDePago(medio: MedioPreferido, pagaCon: number | null): string {
  if (medio === "efectivo") return pagaCon !== null ? `Paga en efectivo con ${pesos(pagaCon)} (llevar vuelto)` : "Paga en efectivo, justo";
  if (medio === "transferencia") return "Paga por transferencia: confirmar al ver la plata en la cuenta";
  return "Pide link de Mercado Pago: mandarlo desde la bandeja";
}

/** Vuelto que tiene que llevar el repartidor; null si no aplica o si alcanza justo. */
export function vueltoALlevar(total: number, pagaCon: number | null): number | null {
  if (pagaCon === null) return null;
  const v = Math.round((pagaCon - total) * 100) / 100;
  return v > 0 ? v : null;
}

/**
 * Los datos para transferir sólo se muestran cuando el local confirmó su alias: un alias provisional
 * a la vista del cliente es una invitación a transferirle a nadie. Sin alias confirmado, el local lo
 * pasa por WhatsApp al confirmar el pedido.
 */
export function transferenciaPublicable<T extends { alias: string }>(t: T | null | undefined): T | null {
  if (!t) return null;
  return /provisional|a\.?confirmar/i.test(t.alias) ? null : t;
}
