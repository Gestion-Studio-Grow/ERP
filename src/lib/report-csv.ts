// Export CSV del reporte del dueño (Reportes v2). Lógica PURA y testeable: arma el
// texto CSV a partir de los datos ya calculados (facturación de `getReportData` +
// KPIs de `getDeepReportData`); no toca la DB ni Next. El route handler
// `/admin/reportes/export` la llama y devuelve el texto como `text/csv`.
//
// Formato: un CSV con secciones (encabezado + tablas), pensado para abrirse en
// Excel/Sheets. Se usa `;` como separador porque en es-AR la coma es separador
// decimal y Excel en locale español espera `;` — así los números no se parten.

import type { DeepKpis } from "@/lib/report-kpis";
import { METODO_LABEL } from "@/lib/report-config";

const SEP = ";";

// Escapa un campo CSV: si contiene el separador, comillas o saltos de línea, se
// envuelve en comillas y se duplican las comillas internas (RFC 4180).
export function csvField(value: string | number): string {
  const s = String(value);
  if (s.includes(SEP) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...fields: (string | number)[]): string {
  return fields.map(csvField).join(SEP);
}

// Número a texto es-AR con 2 decimales para importes (coma decimal). Se escapa
// luego con csvField, que lo envuelve en comillas si hiciera falta.
function money(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(n: number): string {
  return (n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%";
}

export type ReportCsvInput = {
  desde: Date;
  hasta: Date;
  rangeDays: number;
  totalIngresos: number;
  cantidadPagos: number;
  totalTurnos: number;
  porDia: { label: string; total: number }[];
  porProfesional: { label: string; total: number }[];
  porServicio: { label: string; total: number }[];
  kpis: DeepKpis;
};

// Arma el CSV completo. Determinista (mismo input → mismo texto), sin fechas
// "ahora" internas: `desde`/`hasta` vienen dados. Une con CRLF (RFC 4180).
export function buildReportCsv(input: ReportCsvInput): string {
  const k = input.kpis;
  const lines: string[] = [];

  lines.push(row("Reporte del negocio"));
  lines.push(
    row(
      "Período",
      `${input.desde.toISOString().slice(0, 10)} a ${input.hasta.toISOString().slice(0, 10)}`,
      `${input.rangeDays} días`,
    ),
  );
  lines.push("");

  lines.push(row("Indicador", "Valor"));
  lines.push(row("Ingresos totales", money(input.totalIngresos)));
  lines.push(row("Turnos cobrados", input.cantidadPagos));
  lines.push(row("Turnos del período", input.totalTurnos));
  lines.push(row("Ticket promedio", money(k.ticketPromedio)));
  lines.push(row("Tasa de no-show", pct(k.estados.tasaNoShow)));
  lines.push(row("Tasa de cancelación", pct(k.estados.tasaCancelacion)));
  lines.push(row("Clientes únicos", k.retencion.clientesUnicos));
  lines.push(row("Clientes recurrentes", k.retencion.recurrentes));
  lines.push(row("Tasa de recurrencia", pct(k.retencion.tasaRecurrencia)));
  lines.push("");

  lines.push(row("Ingresos por día", "Total"));
  for (const r of input.porDia) lines.push(row(r.label, money(r.total)));
  lines.push("");

  lines.push(row("Ingresos por profesional", "Total"));
  for (const r of input.porProfesional) lines.push(row(r.label, money(r.total)));
  lines.push("");

  lines.push(row("Ingresos por servicio", "Total"));
  for (const r of input.porServicio) lines.push(row(r.label, money(r.total)));
  lines.push("");

  lines.push(row("Rentabilidad hora-silla", "Ingresos", "Horas", "Por hora"));
  for (const r of k.rentabilidadHoraSilla) {
    lines.push(row(r.label, money(r.ingresos), r.horas.toLocaleString("es-AR", { maximumFractionDigits: 1 }), money(r.porHora)));
  }
  lines.push("");

  lines.push(row("Método de pago", "Cantidad", "Total"));
  for (const m of k.mixMetodoPago) {
    lines.push(row(METODO_LABEL[m.method] ?? m.method, m.cantidad, money(m.total)));
  }

  return lines.join("\r\n");
}
