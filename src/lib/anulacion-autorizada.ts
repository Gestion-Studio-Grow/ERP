// QUIÉN AUTORIZA UNA ANULACIÓN — la parte de servidor del código de la dueña (`codigo-anulacion.ts`),
// la misma para los cobros de turnos, las ventas de mostrador y los cobros de Taller.
//
// Sacar el código y comprobarlo sólo leen: no escriben en la base ni mueven plata. Se comprueba ANTES
// de abrir la transacción de la anulación, así un código malo no bloquea nada. Lo que cambia entre
// un objeto y otro es el `objetoId` y las palabras del mensaje; la regla es una sola.

import { prisma } from "@/lib/prisma";
import { authSecret } from "@/lib/auth";
import { fmtTime } from "@/lib/datetime";
import type { AnulacionDeCobro } from "@/lib/capabilities";
import { MENSAJE_CODIGO_MALO, MENSAJE_FALTA_CODIGO, MENSAJE_TOPE_DE_CODIGOS } from "@/lib/turnos/anulacion";
import { emitirCodigo, normalizarCodigo, topeDeAnulaciones, verificarCodigo } from "@/lib/turnos/codigo-anulacion";

export type Autorizadora = { id: string; nombre: string };

export type ResultadoAutorizacion = { ok: true; codigo: string; venceA: string } | { ok: false; error: string };

/** Los dos textos que nombran el objeto («este cobro», «esta venta»). */
export type TextosDelCodigo = { falta: string; malo: string };

const TEXTOS_DEL_COBRO: TextosDelCodigo = { falta: MENSAJE_FALTA_CODIGO, malo: MENSAJE_CODIGO_MALO };

/** Quién autoriza esta anulación: la dueña misma si anula ella; si no, la que emitió el código. */
export async function autorizadoraDeLaAnulacion(
  user: { id: string; name: string },
  politica: AnulacionDeCobro,
  tenantId: string,
  objetoId: string,
  codigoCrudo: FormDataEntryValue | null,
  textos: TextosDelCodigo = TEXTOS_DEL_COBRO,
): Promise<{ ok: true; duena: Autorizadora } | { ok: false; error: string }> {
  if (politica === "directa") return { ok: true, duena: { id: user.id, nombre: user.name } };
  const codigo = normalizarCodigo(codigoCrudo);
  if (!codigo) return { ok: false, error: textos.falta };
  const intento = { tenantId, userId: user.id, objetoId };
  if (topeDeAnulaciones.frenado(intento)) return { ok: false, error: MENSAJE_TOPE_DE_CODIGOS };
  const duenas = await prisma.user.findMany({
    where: { tenantId, role: "OWNER", active: true, deletedAt: null },
    select: { id: true, name: true },
  });
  const r = verificarCodigo({ secreto: authSecret(), tenantId, objetoId, duenas: duenas.map((d) => d.id), codigo }, Date.now());
  const duena = r.ok ? duenas.find((d) => d.id === r.duenaId) : undefined;
  if (!duena) {
    topeDeAnulaciones.fallo(intento);
    return { ok: false, error: textos.malo };
  }
  topeDeAnulaciones.acierto(intento);
  return { ok: true, duena: { id: duena.id, nombre: duena.name } };
}

/** El código de esta dueña para este objeto, con su vencimiento en la hora del negocio y para el rastro. */
export function codigoDeLaDuena(tenantId: string, objetoId: string, duenaId: string): { codigo: string; venceA: string; vence: string } {
  const { codigo, venceMs } = emitirCodigo({ secreto: authSecret(), tenantId, objetoId, duenaId }, Date.now());
  return { codigo, venceA: fmtTime(new Date(venceMs)), vence: new Date(venceMs).toISOString() };
}
