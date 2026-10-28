// ============================================================================
// ARQUEO A CIEGAS (interruptor «arqueo-ciego», N2 · M1-C3 · cert F6/F7)
// ============================================================================
//
// Con el interruptor encendido y SIN turno abierto, quien abre la caja cuenta el cajón sin ver
// lo que dice el libro: el esperado lo revela el servidor sólo si el conteo no cuadra, y queda
// escrito como `caja.apertura-a-ciegas`. Para que eso valga, el número no puede estar en NINGÚN
// lado de la misma pantalla: el formulario (`getCajaData`, esperadoEnElCajon=null) y también el
// resumen del día (`getCierreDiarioData`, que pinta «Lo que hay ahora» / «Queda» con el mismo
// saldo). La cert F7 encontró que el resumen seguía mostrándolo al lado del formulario a ciegas.
//
// Módulo sin "use server": lo importan `caja-actions` y `cierre-diario-actions` sin que la
// lectura por `tenantId` quede expuesta como acción invocable desde el cliente.

import { prisma } from "@/lib/prisma";
import { ARQUEO_CIEGO } from "@/cambios/interruptores";
import { estadoDesdeFilas, filtroDeFilasValidas } from "@/cambios/interruptores-core";
import type { CierreDiario, CierreMedio, CierreTotal } from "@/lib/caja/cierre-diario";

/** Lo que dicen las pantallas donde iría el efectivo del libro mientras la apertura es a ciegas. */
export const EFECTIVO_SE_VE_AL_ABRIR = "Se ve al abrir el turno";

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

const MEDIO_EN_BLANCO: CierreMedio = { opening: 0, ingresos: 0, egresos: 0, expected: 0, cobrosCartera: 0, declared: null, diff: null };
const TOTAL_EN_BLANCO: CierreTotal = { opening: 0, ingresos: 0, egresos: 0, expected: 0, declared: 0, diff: 0 };

/**
 * El mismo cierre sin el efectivo a la vista: la fila EFECTIVO (por medio y por columna) y el
 * TOTAL que la incluye quedan en cero. No alcanza con tapar `expected`: «al abrir + entró − salió»
 * lo reconstruye. Los otros medios quedan como están (van al banco, no se cuentan en el cajón).
 * Quien lo recibe mira `efectivoACiegas` en los datos y escribe EFECTIVO_SE_VE_AL_ABRIR en su lugar.
 */
export function sinElEfectivoALaVista(cierre: CierreDiario): CierreDiario {
  return {
    ...cierre,
    porMedio: { ...cierre.porMedio, EFECTIVO: MEDIO_EN_BLANCO },
    porColumna: { ...cierre.porColumna, EFECTIVO: MEDIO_EN_BLANCO },
    total: TOTAL_EN_BLANCO,
  };
}
