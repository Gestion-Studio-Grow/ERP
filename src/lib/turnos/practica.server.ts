// ============================================================================
// ¿EL NEGOCIO DE ESTE PEDIDO TIENE LA AGENDA PRÁCTICA? (servidor)
// ============================================================================
//
// Interruptor «agenda-practica» (src/cambios/interruptores.ts). Misma lectura por pedido que el
// diseño nuevo (`interruptoresDelNegocio`, cacheada): cero viajes nuevos a la base. Si la lectura
// falla, APAGADO: la agenda de siempre, que es lo seguro para CH.
//
// `server-only`: detrás está el valor `prisma`.

import "server-only";
import { cache } from "react";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { agendaPracticaPrendida } from "@/cambios/interruptores-core";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { politicaDelNegocio, puedeCambiarOnline, reglaDeCancelacion, type PoliticaDeCancelacion } from "./practica";

export const agendaPractica = cache(async (): Promise<boolean> => agendaPracticaPrendida(await interruptoresDelNegocio()));

/** La regla de cancelación que cargó el negocio, si la agenda práctica está prendida; si no, null (nada cambia). */
// Primero la regla cargada (variable del deploy, sin base): sin regla no se lee el interruptor, así
// la reserva pública de un negocio sin regla no suma ninguna consulta.
export const politicaVigente = cache(async (): Promise<PoliticaDeCancelacion | null> => {
  const politica = politicaDelNegocio(await getCurrentTenantSlug());
  return politica && (await agendaPractica()) ? politica : null;
});

/** La regla escrita para la clienta (T12), o null con la agenda práctica apagada. */
export async function reglaVigenteParaLaClienta(): Promise<string | null> {
  const p = await politicaVigente();
  return p ? reglaDeCancelacion(p) : null;
}

/**
 * Para «Tu turno»: la regla vigente y si la clienta todavía puede cambiar ESTE turno online. Sin
 * regla, siempre puede (como siempre). El reloj se lee acá, no en el render de la página.
 */
export async function cambioOnlineDelTurno(startsAt: Date): Promise<{ regla: string | null; puede: boolean }> {
  const p = await politicaVigente();
  if (!p) return { regla: null, puede: true };
  return { regla: reglaDeCancelacion(p), puede: puedeCambiarOnline({ startsAt, ahora: new Date(), politica: p }).ok };
}
