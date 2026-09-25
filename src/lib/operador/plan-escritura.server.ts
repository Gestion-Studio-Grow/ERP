// ============================================================================
// PLAN DEL NEGOCIO — lectura y escritura desde la consola del operador (R2-F4).
// ============================================================================
//
// La usa SÓLO src/lib/operador/plan-actions.ts, después de `requireOperadorParaNegocio`. NO lleva
// "use server": cada export de un archivo así sería un endpoint que recibe un tenantId sin sesión
// (el mismo motivo que interruptores-escritura.server.ts). `server-only` hace que importarlo desde
// un componente de cliente falle en el build.
//
// Cambiar de plan escribe tres columnas del negocio (plan, modules, profile) y nada más: las
// pantallas se prenden o se apagan, los datos quedan (`datosDelCambioDePlan`, perfil-datos.ts).
// Todo va en UNA transacción que:
//   1. toma el candado de las apps del negocio (el mismo que módulos e interruptores);
//   2. escribe SÓLO si la fila sigue con el plan, los módulos y el perfil que se leyeron;
//   3. deja la auditoría (quién, antes, después, qué gana y qué pierde) y cierra las excepciones de
//      límites vigentes, releídas con el candado tomado.
// Un fallo en cualquier paso deshace todo.

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { operatorPrisma } from "@/lib/operator-db";
import { motivoDeCorte } from "@/lib/operador/corte-de-transaccion";
import {
  bloquearAppsDelNegocio,
  leerNegocioParaActivar,
  opcionesDeTransaccionConCandado,
} from "@/app/operador/(console)/tenants/[id]/negocio.server";
import { requiereOkDelDuenio } from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import {
  MOTIVO_PLAN_OK_DEL_DUENIO,
  excepcionesVigentes,
  filasQueCierranExcepciones,
  type NegocioParaPlan,
  type VistaPreviaDePlan,
} from "@/app/operador/(console)/tenants/[id]/plan-del-negocio";
import { datosDelCambioDePlan } from "@/modules/perfil-datos";
import type { Perfil } from "@/modules/perfil";
import { PREFIJO_ACTOR_OPERADOR } from "@/cambios/interruptores";
import {
  filaDeExcepcionDeLimite,
  filtroDeExcepcionesValidas,
  type FilaDeLimite,
} from "@/planes/limites";
import type { LimiteId, PlanId, Tope } from "@/planes/catalogo";

type Tx = Prisma.TransactionClient;

/** La acción de la fila de auditoría del cambio de plan. */
export const ACCION_APLICAR_PLAN = "tenant.plan.aplicar";

/** Lo que se leyó de la fila del negocio antes de decidir: la escritura exige que siga igual. */
export interface PlanLeido {
  plan: string | null;
  modules: readonly string[];
  /** La columna `Tenant.profile` (no admite nulo en la base; `null` = no se leyó y no se compara). */
  profile: Perfil | null;
}

export type ResultadoEscrituraDePlan =
  | { tipo: "ok"; excepcionesCerradas: number }
  | { tipo: "cambio" }
  | { tipo: "rechazado"; motivo: string };

const SELECT_FILA_DE_LIMITE = {
  id: true,
  entity: true,
  entityId: true,
  action: true,
  actor: true,
  channel: true,
  changes: true,
  createdAt: true,
} as const;

async function conElNegocio(tx: Tx, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
}

async function filasDeLimitesEnTx(tx: Tx, tenantId: string): Promise<FilaDeLimite[]> {
  await conElNegocio(tx, tenantId);
  return tx.auditLog.findMany({ where: filtroDeExcepcionesValidas(tenantId), select: SELECT_FILA_DE_LIMITE });
}

/** Las filas de las excepciones de límites del negocio (se revalidan en `limitesDelNegocio`). */
export async function leerFilasDeLimites(tenantId: string): Promise<FilaDeLimite[]> {
  return operatorPrisma.$transaction((tx) => filasDeLimitesEnTx(tx, tenantId));
}

/** El negocio con todo lo que decide sus apps y las columnas del plan, o `null` si no existe. */
export async function leerNegocioParaPlan(tenantId: string): Promise<NegocioParaPlan | null> {
  const [n, columnas] = await Promise.all([
    leerNegocioParaActivar(tenantId),
    operatorPrisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, profile: true } }),
  ]);
  if (!n || !columnas) return null;
  return { ...n, plan: columnas.plan, profile: columnas.profile };
}

/**
 * Escribe el plan nuevo SÓLO si la fila sigue como se leyó, con el candado de las apps tomado, y en
 * la misma transacción deja la auditoría y cierra las excepciones de límites que estén vigentes
 * (releídas con el candado: una que se sumó mientras el operador miraba también se cierra).
 * "cambio" = alguien tocó el plan, los módulos o el perfil en el medio.
 */
export async function escribirPlanConCandado(p: {
  tenantId: string;
  leido: PlanLeido;
  previa: Extract<VistaPreviaDePlan, { ok: true }>;
  operador: string;
}): Promise<ResultadoEscrituraDePlan> {
  const { tenantId, leido, previa } = p;
  const operador = p.operador.trim();
  if (!operador) return { tipo: "rechazado", motivo: "Falta el nombre del operador. Volvé a entrar a la consola." };
  try {
    return await operatorPrisma.$transaction(async (tx): Promise<ResultadoEscrituraDePlan> => {
      await bloquearAppsDelNegocio(tx, tenantId);
      await conElNegocio(tx, tenantId);
      // El candado de CH también acá, con el slug de la base (no el de quien llama).
      const fila = await tx.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
      if (!fila) return { tipo: "cambio" };
      if (requiereOkDelDuenio(fila.slug)) return { tipo: "rechazado", motivo: MOTIVO_PLAN_OK_DEL_DUENIO };
      const r = await tx.tenant.updateMany({
        where: {
          id: tenantId,
          plan: leido.plan,
          modules: { equals: [...leido.modules] },
          ...(leido.profile === null ? {} : { profile: leido.profile }),
        },
        data: datosDelCambioDePlan(previa.despues),
      });
      if (r.count !== 1) return { tipo: "cambio" };
      const vigentes = excepcionesVigentes(fila.slug, await filasDeLimitesEnTx(tx, tenantId));
      await tx.auditLog.create({
        data: {
          tenantId,
          entity: "Tenant",
          entityId: tenantId,
          action: ACCION_APLICAR_PLAN,
          actor: `${PREFIJO_ACTOR_OPERADOR}${operador}`,
          changes: {
            antes: { plan: leido.plan, modules: [...leido.modules], profile: leido.profile },
            despues: { plan: previa.despues.plan, modules: [...previa.despues.modules], profile: previa.despues.profile },
            gana: previa.alAplicar.gana.map((a) => a.id),
            pierde: previa.alAplicar.pierde.map((a) => a.id),
            excepcionesCerradas: vigentes.map((e) => ({ limite: e.limite, plan: e.plan, valor: e.valor })),
          },
        },
      });
      const cierres = filasQueCierranExcepciones(tenantId, operador, vigentes);
      if (cierres.length > 0) await tx.auditLog.createMany({ data: cierres });
      return { tipo: "ok", excepcionesCerradas: vigentes.length };
    }, opcionesDeTransaccionConCandado());
  } catch (e) {
    const motivo = motivoDeCorte(e);
    if (motivo) return { tipo: "rechazado", motivo };
    throw e;
  }
}

/**
 * Ajusta (o vuelve al del plan) UN límite del negocio: una fila de AuditLog de la consola. Sólo si
 * el negocio sigue con el plan que vio el operador (con el candado de las apps, para no cruzarse
 * con un cambio de plan). `valor` ausente = volver al tope del plan; `null` = sin tope.
 */
export async function escribirExcepcionDeLimite(p: {
  tenantId: string;
  planVisto: PlanId;
  limite: LimiteId;
  valor?: Tope;
  operador: string;
}): Promise<{ tipo: "ok" } | { tipo: "cambio" } | { tipo: "rechazado"; motivo: string }> {
  const fila = filaDeExcepcionDeLimite({
    tenantId: p.tenantId,
    operador: p.operador,
    plan: p.planVisto,
    limite: p.limite,
    ...(p.valor === undefined ? {} : { valor: p.valor }),
  });
  try {
    return await operatorPrisma.$transaction(async (tx) => {
      await bloquearAppsDelNegocio(tx, p.tenantId);
      await conElNegocio(tx, p.tenantId);
      const t = await tx.tenant.findUnique({ where: { id: p.tenantId }, select: { plan: true, slug: true } });
      if (!t || t.plan !== p.planVisto) return { tipo: "cambio" as const };
      if (requiereOkDelDuenio(t.slug)) return { tipo: "rechazado" as const, motivo: MOTIVO_PLAN_OK_DEL_DUENIO };
      await tx.auditLog.create({ data: fila });
      return { tipo: "ok" as const };
    }, opcionesDeTransaccionConCandado());
  } catch (e) {
    const motivo = motivoDeCorte(e);
    if (motivo) return { tipo: "rechazado", motivo };
    throw e;
  }
}
