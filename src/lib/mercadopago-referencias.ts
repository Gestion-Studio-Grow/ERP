/**
 * A qué venta pertenece un cobro de Mercado Pago — el resolutor REAL del Core
 * (`ResolverReferencias`, plugins/mercadopago/core-contract.ts).
 *
 * El aviso (mercadopago-dispatch.ts) y el sincronizado (mercadopago-auto.ts) le preguntan lo
 * mismo, acá: de un lote de `external_reference`, cuáles son un turno o un pedido EXISTENTE de
 * ESTE negocio y si esa venta ya tiene factura. Lo que no aparece en la respuesta no es una venta
 * del negocio (texto libre del link manual, turno borrado, pedido de otro negocio) y sigue el
 * camino de una venta directa.
 *
 * Una cantidad FIJA de consultas por lote (pedidos y turnos, cada una con sus facturas), no una
 * por pago. Siempre acotado al negocio: `tenantId` en cada `where` y, encima, la transacción
 * de RLS (`tenantTransaction`).
 *
 * "Tiene factura" = una Invoice con su `orderId`/`appointmentId` que ARCA no rechazó, o —en el
 * turno— la marca que deja `facturarAppointment` en `Payment.comprobanteNro` (el mismo criterio
 * de `decidirFacturacion`, invoice-idempotency.ts, con el que el aviso no vuelve a facturar).
 */

import { tenantTransaction } from "@/lib/rls";
import { fmtShortDate, fmtTime } from "@/lib/datetime";
import {
  normalizarReferencia,
  pedidoDeReferencia,
  PREFIJO_REFERENCIA_PEDIDO,
  type VentaDeReferencia,
} from "@/plugins/mercadopago/core-contract";

/** Lo que puede ser el id de un turno: el de un cuid, sin espacios ni símbolos. */
const FORMA_DE_ID = /^[A-Za-z0-9_-]{1,64}$/;

type FacturaLeida = { id: string; status: string };

/** La base que necesita el resolutor (la tx de RLS en producción; un doble en los tests). */
export interface DbReferencias {
  order: {
    findMany(a: {
      where: { tenantId: string; id: { in: string[] } };
      select: { id: true; code: true; invoices: { select: { id: true; status: true } } };
    }): Promise<{ id: string; code: number; invoices: FacturaLeida[] }[]>;
  };
  appointment: {
    findMany(a: {
      where: { tenantId: string; id: { in: string[] } };
      select: {
        id: true;
        startsAt: true;
        payment: { select: { comprobanteNro: true } };
        invoices: { select: { id: true; status: true } };
      };
    }): Promise<{ id: string; startsAt: Date; payment: { comprobanteNro: string | null } | null; invoices: FacturaLeida[] }[]>;
  };
}

/** Qué se consulta de cada lote: los ids de pedido y los candidatos a id de turno. PURA. */
export function candidatosDeReferencias(refs: readonly string[]): {
  pedidos: Map<string, string>; // orderId → ref
  turnos: Map<string, string>; // appointmentId → ref
} {
  const pedidos = new Map<string, string>();
  const turnos = new Map<string, string>();
  for (const cruda of refs) {
    const ref = normalizarReferencia(cruda);
    if (!ref) continue;
    const orderId = pedidoDeReferencia(ref);
    if (orderId) pedidos.set(orderId, ref);
    else if (!ref.startsWith(PREFIJO_REFERENCIA_PEDIDO) && FORMA_DE_ID.test(ref)) turnos.set(ref, ref);
  }
  return { pedidos, turnos };
}

/** ¿Facturada? Una factura no rechazada; si sólo hay rechazadas, lo dice. PURA. */
export function estadoDeFacturacion(
  invoices: readonly FacturaLeida[],
  marcaDelTurno: string | null = null,
): { facturada: boolean; facturaRechazada?: boolean } {
  const rechazadas = new Set(invoices.filter((i) => i.status === "REJECTED").map((i) => i.id));
  const valida = invoices.some((i) => i.status !== "REJECTED");
  // La marca del turno apunta a la factura que emitió `facturarAppointment`: cuenta salvo que
  // sea justamente una que ARCA rechazó.
  const marca = Boolean(marcaDelTurno) && !rechazadas.has(marcaDelTurno!);
  if (valida || marca) return { facturada: true };
  return rechazadas.size > 0 ? { facturada: false, facturaRechazada: true } : { facturada: false };
}

/** El cuerpo, dentro de la transacción del llamador. */
export async function resolverReferenciasEnTx(
  db: DbReferencias,
  tenantId: string,
  refs: readonly string[],
): Promise<Map<string, VentaDeReferencia>> {
  const { pedidos, turnos } = candidatosDeReferencias(refs);
  const out = new Map<string, VentaDeReferencia>();
  if (pedidos.size > 0) {
    const filas = await db.order.findMany({
      where: { tenantId, id: { in: [...pedidos.keys()] } },
      select: { id: true, code: true, invoices: { select: { id: true, status: true } } },
    });
    for (const o of filas) {
      const ref = pedidos.get(o.id);
      if (ref) out.set(ref, { tipo: "pedido", id: o.id, etiqueta: `#${o.code}`, ...estadoDeFacturacion(o.invoices) });
    }
  }
  if (turnos.size > 0) {
    const filas = await db.appointment.findMany({
      where: { tenantId, id: { in: [...turnos.keys()] } },
      select: {
        id: true,
        startsAt: true,
        payment: { select: { comprobanteNro: true } },
        invoices: { select: { id: true, status: true } },
      },
    });
    for (const a of filas) {
      const ref = turnos.get(a.id);
      if (!ref) continue;
      out.set(ref, {
        tipo: "turno",
        id: a.id,
        etiqueta: `del ${fmtShortDate(a.startsAt)} ${fmtTime(a.startsAt)}`,
        ...estadoDeFacturacion(a.invoices, a.payment?.comprobanteNro ?? null),
      });
    }
  }
  return out;
}

/** El resolutor que se inyecta en el aviso y en la ingesta. `tenantId` lo trae el llamador. */
export async function resolverReferenciasMP(
  tenantId: string,
  refs: readonly string[],
): Promise<ReadonlyMap<string, VentaDeReferencia>> {
  const { pedidos, turnos } = candidatosDeReferencias(refs);
  if (pedidos.size === 0 && turnos.size === 0) return new Map();
  return tenantTransaction((tx) => resolverReferenciasEnTx(tx, tenantId, refs), { tenantId });
}
