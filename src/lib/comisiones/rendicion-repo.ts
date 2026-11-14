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
//   4. CHECK en la base: cobrado = entregado + retenido, ninguno negativo, retenido = 0 (la
//      retención está apagada hasta integrarla con la liquidación, RENDICION.md §Deuda).

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { isFrozenDay, type DayKey } from "@/lib/caja/cierre-diario";
import type { CashMethod } from "@/lib/caja/cash-register";
import { todayInBusinessTz } from "@/lib/datetime";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import {
  destinoDelCobro,
  detalleDeRendicion,
  marcaDeRendicion,
  mensajeRendicionRechazada,
  validarRendicion,
  type DestinoDelCobro,
  type MotivoRendicionRechazada,
} from "./rendicion-core";

export type RendicionTx = Prisma.TransactionClient;

/**
 * ¿Están las dos tablas Y este rol puede usarlas? Una lectura de catálogo: nunca aborta la
 * transacción. Los permisos importan: si la migración la aplicó otro rol que `neondb_owner`, las
 * tablas existen pero `app_rls` no hereda los DEFAULT PRIVILEGES y el INSERT del cobro fallaría
 * (abortando el cobro entero). Sin permisos, todo sigue como hoy: el cobro entra a la caja.
 * `has_table_privilege(oid, …)` con oid NULL (tabla ausente) da NULL → false.
 */
export async function hayRendicionesInTx(tx: RendicionTx): Promise<boolean> {
  const filas = await tx.$queryRaw<{ ok: boolean }[]>`
    SELECT COALESCE(
      has_table_privilege(to_regclass('"CobroARendir"'), 'SELECT')
      AND has_table_privilege(to_regclass('"CobroARendir"'), 'INSERT')
      AND has_table_privilege(to_regclass('"CobroARendir"'), 'UPDATE')
      AND has_table_privilege(to_regclass('"RendicionProfesional"'), 'SELECT')
      AND has_table_privilege(to_regclass('"RendicionProfesional"'), 'INSERT'),
      false) AS ok`;
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

/**
 * ¿Un cobro de este actor en este turno quedaría a rendir? (profesional que cobra aparte, cobrando
 * SU turno, con las tablas habilitadas). Lo usa el cobro con producto para no mezclar: el
 * producto entraría al libro con plata que tiene la profesional (RENDICION.md §Cobro con producto).
 */
export async function cobroQuedariaARendirInTx(
  tx: RendicionTx,
  tenantId: string,
  i: { appointmentId: string; actor: string; method: string },
): Promise<boolean> {
  const d = await destinoDelCobroInTx(tx, tenantId, i);
  return d.destino === "a-rendir" && !!d.professionalId && (await hayRendicionesInTx(tx));
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

/**
 * La rendición ya registrada con esta clave de formulario, y si es LA MISMA que se pide (misma
 * profesional, mismos cobros). Un doble envío idéntico es «ya registrada» (ok); la misma clave con
 * otros cobros es un error: si se mostrara ok, esos cobros quedarían sin rendir en silencio.
 */
export async function rendicionPorClaveInTx(
  tx: RendicionTx,
  tenantId: string,
  a: { idempotencyKey: string; professionalId: string; cobroIds: readonly string[] },
): Promise<{ id: string; misma: boolean } | null> {
  const filas = await tx.$queryRaw<{ id: string; professionalId: string; cobros: string[] | null }[]>`
    SELECT p."id", p."professionalId",
           ARRAY(SELECT r."id" FROM "CobroARendir" r WHERE r."tenantId" = p."tenantId" AND r."rendicionId" = p."id" ORDER BY r."id") AS "cobros"
    FROM "RendicionProfesional" p
    WHERE p."tenantId" = ${tenantId} AND p."idempotencyKey" = ${a.idempotencyKey}
    LIMIT 1`;
  const f = filas[0];
  if (!f) return null;
  const pedidos = [...new Set(a.cobroIds.map((s) => s.trim()).filter(Boolean))].sort();
  const grabados = [...(f.cobros ?? [])].sort();
  const misma =
    f.professionalId === a.professionalId && pedidos.length === grabados.length && pedidos.every((id, k) => id === grabados[k]);
  return { id: f.id, misma };
}

async function duplicadaOReusada(
  tx: RendicionTx,
  tenantId: string,
  a: RegistrarRendicionArgs,
): Promise<{ estado: "duplicada"; rendicionId: string } | null> {
  const previa = await rendicionPorClaveInTx(tx, tenantId, a);
  if (!previa) return null;
  if (!previa.misma) throw new RendicionRechazada("clave-reusada");
  return { estado: "duplicada", rendicionId: previa.id };
}

export async function registrarRendicionInTx(
  tx: RendicionTx,
  tenantId: string,
  a: RegistrarRendicionArgs,
): Promise<RegistrarRendicionResult> {
  if (!(await hayRendicionesInTx(tx))) throw new RendicionRechazada("sin-tabla");

  const previa = await duplicadaOReusada(tx, tenantId, a);
  if (previa) return previa;

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
  const ganadora = await duplicadaOReusada(tx, tenantId, a);
  if (ganadora) return ganadora;

  const v = validarRendicion({ pendientes, idsPedidos: ids, entregado: a.entregado });
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

  // Re-chequeo en el UPDATE (foto nueva en READ COMMITTED, filas ya tomadas): un cobro anulado
  // mientras esta rendición estaba en vuelo no se rinde; si pasara, `reclamados` no cierra y se deshace todo.
  const reclamados = await tx.$executeRaw`
    UPDATE "CobroARendir" r SET "rendicionId" = ${rendicionId}
    WHERE r."tenantId" = ${tenantId} AND r."id" IN (${Prisma.join(v.ids)}) AND r."rendicionId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Collection" c
        WHERE c."tenantId" = r."tenantId" AND c."appointmentId" = r."appointmentId"
          AND c."note" LIKE ('ANULACION:' || r."collectionId" || '%')
      )`;
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

// ── Lo que falta rendir de cada turno (para la liquidación de comisiones) ───

/**
 * Turno → suma de sus `CobroARendir` SIN rendir y SIN anular (mismo criterio que la pantalla y que
 * `registrarRendicionInTx`). Un turno sin nada pendiente no aparece. Sin las tablas (o sin permisos):
 * mapa vacío, todo sigue como hoy. La regla que decide con esto: comisiones/comision-no-rendida.ts.
 *
 * `bloquear` (lo usa `settleCommissions`, Serializable): toma los turnos FOR UPDATE y sus cobros a
 * rendir FOR SHARE, en orden de id — el MISMO orden que la rendición (turnos, después cobros) y que
 * la anulación de un cobro (turno FOR UPDATE, cobro FOR SHARE), así no hay abrazo mortal:
 *  · si una rendición está en vuelo, la liquidación espera; al confirmar la rendición, el FOR SHARE
 *    sobre la fila ya actualizada aborta con 40001 y `tenantTransaction` reintenta con foto nueva;
 *  · si la liquidación va primero, la rendición espera, y la liquidación no paga lo que todavía no
 *    estaba rendido. Nunca se paga comisión de un cobro no rendido.
 */
export async function pendienteDeRendirPorTurnoInTx(
  tx: RendicionTx,
  tenantId: string,
  appointmentIds: readonly string[],
  opts: { bloquear?: boolean } = {},
): Promise<Map<string, number>> {
  const ids = [...new Set(appointmentIds)].sort();
  if (ids.length === 0 || !(await hayRendicionesInTx(tx))) return new Map();
  if (opts.bloquear) {
    await tx.$queryRaw`
      SELECT a."id" FROM "Appointment" a
      WHERE a."tenantId" = ${tenantId} AND a."id" IN (${Prisma.join(ids)})
      ORDER BY a."id"
      FOR UPDATE OF a`;
    await tx.$queryRaw`
      SELECT r."id" FROM "CobroARendir" r
      WHERE r."tenantId" = ${tenantId} AND r."appointmentId" IN (${Prisma.join(ids)})
      ORDER BY r."id"
      FOR SHARE OF r`;
  }
  const filas = await tx.$queryRaw<{ appointmentId: string; monto: number }[]>`
    SELECT r."appointmentId", SUM(r."monto")::float8 AS "monto"
    FROM "CobroARendir" r
    WHERE r."tenantId" = ${tenantId}
      AND r."appointmentId" IN (${Prisma.join(ids)})
      AND r."rendicionId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Collection" c
        WHERE c."tenantId" = r."tenantId" AND c."appointmentId" = r."appointmentId"
          AND c."note" LIKE ('ANULACION:' || r."collectionId" || '%')
      )
    GROUP BY r."appointmentId"`;
  return new Map(filas.filter((f) => Number(f.monto) > 0).map((f) => [f.appointmentId, Number(f.monto)]));
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

  const [pros, cobros, historial] = await Promise.all([
    tx.professional.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, cobraEnMostrador: true },
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
  const profesionales: ProfesionalARendir[] = [];
  for (const p of pros) {
    const suyos = cobros.filter((c) => c.professionalId === p.id);
    if (p.cobraEnMostrador !== false && suyos.length === 0) continue;
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
    profesionales.push({
      professionalId: p.id,
      nombre: p.name,
      pendientes,
      cobradoPendiente: sumarAlCentavo(pendientes.map((c) => c.monto)),
    });
  }

  return {
    habilitada: true,
    profesionales,
    historial: historial.map((h) => ({ ...h, nombre: nombre.get(h.professionalId) ?? "Profesional", cantidad: Number(h.cantidad) })),
  };
}
