// ============================================================================
// RESULTADO PARA DIRECCIÓN (MIA-50 T09 · O49). PURO.
// · Por proyecto: venta − costo real. La venta y el costo real son los MISMOS números que la ficha y Rentabilidad
//   (`proyectosConNumeros`: venta de la ficha viva y `costoRealDeProyectos`, la cuenta única de O13): acá no se recalculan.
//   Cuando la foto de la aprobación (M3, T07) exista, la venta congelada entra por ese mismo campo.
// · De la empresa, por mes: suma de los proyectos del mes − gastos de administración imputados del mes (líneas de
//   comprobante con destino ADMINISTRACION), con lo previsto de los gastos fijos contra lo real imputado.
// El mes de cada cosa sale del parámetro `cierre.periodoDelResultado` (provisional: «por fecha del movimiento»): el
// proyecto, por la fecha del evento (o de alta, sin evento); el gasto, por la fecha del comprobante. Se suma en centavos.
// ============================================================================

import { claveDia } from "./gestion-lecturas-core";
import { centavosDe } from "@/lib/dinero/redondeo";

const c = centavosDe;
const p = (centavos: number) => centavos / 100;

/** El mes (AAAA-MM) de una fecha, en hora de Argentina. */
export const mesDe = (d: Date): string => claveDia(d).slice(0, 7);

export interface ProyectoConResultado { id: string; codigo: string; nombre: string; venta: number; costoReal: number; conGastos: boolean; fecha: Date; vivo: boolean }

/** Venta − costo real, en pesos. */
export const resultadoDelProyecto = (x: Pick<ProyectoConResultado, "venta" | "costoReal">): number => p(c(x.venta) - c(x.costoReal));

export interface LineaAdministracion { categoria: string; costoCentavos: bigint | number; fecha: Date }
export interface GastoFijoPrevisto { nombre: string; tipo: string; frecuencia: string; fecha: Date | null; activo: boolean; montoPesos: number }

/** Si un gasto fijo cae en el mes: los mensuales siempre; los anuales, en el mes de su fecha; los únicos, en su mes. */
export function fijoTocaEnElMes(g: Pick<GastoFijoPrevisto, "frecuencia" | "fecha" | "activo">, mes: string): boolean {
  if (!g.activo) return false;
  if (g.frecuencia === "MENSUAL") return true;
  if (!g.fecha) return false;
  return g.frecuencia === "ANUAL" ? mesDe(g.fecha).slice(5) === mes.slice(5) : mesDe(g.fecha) === mes;
}

export interface ResultadoDelMes {
  mes: string;
  proyectos: (ProyectoConResultado & { resultado: number })[];
  sumaProyectos: number;
  administracion: { categoria: string; real: number }[];
  administracionReal: number;
  fijosPrevistos: { nombre: string; previsto: number }[];
  fijosPrevisto: number;
  /** Real − previsto: positivo = se gastó más de lo previsto. */
  desvioFijos: number;
  resultadoEmpresa: number;
}

export function resultadoDelMes(mes: string, proyectos: readonly ProyectoConResultado[], lineas: readonly LineaAdministracion[], fijos: readonly GastoFijoPrevisto[]): ResultadoDelMes {
  const delMes = proyectos.filter((x) => x.vivo && mesDe(x.fecha) === mes).map((x) => ({ ...x, resultado: resultadoDelProyecto(x) }));
  const sumaProyectos = delMes.reduce((s, x) => s + c(x.resultado), 0);
  const porCategoria = new Map<string, number>();
  for (const l of lineas) if (mesDe(l.fecha) === mes) porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + Number(l.costoCentavos));
  const administracion = [...porCategoria].map(([categoria, cent]) => ({ categoria, real: p(cent) })).sort((x, y) => x.categoria.localeCompare(y.categoria, "es"));
  const adminCent = [...porCategoria.values()].reduce((s, v) => s + v, 0);
  const fijosPrevistos = fijos.filter((g) => fijoTocaEnElMes(g, mes)).map((g) => ({ nombre: g.nombre, previsto: g.montoPesos }));
  const fijosCent = fijosPrevistos.reduce((s, g) => s + c(g.previsto), 0);
  return {
    mes,
    proyectos: delMes,
    sumaProyectos: p(sumaProyectos),
    administracion,
    administracionReal: p(adminCent),
    fijosPrevistos,
    fijosPrevisto: p(fijosCent),
    desvioFijos: p(adminCent - fijosCent),
    resultadoEmpresa: p(sumaProyectos - adminCent),
  };
}
