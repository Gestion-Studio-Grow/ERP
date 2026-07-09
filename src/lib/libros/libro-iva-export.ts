// ============================================================================
// Export ESTRUCTURADO del Libro IVA para el contador (ADR-060 D7). PURO.
// ============================================================================
//
// "Formato estructurado, NO CSV plano" (directiva): en vez de un volcado de filas, el
// export tiene la ESTRUCTURA del Libro IVA — secciones (Ventas / Compras), columnas
// fiscales, subtotales por sección y un RESUMEN con IVA débito/crédito/saldo. Separador
// `;` (Excel AR) y BOM UTF-8 para que abra bien en Excel/Sheets del contador. Es texto
// puro y testeable; la ruta HTTP solo lo envía como descarga.

import type { LibroIva } from "./libro-iva";

const SEP = ";";

/** Escapa un campo para CSV (comillas si tiene separador, comillas o salto de línea). */
function csv(value: string | number): string {
  const s = String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Monto con 2 decimales y coma decimal (formato AR), sin separador de miles (para parsear). */
function money(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/** Alícuota (fracción) → "21%" / "10,5%". */
function pct(frac: number): string {
  return `${(frac * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

function row(cells: (string | number)[]): string {
  return cells.map(csv).join(SEP);
}

/**
 * Construye el contenido del export. `meta.desde`/`meta.hasta` en "YYYY-MM-DD".
 * Devuelve el string SIN BOM (la ruta HTTP le antepone el BOM). PURA.
 */
export function buildLibroIvaExport(libro: LibroIva, meta: { desde: string; hasta: string; tenant?: string }): string {
  const { ventas, compras, resumen } = libro;
  const lines: string[] = [];

  lines.push(row(["Libro IVA", meta.tenant ?? "", `Período ${meta.desde} a ${meta.hasta}`]));
  lines.push("");

  // --- Ventas (IVA débito) ---
  lines.push(row(["VENTAS (IVA débito)"]));
  lines.push(row(["Fecha", "Tipo", "Número", "Cliente", "Documento", "Neto", "Alícuota", "IVA", "Total", "Origen"]));
  for (const v of ventas) {
    lines.push(
      row([v.fecha, v.tipo, v.numero, v.cliente, v.doc, money(v.neto), pct(v.alicuota), money(v.iva), money(v.total), v.fuente === "comprobante" ? "Comprobante fiscal" : "Estimado 21%"]),
    );
  }
  lines.push(row(["Subtotal ventas", "", "", "", "", money(resumen.ventasNeto), "", money(resumen.ventasIva), money(resumen.ventasTotal), ""]));
  lines.push("");

  // --- Compras (IVA crédito) ---
  lines.push(row(["COMPRAS (IVA crédito)"]));
  lines.push(row(["Fecha", "Proveedor", "Documento", "Número", "Neto", "Alícuota", "IVA", "Total", "Origen"]));
  for (const c of compras) {
    lines.push(
      row([c.fecha, c.proveedor, c.doc, c.numero, money(c.neto), pct(c.alicuota), money(c.iva), money(c.total), c.fuente === "comprobante" ? "Comprobante fiscal" : "Estimado 21%"]),
    );
  }
  lines.push(row(["Subtotal compras", "", "", "", money(resumen.comprasNeto), "", money(resumen.comprasIva), money(resumen.comprasTotal), ""]));
  lines.push("");

  // --- Resumen fiscal ---
  lines.push(row(["RESUMEN"]));
  lines.push(row(["IVA débito (ventas)", money(resumen.ivaDebito)]));
  lines.push(row(["IVA crédito (compras)", money(resumen.ivaCredito)]));
  lines.push(row([resumen.ivaSaldo >= 0 ? "Saldo IVA a pagar" : "Saldo IVA a favor", money(Math.abs(resumen.ivaSaldo))]));
  if (resumen.ventasEstimadas > 0 || resumen.comprasEstimadas > 0) {
    lines.push("");
    lines.push(
      row([
        "Nota",
        `Filas "Estimado 21%": ${resumen.ventasEstimadas} ventas y ${resumen.comprasEstimadas} compras sin comprobante fiscal, con IVA derivado del total. Conciliar con los comprobantes emitidos por ARCA.`,
      ]),
    );
  }

  return lines.join("\n");
}
