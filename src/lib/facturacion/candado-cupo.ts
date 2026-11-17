/**
 * El candado del CUPO mensual de facturas de un negocio (`facturita-cupo:<negocio>`).
 *
 * Lo toman la emisión manual de Factoque, la nota de crédito, los trámites, el lote del contador y,
 * desde GSG-FACT-011 (H2), la emisión AUTOMÁTICA (lote del extracto y Mercado Pago). Quien cuenta
 * el cupo lo cuenta con este candado tomado, dentro de la transacción de la factura: dos emisiones
 * a la vez no pasan las dos con el último lugar.
 *
 * Orden fijo de candados (sin abrazo mortal): `facturita-emision:*` → `facturita-cupo:<negocio>` →
 * `cobro-facturado:*` (`tomarClaves`). Nadie toma el del cupo después de una clave de cobro.
 */

import type { InvoiceTx } from "@/lib/invoice-core";

export const claveCandadoCupo = (tenantId: string) => `facturita-cupo:${tenantId}`;

/** Toma el candado del cupo hasta el fin de la transacción. */
export async function tomarCandadoDelCupo(tx: InvoiceTx, tenantId: string): Promise<void> {
  if (typeof (tx as { $executeRaw?: unknown }).$executeRaw !== "function") return; // dobles de test sin SQL
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claveCandadoCupo(tenantId)}))`;
}
