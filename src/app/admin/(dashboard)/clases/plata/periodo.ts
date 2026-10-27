// Plata (matias-DISENO.md §2.3 · M-073/M-075): el período (Hoy · Semana · Mes), sus rótulos y
// el .csv de cobros para el contador. PURO: lo usan la página, la exportación y periodo.test.ts.
//
// Los períodos son los mismos que `plata(periodo)` de datos.server.ts: hoy, desde el lunes de esta
// semana, desde el 1 del mes; siempre hasta el final de hoy, en la hora del negocio.

import { MEDIO_LABEL, semanaDesdeLunes, sumarDias, type MedioPago } from "@/lib/padel/core";
import { BOM, filaCsv } from "@/lib/libros/csv-ar";
import { textoAlCentavo } from "@/lib/dinero/redondeo";

export type PeriodoPlata = "hoy" | "semana" | "mes";

export const PERIODOS: readonly { valor: PeriodoPlata; rotulo: string }[] = [
  { valor: "hoy", rotulo: "Hoy" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mes" },
];

/** Lo que venga en `?periodo=`: si no es uno de los tres, el mes (lo que más se mira). */
export function periodoDe(raw: unknown): PeriodoPlata {
  return raw === "hoy" || raw === "semana" || raw === "mes" ? raw : "mes";
}

/** Del primer día del período a mañana (exclusivo), «YYYY-MM-DD» del negocio. */
export function rangoDelPeriodo(periodo: PeriodoPlata, hoy: string): { desde: string; hasta: string } {
  const desde = periodo === "hoy" ? hoy : periodo === "semana" ? semanaDesdeLunes(hoy) : `${hoy.slice(0, 8)}01`;
  return { desde, hasta: sumarDias(hoy, 1) };
}

export function rotuloCobrado(periodo: PeriodoPlata): string {
  return periodo === "hoy" ? "Cobrado hoy" : periodo === "semana" ? "Cobrado en la semana" : "Cobrado en el mes";
}

export function rotuloDadas(periodo: PeriodoPlata, n: number): string {
  const clases = `${n} clase${n === 1 ? "" : "s"} dada${n === 1 ? "" : "s"}`;
  return periodo === "hoy" ? `${clases} hoy` : periodo === "semana" ? `${clases} en la semana` : `${clases} en el mes`;
}

/**
 * El medio de un cobro. Un comprobante validado no anota medio (fue una transferencia): igual que
 * `plata()`, cuenta como Transferencia.
 */
export const medioDelCobro = (pagoMedio: string | null | undefined): MedioPago =>
  pagoMedio && pagoMedio in MEDIO_LABEL ? (pagoMedio as MedioPago) : "TRANSFERENCIA";

/** «Efectivo 420.000 · Transf. 500.000 · MP 60.000»: los medios con plata, en ese orden. */
const CORTO: Partial<Record<MedioPago, string>> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transf.", MERCADO_PAGO: "MP" };
export function desgloseCorto(porMedio: Record<string, number>): { medio: MedioPago; rotulo: string; monto: number }[] {
  return (["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO"] as const)
    .filter((m) => (porMedio[m] ?? 0) > 0)
    .map((m) => ({ medio: m, rotulo: CORTO[m] ?? MEDIO_LABEL[m], monto: porMedio[m] ?? 0 }));
}

export type FilaCobro = { fecha: Date; alumno: string; medio: MedioPago; monto: number };

const ZONA = "America/Argentina/Buenos_Aires";
const fechaCsv = (d: Date) => d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA });
const horaCsv = (d: Date) => d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA });

/**
 * El .csv del período (M-075): una fila por cobro con fecha, hora, alumno, medio y monto, del más
 * viejo al más nuevo, y el total al final. `;` y coma decimal, para el Excel en castellano
 * (csv-ar.ts); los nombres van a salvo de fórmulas. La respuesta le antepone el BOM.
 */
export function csvCobros(filas: readonly FilaCobro[]): string {
  const orden = [...filas].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const monto = (n: number) => textoAlCentavo(n).replace(".", ",");
  const lineas = [
    filaCsv("Fecha", "Hora", "Alumno", "Medio", "Monto"),
    ...orden.map((f) => filaCsv(fechaCsv(f.fecha), horaCsv(f.fecha), f.alumno, MEDIO_LABEL[f.medio], monto(f.monto))),
    filaCsv("", "", "", "Total", monto(orden.reduce((s, f) => s + f.monto, 0))),
  ];
  return lineas.join("\r\n") + "\r\n";
}

export const CSV_BOM = BOM;

export function nombreArchivo(periodo: PeriodoPlata, hoy: string): string {
  return periodo === "mes" ? `cobros-${hoy.slice(0, 7)}` : periodo === "semana" ? `cobros-semana-${semanaDesdeLunes(hoy)}` : `cobros-${hoy}`;
}
