// KPIs profundos del reporte del dueño (Reportes v2). Lógica PURA y testeable:
// no importa Prisma ni Next, no toca la DB. Recibe un set de turnos ya acotado por
// tenant + rango (lo trae la Server Action `getDeepReportData`) y calcula las
// métricas que un dueño de estética mira para decidir — más allá de la facturación
// bruta que ya muestra `getReportData`:
//
//   · Fuga operativa   → tasa de no-show y de cancelación.
//   · Valor por venta  → ticket promedio + mix de método de pago.
//   · Retención        → recurrentes vs. esporádicos en el período.
//   · Productividad    → rentabilidad "hora-silla" por profesional.
//
// Vive fuera de `actions.ts` (que es `"use server"` y solo exporta funciones async)
// por el mismo motivo que `report-config.ts`, y para poder cubrirlo con tests de
// lógica pura sin levantar la base (ADR-026).

// Estados de turno relevantes para las métricas. Se declara acá como unión de
// strings (no se importa el enum de Prisma) para que el módulo quede desacoplado
// del ORM y trivial de testear con literales.
export type KpiAppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export type KpiPaymentMethod = "MERCADOPAGO" | "EFECTIVO" | "TRANSFERENCIA";

// Forma mínima de turno que necesitan los KPIs. La Server Action mapea las filas
// de Prisma a esto (con `select` acotado), así el cálculo no depende del shape del
// ORM y el test arma casos con objetos planos.
export type KpiAppointment = {
  status: KpiAppointmentStatus;
  startsAt: Date;
  endsAt: Date;
  clientId: string;
  professionalName: string;
  // Pago APROBADO asociado, si lo hay. Solo los pagos aprobados cuentan como
  // ingreso (igual criterio que `getReportData`). null = sin pago aprobado.
  payment: { amount: number; method: KpiPaymentMethod } | null;
};

export type StatusBreakdown = {
  completados: number;
  noShow: number;
  cancelados: number;
  // Base de turnos "resueltos" = completados + no-show + cancelados. Los PENDING /
  // CONFIRMED todavía-por-ocurrir no cuentan: no son fuga hasta que pasan.
  resueltos: number;
  // NO_SHOW / (COMPLETED + NO_SHOW). Mide "de los turnos que llegaron a su hora,
  // cuántos se perdieron por ausencia". Cancelados NO entran en el denominador
  // porque avisar con tiempo permite reasignar el hueco. 0 si no hay base.
  tasaNoShow: number;
  // CANCELLED / resueltos. 0 si no hay base.
  tasaCancelacion: number;
};

export type PaymentMixRow = {
  method: KpiPaymentMethod;
  cantidad: number;
  total: number;
};

export type RetentionBreakdown = {
  // Clientes distintos con al menos un turno "resuelto" (completado/no-show/
  // cancelado) en el período.
  clientesUnicos: number;
  // De esos, cuántos tienen 2+ turnos en el período.
  recurrentes: number;
  // Con exactamente 1 turno en el período.
  esporadicos: number;
  // recurrentes / clientesUnicos. 0 si no hay clientes. Se lee "en este período"
  // — es honesto respecto de la ventana, no una tasa de retención histórica
  // (eso exigiría escanear toda la historia, algo que evitamos por costo).
  tasaRecurrencia: number;
};

export type ChairProfitRow = {
  label: string; // nombre del profesional
  ingresos: number; // suma de pagos aprobados de sus turnos completados
  horas: number; // horas-silla ocupadas (duración de esos turnos)
  porHora: number; // ingresos / horas — 0 si no hay horas
};

export type DeepKpis = {
  estados: StatusBreakdown;
  ticketPromedio: number;
  mixMetodoPago: PaymentMixRow[];
  retencion: RetentionBreakdown;
  rentabilidadHoraSilla: ChairProfitRow[];
};

const HORA_MS = 60 * 60 * 1000;

// Duración del turno en horas. Nunca negativa: si endsAt <= startsAt (dato sucio)
// devuelve 0 para no ensuciar la rentabilidad hora-silla con horas fantasma.
function horasDe(a: KpiAppointment): number {
  const ms = a.endsAt.getTime() - a.startsAt.getTime();
  return ms > 0 ? ms / HORA_MS : 0;
}

function ratio(numerador: number, denominador: number): number {
  return denominador > 0 ? numerador / denominador : 0;
}

// Calcula todos los KPIs profundos en una sola pasada por el set de turnos.
export function computeDeepKpis(appointments: KpiAppointment[]): DeepKpis {
  let completados = 0;
  let noShow = 0;
  let cancelados = 0;

  // Ingresos (solo pagos aprobados) para ticket promedio y mix.
  let ingresosTotales = 0;
  let cantidadPagos = 0;
  const mix = new Map<KpiPaymentMethod, { cantidad: number; total: number }>();

  // Retención: cuántos turnos "resueltos" tuvo cada cliente en el período.
  const turnosPorCliente = new Map<string, number>();

  // Rentabilidad hora-silla: ingresos y horas por profesional (turnos completados).
  const porProfesional = new Map<string, { ingresos: number; horas: number }>();

  for (const a of appointments) {
    const resuelto =
      a.status === "COMPLETED" || a.status === "NO_SHOW" || a.status === "CANCELLED";

    if (a.status === "COMPLETED") completados++;
    else if (a.status === "NO_SHOW") noShow++;
    else if (a.status === "CANCELLED") cancelados++;

    if (resuelto) {
      turnosPorCliente.set(a.clientId, (turnosPorCliente.get(a.clientId) ?? 0) + 1);
    }

    if (a.payment) {
      ingresosTotales += a.payment.amount;
      cantidadPagos++;
      const m = mix.get(a.payment.method) ?? { cantidad: 0, total: 0 };
      m.cantidad++;
      m.total += a.payment.amount;
      mix.set(a.payment.method, m);
    }

    // Hora-silla: un turno aporta a la productividad del profesional cuando se
    // completó y generó ingreso. Un no-show ocupa la silla pero no factura —
    // no lo sumamos a "horas" para no castigar el ratio con huecos ajenos.
    if (a.status === "COMPLETED" && a.payment) {
      const p = porProfesional.get(a.professionalName) ?? { ingresos: 0, horas: 0 };
      p.ingresos += a.payment.amount;
      p.horas += horasDe(a);
      porProfesional.set(a.professionalName, p);
    }
  }

  const resueltos = completados + noShow + cancelados;

  const estados: StatusBreakdown = {
    completados,
    noShow,
    cancelados,
    resueltos,
    // Denominador de no-show: turnos que llegaron a su hora (completados + ausencias).
    tasaNoShow: ratio(noShow, completados + noShow),
    tasaCancelacion: ratio(cancelados, resueltos),
  };

  let recurrentes = 0;
  for (const count of turnosPorCliente.values()) {
    if (count >= 2) recurrentes++;
  }
  const clientesUnicos = turnosPorCliente.size;
  const retencion: RetentionBreakdown = {
    clientesUnicos,
    recurrentes,
    esporadicos: clientesUnicos - recurrentes,
    tasaRecurrencia: ratio(recurrentes, clientesUnicos),
  };

  const mixMetodoPago: PaymentMixRow[] = Array.from(mix.entries())
    .map(([method, v]) => ({ method, cantidad: v.cantidad, total: v.total }))
    .sort((a, b) => b.total - a.total);

  const rentabilidadHoraSilla: ChairProfitRow[] = Array.from(porProfesional.entries())
    .map(([label, v]) => ({
      label,
      ingresos: v.ingresos,
      horas: v.horas,
      porHora: ratio(v.ingresos, v.horas),
    }))
    .sort((a, b) => b.porHora - a.porHora);

  return {
    estados,
    ticketPromedio: ratio(ingresosTotales, cantidadPagos),
    mixMetodoPago,
    retencion,
    rentabilidadHoraSilla,
  };
}
