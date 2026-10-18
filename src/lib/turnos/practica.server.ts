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
import { politicaDelNegocio, reglaDeCancelacion, type PoliticaDeCancelacion } from "./practica";

export const agendaPractica = cache(async (): Promise<boolean> => agendaPracticaPrendida(await interruptoresDelNegocio()));

/** La regla de cancelación del negocio si la agenda práctica está prendida; si no, null (nada cambia). */
export const politicaVigente = cache(async (): Promise<PoliticaDeCancelacion | null> =>
  (await agendaPractica()) ? politicaDelNegocio(await getCurrentTenantSlug()) : null,
);

/** La regla escrita para la clienta (T12), o null con la agenda práctica apagada. */
export async function reglaVigenteParaLaClienta(): Promise<string | null> {
  const p = await politicaVigente();
  return p ? reglaDeCancelacion(p) : null;
}
