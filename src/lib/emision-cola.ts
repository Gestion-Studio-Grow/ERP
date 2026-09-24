/**
 * EMITIR DESDE LA COLA sin sacar una segunda factura de una venta que ya tiene la suya.
 *
 * Un cobro de Mercado Pago de un turno o un pedido SIN factura va a la cola de revisión
 * (plugins/mercadopago/classifier.ts, `decisionPorVenta`): "facturalo desde el turno / Ventas del
 * día o aprobá la factura suelta". Entre que entra a la cola y que alguien la aprueba, la venta
 * pudo facturarse por su camino (el turno, «Facturar» en Ventas del día). Aprobar a ciegas
 * emitía entonces la SEGUNDA factura de la misma venta.
 *
 * Por eso, en los dos momentos en que la cola avanza hacia una factura, se vuelve a preguntar
 * con el MISMO resolutor del aviso y del sincronizado (`resolverReferenciasEnTx`), dentro de la
 * transacción y acotado al negocio:
 *   · al APROBAR (`aprobarRevisionEnTx`, completarRevisionAction): revision → auto;
 *   · al EMITIR (`emitirMovimientoEnTx`, emitirPropuestas — el único camino que emite desde la
 *     cola, lo usan la dueña y el contador): auto → emitida + la factura, todo en UNA tx.
 * Si la venta ya tiene una factura válida (no rechazada por ARCA), el ítem pasa a
 * `no_facturable` con el motivo verdadero y no se emite nada. Si no, sigue como siempre.
 *
 * DOBLE CLIC: cada paso es un compare-and-set del estado (`updateMany` con el estado de origen
 * en el `where`). Dos aprobaciones o emisiones del mismo ítem a la vez: Postgres bloquea la fila
 * al primer `updateMany`; el segundo, al destrabarse, ya no la encuentra en el estado de origen
 * (count 0) y no hace nada.
 *
 * DE DÓNDE SALE LA REFERENCIA: la fila de Mercado Pago guarda en `referencia` la
 * `external_reference` del pago (mercadopago-auto.ts, `ReconciliacionMovimientosMP`). Las filas
 * escritas antes guardaban el id del pago (que ya está en el `hash`): ésas —y las del banco— no
 * tienen venta que verificar y siguen como siempre.
 *
 * LÍMITE (medido en el código, no resuelto acá): la otra punta —`facturarAppointment`, «Facturar»
 * del pedido— no toma ningún candado sobre la venta. Si factura EXACTAMENTE entre la relectura y
 * el commit de esta emisión, las dos pasan. La ventana es la de una transacción; cerrarla del todo
 * pide que ambas puntas tomen el mismo candado (o un índice), y eso ya es otro cambio.
 */

import type { Prisma } from "@/generated/prisma/client";
import { createInvoiceInTx, type CreateInvoiceInput } from "@/lib/invoice-core";
import { resolverReferenciasEnTx, type DbReferencias } from "@/lib/mercadopago-referencias";
import { decisionPorVenta } from "@/plugins/mercadopago/classifier";
import { normalizarReferencia, type VentaDeReferencia } from "@/plugins/mercadopago/core-contract";

const PREFIJO_HASH_MP = "mp:";

/**
 * La `external_reference` de un movimiento de la cola, o null si no tiene (banco, pago sin
 * referencia, fila escrita antes de que se guardara). PURA.
 */
export function referenciaDeVentaDelMovimiento(mov: { hash: string; referencia: string | null }): string | null {
  if (!mov.hash.startsWith(PREFIJO_HASH_MP)) return null;
  const ref = normalizarReferencia(mov.referencia);
  const paymentId = mov.hash.slice(PREFIJO_HASH_MP.length);
  return ref && ref !== paymentId ? ref : null;
}

/** La venta YA facturada detrás del movimiento (con el motivo verdadero), o null. */
export async function ventaYaFacturadaEnTx(
  tx: DbReferencias,
  tenantId: string,
  mov: { hash: string; referencia: string | null },
): Promise<{ venta: VentaDeReferencia; motivo: string } | null> {
  const ref = referenciaDeVentaDelMovimiento(mov);
  if (!ref) return null;
  const venta = (await resolverReferenciasEnTx(tx, tenantId, [ref])).get(ref);
  if (!venta || !venta.facturada) return null;
  return { venta, motivo: decisionPorVenta(venta).motivo };
}

type TxCola = Prisma.TransactionClient;

export type ResultadoAprobacion =
  | { tipo: "aprobada" }
  | { tipo: "ya-facturada"; motivo: string }
  | { tipo: "no-esta-en-revision" };

/**
 * Aprobar un ítem de la cola (revision → auto, con los datos del comprador), salvo que su venta
 * ya esté facturada: entonces revision → no_facturable con el motivo. Compare-and-set.
 */
export async function aprobarRevisionEnTx(
  tx: TxCola,
  tenantId: string,
  movimientoId: string,
  datos: { docTipo: number; docNro: string; nombreReceptor: string | null; descripcionServicio: string | null },
): Promise<ResultadoAprobacion> {
  const mov = await tx.movimientoImportado.findFirst({
    where: { id: movimientoId, tenantId, estadoPropuesta: "revision" },
    select: { hash: true, referencia: true },
  });
  if (!mov) return { tipo: "no-esta-en-revision" };

  const ya = await ventaYaFacturadaEnTx(tx, tenantId, mov);
  if (ya) {
    const r = await tx.movimientoImportado.updateMany({
      where: { id: movimientoId, tenantId, estadoPropuesta: "revision" },
      data: { estadoPropuesta: "no_facturable", motivoRevision: ya.motivo },
    });
    return r.count > 0 ? { tipo: "ya-facturada", motivo: ya.motivo } : { tipo: "no-esta-en-revision" };
  }

  const r = await tx.movimientoImportado.updateMany({
    where: { id: movimientoId, tenantId, estadoPropuesta: "revision" },
    data: { ...datos, estadoPropuesta: "auto", motivoRevision: null },
  });
  return r.count > 0 ? { tipo: "aprobada" } : { tipo: "no-esta-en-revision" };
}

export type ResultadoEmisionMovimiento =
  | { tipo: "emitida"; invoiceId: string }
  | { tipo: "ya-facturada"; motivo: string }
  /** Otro lo tomó (doble clic, otra sesión) o ya no está `auto`: no se hizo nada. */
  | { tipo: "tomada" };

/**
 * Emite UN movimiento `auto` de la cola, en la transacción del llamador: claim auto → emitida,
 * relectura de la venta, y la factura (`createInvoiceInTx`) con su rastro en el movimiento. Si
 * algo tira, la transacción entera vuelve atrás y el movimiento queda `auto` para reintentar.
 */
export async function emitirMovimientoEnTx(
  tx: TxCola,
  tenantId: string,
  mov: { id: string; hash: string; referencia: string | null },
  factura: () => CreateInvoiceInput,
): Promise<ResultadoEmisionMovimiento> {
  // CLAIM idempotente: sólo el que pasa auto → emitida sigue. Bloquea la fila hasta el commit.
  const claim = await tx.movimientoImportado.updateMany({
    where: { id: mov.id, tenantId, estadoPropuesta: "auto" },
    data: { estadoPropuesta: "emitida" },
  });
  if (claim.count === 0) return { tipo: "tomada" };

  const ya = await ventaYaFacturadaEnTx(tx, tenantId, mov);
  if (ya) {
    await tx.movimientoImportado.updateMany({
      where: { id: mov.id, tenantId },
      data: { estadoPropuesta: "no_facturable", motivoRevision: ya.motivo },
    });
    return { tipo: "ya-facturada", motivo: ya.motivo };
  }

  const invoiceId = await createInvoiceInTx(tx, factura());
  await tx.movimientoImportado.updateMany({ where: { id: mov.id, tenantId }, data: { invoiceId } });
  return { tipo: "emitida", invoiceId };
}
