// ============================================================================
// LECTURA DEL NEGOCIO PARA LA CONSOLA — lo que decide qué apps ve, leído cross-tenant.
// ============================================================================
//
// La ficha del negocio y las actions de módulos e interruptores necesitan el mismo dato que
// usa el panel del negocio para decidir sus apps (src/apps/contexto.server.ts), pero leído
// desde la consola: con `operatorPrisma` y por id, porque acá no hay un negocio "del request".
//
// NO lleva "use server": eso publicaría cada export como endpoint, y éste recibe un
// tenantId. Lo importan sólo la página de la ficha, operator-actions.ts e
// interruptores-escritura.server.ts, detrás de `requireOperator()`. `server-only` hace que un
// import desde un client component falle en el build con un mensaje claro.

import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { operatorPrisma } from "@/lib/operator-db";
import { resolveRubroId, rubroConPerecederos } from "@/blueprints/retail/rubros";
import { moduleRegistryEnabled, profilesEnabled } from "@/modules/flags";
import type { Perfil } from "@/modules/perfil";
import { leerRedEnTx, localesDeOtrasRedes, type RedEnLaFicha } from "@/lib/multilocal/multilocal-core";
import type { FlagsDeApps, NegocioParaActivar } from "./apps-del-negocio";
import {
  ACCION_ENCENDER,
  esFilaDeInterruptorValida,
  operadorDeActor,
  type InterruptorId,
} from "@/cambios/interruptores";
import {
  estadoDesdeFilas,
  filtroDeFilasValidas,
  trabajaPorApps,
  type EstadoInterruptores,
} from "@/cambios/interruptores-core";

/**
 * Lo que decide el gate por módulo además de la fila: el flag global del deploy y el interruptor
 * "Trabaja por apps" de ESTE negocio, ya leído (`leerInterruptoresDe`).
 */
export function flagsDeApps(estado: EstadoInterruptores): FlagsDeApps {
  return { registroGlobal: moduleRegistryEnabled(), enInicioPorApps: trabajaPorApps(estado) };
}

/** Una fila del historial de interruptores de la ficha: quién (nombre del operador) y cuándo. */
export interface CambioDeInterruptor {
  id: string;
  interruptor: InterruptorId;
  encendio: boolean;
  quien: string;
  cuando: Date;
}

/**
 * Los interruptores del negocio leídos desde la consola: el estado (la última fila válida de cada
 * uno) y los últimos cambios. Va en UNA transacción del operador con el GUC del negocio, así
 * funciona con el rol exento y con `app_rls` (igual que `leerRedEnTx`). `null` = no se pudo leer:
 * la ficha lo dice y no ofrece cambiar nada.
 */
export async function leerInterruptoresDe(
  tenantId: string,
): Promise<{ estado: EstadoInterruptores; historial: CambioDeInterruptor[] } | null> {
  try {
    return await operatorPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      const select = { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true } as const;
      const [ultimas, recientes] = await Promise.all([
        tx.auditLog.findMany({
          where: filtroDeFilasValidas(tenantId),
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          distinct: ["entityId"],
          select,
        }),
        tx.auditLog.findMany({
          where: filtroDeFilasValidas(tenantId),
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 10,
          select,
        }),
      ]);
      const historial = recientes.filter(esFilaDeInterruptorValida).map((f) => ({
        id: f.id,
        interruptor: f.entityId as InterruptorId,
        encendio: f.action === ACCION_ENCENDER,
        quien: operadorDeActor(f.actor) ?? f.actor,
        cuando: f.createdAt,
      }));
      return { estado: estadoDesdeFilas(ultimas), historial };
    });
  } catch {
    return null;
  }
}

type Tx = Prisma.TransactionClient;

/**
 * EL candado de las apps de un negocio. Lo toman, dentro de su transacción, TODAS las escrituras que
 * cambian qué apps ve: los módulos (`escribirModulosConCandado`) y el interruptor "Trabaja por apps"
 * (src/lib/operador/interruptores-escritura.server.ts). Así una no decide con una foto vieja de la
 * otra: la segunda espera a que termine la primera y relee. Se suelta solo al cerrar la
 * transacción (xact), así que con el pooler de Neon en modo transacción no queda colgado.
 */
export async function bloquearAppsDelNegocio(tx: Tx, tenantId: string): Promise<void> {
  // Espera acotada: si otro operador tiene el candado más de lo razonable, se corta con un error
  // que `esCandadoOcupado` reconoce y la action lo explica, en vez de colgar la transacción.
  await tx.$executeRaw`SELECT set_config('lock_timeout', ${String(esperaDelCandadoMs())}, true)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`apps:${tenantId}`}))`;
}

/** Cuánto espera el candado de las apps de un negocio (ms). Ajustable sólo para los tests. */
function esperaDelCandadoMs(): number {
  const n = Number(process.env.CANDADO_APPS_ESPERA_MS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 8_000;
}

/** Tiempos de las transacciones que toman el candado: arrancar y terminar, con margen sobre la espera. */
export function opcionesDeTransaccionConCandado(): { maxWait: number; timeout: number } {
  return { maxWait: 5_000, timeout: esperaDelCandadoMs() + 7_000 };
}

export const CANDADO_OCUPADO =
  "Otro operador está cambiando las apps de este negocio en este momento y no terminó a tiempo. " +
  "No se guardó nada: esperá unos segundos, recargá la ficha y probá de nuevo.";

/**
 * ¿La transacción se cortó por el candado o por tiempo? `lock_timeout` de Postgres (55P03) o el
 * vencimiento de la transacción interactiva de Prisma (P2028). Cualquier otro error sigue su curso.
 */
export function esCandadoOcupado(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  const texto = e instanceof Error ? e.message : String(e);
  return code === "P2028" || /55P03|lock timeout|lock_not_available|canceling statement due to lock timeout/i.test(texto);
}

/** Los interruptores del negocio leídos DENTRO de una transacción (con el GUC del negocio). */
export async function interruptoresEnTx(tx: Tx, tenantId: string): Promise<EstadoInterruptores> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
  const filas = await tx.auditLog.findMany({
    where: filtroDeFilasValidas(tenantId),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    distinct: ["entityId"],
    select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true },
  });
  return estadoDesdeFilas(filas);
}

export type ResultadoEscrituraDeModulos = { tipo: "ok" } | { tipo: "cambio" } | { tipo: "rechazado"; motivo: string };

/**
 * Escribe la asignación nueva SÓLO si la base sigue teniendo la que se leyó, con el candado de las
 * apps del negocio tomado, y deja la auditoría en la misma transacción. `verificar` recibe los
 * interruptores leídos YA con el candado (no la foto de la pantalla) y puede frenar con un motivo:
 * la action de módulos lo usa para no sacarle apps a un negocio que trabaja por apps.
 * "cambio" = alguien cambió los módulos en el medio.
 */
export async function escribirModulosConCandado(
  tenantId: string,
  leidos: readonly string[],
  nuevos: readonly string[],
  audit: { actor: string; action: string; changes: Prisma.InputJsonValue },
  verificar?: (interruptores: EstadoInterruptores) => string | null,
): Promise<ResultadoEscrituraDeModulos> {
  try {
    return await operatorPrisma.$transaction(async (tx): Promise<ResultadoEscrituraDeModulos> => {
      await bloquearAppsDelNegocio(tx, tenantId);
      const interruptores = await interruptoresEnTx(tx, tenantId);
      const motivo = verificar?.(interruptores) ?? null;
      if (motivo) return { tipo: "rechazado", motivo };
      const r = await tx.tenant.updateMany({
        where: { id: tenantId, modules: { equals: [...leidos] } },
        data: { modules: [...nuevos] },
      });
      if (r.count !== 1) return { tipo: "cambio" };
      await tx.auditLog.create({
        data: { tenantId, entity: "Tenant", entityId: tenantId, ...audit },
      });
      return { tipo: "ok" };
    }, opcionesDeTransaccionConCandado());
  } catch (e) {
    if (esCandadoOcupado(e)) return { tipo: "rechazado", motivo: CANDADO_OCUPADO };
    throw e;
  }
}

/**
 * ¿Está aplicada la migración cárnica? La mitad "migración" de `lotesYDespieceListos`, pero por
 * la conexión del operador: la de la app corre con el negocio del request y acá no hay uno.
 * Cualquier error → false (se esconden lotes y despiece, igual que en el panel).
 */
async function carniceriaLista(): Promise<boolean> {
  try {
    const rows = await operatorPrisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'ProductBatch'`;
    return Number(rows?.[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * El perfil como lo resuelve `getActiveProfile`: `null` con el motor apagado y, si está
 * prendido, la columna del negocio con "lite" como red (la columna puede no estar aplicada).
 */
async function perfilDe(tenantId: string): Promise<Perfil | null> {
  if (!profilesEnabled()) return null;
  try {
    const t = await operatorPrisma.tenant.findUnique({ where: { id: tenantId }, select: { profile: true } });
    return t?.profile ?? "lite";
  } catch {
    return "lite";
  }
}

/** El negocio con todo lo que decide sus apps, o `null` si no existe. */
export async function leerNegocioParaActivar(tenantId: string): Promise<NegocioParaActivar | null> {
  const t = await operatorPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, blueprintId: true, modules: true },
  });
  if (!t) return null;
  const [lotesListos, perfil, vinculosActivos] = await Promise.all([carniceriaLista(), perfilDe(t.id), vinculosActivosDe(t.id)]);
  const rubroId = resolveRubroId({ slug: t.slug, blueprintId: t.blueprintId });
  return {
    id: t.id,
    slug: t.slug,
    blueprintId: t.blueprintId,
    modules: t.modules,
    // El mismo criterio que la barra: blueprint retail conocido o, si no hay, el slug.
    esMostrador: rubroId != null,
    // Lo mismo que el panel (`lotesYDespieceListos`): la migración Y un rubro que vende
    // perecederos. Sin lo segundo, la vista previa le mostraba Lotes y Despiece a Shine y a
    // A Dos Manos, que no los ven.
    carniceriaLista: lotesListos && rubroConPerecederos(rubroId),
    perfil,
    vinculosActivos,
  };
}

/**
 * Los vínculos activos del negocio (locales de su red o clientes de su cartera), para el candado
 * de Mis locales (`validarCambio`). Sin la tabla (migración pendiente) no hay vínculos que
 * cuidar; si no se pudo leer, `null` y el candado rechaza por las dudas.
 */
export async function vinculosActivosDe(tenantId: string): Promise<number | null> {
  const red = await leerRedDeLaFicha(tenantId);
  return red.estado === "ok" ? red.red.vinculosActivos : red.estado === "sin-tabla" ? 0 : null;
}

/**
 * La red de locales vista desde la ficha: los locales de este negocio (si es casa), a qué red
 * pertenece (si es local) y cuántos vínculos tiene. Se lee en UNA transacción del operador con
 * el GUC de cada negocio (`leerRedEnTx`): funciona con el rol exento y con `app_rls`.
 * `sin-tabla` = la migración de CarteraCliente no está en la base; `error` = no se pudo leer.
 * Cacheada por request: la ficha y el candado de módulos (`leerNegocioParaActivar`) la comparten.
 */
export const leerRedDeLaFicha = cache(
  async (tenantId: string): Promise<{ estado: "ok"; red: RedEnLaFicha } | { estado: "sin-tabla" } | { estado: "error" }> => {
    try {
      return { estado: "ok", red: await operatorPrisma.$transaction((tx) => leerRedEnTx(tx, tenantId)) };
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      return code === "P2021" ? { estado: "sin-tabla" } : { estado: "error" };
    }
  },
);

/**
 * De los candidatos a local de `casaId`, cuáles ya están en otra red y de qué casa (el nombre).
 * Es comodidad del formulario: si no se pudo leer, se devuelve vacío y el rechazo llega al
 * enviar, con el motivo, igual que antes.
 */
export async function candidatosEnOtraRed(ids: readonly string[], casaId: string): Promise<Map<string, string>> {
  try {
    const m = await operatorPrisma.$transaction((tx) => localesDeOtrasRedes(tx, ids, casaId));
    return new Map([...m].map(([id, casas]) => [id, casas.map((c) => c.name).join(", ")]));
  } catch {
    return new Map();
  }
}
