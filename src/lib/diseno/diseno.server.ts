// ============================================================================
// ¿EL NEGOCIO DE ESTE PEDIDO TIENE EL DISEÑO NUEVO? (servidor)
// ============================================================================
//
// UNA lectura por pedido (`react.cache`), y ni siquiera propia: es la de los interruptores del
// negocio (`interruptoresDelNegocio`, src/cambios/interruptores.server.ts), que el panel ya hace
// para "Trabaja por apps". En el layout del panel sale en la misma tanda que `enInicioPorApps()`:
// cero viajes nuevos a la base. Si la lectura falla, APAGADO (diseno-core.ts).
//
// El negocio sale del pedido (host), nunca de un parámetro. En la consola del operador no se
// pregunta: allá el diseño nuevo va siempre (src/app/operador/(console)/layout.tsx).
//
// NO lleva "use server" (publicaría cada export como endpoint) y es `server-only`: detrás está el
// valor `prisma`, que nunca puede llegar al navegador. El cliente pregunta con `useDiseno()`.

import "server-only";
import { cache } from "react";
import { logger } from "@/lib/logger";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { leerDisenoNuevoCon } from "./diseno-core";

export const disenoNuevo = cache(
  (): Promise<boolean> =>
    leerDisenoNuevoCon(interruptoresDelNegocio, (error) =>
      logger.warn("diseno", "no se pudo decidir el diseño del negocio; queda el de siempre", {
        error: error instanceof Error ? error.message : String(error),
      }),
    ),
);
