// ============================================================================
// ¿ESTE NEGOCIO TIENE LAS CUENTAS CORRIENTES PRENDIDAS? — la lectura con base (Magra, tanda 2 · 2D).
// ============================================================================
//
// Reemplaza a `cuentasCorrientesEnabled()` (la variable de deploy, igual para todos los negocios)
// en cada lugar del servidor que decide algo de plata del fiado o de los proveedores: el asiento
// del cobro y del pago en el libro, «A cuenta» en Vender y el fiado al entregar sin cobrar.
//
// La decisión es `cuentasCorrientesPrendidas` (asiento-libro.ts, pura y probada): manda el
// interruptor «cuentas-corrientes» del negocio si la consola lo tocó; si no, la variable de
// siempre. Sólo cuentan las filas de la consola (`filtroDeFilasValidas` + `estadoDesdeFilas`,
// los mismos que el resto de los interruptores): una fila forjada desde la app no prende nada.
//
// Recibe el `tenantId` (no lo saca del pedido) para que los servicios que ya lo tienen
// (`collectReceivable`, `payPayable`) decidan por ESE negocio. Lee dentro de `tenantTransaction`
// con su GUC: con RLS, el negocio sólo ve sus filas. Si la lectura falla, la variable de siempre
// (lo que pasaba antes de este cambio), y se avisa en el log.

import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { estadoDesdeFilas, filtroDeFilasValidas } from "@/cambios/interruptores-core";
import { CUENTAS_CORRIENTES } from "@/cambios/interruptores";
import { cuentasCorrientesPrendidas } from "./asiento-libro";

export async function cuentasCorrientesDe(tenantId: string): Promise<boolean> {
  if (!tenantId) return cuentasCorrientesPrendidas(null);
  try {
    const filas = await tenantTransaction(
      (tx) =>
        tx.auditLog.findMany({
          where: { ...filtroDeFilasValidas(tenantId), entityId: CUENTAS_CORRIENTES },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 20,
          select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true },
        }),
      { tenantId },
    );
    return cuentasCorrientesPrendidas(estadoDesdeFilas(filas)[CUENTAS_CORRIENTES]);
  } catch (err) {
    logger.warn("cuentas-corrientes", "no se pudo leer el interruptor del negocio; manda la variable de siempre", {
      error: err instanceof Error ? err.message : String(err),
    });
    return cuentasCorrientesPrendidas(null);
  }
}
