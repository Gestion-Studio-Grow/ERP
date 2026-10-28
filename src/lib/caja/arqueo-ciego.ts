// ============================================================================
// ARQUEO A CIEGAS · la lectura del interruptor (N2 · M1-C3 · cert F6/F7/F8)
// ============================================================================
//
// Con el interruptor encendido y SIN turno abierto, quien abre la caja cuenta el cajón sin ver
// lo que dice el libro: el esperado lo revela el servidor sólo si el conteo no cuadra, y queda
// escrito como `caja.apertura-a-ciegas`. Lo que se blanquea antes de llegar a la pantalla (y por
// qué en un solo lugar) está en `arqueo-ciego-core.ts`, puro, que es lo que importan las pantallas.
//
// Este módulo lee la base: SÓLO del servidor. Sin "use server": lo importan `caja-actions` y
// `cierre-diario-actions` sin que la lectura por `tenantId` quede expuesta como acción invocable.

import { prisma } from "@/lib/prisma";
import { ARQUEO_CIEGO } from "@/cambios/interruptores";
import { estadoDesdeFilas, filtroDeFilasValidas } from "@/cambios/interruptores-core";

/**
 * ¿El negocio abre la caja a ciegas? La misma lectura que `interruptoresDelNegocio` (sólo filas
 * de la consola), acotada a este interruptor. Si la lectura falla: apagado, la apertura de siempre.
 */
export async function arqueoCiegoDelNegocio(tenantId: string): Promise<boolean> {
  try {
    const filas = await prisma.auditLog.findMany({
      where: { ...filtroDeFilasValidas(tenantId), entityId: ARQUEO_CIEGO },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
      select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true },
    });
    return estadoDesdeFilas(filas)[ARQUEO_CIEGO]?.encendido === true;
  } catch {
    return false;
  }
}
