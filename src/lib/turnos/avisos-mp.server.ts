// La lectura de los avisos de la seña por MP (avisos-mp.ts) para la agenda: UNA consulta por día,
// filtrada por `tenantId` además de RLS, sólo de los turnos dados (hasta 300) y sólo de las tres
// acciones de aviso. El cliente de base va inyectado (los tests usan un doble).

import { ACCIONES_AVISO_MP, avisosMPPorTurno, type AvisoMP, type FilaAvisoMP } from "./avisos-mp";

export type LectorAvisosMP = {
  auditLog: {
    findMany: (args: {
      where: { tenantId: string; entity: "Appointment"; action: { in: string[] }; entityId: { in: string[] } };
      select: { entityId: true; action: true; changes: true; createdAt: true };
      orderBy: { createdAt: "asc" };
    }) => Promise<FilaAvisoMP[]>;
  };
};

export async function leerAvisosMP(db: LectorAvisosMP, tenantId: string, ids: readonly string[]): Promise<Record<string, AvisoMP[]>> {
  const unicos = [...new Set(ids.filter((x) => typeof x === "string" && x.length > 0 && x.length <= 64))].slice(0, 300);
  if (!tenantId || unicos.length === 0) return {};
  const filas = await db.auditLog.findMany({
    where: { tenantId, entity: "Appointment", action: { in: [...ACCIONES_AVISO_MP] }, entityId: { in: unicos } },
    select: { entityId: true, action: true, changes: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return avisosMPPorTurno(filas);
}
