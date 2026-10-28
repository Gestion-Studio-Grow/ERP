// ============================================================================
// INTERRUPTORES — la lectura y la escritura REALES que usa la consola (servidor).
// ============================================================================
//
// La única escritura de entity "Interruptor" (y "AppOculta") del código de la app. La llama SÓLO la action de la
// consola (src/lib/operador/interruptores-actions.ts), después de `requireOperadorParaNegocio` (sesión
// de operador + candado de CH): el trinquete
// de src/cambios/interruptores-escritura.test.ts falla si otro archivo escribe esa entidad o
// importa este módulo.
//
// NO lleva "use server": exporta un objeto con una función que recibe un tenantId, y un endpoint
// así sería una puerta para prender interruptores sin sesión de operador. `server-only`: importa
// `operatorPrisma`, que nunca puede llegar al navegador. Vive separado de la action para que el
// test lo corra contra Postgres de verdad (la action necesita la cookie del request).

import "server-only";
import { operatorPrisma } from "@/lib/operator-db";
import { operadorDuenio } from "@/lib/operator-auth";
import { moduleRegistryEnabled } from "@/modules/flags";
import { catalogo } from "@/modules/catalog";
import { mismoConjunto } from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import {
  bloquearAppsDelNegocio,
  leerInterruptoresDe,
  leerNegocioParaActivar,
  opcionesDeTransaccionConCandado,
} from "@/app/operador/(console)/tenants/[id]/negocio.server";
import { motivoDeCorte } from "@/lib/operador/corte-de-transaccion";
import {
  estadoDesdeFilas,
  filtroDeFilasDeOcultas,
  filtroDeFilasValidas,
  ocultasDesdeFilas,
  type DepsDeAppOculta,
  type DepsDeCambio,
} from "@/cambios/interruptores-core";
import { leerAppsOcultasDe } from "@/lib/operador/apps-ocultas.server";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Corre `escribir` en una transacción del operador con el GUC del negocio y EL candado de sus apps
 * (el mismo que la escritura de módulos): dos escrituras sobre el mismo negocio se esperan y la
 * segunda relee lo que dejó la primera. Un candado ocupado o una base caída → `{ motivo }`.
 */
async function conCandadoDelNegocio(
  tenantId: string,
  escribir: (tx: Tx) => Promise<boolean>,
): Promise<boolean | { motivo: string }> {
  try {
    return await operatorPrisma.$transaction(async (tx) => {
      // El GUC del negocio primero: con el rol exento no cambia nada, con `app_rls` es lo que
      // deja leer y escribir su AuditLog.
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      await bloquearAppsDelNegocio(tx, tenantId);
      return escribir(tx);
    }, opcionesDeTransaccionConCandado());
  } catch (e) {
    // Candado ocupado o base que no respondió: un motivo legible (distinto) en vez del error crudo.
    const motivo = motivoDeCorte(e);
    if (motivo) return { motivo };
    throw e;
  }
}

const SELECT_FILA = { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true } as const;

export function depsDeCambioReales(): DepsDeCambio {
  return {
    duenio: operadorDuenio(),
    registroGlobal: moduleRegistryEnabled(),
    registry: catalogo(),
    leerNegocio: leerNegocioParaActivar,
    leerEstado: async (tenantId) => (await leerInterruptoresDe(tenantId))?.estado ?? null,
    // Si otro operador está cambiando los módulos de este negocio, se espera y se relee con lo que dejó.
    escribirSiSigueIgual: (fila, condicion) =>
      conCandadoDelNegocio(fila.tenantId, async (tx) => {
        const t = await tx.tenant.findUnique({ where: { id: fila.tenantId }, select: { modules: true } });
        if (!t || !mismoConjunto(t.modules, condicion.modules)) return false;
        const ultimas = await tx.auditLog.findMany({
          where: { ...filtroDeFilasValidas(fila.tenantId), entityId: fila.entityId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: SELECT_FILA,
        });
        if (estadoDesdeFilas(ultimas)[fila.entityId].encendido !== condicion.encendido) return false;
        await tx.auditLog.create({ data: fila });
        return true;
      }),
  };
}

/** Ocultar o mostrar una app: la misma escritura condicional, bajo el mismo candado. */
export function depsDeAppOcultaReales(): DepsDeAppOculta {
  return {
    leerNegocio: async (tenantId) => {
      const n = await leerNegocioParaActivar(tenantId);
      return n ? { slug: n.slug } : null;
    },
    leerOcultas: async (tenantId) => (await leerAppsOcultasDe(tenantId))?.ocultas ?? null,
    escribirSiSigueIgual: (fila, condicion) =>
      conCandadoDelNegocio(fila.tenantId, async (tx) => {
        const ultimas = await tx.auditLog.findMany({
          where: { ...filtroDeFilasDeOcultas(fila.tenantId), entityId: fila.entityId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: SELECT_FILA,
        });
        if (ocultasDesdeFilas(ultimas).has(fila.entityId) !== condicion.oculta) return false;
        await tx.auditLog.create({ data: fila });
        return true;
      }),
  };
}
