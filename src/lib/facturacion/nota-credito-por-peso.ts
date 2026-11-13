// ============================================================================
// NOTA DE CRÉDITO POR LA DEVOLUCIÓN POR PESO — la emisión (SIMULADA), en su propia transacción.
// ============================================================================
//
// La anota pendiente el ajuste (nota-credito-por-peso-core.ts, misma tx que el EGRESO). Acá se
// emite con el Core de siempre (`crearNotaDeCreditoInTx`: misma letra y receptor, FOR UPDATE de la
// factura, nunca más que el saldo) y viaja por el outbox; el despacho en modo prueba la autoriza
// con el simulador (CAE «STUB…»), sin hablar con ARCA.
//
//   · IDEMPOTENTE: candado advisory por la clave (pedido + egreso) y, bajo el candado, si ya hay
//     `nc_peso_emitida` se devuelve ESA nota. Un segundo intento no emite otra.
//   · NUNCA MÁS QUE LO FACTURADO PENDIENTE: lo devuelto se recorta al `saldoPorAnular` de la factura.
//   · SI FALLA, la devolución de la caja ya está hecha (otra tx): queda `nc_peso_pendiente` y se
//     reintenta (el próximo «Pesar y ajustar» del pedido o `reintentarNotasPorPesoPendientes`).
//   · SÓLO MODO PRUEBA: factura con CAE simulado y el negocio en stub; si no, no se emite.

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { idsDeLosNegocios } from "@/lib/cron/negocios";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import { crearNotaDeCreditoInTx, type InvoiceTx } from "@/lib/invoice-core";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { caeEsSimulado } from "@/lib/fiscal/guarda-simulado";
import { tomarClaves } from "@/lib/facturacion/cobros-facturados";
import { modoEnPantalla } from "@/lib/facturacion/modo-en-pantalla";
import {
  ACCION_NC_PESO_CERRADA,
  ACCION_NC_PESO_EMITIDA,
  ACCION_NC_PESO_INTENTO,
  ACCION_NC_PESO_PENDIENTE,
  ACCION_NC_PESO_RECHAZADA,
  ENTIDAD_NC_POR_PESO,
  importeDeLaNota,
  MAX_INTENTOS_NC_PESO,
  type NotaPorPeso,
} from "@/lib/facturacion/nota-credito-por-peso-core";

type Pendiente = { orderId: string; facturaId: string; importe: number; code: number };

function leerPendiente(changes: unknown): Pendiente | null {
  const c = (changes && typeof changes === "object" ? changes : {}) as Record<string, unknown>;
  if (typeof c.orderId !== "string" || typeof c.facturaId !== "string" || typeof c.importe !== "number") return null;
  return { orderId: c.orderId, facturaId: c.facturaId, importe: c.importe, code: Number(c.code) || 0 };
}

async function anotar(tx: InvoiceTx, tenantId: string, clave: string, action: string, changes: Record<string, unknown>) {
  await tx.auditLog.create({
    data: { tenantId, actor: "system", action, entity: ENTIDAD_NC_POR_PESO, entityId: clave, channel: "admin", changes: JSON.parse(JSON.stringify(changes)) },
  });
}

/**
 * Ventana de un intento: dentro de ella, una clave suma COMO MÁXIMO un intento fallido. Dos crones
 * que corren a la vez (o el cron y un «Pesar y ajustar» repetido) son la misma vuelta y no adelantan
 * el cierre (certificación, hallazgo BAJA). El cron corre una vez por día (vercel.json): 10 minutos
 * alcanzan para juntar corridas superpuestas sin tragarse la del día siguiente.
 */
export const VENTANA_INTENTO_NC_PESO_MS = 10 * 60 * 1000;

/** Cuándo se anotó un intento: `changes.en` (lo escribe el intento) o, en filas viejas, su `createdAt`. */
function momentoDelIntento(f: { changes: unknown; createdAt: Date }): number {
  const en = (f.changes && typeof f.changes === "object" ? (f.changes as Record<string, unknown>).en : undefined);
  const t = typeof en === "string" ? Date.parse(en) : NaN;
  return Number.isFinite(t) ? t : f.createdAt.getTime();
}

/**
 * Emite (simulada) la nota pendiente de `clave`, en la tx del llamador. Nunca lanza por un dato:
 * devuelve el estado. `null` = no hay nada anotado con esa clave en este negocio. `ahora` sólo
 * cuenta para la ventana del intento (inyectable en los tests).
 */
export async function notaDeCreditoPorPesoInTx(
  tx: InvoiceTx,
  tenantId: string,
  clave: string,
  opciones: { ahora?: Date } = {},
): Promise<NotaPorPeso | null> {
  const ahora = opciones.ahora ?? new Date();
  await tomarClaves(tx, tenantId, [clave]);
  const filas = await tx.auditLog.findMany({
    where: { tenantId, entity: ENTIDAD_NC_POR_PESO, entityId: clave },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { action: true, changes: true, createdAt: true },
  });
  const filaPendiente = filas.find((f) => f.action === ACCION_NC_PESO_PENDIENTE);
  if (!filaPendiente) return null;
  const p = leerPendiente(filaPendiente.changes);
  if (!p) {
    // Anotación ilegible: se cierra para que no acapare la cola del reintento (certificación).
    if (!filas.some((f) => f.action === ACCION_NC_PESO_CERRADA)) {
      await anotar(tx, tenantId, clave, ACCION_NC_PESO_CERRADA, { motivo: "anotación pendiente ilegible" });
    }
    return { estado: "rechazada", clave, importe: 0, motivo: "La anotación de la nota está incompleta: revisala en Facturación." };
  }
  const emitida = filas.find((f) => f.action === ACCION_NC_PESO_EMITIDA)?.changes as { notaId?: string; importe?: number } | undefined;
  if (emitida?.notaId) return { estado: "emitida", clave, importe: Number(emitida.importe) || p.importe, invoiceId: emitida.notaId, yaExistia: true };
  const cerrada = filas.find((f) => f.action === ACCION_NC_PESO_CERRADA)?.changes as { motivo?: string } | undefined;
  if (cerrada) return { estado: "rechazada", clave, importe: p.importe, motivo: String(cerrada.motivo ?? "") };

  const rechazar = async (motivo: string, definitivo: boolean, importe = p.importe): Promise<NotaPorPeso> => {
    // Un rastro de rechazo por clave (el reintento no lo repite); el cierre, sólo si es definitivo.
    if (!filas.some((f) => f.action === ACCION_NC_PESO_RECHAZADA)) {
      await anotar(tx, tenantId, clave, ACCION_NC_PESO_RECHAZADA, { orderId: p.orderId, importe, motivo, definitivo });
    }
    if (definitivo) {
      await anotar(tx, tenantId, clave, ACCION_NC_PESO_CERRADA, { motivo });
      return { estado: "rechazada", clave, importe, motivo };
    }
    // No definitivo: se cuenta el intento (manda a la clave al fondo de la cola del reintento) y, al
    // llegar a MAX_INTENTOS_NC_PESO, se cierra con el motivo para que la resuelva un humano. Bajo el
    // candado de la clave: el conteo no se pisa con otro intento simultáneo (certificación). Si ya
    // hay un intento de esta clave dentro de la ventana, es la misma vuelta: no suma ni cierra.
    const previos = filas.filter((f) => f.action === ACCION_NC_PESO_INTENTO);
    const enLaVentana = previos.some((f) => Math.abs(ahora.getTime() - momentoDelIntento(f)) < VENTANA_INTENTO_NC_PESO_MS);
    if (enLaVentana) return { estado: "rechazada", clave, importe, motivo };
    const intentos = previos.length + 1;
    await anotar(tx, tenantId, clave, ACCION_NC_PESO_INTENTO, { intento: intentos, motivo, importe, en: ahora.toISOString() });
    if (intentos >= MAX_INTENTOS_NC_PESO) {
      await anotar(tx, tenantId, clave, ACCION_NC_PESO_CERRADA, {
        motivo: `Se probó ${intentos} veces y no se pudo emitir: ${motivo}`,
        intentos,
      });
    }
    return { estado: "rechazada", clave, importe, motivo };
  };

  const factura = await tx.invoice.findFirst({
    where: { tenantId, id: p.facturaId },
    select: { status: true, cae: true, total: true },
  });
  if (!factura || factura.status !== "AUTHORIZED") return rechazar("La factura del pedido ya no está autorizada.", true);
  // Sólo simulada: una factura con CAE real nunca recibe acá una nota (la emite el contador).
  if (!caeEsSimulado(factura.cae)) return rechazar("La factura del pedido es real ante ARCA: la nota de crédito la emite tu contador.", true);

  const notas = await tx.invoice.findMany({
    where: { tenantId, comprobanteAsociadoId: p.facturaId, status: { in: ["PENDING", "AUTHORIZED"] } },
    select: { total: true },
  });
  const importe = importeDeLaNota(p.importe, Number(factura.total), sumarAlCentavo(notas.map((n) => Number(n.total))));
  if (importe <= 0) return rechazar("La factura del pedido ya está anulada entera con notas de crédito.", true, 0);

  const fecha = fechaFiscalDelDia();
  const nota = await crearNotaDeCreditoInTx(tx, {
    tenantId,
    facturaId: p.facturaId,
    importe,
    motivo: `devolución por peso real del pedido #${p.code}`,
    fecha,
    fechaDeEnvio: fecha,
  });
  if (!nota.ok) return rechazar(nota.error, /ya está anulada entera/.test(nota.error), importe);
  await anotar(tx, tenantId, clave, ACCION_NC_PESO_EMITIDA, {
    orderId: p.orderId,
    facturaId: p.facturaId,
    notaId: nota.invoiceId,
    importe,
    devuelto: p.importe,
    simulada: true,
  });
  return { estado: "emitida", clave, importe, invoiceId: nota.invoiceId, yaExistia: false };
}

export type DepsNotaPorPeso = {
  /** ¿El negocio factura en modo prueba (stub)? Si no, no se emite (queda pendiente). */
  enModoPrueba: (tenantId: string) => Promise<boolean>;
  /** El tick del despacho: el simulador le pone el CAE a la nota. Su falla no importa (lo toma el próximo). */
  procesarEnviosDelNegocio: (tenantId: string) => Promise<unknown>;
  /** El reloj de la ventana del intento. Por defecto, la hora real. */
  ahora?: () => Date;
};

/** ¿Este negocio está en modo prueba? Falla cerrada: si no se pudo leer, no. */
export async function negocioEnModoPrueba(tenantId: string): Promise<boolean> {
  const { resolverModoDelNegocio } = await import("@/lib/arca-dispatch");
  const m = modoEnPantalla(await resolverModoDelNegocio(tenantId).catch(() => null));
  return m.noFactura == null && m.modo === "stub";
}

const DEPS: DepsNotaPorPeso = {
  enModoPrueba: negocioEnModoPrueba,
  procesarEnviosDelNegocio: async (tenantId) => (await import("@/lib/arca-dispatch")).procesarEnviosDelNegocio(tenantId),
};

/** `notaDeCreditoPorPesoInTx` en su propia transacción (RLS del negocio) + el tick del simulador. */
export async function notaDeCreditoPorPeso(
  tenantId: string,
  clave: string,
  deps: DepsNotaPorPeso = DEPS,
): Promise<NotaPorPeso | null> {
  if (!(await deps.enModoPrueba(tenantId))) return null;
  const r = await tenantTransaction((tx) => notaDeCreditoPorPesoInTx(tx, tenantId, clave, { ahora: deps.ahora?.() }), { tenantId });
  if (r?.estado === "emitida" && !r.yaExistia) await deps.procesarEnviosDelNegocio(tenantId).catch(() => undefined);
  return r;
}

/**
 * Vuelve a probar las notas por peso pendientes del negocio: primero las menos intentadas y, entre
 * ellas, las más viejas. Así las que fallan una y otra vez (rechazo no definitivo) no acaparan el
 * lote y una pendiente nueva sale en la corrida siguiente (certificación, hallazgo MEDIA).
 */
export async function reintentarNotasPorPesoPendientes(
  tenantId: string,
  opciones: { limite?: number; deps?: DepsNotaPorPeso } = {},
): Promise<{ probadas: number; emitidas: number; rechazadas: number; errores: number }> {
  const deps = opciones.deps ?? DEPS;
  const r = { probadas: 0, emitidas: 0, rechazadas: 0, errores: 0 };
  if (!(await deps.enModoPrueba(tenantId))) return r;
  const claves = await tenantTransaction(
    async (tx) => {
      // Sólo las pendientes ABIERTAS (sin emitida ni cerrada de la misma clave), en la base: las
      // filas de notas ya resueltas nunca se borran, así que traer «las N más viejas» y filtrar
      // después deja ciega a la pendiente nueva en cuanto el historial pasa de N (certificación).
      const filas = await tx.$queryRaw<{ entityId: string }[]>(Prisma.sql`
        SELECT p."entityId"
          FROM "AuditLog" p
         WHERE p."tenantId" = ${tenantId}
           AND p."entity" = ${ENTIDAD_NC_POR_PESO}
           AND p."action" = ${ACCION_NC_PESO_PENDIENTE}
           AND p."entityId" IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM "AuditLog" r
              WHERE r."tenantId" = p."tenantId"
                AND r."entity" = p."entity"
                AND r."entityId" = p."entityId"
                AND r."action" IN (${ACCION_NC_PESO_EMITIDA}, ${ACCION_NC_PESO_CERRADA}))
         GROUP BY p."entityId"
         ORDER BY (SELECT count(*) FROM "AuditLog" i
                    WHERE i."tenantId" = ${tenantId}
                      AND i."entity" = ${ENTIDAD_NC_POR_PESO}
                      AND i."entityId" = p."entityId"
                      AND i."action" = ${ACCION_NC_PESO_INTENTO}) ASC,
                  min(p."createdAt") ASC, p."entityId" ASC
         LIMIT ${Math.max(1, Math.trunc(opciones.limite ?? 20))}`);
      return filas.map((f) => f.entityId);
    },
    { tenantId },
  );
  for (const clave of claves) {
    r.probadas++;
    try {
      const n = await notaDeCreditoPorPeso(tenantId, clave, deps);
      if (n?.estado === "emitida") r.emitidas++;
      else if (n?.estado === "rechazada") r.rechazadas++;
    } catch {
      r.errores++;
    }
  }
  return r;
}

/** Todos los negocios, cada uno parado en el suyo. La falla de uno no frena a los demás. */
export async function reintentarNotasPorPesoDeLosNegocios(
  ids: () => Promise<readonly string[]> = idsDeLosNegocios,
): Promise<{ negocios: number; emitidas: number; rechazadas: number; errores: number }> {
  const total = { negocios: 0, emitidas: 0, rechazadas: 0, errores: 0 };
  for (const tenantId of await ids()) {
    total.negocios++;
    try {
      const r = await reintentarNotasPorPesoPendientes(tenantId);
      total.emitidas += r.emitidas;
      total.rechazadas += r.rechazadas;
      total.errores += r.errores;
    } catch {
      total.errores++;
    }
  }
  return total;
}

/** Una nota por peso que se cerró sin emitir: la tiene que resolver un humano en Facturación. */
export type NotaPorPesoCerrada = {
  clave: string;
  motivo: string;
  fecha: Date;
  /** Número del pedido (de la anotación pendiente); null si no se pudo leer. */
  code: number | null;
  /** Lo devuelto en la caja que falta acreditar; null si no se pudo leer. */
  importe: number | null;
};

/**
 * Las notas por peso CERRADAS sin emitir del negocio (las más nuevas primero, una por clave): el
 * cierre al 5.º intento, la factura real o la anotación ilegible. Lectura por negocio, con RLS.
 */
export async function notasPorPesoCerradasSinEmitir(tenantId: string, limite = 50): Promise<NotaPorPesoCerrada[]> {
  return tenantTransaction(
    async (tx) => {
      const filas = await tx.$queryRaw<{ clave: string; motivo: string | null; fecha: Date; pendiente: unknown }[]>(Prisma.sql`
        SELECT c."entityId" AS clave,
               c."changes"->>'motivo' AS motivo,
               c."createdAt" AS fecha,
               (SELECT p."changes" FROM "AuditLog" p
                 WHERE p."tenantId" = c."tenantId" AND p."entity" = c."entity"
                   AND p."entityId" = c."entityId" AND p."action" = ${ACCION_NC_PESO_PENDIENTE}
                 ORDER BY p."createdAt" ASC, p."id" ASC LIMIT 1) AS pendiente
          FROM (SELECT DISTINCT ON (x."entityId") x.*
                  FROM "AuditLog" x
                 WHERE x."tenantId" = ${tenantId}
                   AND x."entity" = ${ENTIDAD_NC_POR_PESO}
                   AND x."action" = ${ACCION_NC_PESO_CERRADA}
                   AND x."entityId" IS NOT NULL
                 ORDER BY x."entityId", x."createdAt" ASC, x."id" ASC) c
         WHERE NOT EXISTS (
           SELECT 1 FROM "AuditLog" e
            WHERE e."tenantId" = c."tenantId" AND e."entity" = c."entity"
              AND e."entityId" = c."entityId" AND e."action" = ${ACCION_NC_PESO_EMITIDA})
         ORDER BY c."createdAt" DESC, c."entityId" ASC
         LIMIT ${Math.max(1, Math.trunc(limite))}`);
      return filas.map((f) => {
        const p = (f.pendiente && typeof f.pendiente === "object" ? f.pendiente : {}) as Record<string, unknown>;
        return {
          clave: f.clave,
          motivo: f.motivo ?? "",
          fecha: f.fecha,
          code: typeof p.code === "number" ? p.code : null,
          importe: typeof p.importe === "number" ? p.importe : null,
        };
      });
    },
    { tenantId },
  );
}
