import { centavosDe } from "@/lib/dinero/redondeo";
// ============================================================================
// FACTURADOR EN UNA PANTALLA — lo poco que suma la pantalla única sobre facturador-core
// ============================================================================
//
// docs/facturacion/ux-v2-diseno.md §1: monto + concepto (chips con los servicios del negocio), el
// comprador plegado como «Consumidor final», la letra que decide el sistema (`letraPrevista`, la
// misma de siempre) y una previa de una línea. La validación y la cuenta siguen siendo las de
// facturador-core / facturita-core: acá no se reimplementa nada fiscal. PURA.

import { nombreDelComprador, type Borrador, type Comprador, type Previa } from "@/lib/facturacion/facturador-core";
import type { ConceptoFacturita } from "@/lib/facturita-core";

/** Un servicio del negocio como chip de «¿Qué hiciste?». */
export interface ServicioParaFacturar {
  nombre: string;
  /** Precio de lista; null = sin precio (sólo completa el detalle). */
  precio: number | null;
}

/** 12100 → «12.100»; 12100.5 → «12.100,50»: como lo escribiría la persona (lo lee `totalDelTexto`). */
export function montoComoTexto(n: number): string {
  const entero = Math.trunc(n);
  const centavos = centavosDe(n) - entero * 100;
  const miles = entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return centavos > 0 ? `${miles},${String(centavos).padStart(2, "0")}` : miles;
}

/** Tocar un chip de servicio: el detalle, el concepto «servicios» y el precio si el monto está vacío. */
export function alElegirServicio(
  b: Pick<Borrador, "total">,
  s: ServicioParaFacturar,
): { descripcion: string; concepto: ConceptoFacturita; total?: string } {
  return {
    descripcion: s.nombre,
    concepto: "servicios",
    ...(s.precio != null && !b.total.trim() ? { total: montoComoTexto(s.precio) } : {}),
  };
}

/** ¿El error pide identificar al comprador? Entonces el bloque del comprador se despliega solo. */
export function pideIdentificarAlComprador(error: string | null | undefined): boolean {
  return !!error && /identificar al comprador|dni, cuil o cuit|del comprador|domicilio/i.test(error);
}

/** La previa en una línea: «Factura B a Consumidor final · $12.100 (IVA $2.100 incluido)». */
export function previaEnUnaLinea(v: Previa | null, c: Comprador, formatear: (n: number) => string): string | null {
  if (!v) return null;
  const nombre = v.letra ? `Factura ${v.letra}` : "Factura";
  const iva = v.discrimina && v.iva > 0 ? ` (IVA ${formatear(v.iva)} incluido)` : "";
  return `${nombre} a ${nombreDelComprador(c)} · ${formatear(v.total)}${iva}`;
}
