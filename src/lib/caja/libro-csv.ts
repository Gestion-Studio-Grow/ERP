// Armado del CSV del LIBRO DE CAJA. Lógica PURA y testeable: recibe el libro ya
// calculado y devuelve el texto; no toca Prisma ni Next. La ruta
// `/admin/caja/libro/export` la llama y la sirve como `text/csv`.
//
// A diferencia del export de Reportes, que son AGREGADOS, acá van los MOVIMIENTOS
// uno por uno: es lo que la contadora necesita para clasificar e imputar. Sale el
// mismo bloque RESUMEN que la pantalla, arriba, para que el archivo se lea solo.
//
// Formato es-AR, igual que `report-csv.ts`: separador `;` porque en es-AR la coma es
// el separador decimal y Excel en locale español parte los números con `,`. El BOM lo
// agrega la ruta al servir, mismo criterio que el otro export.

import { csvField } from "@/lib/report-csv";
import type { CashMethod } from "@/lib/caja/cash-register";
import { CASH_METHODS, type Libro, type MethodAmounts } from "@/lib/caja/libro-caja";

const SEP = ";";
const row = (...f: (string | number)[]) => f.map(csvField).join(SEP);

// Los importes van con COMA decimal y sin separador de miles: es lo que Excel es-AR
// interpreta como número. Con punto quedarían como texto y no se podrían sumar —
// que es lo primero que hace quien recibe el archivo.
function money(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

// Fecha ISO (YYYY-MM-DD) a propósito: es la que ordena bien en cualquier planilla,
// a diferencia de dd/mm que Excel reinterpreta según el locale de quien abre.
function isoDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type LibroCsvDeps = {
  methodLabel: (m: CashMethod) => string;
  monthLabel: string;
  totalOf: (a: MethodAmounts) => number;
};

export function buildLibroCsv(libro: Libro, deps: LibroCsvDeps): string {
  const { methodLabel, monthLabel, totalOf } = deps;
  const L: string[] = [];

  L.push(row(`Libro de caja — ${monthLabel}`));
  L.push("");

  // ── Resumen, igual que la pantalla ──
  L.push(row("RESUMEN", ...CASH_METHODS.map(methodLabel), "Total"));
  const linea = (rotulo: string, a: MethodAmounts) =>
    row(rotulo, ...CASH_METHODS.map((m) => money(a[m])), money(totalOf(a)));
  L.push(linea("Saldo inicial", libro.summary.opening));
  L.push(linea("Ingresos (+)", libro.summary.ingresos));
  L.push(linea("Egresos (-)", libro.summary.egresos));
  L.push(linea("Saldo actual", libro.summary.saldo));
  L.push("");

  // ── Movimientos ──
  L.push(row("Fecha", "Detalle", "Medio", "Ingreso", "Egreso", "Saldo"));
  for (const r of libro.rows) {
    const entra = r.signedAmount > 0;
    const sale = r.signedAmount < 0;
    L.push(
      row(
        isoDate(r.occurredAt),
        r.detail,
        methodLabel(r.method),
        entra ? money(r.amount) : "",
        sale ? money(r.amount) : "",
        money(r.runningTotal),
      ),
    );
  }
  if (libro.rows.length === 0) L.push(row("", "(sin movimientos en el mes)"));

  return L.join("\r\n") + "\r\n";
}
