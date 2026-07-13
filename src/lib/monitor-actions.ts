"use server";

// Server Actions del MONITOR DE SOPORTE (control-plane, ADR-021). Guardadas por
// `requireOperator()`. La ÚNICA acción que muta algo es el reintento de despacho —
// y es IDEMPOTENTE por diseño (no duplica comprobantes, ver `reintentarEventoOutbox`).
// El resto del monitor es lectura pura (src/lib/monitor/datos.ts).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/operator-session";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { reintentarEventoOutbox, processArcaOutbox } from "@/lib/arca-dispatch";
import { COLA_LIMIT } from "@/lib/monitor/datos";
import { logger } from "@/lib/logger";

const RUTA = "/operador/monitor";

/** Arma la URL de vuelta con un mensaje de ok/error (patrón del resto de la consola). */
function volverCon(tipo: "ok" | "error", msg: string): string {
  return `${RUTA}?${tipo}=${encodeURIComponent(msg)}`;
}

/**
 * Reintenta el despacho de UN comprobante fallido/pendiente desde la pantalla.
 * IDEMPOTENTE: `reintentarEventoOutbox` solo toca eventos con `processedAt IS NULL`
 * (nunca re-despacha lo ya emitido) y el registro del CAE solo aplica a facturas
 * PENDING → jamás un segundo CAE (guardarraíl del pedido del dueño).
 */
export async function reintentarComprobante(formData: FormData): Promise<void> {
  const actor = await requireOperator();
  const eventId = String(formData.get("eventId") ?? "").trim();

  // Se resuelve el destino DENTRO del try; el redirect() va afuera (redirect lanza
  // una excepción de control de Next que no hay que atrapar como error).
  let destino: string;
  if (!eventId) {
    destino = volverCon("error", "Falta el comprobante a reintentar.");
  } else if (!isInvoicingEnabled()) {
    destino = volverCon("error", "La facturación está apagada (ARCA_INVOICING_ENABLED off). Encendela antes de reintentar.");
  } else {
    try {
      const r = await reintentarEventoOutbox(eventId);
      logger.info("monitor", "reintento de comprobante", { actor, eventId, ...r });
      if (r.procesados === 0) {
        // No estaba pendiente (ya despachado por el cron, o id inexistente): idempotente, no es error.
        destino = volverCon("ok", "Ese comprobante ya no estaba pendiente (nada que reintentar).");
      } else {
        const detalle =
          r.autorizados > 0 ? "autorizado ✓" : r.rechazados > 0 ? "rechazado por ARCA" : "sigue pendiente (reintentá más tarde)";
        destino = volverCon("ok", `Reintento hecho: ${detalle}.`);
      }
    } catch (err) {
      logger.error("monitor", "reintento falló", err, { actor, eventId });
      destino = volverCon("error", "No se pudo reintentar. Probá de nuevo en unos minutos.");
    }
  }

  revalidatePath(RUTA);
  redirect(destino);
}

/**
 * Reintenta TODOS los pendientes de la cola (drena el outbox como el cron). Mismo
 * despacho idempotente que el cron `/api/cron/arca-outbox`, disparado a mano.
 */
export async function reintentarTodosPendientes(): Promise<void> {
  const actor = await requireOperator();

  let destino: string;
  if (!isInvoicingEnabled()) {
    destino = volverCon("error", "La facturación está apagada (ARCA_INVOICING_ENABLED off). Encendela antes de reintentar.");
  } else {
    try {
      // Mismo tope que la cola que se lista (COLA_LIMIT) → "todos" cubre lo que el operador ve.
      const r = await processArcaOutbox(COLA_LIMIT);
      logger.info("monitor", "reintento masivo de la cola", { actor, ...r });
      destino = volverCon(
        "ok",
        `Cola procesada: ${r.autorizados} autorizadas · ${r.rechazados} rechazadas · ${r.fallidos} siguen fallando.`,
      );
    } catch (err) {
      logger.error("monitor", "reintento masivo falló", err, { actor });
      destino = volverCon("error", "No se pudo procesar la cola. Probá de nuevo en unos minutos.");
    }
  }

  revalidatePath(RUTA);
  redirect(destino);
}
