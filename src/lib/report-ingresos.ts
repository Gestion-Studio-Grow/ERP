// ============================================================================
// Ingresos del período, agrupados. PURO — el reloj se inyecta, no se elige acá.
// ============================================================================
//
// Este módulo existe porque `getReportData` tenía DOS RELOJES adentro de la misma función:
// filtraba los pagos por `Payment.createdAt` (cuándo entró la plata) y después los agrupaba
// por día usando `Appointment.startsAt` (cuándo se prestó el servicio). El total y las filas
// de "Ingresos por día" no contestaban la misma pregunta.
//
// El total nunca divergió de la suma de las filas —las dos salen del mismo array—, así que
// el defecto no se veía en un control cruzado. Lo que mentía era CADA FILA:
//
//   · Un turno del lunes cobrado el miércoles sumaba al LUNES, aunque el filtro lo hubiera
//     dejado entrar por el miércoles.
//   · Aparecían filas de días FUERA del período pedido (incluso futuros: una seña de un
//     turno de la semana que viene se imputaba al día del turno).
//   · Había días que mostraban $0 habiendo entrado plata, porque esa plata se fue a la fila
//     del día en que se prestó el servicio.
//
// Ahora el reporte contesta UNA pregunta —"cuánta plata entró cada día"— y lo dice en
// pantalla. "Cuánto facturaron los servicios de marzo" es otra pregunta, igual de legítima,
// y va a necesitar su propia vista: la falla no era usar dos relojes, era no decir cuál.
//
// Es puro y sin imports a propósito: la agrupación por día es lo único que no estaba
// cubierto por ningún test (`report-csv.test.ts` le pasaba `[]`), y por eso el defecto
// sobrevivió a una auditoría de once dimensiones.

/** Un pago tal como lo necesita la agrupación: cuánto, cuándo entró, y de qué turno vino. */
export type PagoParaReporte = {
  amount: number;
  /** El RELOJ. Es `Payment.createdAt`: cuándo entró la plata. */
  cobradoEn: Date;
  profesional: string;
  servicio: string;
};

export type FilaDeReporte = { label: string; total: number };

export type IngresosAgrupados = {
  totalIngresos: number;
  cantidadPagos: number;
  porDia: FilaDeReporte[];
  porProfesional: FilaDeReporte[];
  porServicio: FilaDeReporte[];
};

function aFilas(m: Map<string, number>): FilaDeReporte[] {
  return Array.from(m.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Agrupa los pagos del período. `diaDe` traduce un instante al día calendario del negocio y
 * se INYECTA: sin eso no hay forma de probar los bordes del día sin depender de la zona de
 * la máquina que corre los tests, que es cómo se cuelan estos bugs.
 *
 * Los tres cortes usan el MISMO conjunto de pagos y el MISMO reloj, así que el total de
 * arriba y cualquiera de las tres tablas cierran entre sí. Eso no era cierto antes.
 */
export function agruparIngresos(
  pagos: readonly PagoParaReporte[],
  diaDe: (instante: Date) => string,
): IngresosAgrupados {
  const porDia = new Map<string, number>();
  const porProfesional = new Map<string, number>();
  const porServicio = new Map<string, number>();
  let totalIngresos = 0;

  for (const p of pagos) {
    totalIngresos += p.amount;
    const dia = diaDe(p.cobradoEn);
    porDia.set(dia, (porDia.get(dia) ?? 0) + p.amount);
    porProfesional.set(p.profesional, (porProfesional.get(p.profesional) ?? 0) + p.amount);
    porServicio.set(p.servicio, (porServicio.get(p.servicio) ?? 0) + p.amount);
  }

  return {
    totalIngresos,
    cantidadPagos: pagos.length,
    // Por día va en orden cronológico inverso (el día más reciente arriba), no por monto.
    porDia: Array.from(porDia.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => (a.label < b.label ? 1 : -1)),
    porProfesional: aFilas(porProfesional),
    porServicio: aFilas(porServicio),
  };
}

/** El día calendario que está `dias` días después de `dateStr`. */
function diaMas(dateStr: string, dias: number): string {
  // Anclado al MEDIODÍA: ningún corrimiento de zona cruza la medianoche, así que sumar días
  // en UTC da el mismo resultado que sumarlos en el calendario. Es el mismo truco que usa
  // `dayOfWeekForDate` en `datetime.ts`.
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Los bordes del período, snapeados al DÍA DE NEGOCIO.
 *
 * `hasta` era `new Date()` y `desde` ese instante menos N días: o sea un instante a media
 * tarde, no una frontera de día. La consecuencia medible es que la primera fila de "Ingresos
 * por día" siempre era un día PARCIAL y nada lo decía: se mostraba una parte de lo cobrado
 * ese día y el resto quedaba afuera del reporte.
 *
 * Devuelve `desde` = 00:00:00.000 del primer día y `hasta` = 23:59:59.999 del último, los dos
 * en hora del negocio, para que el rango sea inclusivo en los dos extremos y `hasta` se pueda
 * mostrar en pantalla tal cual (es el último día, no la medianoche del siguiente).
 *
 * `hoy` (YYYY-MM-DD en la zona del negocio) y `aUtc` se inyectan por la misma razón que
 * `diaDe`: sin eso no hay forma de probar los bordes sin depender de la zona de la máquina.
 */
export function bordesDelPeriodo(
  hoy: string,
  rangeDays: number,
  aUtc: (dateStr: string, timeStr: string) => Date,
): { desde: Date; hasta: Date } {
  // `rangeDays` días CONTANDO hoy: con 90, el primer día es hoy − 89.
  const desde = aUtc(diaMas(hoy, 1 - rangeDays), "00:00");
  const hasta = new Date(aUtc(diaMas(hoy, 1), "00:00").getTime() - 1);
  return { desde, hasta };
}
