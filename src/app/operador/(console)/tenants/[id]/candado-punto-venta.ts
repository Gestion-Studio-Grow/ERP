// ============================================================================
// CANDADO FISCAL — un CUIT no repite punto de venta entre negocios.
// ============================================================================
//
// ARCA numera los comprobantes por CUIT + punto de venta: es un talonario. Una marca con
// varios locales bajo el mismo CUIT tiene un negocio del sistema por local, y cada uno
// tiene que facturar con SU punto de venta. Si dos negocios cargan el mismo, los dos piden
// "el próximo número" del mismo talonario: uno de los dos recibe rechazos o deja huecos, y
// el descuadre aparece a fin de mes.
//
// Hasta ahora nada lo impedía: la guarda de numeración de facturas es por negocio
// (Invoice @@unique([tenantId, puntoVenta, tipoComprobante, numero]), schema.prisma:996), Tenant
// no tiene índice sobre el par, y `setTenantArcaCuit` / `setTenantArcaPuntoVenta` escribían sin
// mirar a los demás. El índice UNIQUE(arcaCuit, arcaPuntoVenta) necesita migración (segunda
// ventana); mientras tanto el candado vive en la consola, que es donde GSG carga estos dos
// datos. Las dos actions lo corren dentro de una transacción con un lock por CUIT, así dos
// operadores guardando a la vez no se cuelan entre la lectura y la escritura.
// OJO: la re-alta de la cartera del contador (cartera-actions.ts) también completa el punto de
// venta de un negocio existente y todavía no pasa por acá.
//
// PURO: recibe las filas de los otros negocios con ese CUIT y decide. Lo testea
// candado-punto-venta.test.ts con datos.

import { fmtCuit } from "@/components/ui/format";

/** Lo que el candado necesita de otro negocio. */
export interface NegocioFiscal {
  id: string;
  name: string;
  slug: string;
  arcaCuit: string | null;
  arcaPuntoVenta: number | null;
}

/** El CUIT como 11 dígitos, para comparar "20-30405060-7" con "20304050607". */
export function cuitNormalizado(cuit: string | null | undefined): string | null {
  const d = (cuit ?? "").replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

/**
 * El negocio que ya usa este CUIT con este punto de venta, o `null` si está libre. Sin CUIT
 * o sin punto de venta no hay talonario que compartir: nunca choca. El propio negocio no
 * cuenta (volver a guardar lo mismo no es un choque).
 */
export function choqueDePuntoDeVenta(
  propio: { tenantId: string; cuit: string | null; puntoVenta: number | null },
  otros: readonly NegocioFiscal[],
): NegocioFiscal | null {
  const cuit = cuitNormalizado(propio.cuit);
  if (!cuit || !propio.puntoVenta) return null;
  return (
    otros.find(
      (o) =>
        o.id !== propio.tenantId &&
        cuitNormalizado(o.arcaCuit) === cuit &&
        o.arcaPuntoVenta === propio.puntoVenta,
    ) ?? null
  );
}

/**
 * Los puntos de venta que este CUIT ya usa en OTROS negocios, de menor a mayor. La ficha los
 * muestra al lado del campo para que el operador elija uno libre sin probar a ciegas.
 */
export function puntosDeVentaUsados(
  tenantId: string,
  cuit: string | null,
  otros: readonly NegocioFiscal[],
): { puntoVenta: number; negocio: NegocioFiscal }[] {
  const c = cuitNormalizado(cuit);
  if (!c) return [];
  return otros
    .filter((o) => o.id !== tenantId && cuitNormalizado(o.arcaCuit) === c && !!o.arcaPuntoVenta)
    .map((o) => ({ puntoVenta: o.arcaPuntoVenta as number, negocio: o }))
    .sort((a, b) => a.puntoVenta - b.puntoVenta || a.negocio.slug.localeCompare(b.negocio.slug));
}

/** "1 (MAGRA Canning), 3 (MAGRA Lomas)". */
export function listaDePuntosUsados(usados: readonly { puntoVenta: number; negocio: NegocioFiscal }[]): string {
  return usados.map((u) => `${u.puntoVenta} (${u.negocio.name})`).join(", ");
}

/** El rechazo, dicho para el operador: qué pasó, por qué importa y cómo seguir. */
export function motivoDeChoque(
  cuit: string,
  puntoVenta: number,
  otro: NegocioFiscal,
  usados: readonly { puntoVenta: number; negocio: NegocioFiscal }[],
): string {
  const ocupados = usados.length > 0 ? ` Este CUIT ya usa: ${listaDePuntosUsados(usados)}.` : "";
  return (
    `No se guardó: el punto de venta ${puntoVenta} del CUIT ${fmtCuit(cuit)} ya lo usa ` +
    `«${otro.name}» (/${otro.slug}). Dos negocios con el mismo punto de venta numeran el mismo ` +
    `talonario en ARCA y las facturas se rechazan. Pedí en ARCA un punto de venta nuevo para ` +
    `este local y cargalo acá.${ocupados}`
  );
}
