"use server";

// ============================================================================
// Carnicería — CADENA DE FRÍO: anotar una lectura y guardar el rango del negocio.
// ============================================================================
//
// Guardia como etiqueta-paquete-actions.ts: `requireAppAccion("lotes-y-vencimientos")` (rol,
// módulo, rubro de perecederos y migración cárnica). Además, antes de escribir, se pregunta por
// la tabla RegistroFrio (Gate 2 pendiente): sin ella, ni se intenta.
//   · Anotar: quien recibe la mercadería (`stock:receive`, como los lotes). Idempotente: el
//     formulario trae un id generado al dibujarse; un doble envío no duplica la lectura.
//   · El rango: el dueño (`catalog:manage`, como la etiqueta), en la config de la caja.
// La LECTURA de las lecturas vive en cadena-frio-loader.ts (sin "use server": no es endpoint).

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { permisoEfectivo } from "@/lib/capabilities";
import { logger } from "@/lib/logger";
import { motivoDelRechazoDelAlta } from "@/lib/order-core";
import { Prisma } from "@/generated/prisma/client";
import { guardarRangoFrioEnTx } from "@/lib/supermercado/config-repo";
import { fmtTemperatura, validarLectura, validarRangoFrio } from "./cadena-frio";
import { migracionFrioAplicada } from "./schema-probe";
import { motivoDelError } from "./errores";

const FRIO_PATH = "/admin/lotes/frio";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EstadoFrio = null | { ok: true; mensaje: string } | { ok: false; error: string };

/** Anota una lectura de temperatura. Devuelve qué pasó; nunca se traga un error. */
export async function registrarLecturaFrio(_prev: EstadoFrio, formData: FormData): Promise<EstadoFrio> {
  try {
    const user = await requireAppAccion("lotes-y-vencimientos");
    if (!permisoEfectivo(user, "stock:receive")) {
      return { ok: false, error: "Tu usuario no puede anotar temperaturas. Pedíselo a la dueña o al dueño." };
    }
    if (!(await migracionFrioAplicada())) {
      return { ok: false, error: "La cadena de frío todavía no está habilitada en este negocio: falta preparar la base. Avisale a GSG." };
    }
    const id = String(formData.get("id") ?? "").trim();
    if (!UUID.test(id)) return { ok: false, error: "No se entendió el formulario. Recargá la pantalla y anotá de nuevo." };
    const v = validarLectura({ equipo: formData.get("equipo"), temperatura: formData.get("temperatura"), nota: formData.get("nota") });
    if (!v.ok) return v;
    const { equipo, temperaturaC, nota } = v.valor;

    const tenantId = await getCurrentTenantId();
    const actor = `user:${user.id}`;
    // La lectura y su auditoría van juntas en la misma transacción (certificación T5, O4): si falla la
    // auditoría, la lectura se revierte y el reintento la anota de nuevo, en vez de decir «ya estaba».
    const resultado = await tenantTransaction(
      async (tx) => {
        const insertadas = await tx.$executeRaw`
          INSERT INTO "RegistroFrio" ("id","tenantId","equipo","temperaturaC","medidoPor","nota")
          VALUES (${id}, ${tenantId}, ${equipo}, ${temperaturaC}, ${actor}, ${nota})
          ON CONFLICT ("id") DO NOTHING`;
        if (insertadas === 0) {
          // Repetida sólo si la fila es de este negocio (O1); si el id es de otro, no se confirma nada.
          const propia = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "RegistroFrio" WHERE "id" = ${id} AND "tenantId" = ${tenantId}`;
          return propia.length > 0 ? ("repetida" as const) : ("choque" as const);
        }
        await tx.auditLog.create({
          data: {
            tenantId,
            actor,
            action: "create",
            entity: "RegistroFrio",
            entityId: id,
            changes: { equipo, temperaturaC, conNota: !!nota },
            channel: "admin",
          },
        });
        return "nueva" as const;
      },
      { tenantId },
    );
    if (resultado === "repetida") return { ok: true, mensaje: "Esa lectura ya estaba anotada." };
    if (resultado === "choque") return { ok: false, error: "No se entendió el formulario. Recargá la pantalla y anotá de nuevo." };
    revalidatePath(FRIO_PATH);

    return { ok: true, mensaje: `Anotado: ${equipo} a ${fmtTemperatura(temperaturaC)}.` };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AppNoDisponibleError) return { ok: false, error: err.message };
    if (motivoDelError(err) === "sin-migracion") {
      return { ok: false, error: "La cadena de frío todavía no está habilitada en este negocio: falta preparar la base. Avisale a GSG." };
    }
    logger.error("cadena-frio", "no se pudo anotar la lectura", err);
    return { ok: false, error: "No se pudo anotar la temperatura. Probá de nuevo; si sigue pasando, avisale a GSG." };
  }
}

/** «Guardar» el rango de temperatura del negocio (min y max en °C). */
export async function guardarRangoFrioDelNegocio(_prev: EstadoFrio, formData: FormData): Promise<EstadoFrio> {
  let userId: string;
  try {
    const user = await requireAppAccion("lotes-y-vencimientos");
    if (!permisoEfectivo(user, "catalog:manage")) {
      return { ok: false, error: "El rango de temperatura lo cambia el dueño del negocio." };
    }
    userId = user.id;
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
    throw e;
  }
  const v = validarRangoFrio({ minC: String(formData.get("minC") ?? ""), maxC: String(formData.get("maxC") ?? "") });
  if (!v.ok) return v;
  const tenantId = await getCurrentTenantId();
  const versionLeida = String(formData.get("version") ?? "") || null;
  try {
    await tenantTransaction(
      (tx) => guardarRangoFrioEnTx(tx, tenantId, { rangoFrio: v.valor, actor: `user:${userId}`, versionLeida }),
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    const motivo = motivoDelRechazoDelAlta(err);
    if (motivo !== null) return { ok: false, error: motivo };
    throw err;
  }
  revalidatePath(FRIO_PATH);
  // La config de la caja ES una fila de AuditLog: el cambio ya queda auditado con su actor.
  return { ok: true, mensaje: `Listo: el rango queda de ${fmtTemperatura(v.valor.minC)} a ${fmtTemperatura(v.valor.maxC)}.` };
}
