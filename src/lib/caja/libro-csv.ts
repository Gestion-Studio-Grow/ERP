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
import {
  CASH_METHODS,
  ORIGEN_CONTABLE_LABEL,
  egresosPorOrigen,
  origenDeFila,
  type Libro,
  type MethodAmounts,
} from "@/lib/caja/libro-caja";

const SEP = ";";

// Un salto de línea DENTRO de un campo (un detalle pegado de un mensaje) salía como un \n
// suelto entre comillas en un archivo que separa las filas con \r\n: para Excel es válido,
// pero quien lo lee línea por línea ve una fila partida, y el paquete del Cierre del mes
// parte este mismo texto en líneas (paquete-lectura.ts, `split(/\r?\n/)`): la fila llegaba
// cortada en dos al archivo de la contadora. En el libro cada campo es UNA línea.
// Se parte por el salto y se vuelve a unir con un espacio: un campo que EMPIEZA con un salto
// no puede quedar empezando con un espacio delante de un "=" (la guarda de fórmulas mira el
// primer carácter).
const enUnaLinea = (v: string | number) =>
  typeof v === "string" && /[\r\n]/.test(v)
    ? v.split(/\r\n|\r|\n/).map((p) => p.trim()).filter(Boolean).join(" ")
    : v;
const row = (...f: (string | number)[]) => f.map((v) => csvField(enUnaLinea(v))).join(SEP);

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

  // ── Egresos abiertos por origen ──
  // Lo que la contadora imputa: separa lo que asentó el sistema (compras, comisiones,
  // anulaciones, diferencias de cierre) de lo tipeado a mano, que es lo que tiene que
  // respaldar con comprobante. Sale de las MISMAS filas del archivo: en el export de un
  // día es el subtotal de ese día, aunque el RESUMEN de arriba sea el del mes.
  L.push(row("EGRESOS POR ORIGEN (de los movimientos de abajo)", ...CASH_METHODS.map(methodLabel), "Total"));
  const porOrigen = egresosPorOrigen(libro.rows);
  for (const { origen, egresos } of porOrigen) L.push(linea(ORIGEN_CONTABLE_LABEL[origen], egresos));
  if (porOrigen.length === 0) L.push(row("(sin egresos)"));
  L.push("");

  // ── Movimientos ──
  // Las columnas 0 a 5 no se mueven (quien ya armó fórmulas sobre el archivo las tiene
  // ancladas ahí): Origen y Referencia van AL FINAL. La referencia es el id de lo que
  // originó la fila (compra, liquidación, pedido, cobro, día de cierre, turno de caja),
  // nunca el usuario que la cargó.
  L.push(row("Fecha", "Detalle", "Medio", "Ingreso", "Egreso", "Saldo", "Origen", "Referencia"));
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
        ORIGEN_CONTABLE_LABEL[origenDeFila(r)],
        r.referencia ?? "",
      ),
    );
  }
  if (libro.rows.length === 0) L.push(row("", "(sin movimientos en el mes)"));

  return L.join("\r\n") + "\r\n";
}
