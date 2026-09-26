// La clase de Factura A del negocio (ver regimen-factura-a.ts): lectura y escritura en su registro.
// Sin "use server": no es un endpoint. Quien escribe es Soporte GSG (configurador y ficha del negocio).
// Sin `import "server-only"` a propósito (como src/apps/kpis/*.server.ts): lo leen fiscal.ts y
// arca-dispatch.ts, que también corren fuera del bundle de Next (tests con node --test, y
// prisma/rls/verify-async-tenant-isolation.mts y scripts/qa/arca-emision-e2e.mjs con tsx), donde
// ese paquete no resuelve. Que no llegue al navegador lo cuida guardia-bundle-cliente.test.ts (pg/@prisma).
import type { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import type { RegimenFacturaA } from "./decidir-comprobante";
import { ACCION_REGIMEN_FACTURA_A, ENTIDAD_REGIMEN_FACTURA_A, esRegimenFacturaA, regimenVigente, validarRegimenFacturaA } from "./regimen-factura-a";

export async function leerRegimenFacturaAEnTx(tx: Prisma.TransactionClient, tenantId: string): Promise<RegimenFacturaA | null> {
  const filas = await tx.auditLog.findMany({
    where: { tenantId, action: ACCION_REGIMEN_FACTURA_A, entity: ENTIDAD_REGIMEN_FACTURA_A, entityId: tenantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: { actor: true, changes: true },
  });
  return regimenVigente(filas);
}

/** Con RLS del propio negocio. */
export async function leerRegimenFacturaA(tenantId: string): Promise<RegimenFacturaA | null> {
  return tenantTransaction((tx) => leerRegimenFacturaAEnTx(tx, tenantId), { tenantId });
}

/** Escribe la clase (la más nueva manda). `tx` tiene que estar en el contexto del negocio. */
export async function guardarRegimenFacturaAEnTx(
  tx: Prisma.TransactionClient,
  x: { tenantId: string; regimen: RegimenFacturaA; operador: string; origen: "configurador" | "ficha"; solicitudId?: string },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: x.tenantId,
      actor: `operator:${x.operador}`,
      action: ACCION_REGIMEN_FACTURA_A,
      entity: ENTIDAD_REGIMEN_FACTURA_A,
      entityId: x.tenantId,
      channel: "admin",
      changes: { regimen: x.regimen, origen: x.origen, ...(x.solicitudId ? { solicitudId: x.solicitudId } : {}) },
    },
    select: { id: true },
  });
}

/** Desde la ficha del negocio (Soporte ya pasó la guardia de operador): corrige la clase. */
export async function corregirRegimenFacturaA(x: {
  tenantId: string;
  operador: string;
  regimen: unknown;
  /** La casilla de la ficha: «A con leyenda» y «M» no se guardan sin ella (QA vuelta 7, bloqueante 1). */
  confirmaFuera?: boolean;
}): Promise<{ ok: true; regimen: RegimenFacturaA } | { ok: false; error: string }> {
  if (!esRegimenFacturaA(x.regimen)) return { ok: false, error: "Elegí qué Factura A le asignó ARCA." };
  const regimen = x.regimen;
  // La misma regla que el configurador (la condición se mira abajo, con la base).
  const v = validarRegimenFacturaA("RESPONSABLE_INSCRIPTO", regimen, x.confirmaFuera === true);
  if (!v.ok) return v;
  return tenantTransaction(
    async (tx) => {
      const t = await tx.tenant.findUnique({ where: { id: x.tenantId }, select: { arcaCondicionIva: true } });
      if (!t) return { ok: false as const, error: "Ese negocio no existe." };
      if ((t.arcaCondicionIva ?? "").trim() !== "RESPONSABLE_INSCRIPTO") {
        return { ok: false as const, error: "Sólo un Responsable Inscripto hace Factura A: primero corregí la condición frente al IVA." };
      }
      await guardarRegimenFacturaAEnTx(tx, { tenantId: x.tenantId, regimen, operador: x.operador, origen: "ficha" });
      return { ok: true as const, regimen };
    },
    { tenantId: x.tenantId },
  );
}
