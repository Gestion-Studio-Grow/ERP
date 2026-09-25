// ============================================================================
// USO DEL PLAN (R3-F3) — lo que el plan incluye y lo que el negocio usa, leído de la base.
// ============================================================================
//
// Sin "use server": lo llaman el tope de usuarios (usuarios-del-plan.ts), la pantalla "Tu plan"
// (/admin/usuarios/plan, después de `requireApp("usuarios")`) y el tope de facturas automáticas.
// Todo dentro de `tenantTransaction` (RLS con el negocio puesto).

import { tenantTransaction } from "@/lib/rls";
import { filtrosFacturacionMes } from "@/lib/bancos-glue";
import type { LimitesDelNegocio } from "@/planes/limites";
import { leerLimitesEnTx } from "@/lib/limites-del-negocio-en-tx";
import type { UsoMedido } from "@/app/admin/(dashboard)/usuarios/plan/tu-plan";

// Se leen en limites-del-negocio-en-tx.ts (bancos-glue los usa sin ciclo); se reexportan para los que ya importan de acá.
export { leerLimitesEnTx, capFacturasMesDelNegocioEnTx } from "@/lib/limites-del-negocio-en-tx";

export interface TuPlanLeido {
  slug: string;
  nombre: string;
  limites: LimitesDelNegocio;
  uso: UsoMedido;
}

/**
 * Lo que muestra "Tu plan". Se cuenta sólo lo que tiene una regla de conteo clara: personas con
 * usuario activas y comprobantes del mes (el mismo conteo que el cupo de facturas de Bancos,
 * `filtrosFacturacionMes().cupo`: todo lo emitido en el mes menos lo rechazado por ARCA). Locales,
 * cuentas bancarias y cartera muestran lo que incluye el plan, sin inventar un uso.
 */
export async function leerTuPlan(tenantId: string, ahora: Date = new Date()): Promise<TuPlanLeido | null> {
  return tenantTransaction(
    async (tx): Promise<TuPlanLeido | null> => {
      const l = await leerLimitesEnTx(tx, tenantId);
      if (!l) return null;
      if (l.limites.plan === null) return { ...l, uso: {} };
      const [usuarios, delMes] = await Promise.all([
        tx.user.count({ where: { tenantId, active: true, deletedAt: null } }),
        tx.invoice.count({ where: { tenantId, ...filtrosFacturacionMes(ahora).cupo } }),
      ]);
      return { ...l, uso: { usuarios, comprobantesMes: delMes, facturasAutomaticasMes: delMes } };
    },
    { tenantId },
  );
}
