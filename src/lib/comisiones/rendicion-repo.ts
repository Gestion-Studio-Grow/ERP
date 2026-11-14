// RENDICIÓN DE LA PROFESIONAL QUE COBRA APARTE — persistencia tx-scoped (SQL crudo, schema-ahead).
//
// Las tablas `CobroARendir` y `RendicionProfesional` están ESCRITAS y SIN aplicar
// (prisma/pending-gate2/CH_rendicion_profesional.sql, Gate 2). No están en schema.prisma: se
// accede con SQL crudo y SIEMPRE se pregunta antes si existen (`hayRendicionesInTx`). Una consulta
// a una tabla que no existe abortaría la transacción del cobro entero; preguntar a `pg_class` no.
// Sin las tablas: el cobro de la profesional entra al libro como hoy y la pantalla no muestra nada.
//
// El negocio va EXPLÍCITO en cada WHERE e INSERT además de la RLS (la policy `tenant_isolation`
// la pone el mismo .sql): el SQL crudo no pasa por el proxy que inyecta el tenant.
//
// CONCURRENCIA de la rendición (nunca dos veces, nunca de más) — ver `registrarRendicionInTx`:
//   1. clave del formulario: pre-check y `@@unique(tenantId, idempotencyKey)` como árbitro;
//   2. FOR UPDATE de los turnos (mismo candado que la anulación de un cobro, anulacion.ts) y de
//      los cobros a rendir, en orden de id (sin deadlocks entre dos rendiciones);
//   3. reclamo condicionado (`rendicionId IS NULL`) con conteo exacto: si otra se llevó uno, se
//      deshace todo;
//   4. CHECK en la base: cobrado = entregado + retenido, ninguno negativo.

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { isFrozenDay, type DayKey } from "@/lib/caja/cierre-diario";
import type { CashMethod } from "@/lib/caja/cash-register";
import { todayInBusinessTz } from "@/lib/datetime";
import {
  comisionEstimada,
  destinoDelCobro,
  detalleDeRendicion,
  marcaDeRendicion,
  mensajeRendicionRechazada,
  validarRendicion,
  type DestinoDelCobro,
  type MotivoRendicionRechazada,
} from "./rendicion-core";

export type RendicionTx = Prisma.TransactionClient;

/** ¿Están las dos tablas? Una lectura de catálogo: nunca aborta la transacción. */
export async function hayRendicionesInTx(tx: RendicionTx): Promise<boolean> {
  const filas = await tx.$queryRaw<{ ok: boolean }[]>`
    SELECT (to_regclass('"CobroARendir"') IS NOT NULL AND to_regclass('"RendicionProfesional"') IS NOT NULL) AS ok`;
  return filas[0]?.ok === true;
}

// ── El cobro: ¿caja o a rendir? ─────────────────────────────────────────────

/**
 * Decide el destino de un cobro de turno leyendo la profesional del turno y quién cobra.
 * Sólo un actor `user:<id>` puede ser la profesional; un actor de sistema (Mercado Pago) es caja.
 */
export async function destinoDelCobroInTx(
  tx: RendicionTx,
  tenantId: string,
  i: { appointmentId: string; actor: string; method: string },
): Promise<{ destino: DestinoDelCobro; professionalId: string | null }> {
  if (!i.actor.startsWith("user:")) return { destino: "caja", professionalId: null };
  const userId = i.actor.slice("user:".length);
  const turno = await tx.appointment.findFirst({
    where: { id: i.appointmentId, tenantId },
    select: { professionalId: true, professional: { select: { cobraEnMostrador: true, user: { select: { id: true } } } } },
  });
  if (!turno) return { destino: "caja", professionalId: null };
  const destino = destinoDelCobro({
    cobraEnMostrador: turno.professional?.cobraEnMostrador,
    cobradoPorLaProfesionalDelTurno: !!userId && turno.professional?.user?.id === userId,
    method: i.method,
  });
  return { destino, professionalId: turno.professionalId };
}

export async function marcarCobroARendirInTx(
  tx: RendicionTx,
  tenantId: string,
  c: { collectionId: string; appointmentId: string; professionalId: string; monto: number; method: string },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "CobroARendir" ("id", "tenantId", "collectionId", "appointmentId", "professionalId", "monto", "method")
    VALUES (${id}, ${tenantId}, ${c.collectionId}, ${c.appointmentId}, ${c.professionalId}, ${c.monto}::numeric(14,2), ${c.method})`;
  return id;
}

// ── La rendición ────────────────────────────────────────────────────────────

export class RendicionRechazada extends Error {
  readonly motivo: MotivoRendicionRechazada | "dia-cerrado" | "sin-tabla";
  constructor(motivo: MotivoRendicionRechazada | "dia-cerrado" | "sin-tabla") {
    super(mensajeRendicionRechazada(motivo));
    this.name = "RendicionRechazada";
    this.motivo = motivo;
  }
}

export type RegistrarRendicionArgs = {
  professionalId: string;
  /** Ids de `CobroARendir` que se rinden: los que la pantalla mostró. Todo o nada. */
  cobroIds: readonly string[];
  entregado: number;
  method: CashMethod;
  idempotencyKey: string;
  nota: string | null;
  actor: string;
  /** `commissions:manage`: sólo quien liquida comisiones registra una retención. */
  puedeRetener: boolean;
  /** Último día cerrado de la caja. Obligatorio (DB-5): la rendición escribe en el libro. */
  cerradoHasta: DayKey | null;
};

export type RegistrarRendicionResult =
  | {
      estado: "registrada";
      rendicionId: string;
      cobrado: number;
      entregado: number;
      retenido: number;
      cantidad: number;
      cashMovementId: string | null;
      profesional: string;
    }
  | { estado: "duplicada"; rendicionId: string };

async function rendicionPorClave(tx: RendicionTx, tenantId: string, clave: string): Promise<string | null> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "RendicionProfesional" WHERE "tenantId" = ${tenantId} AND "idempotencyKey" = ${clave} LIMIT 1`;
  return filas[0]?.id ?? null;
}

export async function registrarRendicionInTx(
  tx: RendicionTx,
  tenantId: string,
  a: RegistrarRendicionArgs,
): Promise<RegistrarRendicionResult> {
  if (!(await hayRendicionesInTx(tx))) throw new RendicionRechazada("sin-tabla");

  const previa = await rendicionPorClave(tx, tenantId, a.idempotencyKey);
  if (previa) return { estado: "duplicada", rendicionId: previa };

  const hoy = todayInBusinessTz();
  if (a.cerradoHasta && isFrozenDay(hoy, a.cerradoHasta)) throw new RendicionRechazada("dia-cerrado");

  const ids = [...new Set(a.cobroIds.map((s) => s.trim()).filter(Boolean))].sort();
  if (ids.length === 0) throw new RendicionRechazada("sin-cobros");

  const profesional = await tx.professional.findFirst({ where: { id: a.professionalId, tenantId }, select: { name: true } });
  if (!profesional) throw new RendicionRechazada("cobro-ajeno");

  // Candado 1: los turnos de esos cobros, en orden de id. Es el mismo candado que toma la anulación
  // de un cobro: si la anulación va primero, esta rendición espera y después ve la contrapartida.
  await tx.$queryRaw`
    SELECT a."id" FROM "Appointment" a
    WHERE a."tenantId" = ${tenantId}
      AND a."id" IN (SELECT r."appointmentId" FROM "CobroARendir" r WHERE r."tenantId" = ${tenantId} AND r."id" IN (${Prisma.join(ids)}))
    ORDER BY a."id"
    FOR UPDATE OF a`;

  // Candado 2: los cobros a rendir que SIGUEN pendientes, de esta profesional y sin anular.
  // En READ COMMITTED, si otra rendición los tenía tomados, al soltar se re-evalúa el WHERE sobre
  // la versión nueva de la fila: un cobro ya rendido no vuelve.
  const pendientes = await tx.$queryRaw<{ id: string; monto: number }[]>`
    SELECT r."id", r."monto"::float8 AS "monto"
    FROM "CobroARendir" r
    WHERE r."tenantId" = ${tenantId}
      AND r."professionalId" = ${a.professionalId}
      AND r."id" IN (${Prisma.join(ids)})
      AND r."rendicionId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Collection" c
        WHERE c."tenantId" = r."tenantId" AND c."appointmentId" = r."appointmentId"
          AND c."note" LIKE ('ANULACION:' || r."collectionId" || '%')
      )
    ORDER BY r."id"
    FOR UPDATE OF r`;

  // Doble envío de la MISMA rendición que esperó los candados: la primera ya está confirmada.
  const ganadora = await rendicionPorClave(tx, tenantId, a.idempotencyKey);
  if (ganadora) return { estado: "duplicada", rendicionId: ganadora };

  const v = validarRendicion({ pendientes, idsPedidos: ids, entregado: a.entregado, puedeRetener: a.puedeRetener });
  if (!v.ok) throw new RendicionRechazada(v.motivo);

  const rendicionId = randomUUID();

  // La plata entra al libro AHORA (y no al cobrar). Un INGRESO marcado `rendicion:<id>`: el
  // libro no lo deja borrar a mano (`motivoParaNoBorrar`). Enganchado al turno de caja abierto,
  // si lo hay, para que el arqueo del efectivo lo espere. Con $0 entregado no hay asiento.
  let cashMovementId: string | null = null;
  if (v.entregado > 0) {
    const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
    const mov = await tx.cashMovement.create({
      data: {
        tenantId,
        sessionId: session?.id ?? null,
        type: "INGRESO",
        method: a.method,
        amount: v.entregado,
        reason: detalleDeRendicion(profesional.name, v.ids.length, v.retenido),
        createdBy: marcaDeRendicion(rendicionId),
      },
      select: { id: true },
    });
    cashMovementId = mov.id;
  }

  await tx.$executeRaw`
    INSERT INTO "RendicionProfesional"
      ("id", "tenantId", "professionalId", "cobrado", "entregado", "retenido", "method", "idempotencyKey", "cashMovementId", "nota", "registradaPor")
    VALUES (${rendicionId}, ${tenantId}, ${a.professionalId}, ${v.cobrado}::numeric(14,2), ${v.entregado}::numeric(14,2),
            ${v.retenido}::numeric(14,2), ${a.method}, ${a.idempotencyKey}, ${cashMovementId}, ${a.nota}, ${a.actor})`;

  const reclamados = await tx.$executeRaw`
    UPDATE "CobroARendir" SET "rendicionId" = ${rendicionId}
    WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(v.ids)}) AND "rendicionId" IS NULL`;
  if (reclamados !== v.ids.length) {
    // No debería pasar con los candados de arriba; si pasa, la tx se deshace entera (asiento incluido).
    throw new RendicionRechazada("cobro-ajeno");
  }

  return {
    estado: "registrada",
    rendicionId,
    cobrado: v.cobrado,
    entregado: v.entregado,
    retenido: v.retenido,
    cantidad: v.ids.length,
    cashMovementId,
    profesional: profesional.name,
  };
}

/** ¿El error es el choque del `@@unique(tenantId, idempotencyKey)` de la rendición? */
export function esChoqueDeClaveDeRendicion(e: unknown): boolean {
  const s = (() => {
    try {
      return `${String((e as Error)?.message ?? "")} ${JSON.stringify(e)}`;
    } catch {
      return String((e as Error)?.message ?? "");
    }
  })();
  return s.includes("RendicionProfesional_tenantId_idempotencyKey_key");
}

// ── Lectura para la pantalla de Comisiones ─────────────────────────────────

export type CobroARendirFila = {
  id: string;
  monto: number;
  method: string;
  createdAt: Date;
  startsAt: Date;
  servicio: string;
  serviceId: string | null;
  clienta: string;
};

export type ProfesionalARendir = {
  professionalId: string;
  nombre: string;
  pendientes: CobroARendirFila[];
  cobradoPendiente: number;
  comisionEstimada: number;
  /** Σ retenido en rendiciones que ninguna liquidación descontó todavía (`payoutId` NULL). */
  retenidoSinDescontar: number;
};

export type RendicionHistorial = {
  id: string;
  nombre: string;
  cobrado: number;
  entregado: number;
  retenido: number;
  method: string;
  createdAt: Date;
  cantidad: number;
};

export type LecturaRendiciones =
  | { habilitada: false }
  | { habilitada: true; profesionales: ProfesionalARendir[]; historial: RendicionHistorial[] };

export async function leerRendicionesInTx(tx: RendicionTx, tenantId: string): Promise<LecturaRendiciones> {
  if (!(await hayRendicionesInTx(tx))) return { habilitada: false };

  const [pros, cobros, retenidos, historial] = await Promise.all([
    tx.professional.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, cobraEnMostrador: true, commissionPercent: true, serviceCommissions: { select: { serviceId: true, commissionPercent: true } } },
    }),
    tx.$queryRaw<(Omit<CobroARendirFila, "serviceId"> & { serviceId: string | null; professionalId: string })[]>`
      SELECT r."id", r."professionalId", r."monto"::float8 AS "monto", r."method", r."createdAt",
             a."startsAt", a."serviceId", s."name" AS "servicio", cl."name" AS "clienta"
      FROM "CobroARendir" r
      JOIN "Appointment" a ON a."id" = r."appointmentId" AND a."tenantId" = r."tenantId"
      LEFT JOIN "Service" s ON s."id" = a."serviceId"
      LEFT JOIN "Client" cl ON cl."id" = a."clientId"
      WHERE r."tenantId" = ${tenantId} AND r."rendicionId" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Collection" c
          WHERE c."tenantId" = r."tenantId" AND c."appointmentId" = r."appointmentId"
            AND c."note" LIKE ('ANULACION:' || r."collectionId" || '%')
        )
      ORDER BY r."createdAt"`,
    tx.$queryRaw<{ professionalId: string; retenido: number }[]>`
      SELECT "professionalId", SUM("retenido")::float8 AS "retenido"
      FROM "RendicionProfesional"
      WHERE "tenantId" = ${tenantId} AND "payoutId" IS NULL AND "retenido" > 0
      GROUP BY "professionalId"`,
    tx.$queryRaw<(Omit<RendicionHistorial, "nombre" | "cantidad"> & { professionalId: string; cantidad: bigint | number })[]>`
      SELECT p."id", p."professionalId", p."cobrado"::float8 AS "cobrado", p."entregado"::float8 AS "entregado",
             p."retenido"::float8 AS "retenido", p."method", p."createdAt",
             (SELECT COUNT(*) FROM "CobroARendir" r WHERE r."tenantId" = p."tenantId" AND r."rendicionId" = p."id") AS "cantidad"
      FROM "RendicionProfesional" p
      WHERE p."tenantId" = ${tenantId}
      ORDER BY p."createdAt" DESC
      LIMIT 10`,
  ]);

  const nombre = new Map(pros.map((p) => [p.id, p.name]));
  const retenidoPor = new Map(retenidos.map((r) => [r.professionalId, Number(r.retenido)]));
  const profesionales: ProfesionalARendir[] = [];
  for (const p of pros) {
    const suyos = cobros.filter((c) => c.professionalId === p.id);
    const retenido = retenidoPor.get(p.id) ?? 0;
    if (p.cobraEnMostrador !== false && suyos.length === 0 && retenido === 0) continue;
    const pendientes: CobroARendirFila[] = suyos.map((c) => ({
      id: c.id,
      monto: Number(c.monto),
      method: c.method,
      createdAt: c.createdAt,
      startsAt: c.startsAt,
      servicio: c.servicio ?? "Servicio",
      serviceId: c.serviceId,
      clienta: c.clienta ?? "",
    }));
    const overrides = new Map(p.serviceCommissions.map((o) => [o.serviceId, o.commissionPercent]));
    profesionales.push({
      professionalId: p.id,
      nombre: p.name,
      pendientes,
      cobradoPendiente: pendientes.reduce((s, c) => s + Math.round(c.monto * 100), 0) / 100,
      comisionEstimada: comisionEstimada(pendientes, p.commissionPercent, overrides),
      retenidoSinDescontar: retenido,
    });
  }

  return {
    habilitada: true,
    profesionales,
    historial: historial.map((h) => ({ ...h, nombre: nombre.get(h.professionalId) ?? "Profesional", cantidad: Number(h.cantidad) })),
  };
}
