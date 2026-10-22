"use server";

// ============================================================================
// Server Action de «Subir precios» de servicios (reingeniería CH, Tanda 3 · 3-D · CH-039).
// ============================================================================
//
// Es un endpoint: no recibe `tenantId` (sale del pedido) y todo lo que llega del navegador se valida
// campo por campo (`pedidoServiciosDesdeAfuera`, `claveDesdeAfuera`).
//
// LA GUARDIA. Sólo la DUEÑA (rol OWNER) sube precios (CH-052). Se exige la app `catalogo` (rol,
// módulo, rubro: la misma regla que la página), la capability `catalog:manage` y, además, el rol
// OWNER explícito: subir precios es la ÚNICA modificación de maestros que permite la reingeniería, y
// si mañana a la recepción se le da `catalog:manage` para otra cosa, esto no se tiene que abrir solo.
//
// LA ESCRITURA. «Aplicar» NO confía en la vista previa del navegador: vuelve a leer el catálogo y a
// armar el plan ADENTRO de una transacción Serializable (aumento-servicios-tx.ts). De la pantalla usa
// la huella (si no coincide, «El catálogo cambió, volvé a mirar») y la clave de idempotencia (un
// doble envío del mismo «Aplicar» no aplica dos veces). Dos «Aplicar» a la vez: Postgres aborta uno
// (40001) y `tenantTransaction` lo reintenta; el reintento ve el lote ya escrito (misma clave) o los
// precios ya cambiados (otra huella) y no escribe de nuevo.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { AppNoDisponibleError, requireAppAccion } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { esConflictoDeEscritura } from "@/lib/conflicto-de-escritura";
import { claveDesdeAfuera, pedidoServiciosDesdeAfuera } from "./aumento-servicios";
import { MENSAJE_CATALOGO_CAMBIO, aplicarAumentoServiciosEnTx, type ResultadoAumentoServicios } from "./aumento-servicios-tx";

const SOLO_LA_DUENIA = "Subir los precios lo hace sólo la dueña. Pedile que lo haga desde su usuario.";

/**
 * Sube los precios de los servicios elegidos: TODO o NADA, en una transacción, con una fila de
 * auditoría por servicio. `huella` es la del plan que vio la dueña; `confirmado`, la segunda
 * confirmación de un aumento de más del 30 %; `clave`, un id por «Aplicar» (idempotencia).
 */
export async function aplicarAumentoServicios(
  pedidoCrudo: unknown,
  huella: unknown,
  confirmado: unknown,
  clave: unknown,
): Promise<ResultadoAumentoServicios> {
  let user;
  try {
    user = await requireAppAccion("catalogo");
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, mensaje: e.message };
    throw e;
  }
  if (user.role !== "OWNER" || !roleHasCapability(user.role, "catalog:manage")) return { ok: false, mensaje: SOLO_LA_DUENIA };

  const pedido = pedidoServiciosDesdeAfuera(pedidoCrudo);
  if (!pedido) return { ok: false, mensaje: "El pedido llegó incompleto. Recargá la pantalla y volvé a armarlo." };
  const tenantId = await getCurrentTenantId();
  const lote = claveDesdeAfuera(clave) ?? randomUUID();

  let resultado: ResultadoAumentoServicios;
  try {
    resultado = await tenantTransaction(
      (tx) =>
        aplicarAumentoServiciosEnTx(tx, {
          tenantId,
          actor: `user:${user.id}`,
          lote,
          pedido,
          huella: String(huella ?? ""),
          confirmado: confirmado === true,
        }),
      { tenantId, isolationLevel: "Serializable" },
    );
  } catch (err) {
    // Agotó los reintentos por conflicto: otra persona está cambiando el catálogo ahora mismo.
    if (esConflictoDeEscritura(err)) return { ok: false, mensaje: MENSAJE_CATALOGO_CAMBIO, catalogoCambio: true };
    logger.error("catalogo/precios-servicios", "no se pudo aplicar el aumento", err);
    const propio = err instanceof Error && /^Se (esperaban|cambiaron)/.test(err.message) ? err.message : null;
    return { ok: false, mensaje: propio ?? "No se pudieron subir los precios. No se guardó nada: probá de nuevo." };
  }

  if (resultado.ok && !resultado.yaEstaba) {
    revalidatePath("/admin/catalogo", "layout"); // catálogo y subir precios
    revalidatePath("/admin/turnos", "layout"); // el alta de turnos toma el precio de acá
    revalidatePath("/"); // la vidriera muestra los precios
  }
  return resultado;
}
