// ============================================================================
// NÚMEROS DE MIS LOCALES — el tablero de la casa en los botones del Inicio.
// ============================================================================
//
// Estos números no se pueden sacar con UNA operación del `db` del request, como el resto de la
// carpeta: son datos de OTROS negocios, y cada local se lee en su propia transacción, con su
// GUC. Esa lectura vive en src/lib/multilocal/multilocal-actions.ts (con `exigirCasa`, los ids
// sacados de las filas de la casa y `react.cache`): las apps de la red y su pantalla comparten
// UNA pasada por local en el mismo request (el Catálogo de la marca y Traslados, la suya). Acá
// sólo se la pide y se la dice en palabras. Si un local no se pudo leer, el botón lo dice.
//
// Lo que sí se respeta de la carpeta:
//   · la primera lectura es UNA operación del `db` del request, con el negocio en el `where`:
//     ¿esta casa tiene locales vinculados? Si no tiene, se contesta '—' con el motivo y la red
//     ni se recorre;
//   · nada de caché entre requests ni transacciones escritas acá (las abre la action, con el
//     `tx` de cada local, nunca con el `prisma` del request adentro);
//   · la plata sólo con `monto` (reports:read); si no hay dato, '—' con el motivo, nunca un 0.
// La pasada entra por un lector inyectable para probar las palabras con datos, sin base.

import { cache } from "react";
import { fmtMoneyARS, fmtNumberAR } from "@/components/ui/format";
import { formatDayLabel } from "@/lib/caja/cierre-diario";
import type {
  LocalSinLeer,
  ResultadoCatalogo,
  ResultadoRed,
  ResultadoStock,
  ResultadoTraslados,
} from "@/lib/multilocal/multilocal-actions";
import { divergeDeLaLista } from "@/lib/multilocal/catalogo-marca-core";
import { plural, type ContextoLoader, type DatoKpi, type DbKpi, type LoaderKpi } from "./nucleo.server";

/** De dónde salen la red, el stock, el catálogo y los traslados. El real importa las actions recién al usarlas. */
export interface LectorRed {
  red(): Promise<ResultadoRed>;
  stock(): Promise<ResultadoStock>;
  catalogo(): Promise<ResultadoCatalogo>;
  traslados(): Promise<ResultadoTraslados>;
}

const lectorReal: LectorRed = {
  red: async () => (await import("@/lib/multilocal/multilocal-actions")).redDeLaCasaAction(),
  stock: async () => (await import("@/lib/multilocal/multilocal-actions")).stockDeLaRedAction(),
  catalogo: async () => (await import("@/lib/multilocal/multilocal-actions")).catalogoDeLaMarcaAction(),
  traslados: async () => (await import("@/lib/multilocal/multilocal-actions")).trasladosAction(),
};

/**
 * " · 1 local sin leer": si un local no se pudo leer, el número es de los demás y el botón lo
 * dice. Un total que calla que le falta un local es un número que miente.
 */
export function sinLeerTexto(sinLeer: readonly LocalSinLeer[]): string {
  const n = sinLeer.length;
  return n > 0 ? ` · ${fmtNumberAR(n)} ${plural(n, "local", "locales")} sin leer` : "";
}

export const SIN_LOCALES = "Todavía no hay locales vinculados: los vincula Gestión Studio Grow.";

/**
 * Ningún local se pudo leer: el botón no tiene número que dar. "Al día" o "0" con todos los
 * locales sin leer sería un número que miente; va '—' con el motivo. Con al menos uno leído, el
 * número es de esos y el detalle nombra cuántos faltan (`sinLeerTexto`).
 */
export function ningunoLeido(leidos: number, sinLeer: readonly LocalSinLeer[]): DatoKpi | null {
  if (leidos > 0 || sinLeer.length === 0) return null;
  const n = sinLeer.length;
  return {
    sinDato:
      n === 1
        ? `No se pudo leer ${sinLeer[0].alias} en este momento. Probá de nuevo en un rato.`
        : `No se pudo leer ninguno de tus ${fmtNumberAR(n)} locales en este momento. Probá de nuevo en un rato.`,
  };
}

/**
 * ¿La casa tiene algún local vinculado? Una operación, con el negocio del request en el
 * `where` (la RLS de CarteraCliente la cubre por el `tenantId` de la casa). Es la misma fila
 * que después lee la red (`consultaFilasDeLaRed`: estado activa).
 */
async function contarLocales(db: DbKpi, tenantId: string): Promise<boolean> {
  return (await db.carteraCliente.count({ where: { tenantId, estado: "activa" } })) > 0;
}

/** ¿La casa tiene locales? La pregunta que hace cada botón de la red antes de recorrerla. */
export type PreguntaLocales = (ctx: ContextoLoader) => Promise<boolean>;

/**
 * La pregunta del PEDIDO: los seis botones de la red preguntan lo mismo en el mismo Inicio, así
 * que se consulta UNA vez por pedido y la respuesta se comparte (eran seis transacciones iguales).
 * `react.cache` dura lo que dura el render del pedido; entre pedidos no guarda nada. La clave es
 * el cliente de base y el negocio (`ctx.db`, `ctx.tenantId`): dos negocios nunca comparten.
 */
const hayLocalesDelPedido = cache((db: DbKpi, tenantId: string) => contarLocales(db, tenantId));
const preguntaDelPedido: PreguntaLocales = (ctx) => hayLocalesDelPedido(ctx.db, ctx.tenantId);

/** "+12 %" / "−8 %". */
export function textoCambio(cambio: number): string {
  const pct = Math.round(Math.abs(cambio) * 100);
  return `${cambio >= 0 ? "+" : "−"}${fmtNumberAR(pct)} %`;
}

export function crearLoadersLocales(
  lector: LectorRed,
  hayLocales: PreguntaLocales = preguntaDelPedido,
): Readonly<Record<string, LoaderKpi>> {
  /**
   * "5 locales · 2 con la caja sin cerrar" y, con reports:read, "$X cobrado hoy". No va a
   * "Para atender hoy": ese aviso lo da Cajas de los locales, que es donde se resuelve.
   */
  const misLocales: LoaderKpi = async (ctx): Promise<DatoKpi> => {
    if (!(await hayLocales(ctx))) return { sinDato: SIN_LOCALES };
    const r = await lector.red();
    if (!r.ok) return { sinDato: r.error };
    const vacio = ningunoLeido(r.red.length, r.sinLeer);
    if (vacio) return vacio;
    const { locales, cajasSinCerrar, cobradoHoy } = r.resumen;
    return {
      valor: fmtNumberAR(locales),
      detalle:
        `${plural(locales, "local", "locales")} · ` +
        (cajasSinCerrar > 0
          ? `${fmtNumberAR(cajasSinCerrar)} con la caja sin cerrar`
          : "cajas al día") +
        sinLeerTexto(r.sinLeer),
      ...(ctx.monto ? { monto: `${fmtMoneyARS(cobradoHoy, 0)} cobrado hoy` } : {}),
    };
  };

  /** "Semana: $X · Canning +12 % frente a la anterior". Todo es plata: el tile pide reports:read. */
  const ventasPorLocal: LoaderKpi = async (ctx): Promise<DatoKpi> => {
    if (!(await hayLocales(ctx))) return { sinDato: SIN_LOCALES };
    const r = await lector.red();
    if (!r.ok) return { sinDato: r.error };
    const vacio = ningunoLeido(r.red.length, r.sinLeer);
    if (vacio) return vacio;
    const { actual, destacado } = r.resumen.semana;
    return {
      valor: fmtMoneyARS(actual, 0),
      detalle:
        (destacado ? `esta semana · ${destacado.alias} ${textoCambio(destacado.cambio)} frente a la anterior` : "esta semana") +
        sinLeerTexto(r.sinLeer),
    };
  };

  /** "2 locales con la caja sin cerrar", en "Para atender hoy": un día sin cerrar pide acción. */
  const cajasDeLosLocales: LoaderKpi = async (ctx): Promise<DatoKpi> => {
    if (!(await hayLocales(ctx))) return { sinDato: SIN_LOCALES };
    const r = await lector.red();
    if (!r.ok) return { sinDato: r.error };
    const vacio = ningunoLeido(r.red.length, r.sinLeer);
    if (vacio) return vacio;
    const { cajasSinCerrar: n, pendienteMasViejo } = r.resumen;
    const falta = sinLeerTexto(r.sinLeer);
    if (n === 0) return { valor: "Al día", detalle: `todas las cajas cerradas hasta ayer${falta}` };
    const texto =
      `${plural(n, "local", "locales")} con la caja sin cerrar` +
      (pendienteMasViejo ? ` desde el ${formatDayLabel(pendienteMasViejo)}` : "");
    return {
      valor: fmtNumberAR(n),
      detalle: texto + falta,
      alerta: { valor: fmtNumberAR(n), texto },
    };
  };

  /** "12 cortes bajo el mínimo en 3 locales". Sin plata: lo ve también el encargado. */
  const stockPorLocal: LoaderKpi = async (ctx): Promise<DatoKpi> => {
    if (!(await hayLocales(ctx))) return { sinDato: SIN_LOCALES };
    const r = await lector.stock();
    if (!r.ok) return { sinDato: r.error };
    // El número es de los locales leídos (la casa no cuenta en "bajo el mínimo en N locales").
    const vacio = ningunoLeido(r.locales, r.sinLeer);
    if (vacio) return vacio;
    const { stockBajo, stockNegativo } = r.resumen;
    const { uno, varios } = ctx.sustantivo;
    const negativos =
      (stockNegativo.productos > 0 ? ` · ${fmtNumberAR(stockNegativo.productos)} en negativo` : "") + sinLeerTexto(r.sinLeer);
    if (stockBajo.productos === 0) return { valor: "0", detalle: `${varios} bajo el mínimo${negativos}` };
    return {
      valor: fmtNumberAR(stockBajo.productos),
      detalle:
        `${plural(stockBajo.productos, uno, varios)} bajo el mínimo en ` +
        `${fmtNumberAR(stockBajo.locales)} ${plural(stockBajo.locales, "local", "locales")}${negativos}`,
    };
  };

  /**
   * "2 locales con precios distintos a la lista". Sale de la MISMA vista previa que muestra la
   * pantalla (el plan de la planilla de cada local contra la lista de la casa).
   */
  const catalogoDeLaMarca: LoaderKpi = async (ctx): Promise<DatoKpi> => {
    if (!(await hayLocales(ctx))) return { sinDato: SIN_LOCALES };
    const r = await lector.catalogo();
    if (!r.ok) return { sinDato: r.error };
    const vacio = ningunoLeido(r.locales.length, r.sinLeer);
    if (vacio) return vacio;
    const distintos = r.locales.filter((l) => divergeDeLaLista(l.vista)).length;
    const falta = sinLeerTexto(r.sinLeer);
    if (distintos === 0) return { valor: "Al día", detalle: `todos los locales tienen la lista de la casa${falta}` };
    return {
      valor: fmtNumberAR(distintos),
      detalle: `${plural(distintos, "local", "locales")} con precios distintos a la lista${falta}`,
    };
  };

  /** "Hoy: 4 traslados · 182 kg". Sin plata: lo abre también el encargado. */
  const traslados: LoaderKpi = async (ctx): Promise<DatoKpi> => {
    if (!(await hayLocales(ctx))) return { sinDato: SIN_LOCALES };
    const r = await lector.traslados();
    if (!r.ok) return { sinDato: r.error };
    // Las ubicaciones son la casa y los locales que se pudieron leer.
    const vacio = ningunoLeido(r.ubicaciones.filter((u) => !u.esCasa).length, r.sinLeer);
    if (vacio) return vacio;
    const { cantidad, kg, unidades } = r.deHoy;
    const cuanto = [
      kg > 0 ? `${fmtNumberAR(kg, Number.isInteger(kg) ? 0 : 1)} kg` : "",
      unidades > 0 ? `${fmtNumberAR(unidades)} ${plural(unidades, "unidad", "unidades")}` : "",
    ].filter(Boolean);
    return {
      valor: fmtNumberAR(cantidad),
      detalle:
        (cantidad === 0 ? "traslados hoy" : `${cantidad === 1 ? "traslado" : "traslados"} hoy${cuanto.length > 0 ? ` · ${cuanto.join(" · ")}` : ""}`) +
        sinLeerTexto(r.sinLeer),
    };
  };

  return {
    "mis-locales": misLocales,
    "ventas-por-local": ventasPorLocal,
    "cajas-de-los-locales": cajasDeLosLocales,
    "stock-por-local": stockPorLocal,
    "catalogo-de-la-marca": catalogoDeLaMarca,
    traslados,
  };
}

export const LOADERS_LOCALES = crearLoadersLocales(lectorReal);
