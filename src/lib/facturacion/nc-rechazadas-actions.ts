"use server";

/**
 * #T7 · Acciones del dueño sobre una nota de crédito rechazada por ARCA (billing:manage = OWNER).
 * La lógica vive en nc-rechazadas.server.ts; acá sólo el permiso, el negocio y la transacción.
 */
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { logger } from "@/lib/logger";
import { darPorResueltoElRechazoInTx, reemitirNotaDeCreditoInTx } from "@/lib/facturacion/nc-rechazadas.server";

export type ResultadoAccionNC = { ok: true; mensaje: string } | { ok: false; error: string };

const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

export async function reemitirNotaDeCreditoAction(notaId: string): Promise<ResultadoAccionNC> {
  const user = await requireCapability("billing:manage");
  if (!ID_VALIDO.test(notaId ?? "")) return { ok: false, error: "No encontramos esa nota de crédito." };
  const tenantId = await getCurrentTenantId();
  try {
    const r = await tenantTransaction(
      (tx) => reemitirNotaDeCreditoInTx(tx, { tenantId, notaId, actor: `user:${user.id}`, fecha: fechaFiscalDelDia() }),
      { tenantId },
    );
    if (!r.ok) return r;
    revalidatePath("/admin/facturacion");
    revalidatePath("/admin/inicio");
    return { ok: true, mensaje: "Listo: la nota de crédito nueva quedó en la fila para ARCA." };
  } catch (e) {
    logger.error("facturacion", "no se pudo volver a emitir la nota de crédito rechazada", e, { tenantId, notaId });
    return { ok: false, error: "No se pudo volver a emitir. Probá de nuevo en un rato." };
  }
}

export async function darPorResueltoElRechazoAction(notaId: string, nota: string): Promise<ResultadoAccionNC> {
  const user = await requireCapability("billing:manage");
  if (!ID_VALIDO.test(notaId ?? "")) return { ok: false, error: "No encontramos esa nota de crédito." };
  const porque = (nota ?? "").trim().slice(0, 200);
  if (porque.length < 3) return { ok: false, error: "Contá en pocas palabras cómo lo resolviste (por ejemplo: «la hice en ARCA»)." };
  const tenantId = await getCurrentTenantId();
  try {
    const r = await tenantTransaction(
      (tx) => darPorResueltoElRechazoInTx(tx, { tenantId, notaId, actor: `user:${user.id}`, nota: porque }),
      { tenantId },
    );
    if (!r.ok) return r;
    revalidatePath("/admin/facturacion");
    revalidatePath("/admin/inicio");
    return { ok: true, mensaje: "Anotado: el aviso se va." };
  } catch (e) {
    logger.error("facturacion", "no se pudo dar por resuelto el rechazo de la nota de crédito", e, { tenantId, notaId });
    return { ok: false, error: "No se pudo guardar. Probá de nuevo en un rato." };
  }
}
