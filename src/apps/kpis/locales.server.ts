// ============================================================================
// NÚMEROS DE MIS LOCALES — el tablero de la casa en los botones del Inicio.
// ============================================================================
//
// Estos números no se pueden sacar con UNA operación del `db` del request, como el resto de la
// carpeta: son datos de OTROS negocios, y cada local se lee en su propia transacción, con su
// GUC. Esa lectura vive en src/lib/multilocal/multilocal-actions.ts (con `exigirCasa`, los ids
// sacados de las filas de la casa y `react.cache`): las cuatro apps y la pantalla comparten UNA
// pasada por local en el mismo request. Acá sólo se la pide y se la dice en palabras.
//
// Lo que sí se respeta de la carpeta:
//   · la primera lectura es UNA operación del `db` del request, con el negocio en el `where`:
//     ¿esta casa tiene locales vinculados? Si no tiene, se contesta '—' con el motivo y la red
//     ni se recorre;
//   · nada de caché entre requests ni transacciones escritas acá (las abre la action, con el
//     `tx` de cada local, nunca con el `prisma` del request adentro);
//   · la plata sólo con `monto` (reports:read); si no hay dato, '—' con el motivo, nunca un 0.
// La pasada entra por un lector inyectable para probar las palabras con datos, sin base.

import { fmtMoneyARS, fmtNumberAR } from "@/components/ui/format";
import { formatDayLabel } from "@/lib/caja/cierre-diario";
import type { ResultadoRed, ResultadoStock } from "@/lib/multilocal/multilocal-actions";
import { plural, type ContextoLoader, type DatoKpi, type LoaderKpi } from "./nucleo.server";

/** De dónde salen la red y el stock. El real importa las actions recién al usarlas. */
export interface LectorRed {
  red(): Promise<ResultadoRed>;
  stock(): Promise<ResultadoStock>;
}

const lectorReal: LectorRed = {
  red: async () => (await import("@/lib/multilocal/multilocal-actions")).redDeLaCasaAction(),
  stock: async () => (await import("@/lib/multilocal/multilocal-actions")).stockDeLaRedAction(),
};

export const SIN_LOCALES = "Todavía no hay locales vinculados: los vincula Gestión Studio Grow.";

/**
 * ¿La casa tiene algún local vinculado? Una operación, con el negocio del request en el
 * `where` (la RLS de CarteraCliente la cubre por el `tenantId` de la casa). Es la misma fila
 * que después lee la red (`consultaFilasDeLaRed`: estado activa).
 */
async function hayLocales({ db, tenantId }: ContextoLoader): Promise<boolean> {
  return (await db.carteraCliente.count({ where: { tenantId, estado: "activa" } })) > 0;
}

/** "+12 %" / "−8 %". */
export function textoCambio(cambio: number): string {
  const pct = Math.round(Math.abs(cambio) * 100);
  return `${cambio >= 0 ? "+" : "−"}${fmtNumberAR(pct)} %`;
}

export function crearLoadersLocales(lector: LectorRed): Readonly<Record<string, LoaderKpi>> {
  /**
   * "5 locales · 2 con la caja sin cerrar" y, con reports:read, "$X cobrado hoy". No va a
   * "Para atender hoy": ese aviso lo da Cajas de los locales, que es donde se resuelve.
   */
  const misLocales: LoaderKpi = async (ctx): Promise<DatoKpi> => {
    if (!(await hayLocales(ctx))) return { sinDato: SIN_LOCALES };
    const r = await lector.red();
    if (!r.ok) return { sinDato: r.error };
    const { locales, cajasSinCerrar, cobradoHoy } = r.resumen;
    return {
      valor: fmtNumberAR(locales),
      detalle:
        `${plural(locales, "local", "locales")} · ` +
        (cajasSinCerrar > 0
          ? `${fmtNumberAR(cajasSinCerrar)} con la caja sin cerrar`
          : "cajas al día"),
      ...(ctx.monto ? { monto: `${fmtMoneyARS(cobradoHoy, 0)} cobrado hoy` } : {}),
    };
  };

  /** "Semana: $X · Canning +12 % frente a la anterior". Todo es plata: el tile pide reports:read. */
  const ventasPorLocal: LoaderKpi = async (ctx): Promise<DatoKpi> => {
    if (!(await hayLocales(ctx))) return { sinDato: SIN_LOCALES };
    const r = await lector.red();
    if (!r.ok) return { sinDato: r.error };
    const { actual, destacado } = r.resumen.semana;
    return {
      valor: fmtMoneyARS(actual, 0),
      detalle: destacado
        ? `esta semana · ${destacado.alias} ${textoCambio(destacado.cambio)} frente a la anterior`
        : "esta semana",
    };
  };

  /** "2 locales con la caja sin cerrar", en "Para atender hoy": un día sin cerrar pide acción. */
  const cajasDeLosLocales: LoaderKpi = async (ctx): Promise<DatoKpi> => {
    if (!(await hayLocales(ctx))) return { sinDato: SIN_LOCALES };
    const r = await lector.red();
    if (!r.ok) return { sinDato: r.error };
    const { cajasSinCerrar: n, pendienteMasViejo } = r.resumen;
    if (n === 0) return { valor: "Al día", detalle: "todas las cajas cerradas hasta ayer" };
    const texto =
      `${plural(n, "local", "locales")} con la caja sin cerrar` +
      (pendienteMasViejo ? ` desde el ${formatDayLabel(pendienteMasViejo)}` : "");
    return {
      valor: fmtNumberAR(n),
      detalle: texto,
      alerta: { valor: fmtNumberAR(n), texto },
    };
  };

  /** "12 cortes bajo el mínimo en 3 locales". Sin plata: lo ve también el encargado. */
  const stockPorLocal: LoaderKpi = async (ctx): Promise<DatoKpi> => {
    if (!(await hayLocales(ctx))) return { sinDato: SIN_LOCALES };
    const r = await lector.stock();
    if (!r.ok) return { sinDato: r.error };
    const { stockBajo, stockNegativo } = r.resumen;
    const { uno, varios } = ctx.sustantivo;
    const negativos =
      stockNegativo.productos > 0 ? ` · ${fmtNumberAR(stockNegativo.productos)} en negativo` : "";
    if (stockBajo.productos === 0) return { valor: "0", detalle: `${varios} bajo el mínimo${negativos}` };
    return {
      valor: fmtNumberAR(stockBajo.productos),
      detalle:
        `${plural(stockBajo.productos, uno, varios)} bajo el mínimo en ` +
        `${fmtNumberAR(stockBajo.locales)} ${plural(stockBajo.locales, "local", "locales")}${negativos}`,
    };
  };

  return {
    "mis-locales": misLocales,
    "ventas-por-local": ventasPorLocal,
    "cajas-de-los-locales": cajasDeLosLocales,
    "stock-por-local": stockPorLocal,
  };
}

export const LOADERS_LOCALES = crearLoadersLocales(lectorReal);
