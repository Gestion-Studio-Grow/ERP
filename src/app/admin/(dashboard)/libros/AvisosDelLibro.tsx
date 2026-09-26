// ============================================================================
// Lo que la pantalla del Libro IVA dice ARRIBA de los libros (refutador, vuelta 4): qué locales del
// mismo CUIT suma, y las facturas de prueba (CAE simulado), aparte, a la vista y sin sumar. Antes sólo
// lo decían el CSV y el paquete: en la pantalla las de prueba desaparecían sin aviso y el débito incluía
// las ventas del otro local sin decirlo. Los mismos textos que el CSV (libro-iva-export.ts).
// ============================================================================

import type { LibroIva } from "@/lib/libros/libro-iva";
import { EXPLICACION_FACTURAS_DE_PRUEBA, listaDeLocalesDelLibro } from "@/lib/libros/libro-iva-export";
import { avisoDelLibroFacturaAFuera } from "@/lib/fiscal/regimen-factura-a";
import { diaLegible } from "@/lib/libros/fecha-fiscal";
import { fmtMoneyARS } from "@/components/ui/format";

export default function AvisosDelLibro({
  libro,
}: {
  libro: Pick<LibroIva, "negocios" | "comprobantesDePrueba" | "facturaAFueraDelSistema">;
}) {
  const locales = listaDeLocalesDelLibro(libro.negocios);
  const dePrueba = libro.comprobantesDePrueba ?? [];
  const facturaAFuera = avisoDelLibroFacturaAFuera(libro.facturaAFueraDelSistema);
  if (!locales && dePrueba.length === 0 && !facturaAFuera) return null;
  return (
    <div className="mb-6 space-y-4">
      {facturaAFuera && (
        <p role="note" className="rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-body">
          {facturaAFuera}
        </p>
      )}
      {locales && (
        <p className="rounded-lg border border-line bg-surface-sunken px-4 py-3 text-sm text-body">
          Este libro suma los locales del mismo CUIT: {locales}. Cada comprobante lleva su punto de venta en el número.
        </p>
      )}
      {dePrueba.length > 0 && (
        <section aria-labelledby="libro-facturas-de-prueba" className="rounded-lg border border-line px-4 py-3">
          <h2 id="libro-facturas-de-prueba" className="text-base font-semibold text-strong">
            Facturas de prueba ({dePrueba.length})
          </h2>
          <p className="mb-2 text-sm text-muted">{EXPLICACION_FACTURAS_DE_PRUEBA}. No están en los totales de abajo.</p>
          <ul className="divide-y divide-line text-sm">
            {dePrueba.map((c) => (
              <li key={c.clave} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {c.tipo} {c.numero} · {diaLegible(c.fecha)} · {c.cliente}
                </span>
                <span className="tabular-nums">{fmtMoneyARS(c.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
