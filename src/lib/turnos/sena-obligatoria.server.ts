// La seña obligatoria del negocio actual, para las PANTALLAS (agenda y ficha): si el interruptor
// está prendido y las horas H de `SENA_VENCE_HORAS`. UNA lectura por request (`react.cache`, sobre
// `interruptoresDelNegocio`, que ya está cacheada). Si la lectura de interruptores falla, apagado: las
// pantallas se ven como siempre. La REGLA no depende de esto: la guarda del servidor lee el
// interruptor con el `tx` de cada operación (sena-obligatoria.ts).

import "server-only";
import { cache } from "react";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { senaObligatoriaPrendida } from "@/cambios/interruptores";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { horasDeVencimientoDelNegocio } from "./sena-obligatoria-core";

export type SeniaObligatoriaDelNegocio = { prendida: boolean; horas: number | null };

export const seniaObligatoriaDelNegocio = cache(async (): Promise<SeniaObligatoriaDelNegocio> => {
  const prendida = senaObligatoriaPrendida(await interruptoresDelNegocio());
  return { prendida, horas: prendida ? horasDeVencimientoDelNegocio(await getCurrentTenantSlug()) : null };
});
