/**
 * RENDÍ — archivo para Haberes (Core, PURO). Plan §6.8; LCT arts. 105-106; CCT 40/89.
 *
 * Por legajo y período: anticipos, lo rendido con comprobante, los reintegros sin comprobante (son
 * remuneración), el saldo no rendido con su antigüedad y los viajes (para cruzar con el convenio).
 * El formato final del archivo lo define el sistema de liquidación de cada cliente.
 *
 * Decisiones donde el contrato no alcanza (ver README):
 * - Cuenta como rendido lo que está en una rendición ENVIADA y no rechazada (en aprobación, devuelta,
 *   aprobada, en control, contabilizada o cerrada). Un borrador no es una rendición todavía: si se
 *   contara, Haberes vería justificado lo que nadie presentó.
 * - Anticipos del período = los entregados en el período más los vinculados a sus rendiciones.
 * - Viajes del período = los que se superponen con el período.
 *
 * Con `evaluaciones` (es lo que tienen que pasar las pantallas), las líneas bloqueadas o derivadas a
 * Cuentas a Pagar no cuentan como rendidas: es la misma regla de la cuadratura (`lineasQueNoSeRinden`).
 */

import { convertirAPesos, sumar } from "./dinero";
import { diasEntre, estaEnPeriodo } from "./fechas";
import { comprobantesDeRendicion, lineasQueNoSeRinden } from "./rendicion";
import type {
  Anticipo,
  Comprobante,
  EstadoRendicion,
  Evaluacion,
  FechaISO,
  LineaHaberes,
  Periodo,
  Persona,
  Rendicion,
  Viaje,
} from "./tipos";

export interface ArgsHaberes {
  personas: Persona[];
  anticipos: Anticipo[];
  rendiciones: Rendicion[];
  comprobantes: Comprobante[];
  viajes: Viaje[];
  periodo: Periodo;
  hoy: FechaISO;
  /** Evaluaciones de los comprobantes: sacan las líneas bloqueadas o derivadas. */
  evaluaciones?: Evaluacion[];
}

const ESTADOS_RENDIDOS: ReadonlySet<EstadoRendicion> = new Set([
  "en_aprobacion",
  "devuelta",
  "aprobada",
  "en_control",
  "contabilizada",
  "cerrada",
]);

function total(c: Comprobante): number {
  return convertirAPesos(c.datos.total, c.datos.moneda, c.datos.cotizacion);
}

/** Una línea por persona con anticipos, comprobantes rendidos o viajes en el período. */
export function resumenParaHaberes(args: ArgsHaberes): LineaHaberes[] {
  const { personas, anticipos, rendiciones, comprobantes, viajes, periodo, hoy, evaluaciones } = args;
  const noSeRinde = lineasQueNoSeRinden(evaluaciones);
  const lineas: LineaHaberes[] = [];

  for (const persona of personas) {
    const delPeriodo = rendiciones.filter((r) => r.legajo === persona.legajo && r.periodo === periodo);
    const rendidas = delPeriodo.filter((r) => ESTADOS_RENDIDOS.has(r.estado));
    const anticiposVinculados = new Set(delPeriodo.flatMap((r) => r.anticipoIds));

    const susAnticipos = anticipos.filter(
      (a) => a.legajo === persona.legajo && (estaEnPeriodo(a.fechaEntrega, periodo) || anticiposVinculados.has(a.id)),
    );
    const susComprobantes = [...new Set(rendidas.flatMap((r) => comprobantesDeRendicion(r, comprobantes)))].filter(
      (c) => !noSeRinde.has(c.id),
    );
    const susViajes = viajes.filter(
      (v) => v.legajo === persona.legajo && v.desde <= `${periodo}-31` && v.hasta >= `${periodo}-01`,
    );
    if (susAnticipos.length === 0 && susComprobantes.length === 0 && susViajes.length === 0) continue;

    const anticipado = sumar(...susAnticipos.map((a) => a.importe));
    const conElAnticipo = susComprobantes.filter(
      (c) => c.imputacion.medioPago.tipo === "efectivo_anticipo" || c.imputacion.medioPago.tipo === "recargable",
    );
    const saldoNoRendido = Math.max(
      0,
      anticipado - sumar(...conElAnticipo.map(total)) - sumar(...rendidas.map((r) => r.devolucionDeclarada)),
    );
    const masViejo = susAnticipos.map((a) => a.fechaEntrega).sort()[0];

    lineas.push({
      legajo: persona.legajo,
      nombre: persona.nombre,
      periodo,
      anticipado,
      rendidoConComprobante: sumar(
        ...susComprobantes.filter((c) => c.datos.clase !== "sin_comprobante").map(total),
      ),
      reintegrosSinComprobante: sumar(
        ...susComprobantes.filter((c) => c.datos.clase === "sin_comprobante").map(total),
      ),
      saldoNoRendido,
      antiguedadDias: saldoNoRendido > 0 && masViejo ? Math.max(0, diasEntre(masViejo, hoy)) : 0,
      viajes: susViajes.map((v) => ({
        id: v.id,
        desde: v.desde,
        hasta: v.hasta,
        km: v.km,
        pernoctes: v.pernoctes,
        cubiertoPorConvenio: v.cubiertoPorConvenio,
      })),
    });
  }
  return lineas;
}
