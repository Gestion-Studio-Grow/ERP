/**
 * ¿Qué ve ESTE negocio del módulo de Contabilidad + Control de gestión? (T0, GSG-CTRL-001)
 *
 * 1. El interruptor «contabilidad» (AuditLog, src/cambios/interruptores.ts). Apagado → OCULTO y
 *    no se toca ninguna tabla contable: cero rastro, nada que pueda romper.
 * 2. Prendido: una sonda mínima de las tablas y columnas de las olas 1 y 2. Si falta alguna
 *    (P2021/P2022) → MIGRACION_PENDIENTE, que la pantalla muestra como aviso, nunca como error.
 *
 * Cada paso en su propia transacción: una sonda que falla aborta la transacción de Postgres, y la
 * lectura del interruptor no tiene que pagar por eso.
 */

import { tenantTransaction } from "@/lib/rls";
import { CONTABILIDAD_HABILITADA } from "@/cambios/interruptores";
import { estadoDesdeFilas, filtroDeFilasValidas } from "@/cambios/interruptores-core";
import { estadoModuloContable, type EstadoModuloContable } from "./config";
import { esMigracionPendiente } from "./repo";

/** Lee el interruptor del negocio. Si la lectura falla, apagado: lo nuevo nunca se prende por un error. */
export async function contabilidadPrendidaEn(tenantId: string): Promise<boolean> {
  try {
    return await tenantTransaction(
      async (tx) => {
        const filas = await tx.auditLog.findMany({
          where: { ...filtroDeFilasValidas(tenantId), entityId: CONTABILIDAD_HABILITADA },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true },
        });
        return estadoDesdeFilas(filas)[CONTABILIDAD_HABILITADA]?.encendido === true;
      },
      { tenantId },
    );
  } catch {
    return false;
  }
}

/** ¿Están las tablas y columnas de las olas 1 y 2? Sólo `SELECT … LIMIT 1` del propio negocio. */
export async function migracionContableAplicada(tenantId: string): Promise<boolean> {
  try {
    await tenantTransaction(
      async (tx) => {
        await tx.cuentaContable.findFirst({ where: { tenantId }, select: { id: true, rubro: true, monedaCuenta: true } });
        await tx.asientoLinea.findFirst({ where: { tenantId }, select: { id: true, fechaOrigen: true } });
        await tx.cuentaRol.findFirst({ where: { tenantId }, select: { id: true } });
        await tx.configContable.findFirst({ where: { tenantId }, select: { tenantId: true } });
      },
      { tenantId },
    );
    return true;
  } catch (e) {
    if (esMigracionPendiente(e)) return false;
    throw e;
  }
}

export async function estadoContabilidadDelNegocio(tenantId: string): Promise<EstadoModuloContable> {
  const prendido = await contabilidadPrendidaEn(tenantId);
  if (!prendido) return estadoModuloContable({ prendido, migracionAplicada: false });
  return estadoModuloContable({ prendido, migracionAplicada: await migracionContableAplicada(tenantId) });
}
