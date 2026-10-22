// ============================================================================
// SUBIR PRECIOS DE SERVICIOS — lo que corre ADENTRO de la transacción, y las lecturas de la página.
// ============================================================================
//
// Separado de la acción (aumento-servicios-actions.ts, "use server") porque un archivo "use server"
// convierte cada export en un endpoint: `aplicarAumentoServiciosEnTx` recibe el `tenantId` por
// parámetro y NO puede ser llamable desde el navegador. La acción le agrega la guardia (sólo la
// dueña), la transacción Serializable (con el reintento de `tenantTransaction`) y los mensajes.
//
// Todo va con `tenantId` en el where ADEMÁS de RLS (la tx del llamador ya tiene el negocio puesto).

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { dateStrInBusinessTz } from "@/lib/datetime";
import {
  ACCION_CAMBIO_DE_PRECIO_SERVICIO,
  ENTIDAD_SERVICIO,
  aumentoServiciosAplicable,
  filasAuditoriaAumentoServicios,
  planificarAumentoServicios,
  resumirUltimoAumentoServicios,
  whereAumentosDeServicios,
  type PedidoAumentoServicios,
  type PlanAumentoServicios,
  type ServicioParaAumento,
  type UltimoAumentoServicios,
} from "./aumento-servicios";

type Tx = Prisma.TransactionClient;

/** Los servicios del negocio (no borrados), en el orden del catálogo, leídos con la tx del llamador. */
export async function leerServiciosParaAumento(tx: Pick<Tx, "service">, tenantId: string): Promise<ServicioParaAumento[]> {
  const filas = await tx.service.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      active: true,
      categoryId: true,
      price: true,
      residentPrice: true,
      depositAmount: true,
      category: { select: { name: true, order: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return filas.map((s) => ({
    id: s.id,
    name: s.name,
    active: s.active,
    categoryId: s.categoryId,
    categoria: s.category?.name ?? null,
    price: s.price,
    residentPrice: s.residentPrice,
    depositAmount: s.depositAmount,
  }));
}

export type ResultadoAumentoServicios =
  | {
      ok: true;
      cambiados: number;
      /** Era un doble envío del mismo «Aplicar»: ya estaba aplicado y no se volvió a escribir nada. */
      yaEstaba?: true;
    }
  | {
      ok: false;
      mensaje: string;
      /** El plan que armó el servidor, cuando llegó a armarlo. */
      plan?: PlanAumentoServicios;
      /** Falta la confirmación extra de un aumento de más del 30 %. */
      pideConfirmacion?: true;
      /** Algún precio cambió desde que se abrió la vista previa: hay que volver a mirar. */
      catalogoCambio?: true;
    };

export const MENSAJE_CATALOGO_CAMBIO =
  "El catálogo cambió, volvé a mirar: alguien tocó un precio mientras mirabas. La vista previa ya está actualizada; revisala y aplicá de nuevo.";

/** Hasta cuánto atrás se busca un lote ya aplicado con la misma clave (un doble envío es de segundos). */
const VENTANA_IDEMPOTENCIA_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Relee el catálogo, rearma el plan y, si es EL MISMO que vio la dueña (misma huella) y tiene la
 * confirmación que corresponde, escribe los precios con UNA sentencia y una fila de auditoría por
 * servicio. Si las filas escritas y las registradas no coinciden con el plan, LANZA: la tx del
 * llamador se deshace entera (nada a medias).
 *
 * IDEMPOTENTE: `lote` es la clave que manda la pantalla por cada «Aplicar». Si ya hay filas de
 * auditoría de ESE lote, el aumento ya se aplicó (doble clic, reenvío, dos pestañas con la misma
 * respuesta): se contesta lo mismo sin escribir. Se mira ANTES de la huella, porque después de
 * aplicar los precios ya son otros y la huella no coincidiría.
 *
 * NO toca turnos: sólo `Service`. `Appointment.priceAtBooking` queda como estaba (CH-051).
 */
export async function aplicarAumentoServiciosEnTx(
  tx: Tx,
  args: { tenantId: string; actor: string; lote: string; pedido: PedidoAumentoServicios; huella: string; confirmado: boolean },
): Promise<ResultadoAumentoServicios> {
  const { tenantId, pedido } = args;

  const previas = await tx.auditLog.findMany({
    where: {
      tenantId,
      entity: ENTIDAD_SERVICIO,
      action: ACCION_CAMBIO_DE_PRECIO_SERVICIO,
      createdAt: { gte: new Date(Date.now() - VENTANA_IDEMPOTENCIA_MS) },
      changes: { path: ["lote", "id"], equals: args.lote },
    },
    select: { id: true },
  });
  if (previas.length > 0) return { ok: true, cambiados: previas.length, yaEstaba: true };

  const plan = planificarAumentoServicios(await leerServiciosParaAumento(tx, tenantId), pedido);
  if (!aumentoServiciosAplicable(plan)) return { ok: false, mensaje: plan.error ?? "No hay precios para subir.", plan };
  if (plan.huella !== args.huella) return { ok: false, mensaje: MENSAJE_CATALOGO_CAMBIO, plan, catalogoCambio: true };
  if (plan.pideConfirmacion && !args.confirmado) {
    return { ok: false, mensaje: "Un aumento de más del 30 % se confirma dos veces.", plan, pideConfirmacion: true };
  }

  // UNA sentencia para todos. Cada columna lleva su valor final (el de antes si no se sube), y el
  // where repite el precio de antes: si otra transacción lo cambió en el medio (no debería pasar en
  // Serializable), la fila no se escribe y el conteo de abajo deshace todo.
  const ids = plan.filas.map((f) => f.serviceId);
  const preciosAntes = plan.filas.map((f) => f.precio.antes);
  const precios = plan.filas.map((f) => f.precio.despues);
  const vecinas = plan.filas.map((f) => (f.vecina ? f.vecina.despues : null));
  const senias = plan.filas.map((f) => (f.senia ? f.senia.despues : null));
  const escritas = await tx.$executeRaw`
    UPDATE "Service" AS s SET
      "price" = v.precio,
      "residentPrice" = COALESCE(v.vecina, s."residentPrice"),
      "depositAmount" = COALESCE(v.senia, s."depositAmount"),
      "updatedAt" = now()
    FROM unnest(${ids}::text[], ${preciosAntes}::double precision[], ${precios}::double precision[], ${vecinas}::double precision[], ${senias}::double precision[])
      AS v(id, precio_antes, precio, vecina, senia)
    WHERE s."id" = v.id AND s."tenantId" = ${tenantId} AND s."deletedAt" IS NULL AND s."price" = v.precio_antes`;
  if (escritas !== plan.filas.length) {
    throw new Error(`Se esperaban ${plan.filas.length} servicios y se escribieron ${escritas}: no se guardó nada.`);
  }

  const registro = await tx.auditLog.createMany({
    data: filasAuditoriaAumentoServicios({
      tenantId,
      actor: args.actor,
      lote: { id: args.lote, porcentaje: plan.porcentaje ?? 0, redondeo: plan.redondeo, senia: plan.senia, vecina: plan.vecina },
      filas: plan.filas,
    }),
  });
  if (registro.count !== escritas) {
    throw new Error(`Se cambiaron ${escritas} precios y se registraron ${registro.count}: no se guardó nada.`);
  }
  return { ok: true, cambiados: escritas };
}

// ── Lecturas de la página (no son endpoints: las llama la página, que ya pasó la guardia) ──

/** Los servicios para la pantalla, en una transacción propia (RLS con el negocio puesto). */
export function cargarServiciosParaAumento(tenantId: string): Promise<ServicioParaAumento[]> {
  return tenantTransaction((tx) => leerServiciosParaAumento(tx, tenantId), { tenantId });
}

/** El último aumento de servicios: «hace N días (+8 %)». */
export async function cargarUltimoAumentoServicios(tenantId: string, hoy: string): Promise<UltimoAumentoServicios | null> {
  const fila = await prisma.auditLog.findFirst({
    where: whereAumentosDeServicios(tenantId),
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, changes: true },
  });
  return resumirUltimoAumentoServicios(fila ? { diaDelCambio: dateStrInBusinessTz(fila.createdAt), changes: fila.changes } : null, hoy);
}
