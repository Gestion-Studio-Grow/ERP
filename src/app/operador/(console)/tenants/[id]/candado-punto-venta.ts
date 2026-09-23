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
// La cartera del contador (cartera-actions.ts) también carga el punto de venta, en el alta y en
// la re-alta de un cliente: pasa por `choqueDePuntoDeVenta` con el mismo lock por CUIT, y le
// avisa al contador con `avisoDeChoqueAlContador` (sin nombrar al otro negocio, que no es suyo).
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

/**
 * El aviso para el CONTADOR cuando el punto de venta que escribió ya lo usa otro negocio de ese
 * CUIT. No nombra al otro negocio (puede no ser de su cartera): dice qué no se hizo, por qué
 * importa y cómo seguir. Lo que ya estaba cargado no se toca.
 */
export function avisoDeChoqueAlContador(puntoVenta: number): string {
  return (
    `No se cargó el punto de venta ${puntoVenta}: ese CUIT ya lo usa otro negocio con ese número, y dos negocios ` +
    "con el mismo punto de venta numeran el mismo talonario en ARCA. Pedí en ARCA un punto de venta nuevo para " +
    "este cliente y pasáselo a Gestión Studio Grow."
  );
}

// ── El alta del contador con un CUIT que tienen varios negocios ──────────────
//
// Hasta ahora el alta buscaba el CUIT con `findFirst` y se quedaba con el primero que
// devolviera la base. Con una marca de varios locales bajo el mismo CUIT eso es elegir un
// negocio cualquiera: la re-alta podía reactivar (y completarle el punto de venta a) el local
// equivocado, o contestar "ya está registrado" teniendo el correcto en la cartera.

/** Un negocio con el CUIT pedido, y si está en la cartera de ESTE estudio. */
export interface NegocioDelCuit {
  id: string;
  slug: string;
  arcaPuntoVenta: number | null;
  enMiCartera: boolean;
}

export type EleccionPorCuit =
  /** Ningún negocio tiene ese CUIT: se da de alta uno nuevo. */
  | { tipo: "nuevo" }
  /** Es el CUIT del propio estudio. */
  | { tipo: "propio" }
  /** Existe pero no está en esta cartera: vincularlo es decisión de GSG, nunca automática. */
  | { tipo: "ajeno" }
  /** Uno solo de esta cartera, sin ambigüedad: re-alta de ése. */
  | { tipo: "realta"; negocio: NegocioDelCuit }
  /** Varios de esta cartera y el punto de venta no desempata: hay que decir cuál. */
  | { tipo: "ambiguo"; cantidad: number; puntosDeVenta: number[] };

/**
 * Qué negocio es el del alta, entre todos los que tienen ese CUIT. Nunca elige al azar: si el
 * punto de venta que escribió el contador no deja uno solo de su cartera, se lo pregunta. PURA.
 */
export function elegirNegocioDelCuit(
  estudioId: string,
  negocios: readonly NegocioDelCuit[],
  puntoVenta: number | null,
): EleccionPorCuit {
  if (negocios.some((n) => n.id === estudioId)) return { tipo: "propio" };
  if (negocios.length === 0) return { tipo: "nuevo" };
  const mios = negocios.filter((n) => n.enMiCartera);
  if (mios.length === 0) return { tipo: "ajeno" };
  if (mios.length === 1) return { tipo: "realta", negocio: mios[0] };
  const porPunto = puntoVenta === null ? [] : mios.filter((n) => n.arcaPuntoVenta === puntoVenta);
  if (porPunto.length === 1) return { tipo: "realta", negocio: porPunto[0] };
  return {
    tipo: "ambiguo",
    cantidad: mios.length,
    puntosDeVenta: mios.flatMap((n) => (n.arcaPuntoVenta ? [n.arcaPuntoVenta] : [])).sort((a, b) => a - b),
  };
}

/** El porqué de "ambiguo", dicho para el contador. */
export function motivoCuitAmbiguo(cantidad: number, puntosDeVenta: readonly number[]): string {
  const pvs = puntosDeVenta.length > 0 ? ` (puntos de venta ${puntosDeVenta.join(", ")})` : "";
  return (
    `Ese CUIT tiene ${cantidad} negocios en tu cartera${pvs}. Escribí el punto de venta del que querés dar ` +
    "de alta de nuevo, así no se toca el que no es."
  );
}
