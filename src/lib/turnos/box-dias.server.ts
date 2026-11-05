// Lectura de la regla «el box abre sólo los días que elijo» (regla pura en ./box-dias.ts).
//
// Detrás del interruptor `nail-artist`: apagado, `null` sin tocar la base (igual que hoy). Prendido
// con la migración 20261105120000_nail_artist sin aplicar (columna o tabla ausente), también `null`:
// el box se comporta como siempre en vez de tirar un 500 en la reserva.
//
// Aislamiento: `tenantId` escrito a mano en cada lectura, además de RLS.

import "server-only";
import { prisma } from "@/lib/prisma";
import { nailArtistDelNegocio } from "@/cambios/interruptores.server";
import { isColumnMissing, isPrismaError } from "@/lib/prisma-errors";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { boxAbreEseDia, dateComoFecha, fechaComoDate, RECHAZO_BOX_CERRADO, type ReglaDelBox } from "./box-dias";

function migracionAusente(err: unknown): boolean {
  return isColumnMissing(err) || isPrismaError(err, "P2021");
}

/** La regla del box para esas fechas (YYYY-MM-DD). `null` = no restringe. */
export async function reglaDelBox(tenantId: string, boxId: string | null | undefined, fechas: readonly string[]): Promise<ReglaDelBox> {
  if (!boxId || fechas.length === 0) return null;
  if (!(await nailArtistDelNegocio())) return null;
  try {
    const box = await prisma.box.findFirst({ where: { id: boxId, tenantId }, select: { soloDiasAbiertos: true } });
    if (!box?.soloDiasAbiertos) return null;
    const filas = await prisma.boxDiaAbierto.findMany({
      where: { tenantId, boxId, fecha: { in: [...new Set(fechas)].map(fechaComoDate) } },
      select: { fecha: true },
    });
    return { soloDiasAbiertos: true, abiertos: new Set(filas.map((f) => dateComoFecha(f.fecha))) };
  } catch (err) {
    if (migracionAusente(err)) return null;
    throw err;
  }
}

/** Validación del servidor: un turno en un día que el box no abre se rechaza, aunque se fuerce. */
export async function assertBoxAbreEseDia(tenantId: string, boxId: string | null | undefined, fecha: string): Promise<void> {
  const regla = await reglaDelBox(tenantId, boxId, [fecha]);
  if (!boxAbreEseDia(regla, fecha)) throw new RechazoDeDominio(RECHAZO_BOX_CERRADO);
}

/** Calendario del mes para la pantalla del catálogo. `null` = migración sin aplicar. */
export async function diasAbiertosDelMes(
  tenantId: string,
  desde: string,
  hasta: string,
): Promise<{ boxId: string; soloDiasAbiertos: boolean; abiertos: string[] }[] | null> {
  try {
    const [boxes, filas] = await Promise.all([
      prisma.box.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, soloDiasAbiertos: true } }),
      prisma.boxDiaAbierto.findMany({
        where: { tenantId, fecha: { gte: fechaComoDate(desde), lte: fechaComoDate(hasta) } },
        select: { boxId: true, fecha: true },
      }),
    ]);
    return boxes.map((b) => ({
      boxId: b.id,
      soloDiasAbiertos: b.soloDiasAbiertos,
      abiertos: filas.filter((f) => f.boxId === b.id).map((f) => dateComoFecha(f.fecha)).sort(),
    }));
  } catch (err) {
    if (migracionAusente(err)) return null;
    throw err;
  }
}
