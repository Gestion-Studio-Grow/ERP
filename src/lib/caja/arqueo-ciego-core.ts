// ============================================================================
// ARQUEO A CIEGAS · lo puro (interruptor «arqueo-ciego», N2 · M1-C3 · cert F6/F7/F8)
// ============================================================================
//
// Con el interruptor encendido y SIN turno abierto, quien abre la caja cuenta el cajón sin ver
// lo que dice el libro. Para que eso valga, ningún número del libro de EFECTIVO puede llegar a la
// pantalla Caja: ni el esperado, ni las partes que lo reconstruyen («al abrir + entró − salió», el
// fondo y las ventas en efectivo de la lista de movimientos), ni los conteos de turnos anteriores
// («contó X sobre Y»). Cuatro vueltas de cert encontraron cada uno de esos caminos por separado.
//
// La CAUSA RAÍZ era que cada pantalla y cada campo decidía por su cuenta. Ahora la redacción vive
// en un solo lugar, en el borde del servidor: los loaders (`getCierreDiarioData`, `getCajaData`)
// pasan TODO lo que devuelven por `diaALaVista` / `cajaALaVista` justo antes de devolverlo. Lo que
// no se blanquea acá no sale; las pantallas no deciden nada, sólo escriben EFECTIVO_SE_VE_AL_ABRIR
// donde llega un `null`.
//
// Módulo PURO, sin prisma ni next: lo importan componentes que también se arman para el navegador
// (CajaRenglon en caja-renglon.test.ts). La lectura del interruptor está en `arqueo-ciego.ts`.

import type { CierreDiario, CierreMedio, CierreTotal } from "@/lib/caja/cierre-diario";
import type { CierreDiarioData } from "@/lib/cierre-diario-actions";

/** Lo que dicen las pantallas donde iría el efectivo del libro mientras la apertura es a ciegas. */
export const EFECTIVO_SE_VE_AL_ABRIR = "Se ve al abrir el turno";

const MEDIO_EN_BLANCO: CierreMedio = { opening: 0, ingresos: 0, egresos: 0, expected: 0, cobrosCartera: 0, declared: null, diff: null };
const TOTAL_EN_BLANCO: CierreTotal = { opening: 0, ingresos: 0, egresos: 0, expected: 0, declared: 0, diff: 0 };

/**
 * El mismo cierre sin el efectivo a la vista: la fila EFECTIVO (por medio y por columna), el TOTAL
 * que la incluye y los ajustes en efectivo quedan en cero / fuera. Los otros medios quedan como
 * están (van al banco, no se cuentan en el cajón).
 */
export function sinElEfectivoALaVista(cierre: CierreDiario): CierreDiario {
  return {
    ...cierre,
    porMedio: { ...cierre.porMedio, EFECTIVO: MEDIO_EN_BLANCO },
    porColumna: { ...cierre.porColumna, EFECTIVO: MEDIO_EN_BLANCO },
    total: TOTAL_EN_BLANCO,
    ajustes: cierre.ajustes.filter((a) => a.method !== "EFECTIVO"),
  };
}

/**
 * EL BORDE del resumen del día: con `efectivoACiegas`, todo monto derivado del libro de efectivo
 * sale en blanco —resumen por medio y total, el monto de cada movimiento en efectivo (`null`: la
 * fila se ve, el monto no), el conteo del último turno y las causas probables (que sólo explican
 * una diferencia contra el esperado)—. Sin `efectivoACiegas` devuelve los datos tal cual.
 */
export function diaALaVista(dia: CierreDiarioData): CierreDiarioData {
  if (!dia.efectivoACiegas) return dia;
  return {
    ...dia,
    preview: sinElEfectivoALaVista(dia.preview),
    movements: dia.movements.map((m) => (m.method === "EFECTIVO" ? { ...m, amount: null } : m)),
    conteoDelTurno: null,
    hechos: null,
    registro: null,
  };
}

/**
 * EL BORDE del turno de cajero: con `aperturaACiegas` (sin turno abierto), ni el esperado del
 * cajón ni los turnos cerrados («contó X sobre Y»: el esperado al cerrar es el libro al abrir).
 * Con el turno abierto o sin interruptor, todo igual.
 */
export function cajaALaVista<S, T extends { aperturaACiegas: boolean; esperadoEnElCajon: number | null; recentClosed: S[] }>(caja: T): T {
  if (!caja.aperturaACiegas) return caja;
  return { ...caja, esperadoEnElCajon: null, recentClosed: [] as S[] };
}
