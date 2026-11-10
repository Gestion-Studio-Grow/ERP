// ============================================================================
// LECTURA de la Cadena de frío — servidor, sin "use server" (como lotes-loader.ts: un export
// de un archivo "use server" sería un endpoint público que devuelve datos del negocio).
// ============================================================================
//
// SQL crudo (RegistroFrio es de prisma/pending-gate2/CadenaDeFrio.sql, no está en el cliente de
// Prisma), adentro de `tenantTransaction` (RLS) y con el `tenantId` escrito a mano. La página la
// llama SÓLO si `migracionFrioAplicada()` dijo que sí; si igual falta la tabla (carrera con el
// probe), lista vacía; cualquier otro error SUBE.

import { tenantTransaction } from "@/lib/rls";
import type { Lectura } from "./cadena-frio";
import { motivoDelError } from "./errores";

export const LECTURAS_POR_EQUIPO = 5;

type Fila = { id: string; equipo: string; temperaturaC: number; medidoEn: Date; medidoPor: string | null; nota: string | null };

/** Las últimas `n` lecturas de cada equipo del negocio (las más nuevas primero). */
export async function listarUltimasLecturasPorEquipo(tenantId: string, n = LECTURAS_POR_EQUIPO): Promise<Lectura[]> {
  const tope = Math.max(1, Math.min(50, Math.trunc(n)));
  let filas: Fila[];
  try {
    filas = await tenantTransaction(
      (tx) => tx.$queryRaw<Fila[]>`
        SELECT "id", "equipo", "temperaturaC", "medidoEn", "medidoPor", "nota"
        FROM (
          SELECT r."id", r."equipo", r."temperaturaC"::float8 AS "temperaturaC", r."medidoEn", r."medidoPor", r."nota",
                 ROW_NUMBER() OVER (PARTITION BY lower(r."equipo") ORDER BY r."medidoEn" DESC, r."id" DESC) AS rn
          FROM "RegistroFrio" r
          WHERE r."tenantId" = ${tenantId}
        ) t
        WHERE t.rn <= ${tope}
        ORDER BY "medidoEn" DESC`,
      { tenantId },
    );
  } catch (err) {
    if (motivoDelError(err) === "sin-migracion") return [];
    throw err;
  }
  return filas.map((f) => ({ ...f, temperaturaC: Number(f.temperaturaC), medidoEn: new Date(f.medidoEn) }));
}
