"use server";

// ============================================================================
// ACCIONES COMERCIALES — contacto, permiso de mensajes y unificar fichas.
// ============================================================================
//
// Cáscara fina sobre el motor puro (src/lib/crm/*). Cada export es un ENDPOINT ("use server"):
//   · ninguno recibe el negocio por parámetro: sale del request (`getCurrentTenantId`);
//   · todo id que llega del navegador se busca CON el negocio en el `where`;
//   · devuelven un resultado, no tiran: un `throw` en una action llega a producción como un
//     error genérico, y quien lo lee es la recepcionista con la clienta en el chat.
//
// POR QUÉ LA CONSTANCIA SE ESCRIBE ACÁ Y NO CON `auditAdmin`: `auditAdmin` nunca falla (si no
// puede escribir, lo loguea y sigue), que es lo correcto para un rastro. Pero acá la fila de
// auditoría ES el dato: si no queda, la clienta vuelve a la bandeja mañana y le escriben dos
// veces, o una baja no se respeta. Así que se escribe directo y, si falla, se dice.

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { pidioBaja, permisoTrasUnificar } from "@/lib/crm/constancias";
import {
  ACCION_A_BANDEJA,
  ACCION_ALTA,
  ACCION_BAJA,
  ACCION_CONTACTO,
  ENTIDAD_CONTACTO,
  ENTIDAD_PERMISO,
  esMotivoContacto,
} from "@/lib/crm/reglas";
import { fotoParaAuditoria, idsUnicos, planUnificacion } from "@/lib/crm/unificar";

type Resultado<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const NO_QUIERE = "Pidió no recibir mensajes: no se le escribe. Si cambió de idea, se cambia en su ficha.";

/** La ficha `id` de ESTE negocio, o null. El id llega del navegador: siempre con el negocio. */
async function fichaDelNegocio(tenantId: string, id: string) {
  if (!id) return null;
  return prisma.client.findFirst({ where: { id, tenantId }, select: { id: true, name: true } });
}

async function eventosDePermiso(tenantId: string, ids: readonly string[]) {
  return prisma.auditLog.findMany({
    where: { tenantId, entity: ENTIDAD_PERMISO, entityId: { in: [...ids] } },
    select: { entity: true, action: true, entityId: true, createdAt: true },
  });
}

/** Escribe la constancia y devuelve cuándo quedó, o null si no se pudo (y lo deja en el log). */
async function escribirConstancia(entrada: {
  tenantId: string;
  actor: string;
  entity: string;
  action: string;
  entityId: string;
  changes: Prisma.InputJsonObject;
}): Promise<Date | null> {
  try {
    const fila = await prisma.auditLog.create({
      data: { ...entrada, channel: "admin" },
      select: { createdAt: true },
    });
    return fila.createdAt;
  } catch (err) {
    logger.error("crm", "no se pudo guardar la constancia", err, { entity: entrada.entity, action: entrada.action });
    return null;
  }
}

// ── Contacto 1 a 1 ───────────────────────────────────────────────────────────

/**
 * Deja constancia de que se le escribió a una clienta desde la bandeja ("contactada HH:MM").
 * Se llama al tocar el botón de WhatsApp: el sistema no sabe si el mensaje salió, sabe que se
 * abrió el chat con el texto listo. Con esto la clienta sale de la bandeja por 14 días.
 *
 * No revalida la bandeja a propósito: la fila tiene que quedarse en pantalla con su
 * "contactada HH:MM" hasta que la recepción recargue.
 */
export async function registrarContacto(clientId: string, motivo: string): Promise<Resultado<{ contactadaEl: string }>> {
  const user = await requireCapability("clients:manage");
  if (!esMotivoContacto(motivo)) return { ok: false, error: "No se reconoce el motivo del contacto." };
  const tenantId = await getCurrentTenantId();
  const id = String(clientId ?? "").trim();
  const ficha = await fichaDelNegocio(tenantId, id);
  if (!ficha) return { ok: false, error: "Esa ficha ya no existe. Recargá la bandeja." };
  // La baja se respeta en el SERVIDOR: la bandeja no la ofrece, pero la acción es un endpoint.
  if (pidioBaja(await eventosDePermiso(tenantId, [id]), id)) return { ok: false, error: NO_QUIERE };
  const el = await escribirConstancia({
    tenantId,
    actor: `user:${user.id}`,
    entity: ENTIDAD_CONTACTO,
    action: ACCION_CONTACTO,
    entityId: id,
    changes: { motivo, canal: "whatsapp-manual" },
  });
  if (!el) return { ok: false, error: "Se abrió WhatsApp, pero no quedó anotado que la contactaste. Tocá de nuevo." };
  return { ok: true, contactadaEl: el.toISOString() };
}

/** Suma una clienta de "Por recuperar" a la bandeja de hoy (va primera). */
export async function pasarABandeja(clientId: string): Promise<Resultado> {
  const user = await requireCapability("clients:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(clientId ?? "").trim();
  const ficha = await fichaDelNegocio(tenantId, id);
  if (!ficha) return { ok: false, error: "Esa ficha ya no existe. Recargá la pantalla." };
  if (pidioBaja(await eventosDePermiso(tenantId, [id]), id)) return { ok: false, error: NO_QUIERE };
  const el = await escribirConstancia({
    tenantId,
    actor: `user:${user.id}`,
    entity: ENTIDAD_CONTACTO,
    action: ACCION_A_BANDEJA,
    entityId: id,
    changes: { desde: "por-recuperar" },
  });
  if (!el) return { ok: false, error: "No se pudo sumar a la bandeja. Probá de nuevo." };
  revalidatePath("/admin/clientes/recuperar");
  revalidatePath("/admin/clientes/hoy");
  return { ok: true };
}

// ── Permiso de mensajes ──────────────────────────────────────────────────────

/**
 * "No quiere mensajes" / "Vuelve a aceptar mensajes", desde la ficha. Es la prueba de una baja
 * (Ley 25.326): la fila queda exenta de la purga de la auditoría (audit-retention.ts).
 */
export async function cambiarPermisoMensajes(formData: FormData): Promise<Resultado> {
  const user = await requireCapability("clients:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("clientId") ?? "").trim();
  const quiere = String(formData.get("quiere") ?? "");
  if (quiere !== "si" && quiere !== "no") return { ok: false, error: "Falta indicar si quiere o no recibir mensajes." };
  const ficha = await fichaDelNegocio(tenantId, id);
  if (!ficha) return { ok: false, error: "Esa ficha ya no existe." };
  const bajaAhora = pidioBaja(await eventosDePermiso(tenantId, [id]), id);
  // Sin cambio no se escribe nada: un doble clic no deja dos constancias.
  if ((quiere === "no") === bajaAhora) return { ok: true };
  const el = await escribirConstancia({
    tenantId,
    actor: `user:${user.id}`,
    entity: ENTIDAD_PERMISO,
    action: quiere === "no" ? ACCION_BAJA : ACCION_ALTA,
    entityId: id,
    changes: { fuente: "ficha", antes: bajaAhora ? ACCION_BAJA : ACCION_ALTA },
  });
  if (!el) return { ok: false, error: "No se pudo guardar. Probá de nuevo." };
  revalidatePath(`/admin/clientes/${id}`);
  revalidatePath("/admin/clientes/hoy");
  return { ok: true };
}

// ── Unificar fichas ──────────────────────────────────────────────────────────

/** ¿Está la tabla del fiado en esta base? Se pregunta ANTES de la transacción: adentro, un error aborta todo. */
async function hayTablaDeFiado(tenantId: string): Promise<boolean> {
  try {
    await prisma.accountReceivable.count({ where: { tenantId, id: "__sonda__" } });
    return true;
  } catch (e) {
    const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
    if (code === "P2021" || code === "P2022") return false;
    throw e;
  }
}

/**
 * Junta fichas duplicadas (mismo teléfono) en la que se conserva. En UNA transacción:
 *   1. vuelve a leer las fichas (si otra persona ya las unificó, no hace nada);
 *   2. mueve turnos, pedidos y fiado de las duplicadas a la que queda;
 *   3. completa en la que queda los datos que le faltaban y suma las notas (unificar.ts);
 *   4. borra las duplicadas;
 *   5. deja en la auditoría la foto de cada ficha borrada y los ids movidos, para poder
 *      deshacerlo a mano. La auditoría va ADENTRO de la transacción: sin ella no hay cómo volver.
 * Si mientras tanto se cargó un turno nuevo en una duplicada, el borrado falla por la clave
 * foránea, la transacción entera vuelve atrás y se pide reintentar.
 */
export async function unificarFichas(formData: FormData): Promise<Resultado<{ mensaje: string }>> {
  let user;
  try {
    user = await requireAppAccion("unificar-fichas");
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
    throw e;
  }
  const tenantId = await getCurrentTenantId();
  const conservaId = String(formData.get("conservaId") ?? "").trim();
  const eliminaIds = idsUnicos(formData.getAll("eliminaId")).filter((id) => id !== conservaId);
  if (!conservaId) return { ok: false, error: "Elegí qué ficha queda." };
  if (eliminaIds.length === 0) return { ok: false, error: "Elegí al menos una ficha para sumar a la que queda." };

  const actor = `user:${user.id}`;
  const [conFiado, eventos] = await Promise.all([hayTablaDeFiado(tenantId), eventosDePermiso(tenantId, [conservaId, ...eliminaIds])]);

  try {
    const r = await tenantTransaction(async (tx) => {
      const fichas = await tx.client.findMany({
        where: { tenantId, id: { in: [conservaId, ...eliminaIds] } },
        select: { id: true, name: true, phone: true, email: true, notes: true, birthDate: true, isResident: true, createdAt: true },
      });
      const conserva = fichas.find((f) => f.id === conservaId) ?? null;
      const eliminadas = fichas.filter((f) => f.id !== conservaId);
      const plan = planUnificacion(conserva, eliminadas, eliminaIds.length);
      if (!plan.ok) return plan;
      // `planUnificacion` ya rechaza la ficha que queda inexistente; esto es para el tipo.
      if (!conserva) return { ok: false as const, error: "La ficha que queda ya no existe." };

      const turnos = (await tx.appointment.findMany({ where: { tenantId, clientId: { in: eliminaIds } }, select: { id: true } })).map((t) => t.id);
      const pedidos = (await tx.order.findMany({ where: { tenantId, clientId: { in: eliminaIds } }, select: { id: true } })).map((p) => p.id);
      const fiado = conFiado
        ? (await tx.accountReceivable.findMany({ where: { tenantId, clientId: { in: eliminaIds } }, select: { id: true } })).map((d) => d.id)
        : [];

      if (turnos.length) await tx.appointment.updateMany({ where: { tenantId, id: { in: turnos } }, data: { clientId: conservaId } });
      if (pedidos.length) await tx.order.updateMany({ where: { tenantId, id: { in: pedidos } }, data: { clientId: conservaId } });
      if (fiado.length) await tx.accountReceivable.updateMany({ where: { tenantId, id: { in: fiado } }, data: { clientId: conservaId } });

      const antes: Record<string, unknown> = {};
      for (const k of Object.keys(plan.cambios) as (keyof typeof plan.cambios)[]) antes[k] = conserva[k];
      if (Object.keys(plan.cambios).length > 0) {
        await tx.client.update({ where: { id: conservaId }, data: plan.cambios });
      }
      await tx.client.deleteMany({ where: { tenantId, id: { in: eliminaIds } } });

      // El permiso de mensajes que queda es el último que expresó la persona en cualquiera de
      // sus fichas (constancias.ts). Si la última palabra estaba en una duplicada, se copia.
      const permiso = permisoTrasUnificar(eventos, conservaId, eliminaIds);
      if (permiso) {
        await tx.auditLog.create({
          data: {
            tenantId,
            actor,
            action: permiso,
            entity: ENTIDAD_PERMISO,
            entityId: conservaId,
            changes: { fuente: "unificacion", de: eliminaIds },
            channel: "admin",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actor,
          action: "unificar",
          entity: "Client",
          entityId: conservaId,
          changes: JSON.parse(
            JSON.stringify({
              conserva: { id: conserva.id, name: conserva.name, phone: conserva.phone },
              eliminadas: eliminadas.map(fotoParaAuditoria),
              movidos: { turnos, pedidos, fiado },
              cambios: { antes, despues: plan.cambios },
              ...(permiso ? { permisoCopiado: permiso } : {}),
            }),
          ),
          channel: "admin",
        },
      });

      return { ok: true as const, nombre: conserva.name, turnos: turnos.length, pedidos: pedidos.length, fiado: fiado.length, fichas: eliminadas.length };
    });
    if (!r.ok) return r;
    revalidatePath("/admin/clientes");
    revalidatePath("/admin/clientes/duplicadas");
    revalidatePath(`/admin/clientes/${conservaId}`);
    const partes = [
      `${r.turnos} ${r.turnos === 1 ? "turno" : "turnos"}`,
      `${r.pedidos} ${r.pedidos === 1 ? "pedido" : "pedidos"}`,
      ...(conFiado ? [`${r.fiado} ${r.fiado === 1 ? "deuda" : "deudas"} de fiado`] : []),
    ];
    return {
      ok: true,
      mensaje: `Listo: ${r.fichas === 1 ? "la ficha duplicada quedó sumada" : `las ${r.fichas} fichas duplicadas quedaron sumadas`} a la de ${r.nombre}. Se movieron ${partes.join(", ")}.`,
    };
  } catch (e) {
    unstable_rethrow(e);
    const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
    if (code === "P2003") {
      return { ok: false, error: "Mientras unificabas se cargó algo nuevo en una de las fichas. No se cambió nada: probá de nuevo." };
    }
    logger.error("crm", "no se pudieron unificar las fichas", e, { conservaId, eliminaIds });
    return { ok: false, error: "No se pudieron unificar las fichas. No se cambió nada: probá de nuevo en un rato." };
  }
}
