"use server";

// ============================================================================
// Server Actions de la PLANILLA DE CORTES — vista previa y aplicar.
// ============================================================================
//
// Cada export de este archivo es un endpoint. Por eso ninguno recibe `tenantId`: el tenant
// sale de la sesión (`getCurrentTenantId`) y la escritura va en `tenantTransaction`. La
// lógica (leer el CSV, cruzar, decidir) vive en `planilla-core.ts`, pura y testeada.
//
// Dos candados además de la capacidad: el rubro tiene que ser retail (CH no ve los botones,
// y tampoco puede llamar al endpoint a mano), y el texto tiene un tope de tamaño.
//
// "Aplicar" NO confía en la vista previa: vuelve a leer el archivo y a cruzarlo contra el
// catálogo leído DENTRO de la transacción que escribe. Lo único que usa de la vista previa
// es la huella, para negarse si el plan ya no es el que la persona vio (alguien cambió un
// precio en el medio, o el archivo es otro).

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { auditAdmin } from "@/lib/audit-core";
import { logger } from "@/lib/logger";
import type { LedgerTx } from "@/lib/stock/ledger";
import {
  MAX_BYTES,
  SELECT_CATALOGO,
  aProductoDelCatalogo,
  escribirPlan,
  planAplicable,
  planificarPlanilla,
  type PlanPlanilla,
  type ProductoDelCatalogo,
} from "@/lib/catalogo/planilla-core";

export type ResultadoVistaPrevia = { ok: true; plan: PlanPlanilla } | { ok: false; mensaje: string };

export type ResultadoAplicar =
  | { ok: true; altas: number; cambios: number }
  | { ok: false; mensaje: string; plan?: PlanPlanilla };

/** Capacidad + rubro retail. Devuelve el mensaje si no pasa; null si pasa. */
async function candado(): Promise<string | null> {
  await requireCapability("catalog:manage");
  const rubro = await getCurrentTenantRubro();
  return rubro.isRetail ? null : "La planilla de cortes es del catálogo de mostrador.";
}

function textoValido(texto: unknown): string | null {
  if (typeof texto !== "string") return "No llegó el archivo. Elegilo de nuevo.";
  if (texto.length > MAX_BYTES) return "El archivo es demasiado grande para una planilla de cortes.";
  return null;
}

// Sin export: no es endpoint. Recibe la tx para leer en la MISMA transacción que escribe.
async function leerCatalogo(tx: LedgerTx, tenantId: string): Promise<ProductoDelCatalogo[]> {
  const filas = await tx.product.findMany({
    where: { tenantId, deletedAt: null },
    select: SELECT_CATALOGO,
    orderBy: { name: "asc" },
  });
  return filas.map(aProductoDelCatalogo);
}

/** Vista previa: arma el plan y NO escribe nada. */
export async function previsualizarPlanilla(texto: string): Promise<ResultadoVistaPrevia> {
  const bloqueo = (await candado()) ?? textoValido(texto);
  if (bloqueo) return { ok: false, mensaje: bloqueo };
  const tenantId = await getCurrentTenantId();
  try {
    const catalogo = await tenantTransaction((tx) => leerCatalogo(tx, tenantId), { tenantId });
    return { ok: true, plan: planificarPlanilla(texto, catalogo) };
  } catch (err) {
    logger.error("catalogo/planilla", "no se pudo armar la vista previa", err);
    return { ok: false, mensaje: "No se pudo leer el catálogo para comparar. Probá de nuevo." };
  }
}

/**
 * Aplica la planilla: TODO o NADA, en una sola transacción. `huella` es la de la vista
 * previa que la persona aprobó; si el plan de ahora da otra, no se escribe.
 */
export async function aplicarPlanilla(texto: string, huella: string): Promise<ResultadoAplicar> {
  const bloqueo = (await candado()) ?? textoValido(texto);
  if (bloqueo) return { ok: false, mensaje: bloqueo };
  const tenantId = await getCurrentTenantId();

  let resultado: ResultadoAplicar;
  let aplicado: PlanPlanilla | null = null;
  try {
    resultado = await tenantTransaction(
      async (tx): Promise<ResultadoAplicar> => {
        const plan = planificarPlanilla(texto, await leerCatalogo(tx, tenantId));
        if (!planAplicable(plan)) {
          return {
            ok: false,
            mensaje: plan.errorGeneral ?? (plan.errores.length > 0 ? "La planilla tiene filas con error: no se aplicó nada." : "La planilla no cambia nada."),
            plan,
          };
        }
        if (plan.huella !== String(huella ?? "")) {
          return {
            ok: false,
            mensaje: "El catálogo cambió desde la vista previa (o el archivo es otro). Revisá la vista previa nueva y aplicá de nuevo.",
            plan,
          };
        }
        const escrito = await escribirPlan(tx, tenantId, plan);
        aplicado = plan;
        return { ok: true, ...escrito };
      },
      { tenantId },
    );
  } catch (err) {
    logger.error("catalogo/planilla", "no se pudo aplicar la planilla", err);
    // El conteo que no cierra es un mensaje nuestro y dice qué hacer; lo demás, no se filtra.
    const propio = err instanceof Error && err.message.startsWith("Se esperaban") ? err.message : null;
    return { ok: false, mensaje: propio ?? "No se pudo aplicar la planilla. No se guardó nada: probá de nuevo." };
  }

  if (resultado.ok && aplicado) {
    const plan: PlanPlanilla = aplicado;
    // Un aumento de precios en bloque tiene que quedar con su antes/después y su autor.
    await auditAdmin({
      action: "import",
      entity: "Product",
      changes: {
        origen: "planilla",
        altas: plan.altas.map((a) => a.data.name),
        cambios: plan.cambios.map((c) => ({
          id: c.productId,
          nombre: c.nombre,
          precio: c.precioDespues === null ? undefined : [c.precioAntes, c.precioDespues],
          controlaStock: c.controlDespues === null ? undefined : [c.controlAntes, c.controlDespues],
        })),
      },
    });
    revalidatePath("/admin/catalogo");
    revalidatePath("/admin/pedidos"); // el POS lee el precio de acá
    revalidatePath("/admin/inventario");
  }
  return resultado;
}
