// Cómo se arma el Inicio por apps a partir de las apps que la persona ve. PURO: lo prueban
// los tests con el registro real, sin base ni render.

import type { AppDescriptor } from "@/apps/contract";
import { ESPACIOS, nombreDeEspacio, type EspacioId } from "@/apps/espacios";
import type { AlertaKpi, ResultadoKpi } from "@/apps/kpis/nucleo.server";

export interface SeccionInicio {
  id: EspacioId;
  /** "Mostrador" en un local, "Recepción" en una estética. */
  nombre: string;
  apps: AppDescriptor[];
}

/**
 * Una sección por espacio, en el orden de los espacios, con las apps que la persona ve. Un
 * espacio sin apps visibles no aparece (RECEPTION no ve "Finanzas" porque no ve ninguna app
 * de finanzas). Los espacios que no van en el Inicio (plataforma, el estudio contable) nunca.
 * `visibles` ya viene ordenada por `appsVisibles`; acá sólo se reparte.
 */
export function seccionesDelInicio(
  visibles: readonly AppDescriptor[],
  opts: { esMostrador: boolean },
): SeccionInicio[] {
  return ESPACIOS.filter((e) => e.enInicio)
    .map((e) => ({
      id: e.id,
      nombre: nombreDeEspacio(e.id, opts),
      apps: visibles.filter((a) => a.espacio === e.id),
    }))
    .filter((s) => s.apps.length > 0);
}

/**
 * Qué sube a "Para atender hoy": los números en alerta, en el orden del Inicio. Y cuáles no
 * se pudieron calcular: sin ellos no se puede decir "nada pendiente", porque puede haber algo
 * justo ahí.
 */
export function paraAtenderHoy(
  items: readonly { app: AppDescriptor; resultado: ResultadoKpi | null }[],
): { alertas: { app: AppDescriptor; alerta: AlertaKpi }[]; sinRevisar: AppDescriptor[] } {
  const alertas: { app: AppDescriptor; alerta: AlertaKpi }[] = [];
  const sinRevisar: AppDescriptor[] = [];
  for (const { app, resultado } of items) {
    if (resultado?.estado === "ok" && resultado.alerta) alertas.push({ app, alerta: resultado.alerta });
    else if (resultado?.estado === "error") sinRevisar.push(app);
  }
  return { alertas, sinRevisar };
}

/** "Pedidos para preparar", "Pedidos y Stock", "Pedidos, Stock y Caja del día". */
export function listaDeNombres(apps: readonly AppDescriptor[]): string {
  const n = apps.map((a) => a.nombre);
  if (n.length <= 1) return n.join("");
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}
