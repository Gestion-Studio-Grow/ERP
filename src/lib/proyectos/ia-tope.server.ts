// ============================================================================
// Tope mensual de gasto de IA paga por negocio (Etapa 2 de MIA · T4) — la base.
//
// Flujo de cada llamada PAGA (ia.server.ts → pedirAlModelo):
//   1. `reservarGastoIA`: en la transacción del negocio y con su candado, reserva el costo MÁXIMO de la
//      llamada si lo gastado + lo que está en vuelo + lo nuevo no pasa el tope del mes. Si no entra, niega.
//   2. La llamada.
//   3. `liquidarGastoIA`: devuelve la reserva y suma lo realmente gastado, en el mes DE LA RESERVA.
// Si el proceso muere entre 1 y 3, la reserva queda tomada hasta fin de mes: cierra a favor de no gastar
// (aceptado en el diseño; GSG lo ve en la consola como «en vuelo» y puede ampliar el tope).
//
// Las llamadas gratis (Cloudflare) no miran el tope: sólo se cuentan, sin garantía (`anotarLlamadaGratis`).
// Las de GSG (soporte del operador, `tenantId` null) no pasan por acá: son gasto de GSG, sin tope.
// ============================================================================

import "server-only";
import { randomUUID } from "node:crypto";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import {
  entraEnElTope,
  costoMicroUsd,
  IA_ESPERA_ACTUALIZACION,
  mesDeIA,
  MODELO_SIN_PRECIO,
  SIN_TOPE_CARGADO,
  TOPE_ALCANZADO,
  TOPE_NO_VERIFICADO,
} from "./ia-tope-core";

// ── ¿Existen las tablas? (catálogo, SIN transacción; se recuerda sólo el sí) ───────────────────
// Mismo patrón que `hayColumnaCuotaEnInvoice` (T2): una consulta a una tabla que falta ABORTA la
// transacción en la que corre; por eso se pregunta antes. El «no» no se recuerda.
let _tablasPresentes = false;

/** ¿La base tiene `IaTope` e `IaConsumo`? Falla cerrado: sin poder preguntar, `false`. */
export async function hayTablasIa(): Promise<boolean> {
  if (_tablasPresentes) return true;
  const filas = await basePrisma
    .$queryRaw<{ n: bigint | number }[]>`SELECT count(*) AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('IaTope', 'IaConsumo')`
    .catch(() => null);
  if (filas === null) return false;
  _tablasPresentes = Number(filas[0]?.n ?? 0) === 2;
  return _tablasPresentes;
}

/** Sólo para tests: olvida el «sí» recordado. */
export function olvidarTablasIaParaTests(): void {
  _tablasPresentes = false;
}

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

const candado = (tx: Tx, tenantId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ia-tope:${tenantId}`}))`;

async function topeEnTx(tx: Tx, tenantId: string): Promise<bigint> {
  const f = await tx.$queryRaw<{ t: string }[]>`SELECT "topeMensualMicroUsd"::text AS t FROM "IaTope" WHERE "tenantId" = ${tenantId}`;
  return f[0] ? BigInt(f[0].t) : BigInt(0);
}

/** La reserva de una llamada en vuelo: se liquida en SU mes, aunque vuelva en el siguiente. */
export interface ReservaIA {
  tenantId: string;
  mes: string;
  estimado: bigint;
}

export type ResultadoReserva = { ok: true; reserva: ReservaIA } | { ok: false; error: string };

export async function reservarGastoIA(
  tenantId: string,
  x: { modelo: string; tokensEntrada: number; maxTokens: number },
  ahora: Date = new Date(),
): Promise<ResultadoReserva> {
  const estimado = costoMicroUsd(x.modelo, x.tokensEntrada, x.maxTokens);
  if (estimado === null) return { ok: false, error: MODELO_SIN_PRECIO };
  if (!(await hayTablasIa())) return { ok: false, error: IA_ESPERA_ACTUALIZACION };
  const mes = mesDeIA(ahora);
  try {
    return await tenantTransaction(
      async (tx): Promise<ResultadoReserva> => {
        await candado(tx, tenantId);
        const tope = await topeEnTx(tx, tenantId);
        if (tope <= BigInt(0)) return { ok: false, error: SIN_TOPE_CARGADO };
        await tx.$executeRaw`INSERT INTO "IaConsumo" ("id", "tenantId", "mes") VALUES (${randomUUID()}, ${tenantId}, ${mes})
          ON CONFLICT ("tenantId", "mes") DO NOTHING`;
        const [c] = await tx.$queryRaw<{ reservado: string; gastado: string }[]>`
          SELECT "reservadoMicroUsd"::text AS reservado, "gastadoMicroUsd"::text AS gastado
          FROM "IaConsumo" WHERE "tenantId" = ${tenantId} AND "mes" = ${mes} FOR UPDATE`;
        if (!c) return { ok: false, error: TOPE_NO_VERIFICADO };
        const gastado = BigInt(c.gastado);
        const reservado = BigInt(c.reservado);
        if (!entraEnElTope({ tope, gastado, reservado, estimado })) return { ok: false, error: TOPE_ALCANZADO(gastado + reservado, tope) };
        await tx.$executeRaw`UPDATE "IaConsumo"
          SET "reservadoMicroUsd" = "reservadoMicroUsd" + ${estimado.toString()}::bigint, "llamadas" = "llamadas" + 1
          WHERE "tenantId" = ${tenantId} AND "mes" = ${mes}`;
        return { ok: true, reserva: { tenantId, mes, estimado } };
      },
      { tenantId },
    );
  } catch (e) {
    console.error("[proyectos/ia-tope] no se pudo reservar", (e as Error)?.message);
    return { ok: false, error: TOPE_NO_VERIFICADO };
  }
}

/**
 * Devuelve la reserva y suma lo gastado (en micro-dólares). No tira: si falla, la reserva queda tomada
 * (a favor de no gastar) y se anota en el log.
 *
 * DEUDA (cert. T4, BAJA): no es idempotente. Liquidar DOS veces la misma reserva resta su estimado dos
 * veces del «en vuelo» y libera lugar que es de otra llamada todavía en curso (el GREATEST sólo evita el
 * negativo). Hoy el único llamador (`pedirAlModelo`) liquida una sola vez por reserva; cerrarlo de verdad
 * pide una fila por reserva (id único, liquidada sí/no) en vez del acumulado.
 */
export async function liquidarGastoIA(reserva: ReservaIA, gasto: bigint): Promise<void> {
  const real = gasto < BigInt(0) ? BigInt(0) : gasto;
  try {
    await tenantTransaction(
      async (tx) => {
        await candado(tx, reserva.tenantId);
        await tx.$executeRaw`UPDATE "IaConsumo"
          SET "reservadoMicroUsd" = GREATEST("reservadoMicroUsd" - ${reserva.estimado.toString()}::bigint, 0),
              "gastadoMicroUsd" = "gastadoMicroUsd" + ${real.toString()}::bigint
          WHERE "tenantId" = ${reserva.tenantId} AND "mes" = ${reserva.mes}`;
      },
      { tenantId: reserva.tenantId },
    );
  } catch (e) {
    console.error("[proyectos/ia-tope] no se pudo liquidar: la reserva queda tomada", (e as Error)?.message);
  }
}

/** Cuenta una llamada gratis. Sin garantía: si falla o faltan las tablas, no pasa nada. */
export async function anotarLlamadaGratis(tenantId: string, ahora: Date = new Date()): Promise<void> {
  try {
    if (!(await hayTablasIa())) return;
    const mes = mesDeIA(ahora);
    await tenantTransaction(
      (tx) => tx.$executeRaw`INSERT INTO "IaConsumo" ("id", "tenantId", "mes", "llamadasGratis") VALUES (${randomUUID()}, ${tenantId}, ${mes}, 1)
        ON CONFLICT ("tenantId", "mes") DO UPDATE SET "llamadasGratis" = "IaConsumo"."llamadasGratis" + 1`,
      { tenantId },
    );
  } catch {
    // best-effort
  }
}

export interface ConsumoIA {
  mes: string;
  tope: bigint;
  gastado: bigint;
  reservado: bigint;
  llamadas: number;
  llamadasGratis: number;
}

/** Tope y consumo del mes, con el RLS del negocio. null si faltan las tablas o no se pudo leer. */
export async function consumoDelMes(tenantId: string, ahora: Date = new Date()): Promise<ConsumoIA | null> {
  if (!(await hayTablasIa())) return null;
  const mes = mesDeIA(ahora);
  try {
    return await tenantTransaction(
      async (tx) => {
        const tope = await topeEnTx(tx, tenantId);
        const [c] = await tx.$queryRaw<{ reservado: string; gastado: string; llamadas: number; gratis: number }[]>`
          SELECT "reservadoMicroUsd"::text AS reservado, "gastadoMicroUsd"::text AS gastado, "llamadas", "llamadasGratis" AS gratis
          FROM "IaConsumo" WHERE "tenantId" = ${tenantId} AND "mes" = ${mes}`;
        return {
          mes,
          tope,
          gastado: c ? BigInt(c.gastado) : BigInt(0),
          reservado: c ? BigInt(c.reservado) : BigInt(0),
          llamadas: c ? Number(c.llamadas) : 0,
          llamadasGratis: c ? Number(c.gratis) : 0,
        };
      },
      { tenantId },
    );
  } catch {
    return null;
  }
}

/** El rol de la conexión no puede escribir `IaTope` (42501): ver `guardarTopeIA`. */
export const CONSOLA_SIN_PERMISO_TOPE =
  "La conexión de la consola no tiene permiso para fijar el tope de IA. Hace falta que OPERATOR_DATABASE_URL use un rol con escritura sobre IaTope (lo decide el dueño).";

const sinPermiso = (e: unknown): boolean => {
  const err = e as { code?: unknown; meta?: { code?: unknown; driverAdapterError?: { cause?: { code?: unknown } } }; message?: unknown };
  return (
    err?.code === "42501" ||
    err?.meta?.code === "42501" ||
    err?.meta?.driverAdapterError?.cause?.code === "42501" ||
    (typeof err?.message === "string" && /permission denied/i.test(err.message))
  );
};

/**
 * GSG fija el tope mensual de un negocio (consola del operador; la guardia de operador ya pasó).
 * Queda en el registro de auditoría del negocio, en la misma transacción.
 *
 * Va por la conexión de la CONSOLA (`operatorPrisma`, parada en el negocio con `enElNegocio`), no por la
 * de la app: la migración le deja a `app_rls` sólo SELECT sobre `IaTope`, así un negocio no puede subirse
 * su propio tope ni con un error del código. Si la consola también conecta como `app_rls` (hoy, en
 * producción, sin medir: ENG-204), esto falla cerrado con `CONSOLA_SIN_PERMISO_TOPE` y la IA paga sigue
 * negada (tope 0). Darle a la consola un rol propio con ese permiso es decisión del dueño.
 */
export async function guardarTopeIA(x: { tenantId: string; topeMicroUsd: bigint; operador: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (x.topeMicroUsd < BigInt(0)) return { ok: false, error: "El tope no puede ser negativo." };
  if (!(await hayTablasIa())) return { ok: false, error: IA_ESPERA_ACTUALIZACION };
  try {
    // Import diferido: la ruta de la app (ia.server.ts) no arma el cliente de la consola si nunca lo usa.
    const { enElNegocio } = await import("@/lib/operator-db");
    return await enElNegocio(x.tenantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ia-tope:${x.tenantId}`}))`;
      const f = await tx.$queryRaw<{ t: string }[]>`SELECT "topeMensualMicroUsd"::text AS t FROM "IaTope" WHERE "tenantId" = ${x.tenantId}`;
      const antes = f[0] ? BigInt(f[0].t) : BigInt(0);
      await tx.$executeRaw`INSERT INTO "IaTope" ("tenantId", "topeMensualMicroUsd", "actualizadoPor", "updatedAt")
        VALUES (${x.tenantId}, ${x.topeMicroUsd.toString()}::bigint, ${x.operador}, now())
        ON CONFLICT ("tenantId") DO UPDATE SET "topeMensualMicroUsd" = EXCLUDED."topeMensualMicroUsd",
          "actualizadoPor" = EXCLUDED."actualizadoPor", "updatedAt" = now()`;
      await tx.auditLog.create({
        data: {
          tenantId: x.tenantId,
          actor: `operator:${x.operador}`,
          action: "ia_tope_mensual",
          entity: "IaTope",
          entityId: x.tenantId,
          channel: "admin",
          changes: { antesMicroUsd: antes.toString(), despuesMicroUsd: x.topeMicroUsd.toString() },
        },
        select: { id: true },
      });
      return { ok: true as const };
    });
  } catch (e) {
    console.error("[proyectos/ia-tope] no se pudo guardar el tope", (e as Error)?.message);
    if (sinPermiso(e)) return { ok: false, error: CONSOLA_SIN_PERMISO_TOPE };
    return { ok: false, error: "No se pudo guardar el tope. Probá de nuevo." };
  }
}
