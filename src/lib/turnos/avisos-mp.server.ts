// La lectura de los avisos de la seña por MP (avisos-mp.ts) para la agenda: una consulta por día
// (por cada bloque de 300 turnos), filtrada por `tenantId` además de RLS, sólo de los turnos dados,
// sólo de las tres acciones de aviso y sólo si la regla de seña obligatoria está prendida.
// El cliente de base va inyectado (los tests usan un doble).

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

/** Tamaño de cada consulta: los turnos del día van en bloques de 300 (más turnos = más bloques, ninguno se corta). */
export const BLOQUE_AVISOS_MP = 300;

/**
 * Los avisos de los turnos dados. Con la regla de seña obligatoria APAGADA para el negocio no se
 * lee nada (los avisos son de la regla: mostrarlos apagada invita a cargar el cobro dos veces).
 * Más de 300 turnos en el día → varias consultas de 300, todas con `tenantId`: no se corta ninguno.
 */
export async function leerAvisosMP(
  db: LectorAvisosMP,
  tenantId: string,
  ids: readonly string[],
  o: { reglaPrendida: boolean },
): Promise<Record<string, AvisoMP[]>> {
  if (!o.reglaPrendida) return {};
  const unicos = [...new Set(ids.filter((x) => typeof x === "string" && x.length > 0 && x.length <= 64))];
  if (!tenantId || unicos.length === 0) return {};
  const filas: FilaAvisoMP[] = [];
  for (let i = 0; i < unicos.length; i += BLOQUE_AVISOS_MP) {
    filas.push(
      ...(await db.auditLog.findMany({
        where: { tenantId, entity: "Appointment", action: { in: [...ACCIONES_AVISO_MP] }, entityId: { in: unicos.slice(i, i + BLOQUE_AVISOS_MP) } },
        select: { entityId: true, action: true, changes: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })),
    );
  }
  return avisosMPPorTurno(filas);
}
