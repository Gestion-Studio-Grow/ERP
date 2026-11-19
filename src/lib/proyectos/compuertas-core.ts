// COMPUERTAS ENTRE ETAPAS (MIA-50 T02 · O03, Dis. § 2.2). PURO.
// Al pasar de etapa, lista lo que falta. Avisa y no frena, salvo que la etapa que se deja tenga la compuerta en «frena»
// (parámetro `etapas.lista`); en ese caso sólo Dirección fuerza el paso, con motivo (lo hace la acción, no este archivo).
// Cada requisito se ata al estado interno al que hay que llegar, no a una etapa: así vale para cualquier agrupación que
// defina el negocio. Se mide sólo cuando el paso cruza de etapa y va hacia adelante.
// Fuera por ahora: «Administración declara costos completos» no tiene dato en la base (llega con la etapa II, T09).

import { ETAPAS, etapaLabel, type Etapa } from "./core";
import { indiceDeEtapa, ordenDelEstado, type EtapaParam } from "./etapas-core";

/** Lo que la acción lee del proyecto para medir la compuerta. */
export interface HechosDelPase {
  brief: string;
  responsable: string | null;
  /** El cliente aprobó una versión del presupuesto. */
  aprobada: boolean;
  /** Fin del evento: fecha de fin, si no la de desarme, si no la del evento. */
  finEvento: Date | null;
  /** Rendiciones de gastos de campo sin cerrar (borrador, enviada o devuelta). */
  rendicionesPendientes: number;
}

export type IdRequisito = "brief" | "responsable" | "aprobacion" | "evento" | "rendiciones";

interface Requisito {
  id: IdRequisito;
  /** Hace falta para llegar a este estado o a uno posterior. */
  alcanzar: Etapa;
  falta: (h: HechosDelPase, ahora: Date) => string | null;
}

const REQUISITOS: readonly Requisito[] = [
  { id: "brief", alcanzar: "DISENO", falta: (h) => (h.brief.trim() ? null : "Cargar el brief del proyecto.") },
  { id: "responsable", alcanzar: "DISENO", falta: (h) => (h.responsable?.trim() ? null : "Asignar el responsable comercial.") },
  { id: "aprobacion", alcanzar: "APROBADO", falta: (h) => (h.aprobada ? null : "Que el cliente apruebe una versión del presupuesto.") },
  {
    id: "evento",
    alcanzar: "CIERRE",
    falta: (h, ahora) => (h.finEvento && h.finEvento.getTime() <= ahora.getTime() ? null : h.finEvento ? "Que termine el evento (la fecha de fin todavía no pasó)." : "Que termine el evento (falta cargar la fecha)."),
  },
  {
    id: "rendiciones",
    alcanzar: "CIERRE",
    falta: (h) => (h.rendicionesPendientes > 0 ? `Rendir los gastos de campo: ${h.rendicionesPendientes} ${h.rendicionesPendientes === 1 ? "rendición pendiente" : "rendiciones pendientes"}.` : null),
  },
];

export interface Faltante {
  id: IdRequisito;
  texto: string;
  /** La etapa cuya compuerta lo pide (la que se deja). */
  etapa: string;
}

export interface Pase {
  faltan: Faltante[];
  /** Hay algo que falta y la etapa que lo pide tiene la compuerta en «frena». */
  frena: boolean;
}

export function evaluarPase(lista: readonly EtapaParam[], origen: string, destino: string, h: HechosDelPase, ahora: Date): Pase {
  const eo = indiceDeEtapa(lista, origen);
  const ed = indiceDeEtapa(lista, destino);
  const io = ordenDelEstado(origen);
  const id = ordenDelEstado(destino);
  if (eo < 0 || ed <= eo || io < 0 || id <= io) return { faltan: [], frena: false };
  const faltan: Faltante[] = [];
  for (const r of REQUISITOS) {
    const frontera = ordenDelEstado(r.alcanzar);
    if (!(io < frontera && frontera <= id)) continue;
    const texto = r.falta(h, ahora);
    if (!texto) continue;
    // La etapa que pone la compuerta: la del estado anterior a la frontera, dentro del tramo que se recorre.
    const quien = Math.min(Math.max(indiceDeEtapa(lista, ETAPAS[frontera - 1]), eo), ed - 1);
    faltan.push({ id: r.id, texto, etapa: lista[quien].id });
  }
  const frena = faltan.some((f) => lista.find((e) => e.id === f.etapa)?.compuerta === "FRENA");
  return { faltan, frena };
}

/** El aviso en castellano: qué etapa se deja y la lista entera de lo que falta. */
export function textoDelPase(lista: readonly EtapaParam[], destino: string, p: Pase): string {
  const etapa = lista[indiceDeEtapa(lista, destino)]?.nombre ?? etapaLabel(destino);
  return `Para pasar a ${etapa} falta: ${p.faltan.map((f) => f.texto).join(" ")}`;
}
