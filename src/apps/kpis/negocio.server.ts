// ============================================================================
// EL NEGOCIO DEL REQUEST — slug, rubro y si es de mostrador, leídos UNA vez.
// ============================================================================
//
// El layout, el Inicio y los números del Inicio necesitan lo mismo del negocio (su slug, su
// rubro para "Mostrador"/"Recepción" y para decir "cortes" o "productos").
// `getCurrentTenantRubro` lo lee, pero sin caché: cada llamador pagaba su propia consulta.
// Acá se envuelve con `react.cache`, que dura un request (nunca entre requests ni entre
// negocios), y todos comparten la misma lectura.

import "server-only";
import { cache } from "react";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";

export const negocioActual = cache(getCurrentTenantRubro);
