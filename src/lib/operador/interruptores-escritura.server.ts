// ============================================================================
// INTERRUPTORES — la lectura y la escritura REALES que usa la consola (servidor).
// ============================================================================
//
// La única escritura de entity "Interruptor" del código de la app. La llama SÓLO la action de la
// consola (src/lib/operador/interruptores-actions.ts), después de `requireOperator()`: el trinquete
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
  CANDADO_OCUPADO,
  esCandadoOcupado,
  leerInterruptoresDe,
  leerNegocioParaActivar,
  opcionesDeTransaccionConCandado,
} from "@/app/operador/(console)/tenants/[id]/negocio.server";
import { estadoDesdeFilas, filtroDeFilasValidas, type DepsDeCambio } from "@/cambios/interruptores-core";

export function depsDeCambioReales(): DepsDeCambio {
  return {
    duenio: operadorDuenio(),
    registroGlobal: moduleRegistryEnabled(),
    registry: catalogo(),
    leerNegocio: leerNegocioParaActivar,
    leerEstado: async (tenantId) => (await leerInterruptoresDe(tenantId))?.estado ?? null,
    escribirSiSigueIgual: async (fila, condicion) => {
      try {
        return await operatorPrisma.$transaction(async (tx) => {
          // El GUC del negocio primero: con el rol exento no cambia nada, con `app_rls` es lo que
          // deja leer y escribir su AuditLog.
          await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${fila.tenantId}, true)`;
          // El mismo candado que la escritura de módulos: si otro operador está cambiando los
          // módulos de este negocio, se espera y se relee con lo que dejó.
          await bloquearAppsDelNegocio(tx, fila.tenantId);
          const t = await tx.tenant.findUnique({ where: { id: fila.tenantId }, select: { modules: true } });
          if (!t || !mismoConjunto(t.modules, condicion.modules)) return false;
          const ultimas = await tx.auditLog.findMany({
            where: { ...filtroDeFilasValidas(fila.tenantId), entityId: fila.entityId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true },
          });
          if (estadoDesdeFilas(ultimas)[fila.entityId].encendido !== condicion.encendido) return false;
          await tx.auditLog.create({ data: fila });
          return true;
        }, opcionesDeTransaccionConCandado());
      } catch (e) {
        // Si el candado no se pudo tomar a tiempo, un motivo legible en vez del error crudo.
        if (esCandadoOcupado(e)) return { motivo: CANDADO_OCUPADO };
        throw e;
      }
    },
  };
}
