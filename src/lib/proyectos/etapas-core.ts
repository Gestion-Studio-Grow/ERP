// ETAPAS DEL TABLERO (MIA-50 T02 · O01, Dis. § 2.2). PURO.
// Las etapas son una AGRUPACIÓN de los 10 estados internos (`core.ts`, ETAPAS): agruparlas no cambia ningún valor de
// `Proyecto.etapa`, de la que dependen las cuotas (`gestion-core.ts`, ETAPAS_CON_CUOTAS). Qué etapas hay, su nombre y qué
// estados agrupa es un parámetro del negocio (`etapas.lista`, catálogo de T03): este archivo no fija ninguna.

import { ETAPAS, type Etapa } from "./core";
import type { EtapaParam } from "./parametros/catalogo";

export type { EtapaParam };

/** La etapa que agrupa ese estado; null si el estado no es uno de los 10. */
export function etapaDelEstado(lista: readonly EtapaParam[], estado: string): EtapaParam | null {
  return lista.find((e) => (e.estados as readonly string[]).includes(estado)) ?? null;
}

/** El orden de la etapa de ese estado en la lista; -1 si no está. */
export function indiceDeEtapa(lista: readonly EtapaParam[], estado: string): number {
  return lista.findIndex((e) => (e.estados as readonly string[]).includes(estado));
}

/** Reparte las tarjetas en las columnas del tablero, en el orden del parámetro. Los perdidos son una salida, no una etapa. */
export function agruparPorEtapa<T extends { etapa: string; perdido: boolean }>(lista: readonly EtapaParam[], items: readonly T[]) {
  const columnas = lista.map((etapa) => ({ etapa, items: [] as T[] }));
  const perdidos: T[] = [];
  for (const it of items) {
    if (it.perdido) {
      perdidos.push(it);
      continue;
    }
    const i = indiceDeEtapa(lista, it.etapa);
    if (i >= 0) columnas[i].items.push(it);
  }
  return { columnas, perdidos };
}

/** Al soltar una tarjeta en una columna: el primer estado de esa etapa. null si ya está en ella o la etapa no existe. */
export function destinoAlSoltar(lista: readonly EtapaParam[], etapaId: string, estadoActual: string): Etapa | null {
  const etapa = lista.find((e) => e.id === etapaId);
  if (!etapa || (etapa.estados as readonly string[]).includes(estadoActual)) return null;
  return etapa.estados[0] ?? null;
}

/** El orden de un estado interno (0 a 9); -1 si no es uno de los 10. */
export const ordenDelEstado = (estado: string): number => (ETAPAS as readonly string[]).indexOf(estado);

// ── Fechas por etapa (MIA-50 T09 · O05, M7b) ──────────────────────────────────────────────────────────────────────

/** Lo que guarda la base por etapa: la fecha prevista (a mano) y la real (la graba el pase). */
export interface FilaFechaEtapa { etapaId: string; prevista: Date | null; real: Date | null }

/** Las etapas del parámetro, en su orden, cada una con sus dos fechas (o nada). Una fila de una etapa que ya no existe no sale. */
export function fechasPorEtapa(lista: readonly EtapaParam[], filas: readonly FilaFechaEtapa[]) {
  return lista.map((etapa) => {
    const f = filas.find((x) => x.etapaId === etapa.id);
    return { etapa, prevista: f?.prevista ?? null, real: f?.real ?? null };
  });
}

/** La etapa en la que se entra al pasar de un estado a otro; null si los dos estados son de la misma etapa (no hay pase). */
export function etapaQueSeEntra(lista: readonly EtapaParam[], antes: string, despues: string): EtapaParam | null {
  const destino = etapaDelEstado(lista, despues);
  if (!destino) return null;
  return etapaDelEstado(lista, antes)?.id === destino.id ? null : destino;
}
