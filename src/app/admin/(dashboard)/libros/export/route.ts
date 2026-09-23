/**
 * Export del Libro IVA de UN MES al contador — `GET /admin/libros/export?mes=2026-08`.
 *
 * Estructurado (comprobantes, ventas sin comprobante, compras y resumen), con `;` y BOM
 * para que abra bien en Excel. Lo arma `libro-iva-export.ts` (puro, testeado); acá sólo se
 * lee y se sirve. La guardia es la misma que la pantalla: `requireApp("libro-iva")` (rol,
 * módulo asignado y edición). Antes pedía además la edición Empresa, que con el motor de
 * perfiles apagado no tiene nadie: la exportación de una pantalla vendida no se podía bajar.
 *
 * A un monotributista (sólo Factura C) no se le arma: la pantalla se le oculta y el botón no
 * aparece. Si llega por la URL, un texto que dice dónde está lo suyo (el paquete del Cierre
 * del mes), no un libro de IVA que no le corresponde.
 */

import { getLibroIva } from "@/lib/libros/libro-iva-loader";
import { armarExportLibroIva } from "@/lib/libros/libro-iva-export";
import { libroOcultoPara } from "@/lib/libros/libro-iva";
import { BOM, cabecerasCsv } from "@/lib/libros/csv-ar";
import { esMesKey, mesDelNegocio } from "@/lib/libros/fecha-fiscal";
import { getTenantBrand } from "@/lib/branding";
import { logger } from "@/lib/logger";
import { requireApp } from "@/lib/require-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Guardia de la app (ADR-098): una app oculta no es una app protegida.
  await requireApp("libro-iva");
  const actual = mesDelNegocio();
  const pedido = new URL(request.url).searchParams.get("mes");
  const mes = esMesKey(pedido) && pedido <= actual ? pedido : actual;
  try {
    const [libro, brand] = await Promise.all([getLibroIva(mes), getTenantBrand()]);
    if (libroOcultoPara(libro.resumen.condicion)) {
      return new Response(
        "Tu negocio emite Factura C (monotributo): el Libro IVA no le corresponde. Lo facturado del mes va en el paquete del Cierre del mes (/admin/cierre-mes).",
        { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
      );
    }
    const body = armarExportLibroIva(libro, { mes, negocio: brand.name });
    return new Response(BOM + body, { status: 200, headers: cabecerasCsv(`libro-iva-${mes}.csv`) });
  } catch (err) {
    logger.error("libros/export", "no se pudo generar el Libro IVA", err);
    return new Response("No se pudo armar el Libro IVA. Volvé a intentar en un momento; si sigue, avisanos.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
