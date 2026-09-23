"use server";

// ============================================================================
// MIS LOCALES — las lecturas y las escrituras de la red, cableadas a la base.
// ============================================================================
//
// Cada export de este archivo es un ENDPOINT (así funciona "use server"), así que cada uno
// arranca con `exigirCasa` (capability + módulo `multilocal` leído de Tenant.modules) y
// NINGUNO recibe un id de negocio por parámetro: la casa sale de la sesión y los locales, de SUS
// filas de la red, leídas con el GUC de la casa. Lo que llega de un formulario (el origen de un
// traslado, los locales elegidos para el catálogo, el `?local=` de las pantallas) se elige
// DESPUÉS entre los ids que salieron de esas filas: un id ajeno no se toca y da error.
//
// AISLAMIENTO (el molde de la cartera del contador, cartera-actions.ts):
//   · las filas de la red, con `tenantTransaction` y el GUC de la CASA (RLS de CarteraCliente);
//   · los datos de cada local, con UNA `tenantTransaction` por local y SU GUC, en serie
//     (`recorrerLocales`), y adentro sólo el `tx` de esa transacción;
//   · el traslado, con `trasladoTransaction` (rls.ts): UNA transacción con el GUC del origen y
//     después el del destino. Este es el ÚNICO archivo que la importa (forma.test.ts);
//   · la única lectura con el cliente base es la tabla Tenant (fuera de RLS por diseño), para
//     el nombre, el CUIT y el punto de venta de locales ya verificados.
// Jamás `operatorPrisma` en este camino.
//
// UN LOCAL QUE FALLA NO TUMBA LA RED: se muestran los demás y un aviso por ese (qué pasó y
// cómo seguir). El detalle del error queda en el log, con la casa y el local, nunca en pantalla.
//
// UNA PASADA POR REQUEST: el Inicio (los números de las apps) y la pantalla piden lo mismo, y
// `react.cache` hace que la base se recorra una sola vez. Esa caché dura el request; entre
// requests no hay ninguna (una caché compartida filtraría números entre negocios).

import { randomUUID } from "node:crypto";
import { cache } from "react";
import { revalidatePath } from "next/cache";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction, trasladoTransaction } from "@/lib/rls";
import { roleHasCapability } from "@/lib/capabilities";
import { CIERRE_DIARIO_ACTION, CIERRE_DIARIO_ENTITY, lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import type { DayKey } from "@/lib/caja/cierre-diario";
import { logger } from "@/lib/logger";
import { AppNoDisponibleError, requireAppAccion } from "@/lib/require-app";
import type { AppId } from "@/apps/registro";
import { exigirCasa } from "./casa.server";
import {
  consolidarPorCuit,
  consultaFilasDeLaRed,
  consultaFilasDeVentas,
  contarStock,
  filaDeLaBase,
  instantesDelRango,
  leerRango,
  leerStock,
  localesDeLaRed,
  matrizDeStock,
  recolectarLocal,
  recorrerLocales,
  resumirRed,
  sumarDias,
  sumarVentas,
  ventasDe,
  ventasPorDia,
  type ColumnaStock,
  type ContextoPasada,
  type FilaCaja,
  type FilaStock,
  type GrupoCuit,
  type LocalConPasada,
  type LocalDeLaRed,
  type LocalQueFallo,
  type MetaLocal,
  type PuertosRed,
  type Rango,
  type ResumenRed,
  type Ventas,
  type VentasDeUnLocal,
} from "./multilocal-core";
import {
  ACCION_CATALOGO_EN_LA_CASA,
  empujarEnTx,
  leerCatalogo,
  listaDeLaCasa,
  planDelLocal,
  textoDelResultado,
  vistaDelLocal,
  type ResultadoEmpuje,
  type VistaDelLocal,
} from "./catalogo-marca-core";
import {
  TrasladoRechazado,
  consultaProductosParaTraslado,
  consultaRemito,
  consultaSalidas,
  esClaveDeTraslado,
  leerPedidoDeTraslado,
  productosParaTraslado,
  remitoDeLaAuditoria,
  resumenDeTraslados,
  trasladarEnFases,
  validarUbicaciones,
  type ProductoParaTraslado,
  type Remito,
  type Ubicacion,
} from "./traslado-core";

// ── Resultados (los consumen las pantallas de /admin/locales y los números del Inicio) ──

/** Una tabla que el código espera y la base todavía no tiene (migración sin aplicar). */
const MIGRACION_PENDIENTE =
  "Falta aplicar una migración de la base (paso del dueño). Cuando se aplique, esta pantalla se enciende sola.";

/** Un local de la red que no se pudo leer: la pantalla lo nombra y dice qué hacer. */
export interface LocalSinLeer {
  localTenantId: string;
  alias: string;
  motivo: string;
}

export type ResultadoRed =
  | { ok: true; casa: string; hoy: DayKey; red: LocalConPasada[]; resumen: ResumenRed; sinLeer: LocalSinLeer[] }
  | { ok: false; error: string };

export type ResultadoStock =
  | {
      ok: true;
      casa: string;
      columnas: { id: string; nombre: string; esCasa: boolean }[];
      filas: FilaStock[];
      resumen: Pick<ResumenRed, "stockBajo" | "stockNegativo">;
      /** Locales de la red que se pudieron leer (sin contar la casa). */
      locales: number;
      sinLeer: LocalSinLeer[];
    }
  | { ok: false; error: string };

export type ResultadoVentas =
  | {
      ok: true;
      casa: string;
      rango: Rango;
      /** Por qué se ignoró el rango pedido (fecha ilegible, invertida, futura o muy larga). */
      aviso: string | null;
      locales: VentasDeUnLocal[];
      porCuit: GrupoCuit[];
      total: Ventas;
      sinLeer: LocalSinLeer[];
    }
  | { ok: false; error: string };

export type ResultadoCatalogo =
  | {
      ok: true;
      casa: string;
      lista: { incluidos: number; sinPrecio: string[]; repetidos: string[] };
      locales: { local: LocalDeLaRed; vista: VistaDelLocal }[];
      sinLeer: LocalSinLeer[];
    }
  | { ok: false; error: string };

/** Lo que devuelve "Aplicar" del catálogo de la marca, local por local. */
export type EstadoEmpuje = {
  ok: boolean;
  mensaje: string;
  resultados: { localTenantId: string; alias: string; estado: ResultadoEmpuje["estado"] | "error"; texto: string }[];
} | null;

export type ResultadoTraslados =
  | {
      ok: true;
      casa: string;
      hoy: DayKey;
      ubicaciones: Ubicacion[];
      productos: ProductoParaTraslado[];
      /** Los traslados de los últimos 7 días, del más nuevo al más viejo. */
      recientes: Remito[];
      /** Los de hoy: cuántos y cuánto se movió. */
      deHoy: { cantidad: number; kg: number; unidades: number };
      sinLeer: LocalSinLeer[];
    }
  | { ok: false; error: string };

/** Lo que devuelve "Trasladar". */
export type EstadoTraslado =
  | { ok: true; yaEstaba: boolean; clave: string; codigo: string; texto: string }
  | { ok: false; error: string }
  | null;

export type ResultadoRemito = { ok: true; remito: Remito } | { ok: false; error: string };

// ── Puertos reales ───────────────────────────────────────────────────────────

const puertos: PuertosRed = {
  // Las filas de la red, con el GUC de la CASA: RLS de CarteraCliente + predicado explícito.
  filasDeLaRed: async (casaId) =>
    (await tenantTransaction((tx) => tx.carteraCliente.findMany(consultaFilasDeLaRed(casaId)), { tenantId: casaId })).map(
      filaDeLaBase,
    ),
  // Tenant está fuera de RLS por diseño. Los ids llegan SÓLO de `filasDeLaRed` (localesDeLaRed).
  metaDeLocales: async (ids) => {
    const ts = await basePrisma.tenant.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, slug: true, subdomain: true, arcaCuit: true, arcaPuntoVenta: true },
    });
    return new Map<string, MetaLocal>(
      ts.map((t) => [
        t.id,
        { nombre: t.name, slug: t.slug, subdomain: t.subdomain, arcaCuit: t.arcaCuit, arcaPuntoVenta: t.arcaPuntoVenta },
      ]),
    );
  },
  enLocal: (localTenantId, fn) => tenantTransaction(fn, { tenantId: localTenantId }),
};

/** Tabla o columna inexistente (P2021/P2022): hay una migración que el código espera. */
function esMigracionPendiente(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
}

/**
 * Lo que la pantalla dice cuando la lectura de la red entera falla por otra cosa (la base no
 * contestó). La dueña ve qué pasó y qué hacer, no la pantalla genérica de error; el detalle
 * queda en el log, con la casa, nunca en pantalla.
 */
const NO_SE_PUDO_LEER =
  "No se pudo leer la información de tus locales en este momento. Probá de nuevo en un rato; si sigue, escribinos a Gestión Studio Grow.";

const NO_SE_PUDO_LEER_EL_LOCAL =
  "No se pudo leer este local en este momento (los demás sí). Probá de nuevo en un rato; si sigue, escribinos a Gestión Studio Grow.";

function falloDeLectura(e: unknown, que: string, casaId: string): { ok: false; error: string } {
  if (esMigracionPendiente(e)) return { ok: false, error: MIGRACION_PENDIENTE };
  logger.error("mis-locales", `no se pudo leer ${que}`, e, { casaId });
  return { ok: false, error: NO_SE_PUDO_LEER };
}

/** Los locales que fallaron en un recorrido → lo que dice la pantalla de cada uno (y al log). */
function sinLeerDe(fallidos: readonly LocalQueFallo[], que: string, casaId: string): LocalSinLeer[] {
  return fallidos.map(({ local, error }) => {
    if (!esMigracionPendiente(error)) {
      logger.error("mis-locales", `no se pudo leer ${que} de un local`, error, { casaId, localId: local.localTenantId });
    }
    return {
      localTenantId: local.localTenantId,
      alias: local.alias,
      motivo: esMigracionPendiente(error) ? MIGRACION_PENDIENTE : NO_SE_PUDO_LEER_EL_LOCAL,
    };
  });
}

/**
 * La misma regla que la página (`requireApp`) para una action: el POST directo a la action no
 * pasa por la página. Devuelve el porqué para mostrarlo, o null si la app está disponible.
 */
async function appNoDisponible(id: AppId): Promise<{ ok: false; error: string } | null> {
  try {
    await requireAppAccion(id);
    return null;
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
    throw e;
  }
}

// ── Las pasadas, cacheadas por request ───────────────────────────────────────

/**
 * La pasada completa de la red (ventas de hoy y de la semana, caja, cierres y stock), una
 * transacción por local. Recibe el id de la casa que YA verificó `exigirCasa`; no se exporta.
 */
const pasadaDeLaCasa = cache(async (casaId: string, hoy: DayKey) => {
  const ctx: ContextoPasada = {
    hoy,
    // La MISMA frontera que usa la pantalla de Caja de cada local, leída con el `tx` del local.
    leerFronteraCaja: lastClosedDayTx,
    leerCierres: (tx, tenantId) =>
      tx.auditLog.findMany({
        where: { tenantId, entity: CIERRE_DIARIO_ENTITY, action: CIERRE_DIARIO_ACTION },
        orderBy: { createdAt: "desc" },
        take: 7,
        select: { entityId: true, createdAt: true, changes: true },
      }),
  };
  return recorrerLocales(puertos, casaId, (tx, local) => recolectarLocal(tx, local, ctx));
});

/** Sólo el stock de cada local (la pasada del encargado, que no ve plata). */
const stockDeLaCasa = cache(async (casaId: string) =>
  recorrerLocales(puertos, casaId, (tx, local) => leerStock(tx, local.localTenantId)),
);

/** La lista de la casa y lo que el empuje haría en cada local. Sólo lectura. */
const catalogoDeLaCasa = cache(async (casaId: string) => {
  const lista = listaDeLaCasa(await tenantTransaction((tx) => leerCatalogo(tx, casaId), { tenantId: casaId }));
  const recorrido = await recorrerLocales(puertos, casaId, async (tx, local) =>
    vistaDelLocal(await planDelLocal(tx, local.localTenantId, lista)),
  );
  return { lista, recorrido };
});

type TxDeUnNegocio = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/**
 * Lo que un traslado necesita saber de UN negocio, con el `tx` de su transacción (sin costos): sus
 * productos no borrados (activos y pausados, que el formulario cruza con la misma regla que la
 * transacción) y los traslados que salieron de ahí.
 */
async function leerParaTraslados(tx: TxDeUnNegocio, tenantId: string, desde: Date) {
  const [productos, salidas] = await Promise.all([
    tx.product.findMany(consultaProductosParaTraslado(tenantId)),
    tx.auditLog.findMany(consultaSalidas(tenantId, desde)),
  ]);
  return { productos, salidas: salidas.flatMap((s) => remitoDeLaAuditoria(s.changes) ?? []) };
}

/** La casa y sus locales, como lugares de donde sale y adonde va la mercadería. */
function ubicacionesDe(casa: { casaId: string; nombre: string; cuit: string | null }, red: readonly LocalDeLaRed[]): Ubicacion[] {
  return [
    { id: casa.casaId, nombre: casa.nombre, esCasa: true, cuit: casa.cuit },
    ...red.map((l) => ({ id: l.localTenantId, nombre: l.alias, esCasa: false, cuit: l.arcaCuit })),
  ];
}

// ── Actions: lecturas ────────────────────────────────────────────────────────

/**
 * La red de la casa: cómo viene hoy cada local. La usan Mis locales, Cajas de los locales y
 * los números del Inicio. Sólo la dueña (`multilocal:manage`).
 */
export async function redDeLaCasaAction(): Promise<ResultadoRed> {
  const casa = await exigirCasa("multilocal:manage");
  if (!casa.ok) return casa;
  const hoy = todayInBusinessTz();
  try {
    const { leidos, fallidos } = await pasadaDeLaCasa(casa.casaId, hoy);
    return {
      ok: true,
      casa: casa.nombre,
      hoy,
      red: leidos,
      resumen: resumirRed(leidos),
      sinLeer: sinLeerDe(fallidos, "la red", casa.casaId),
    };
  } catch (e) {
    return falloDeLectura(e, "la red", casa.casaId);
  }
}

/**
 * Stock por local: la casa (el obrador) primero y después cada local, cruzados por producto.
 * La abre también el encargado de la casa (`stock:read`), así que no lleva costos ni plata.
 * Si la dueña ya pidió la pasada completa en este request (el Inicio), se reusa.
 */
export async function stockDeLaRedAction(): Promise<ResultadoStock> {
  const casa = await exigirCasa("stock:read");
  if (!casa.ok) return casa;
  // Stock por local es de mostrador (rubro de la app). La página ya lo exige con `requireApp`;
  // un POST directo a la action no pasa por la página, así que se repite la misma regla.
  const app = await appNoDisponible("stock-por-local");
  if (app) return app;
  try {
    const recorrido = roleHasCapability(casa.user.role, "multilocal:manage")
      ? await pasadaDeLaCasa(casa.casaId, todayInBusinessTz()).then((r) => ({
          leidos: r.leidos.map(({ local, dato }) => ({ local, dato: dato.stock })),
          fallidos: r.fallidos,
        }))
      : await stockDeLaCasa(casa.casaId);
    const sinLeer = sinLeerDe(recorrido.fallidos, "el stock", casa.casaId);
    // El stock de la propia casa: es el negocio del request, así que su id sale de la sesión.
    // Si falla, la casa se nombra como un lugar más que no se pudo leer, y el resto se muestra.
    let propio: Awaited<ReturnType<typeof leerStock>> = [];
    try {
      propio = await tenantTransaction((tx) => leerStock(tx, casa.casaId), { tenantId: casa.casaId });
    } catch (e) {
      if (!esMigracionPendiente(e)) logger.error("mis-locales", "no se pudo leer el stock de la casa", e, { casaId: casa.casaId });
      sinLeer.unshift({
        localTenantId: casa.casaId,
        alias: casa.nombre,
        motivo: esMigracionPendiente(e) ? MIGRACION_PENDIENTE : NO_SE_PUDO_LEER_EL_LOCAL,
      });
    }
    const columnas: ColumnaStock[] = [
      // La casa va sólo si tiene productos: una casa que no es obrador no suma una columna vacía.
      ...(propio.length > 0 ? [{ id: casa.casaId, nombre: casa.nombre, esCasa: true, productos: propio }] : []),
      ...recorrido.leidos.map(({ local, dato }) => ({ id: local.localTenantId, nombre: local.alias, esCasa: false, productos: dato })),
    ];
    return {
      ok: true,
      casa: casa.nombre,
      columnas: columnas.map(({ id, nombre, esCasa }) => ({ id, nombre, esCasa })),
      filas: matrizDeStock(columnas),
      resumen: contarStock(recorrido.leidos.map((l) => l.dato)),
      locales: recorrido.leidos.length,
      sinLeer,
    };
  } catch (e) {
    return falloDeLectura(e, "el stock de la red", casa.casaId);
  }
}

/**
 * Ventas por local en un rango de fechas (por defecto, la semana en curso), por día y por
 * medio, más el consolidado por CUIT. Las fechas llegan como texto de la URL y se validan acá
 * (`leerRango`): nada de lo que llega se usa sin pasar por ahí.
 */
export async function ventasDeLaRedAction(pedido: {
  desde?: string | null;
  hasta?: string | null;
}): Promise<ResultadoVentas> {
  const casa = await exigirCasa("multilocal:manage");
  if (!casa.ok) return casa;
  // Es un endpoint: lo que llega puede no ser texto. Lo que no es texto se trata como vacío.
  const texto = (x: unknown) => (typeof x === "string" ? x : null);
  const { rango, aviso } = leerRango(texto(pedido?.desde), texto(pedido?.hasta), todayInBusinessTz());
  const { desde, hasta } = instantesDelRango(rango);
  try {
    const { leidos, fallidos } = await recorrerLocales(puertos, casa.casaId, async (tx, local) =>
      (await tx.cashMovement.findMany(consultaFilasDeVentas(local.localTenantId, desde, hasta))) as FilaCaja[],
    );
    const locales: VentasDeUnLocal[] = leidos.map(({ local, dato }) => ({
      local,
      total: ventasDe(dato),
      porDia: ventasPorDia(dato),
    }));
    return {
      ok: true,
      casa: casa.nombre,
      rango,
      aviso,
      locales,
      porCuit: consolidarPorCuit(locales),
      total: sumarVentas(locales.map((l) => l.total)),
      sinLeer: sinLeerDe(fallidos, "las ventas", casa.casaId),
    };
  } catch (e) {
    return falloDeLectura(e, "las ventas de la red", casa.casaId);
  }
}

/**
 * Catálogo de la marca: la lista de la casa y lo que el empuje haría en cada local (cambios de
 * precio, productos que el local no tiene, productos que sólo tiene el local y lo que impide
 * aplicarlo). Sólo lectura: es la vista previa y la pantalla de diferencias.
 */
export async function catalogoDeLaMarcaAction(): Promise<ResultadoCatalogo> {
  const casa = await exigirCasa("multilocal:manage");
  if (!casa.ok) return casa;
  const app = await appNoDisponible("catalogo-de-la-marca");
  if (app) return app;
  try {
    const { lista, recorrido } = await catalogoDeLaCasa(casa.casaId);
    return {
      ok: true,
      casa: casa.nombre,
      lista: { incluidos: lista.incluidos, sinPrecio: lista.sinPrecio, repetidos: lista.repetidos },
      locales: recorrido.leidos.map(({ local, dato }) => ({ local, vista: dato })),
      sinLeer: sinLeerDe(recorrido.fallidos, "el catálogo", casa.casaId),
    };
  } catch (e) {
    return falloDeLectura(e, "el catálogo de la marca", casa.casaId);
  }
}

/**
 * Traslados: dónde puede salir y entrar la mercadería (la casa y sus locales, con su CUIT),
 * qué hay de cada producto en cada lugar, y los traslados de la última semana. Lo abre también
 * el encargado de la casa: nada de costos.
 */
export async function trasladosAction(): Promise<ResultadoTraslados> {
  const casa = await exigirCasa("traslados:manage");
  if (!casa.ok) return casa;
  const app = await appNoDisponible("traslados");
  if (app) return app;
  const hoy = todayInBusinessTz();
  const desde = businessWallTimeToUtc(sumarDias(hoy, -6), "00:00");
  const inicioDeHoy = businessWallTimeToUtc(hoy, "00:00");
  try {
    const recorrido = await recorrerLocales(puertos, casa.casaId, (tx, local) => leerParaTraslados(tx, local.localTenantId, desde));
    const sinLeer = sinLeerDe(recorrido.fallidos, "los traslados", casa.casaId);
    const propia = await tenantTransaction((tx) => leerParaTraslados(tx, casa.casaId, desde), { tenantId: casa.casaId });
    // Un local que no se pudo leer no se ofrece como origen ni destino: no se sabe qué tiene.
    const ubicaciones = ubicacionesDe(casa, recorrido.leidos.map((l) => l.local));
    const porUbicacion = [
      { id: casa.casaId, dato: propia },
      ...recorrido.leidos.map((l) => ({ id: l.local.localTenantId, dato: l.dato })),
    ];

    const productos: ProductoParaTraslado[] = productosParaTraslado(porUbicacion.map(({ id, dato }) => ({ id, productos: dato.productos })));
    const recientes = porUbicacion.flatMap((u) => u.dato.salidas).sort((a, b) => b.fecha.localeCompare(a.fecha));
    return {
      ok: true,
      casa: casa.nombre,
      hoy,
      ubicaciones,
      productos,
      recientes,
      deHoy: resumenDeTraslados(recientes.filter((r) => new Date(r.fecha) >= inicioDeHoy)),
      sinLeer,
    };
  } catch (e) {
    return falloDeLectura(e, "los traslados", casa.casaId);
  }
}

/**
 * Un remito interno, por su clave. Se busca en la casa y en cada local de la red (el traslado
 * queda registrado en la auditoría del negocio de donde salió); nunca en otro negocio.
 */
export async function remitoAction(clave: string): Promise<ResultadoRemito> {
  const casa = await exigirCasa("traslados:manage");
  if (!casa.ok) return casa;
  const app = await appNoDisponible("traslados");
  if (app) return app;
  const NO_ESTA = "Ese remito no existe o no es de tu red. Buscalo en la lista de traslados.";
  if (!esClaveDeTraslado(clave)) return { ok: false, error: NO_ESTA };
  try {
    const lugares = [casa.casaId, ...(await localesDeLaRed(puertos, casa.casaId)).map((l) => l.localTenantId)];
    for (const tenantId of lugares) {
      const fila = await tenantTransaction((tx) => tx.auditLog.findFirst(consultaRemito(tenantId, clave)), { tenantId });
      if (fila) {
        const r = remitoDeLaAuditoria(fila.changes);
        return r ? { ok: true, remito: r } : { ok: false, error: NO_ESTA };
      }
    }
    return { ok: false, error: NO_ESTA };
  } catch (e) {
    return falloDeLectura(e, "un remito", casa.casaId);
  }
}

// ── Actions: escrituras ──────────────────────────────────────────────────────

/**
 * Aplica la lista de la casa en los locales elegidos. Cada local en SU transacción, todo o
 * nada por local, contra la huella de la vista previa que se aprobó. Los ids elegidos se
 * cruzan con los de las filas de la casa: uno ajeno no se toca. Deja auditoría en cada local
 * y un resumen en la casa.
 */
export async function empujarCatalogoAction(_previo: EstadoEmpuje, formData: FormData): Promise<EstadoEmpuje> {
  const casa = await exigirCasa("multilocal:manage");
  if (!casa.ok) return { ok: false, mensaje: casa.error, resultados: [] };
  const app = await appNoDisponible("catalogo-de-la-marca");
  if (app) return { ok: false, mensaje: app.error, resultados: [] };

  const elegidos = new Set(formData.getAll("elegido").filter((x): x is string => typeof x === "string" && x.length > 0));
  if (elegidos.size === 0) return { ok: false, mensaje: "Elegí al menos un local para mandarle la lista.", resultados: [] };

  let lista: ReturnType<typeof listaDeLaCasa>;
  let red: LocalDeLaRed[];
  try {
    lista = listaDeLaCasa(await tenantTransaction((tx) => leerCatalogo(tx, casa.casaId), { tenantId: casa.casaId }));
    red = await localesDeLaRed(puertos, casa.casaId);
  } catch (e) {
    const f = falloDeLectura(e, "la lista de la casa", casa.casaId);
    return { ok: false, mensaje: `${f.error} No se cambió nada en ningún local.`, resultados: [] };
  }
  if (lista.repetidos.length > 0) {
    return {
      ok: false,
      mensaje:
        `Tu lista tiene productos con el mismo nombre (${lista.repetidos.join(", ")}). Renombrá uno desde el Catálogo ` +
        "y volvé a mirar la vista previa. No se cambió nada.",
      resultados: [],
    };
  }
  if (lista.incluidos === 0) {
    return { ok: false, mensaje: "Tu lista no tiene productos activos con precio: no hay nada para mandar.", resultados: [] };
  }
  const aplicar = red.filter((l) => elegidos.has(l.localTenantId));
  const ajenos = [...elegidos].filter((id) => !red.some((l) => l.localTenantId === id)).length;

  const lote = randomUUID();
  const actor = `casa:${casa.casaId}:user:${casa.user.id}`;
  const resultados: NonNullable<EstadoEmpuje>["resultados"] = [];
  for (const local of aplicar) {
    const huella = formData.get(`huella:${local.localTenantId}`);
    try {
      const r = await tenantTransaction(
        (tx) =>
          empujarEnTx(tx, {
            tenantId: local.localTenantId,
            lista,
            // Sin la huella de la vista previa no se aplica: "" nunca coincide y pide mirarla.
            huella: typeof huella === "string" ? huella : "",
            actor,
            casa: { id: casa.casaId, nombre: casa.nombre },
            por: casa.user.name,
            lote,
          }),
        { tenantId: local.localTenantId },
      );
      resultados.push({ localTenantId: local.localTenantId, alias: local.alias, estado: r.estado, texto: textoDelResultado(local.alias, r) });
    } catch (e) {
      logger.error("mis-locales", "no se pudo aplicar la lista en un local", e, { casaId: casa.casaId, localId: local.localTenantId });
      // El conteo que no cierra es un mensaje de escribirPlan y dice qué hacer; lo demás no se filtra.
      const propio =
        e instanceof Error && e.message.startsWith("Se esperaban") ? e.message : "No se pudo escribir en este local: no se cambió nada ahí.";
      resultados.push({
        localTenantId: local.localTenantId,
        alias: local.alias,
        estado: "error",
        texto: `${local.alias}: ${propio} Probá de nuevo en un rato.`,
      });
    }
  }

  // El resumen en la casa: qué se mandó, a quién, y qué pasó en cada uno. Si todos los locales ya
  // tenían la lista no pasó nada, y la auditoría no se llena de filas que no dicen nada.
  if (resultados.some((r) => r.estado !== "al-dia")) {
    try {
      await tenantTransaction(
        (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: casa.casaId,
              actor: `user:${casa.user.id}`,
              action: ACCION_CATALOGO_EN_LA_CASA,
              entity: "Product",
              channel: "admin",
              changes: {
                lote,
                productos: lista.incluidos,
                locales: resultados.map(({ localTenantId, alias, estado }) => ({ localTenantId, alias, estado })),
              },
            },
          }),
        { tenantId: casa.casaId },
      );
    } catch (e) {
      // Lo de los locales ya quedó escrito y auditado allá; el resumen de la casa no lo deshace.
      logger.error("mis-locales", "no se pudo auditar el empuje en la casa", e, { casaId: casa.casaId, lote });
    }
  }

  revalidatePath("/admin/locales/catalogo");
  const aplicados = resultados.filter((r) => r.estado === "aplicado").length;
  const conProblema = resultados.filter((r) => r.estado === "no-aplicable" || r.estado === "cambio" || r.estado === "error").length;
  const mensaje =
    (aplicados > 0 ? `La lista quedó en ${aplicados} ${aplicados === 1 ? "local" : "locales"}.` : "No se cambió ningún local.") +
    (conProblema > 0 ? ` En ${conProblema} no se aplicó: mirá el detalle.` : "") +
    (ajenos > 0 ? " Uno de los locales elegidos no es de tu red: no se tocó." : "");
  return { ok: conProblema === 0 && ajenos === 0, mensaje, resultados };
}

/**
 * Traslada mercadería entre dos lugares de la red (la casa o sus locales), en UNA transacción
 * con dos fases de GUC (`trasladoTransaction`). El origen y el destino que llegan del
 * formulario se eligen entre los de la red; con CUIT distinto es una venta y se rechaza.
 * Idempotente por la clave del formulario: un doble clic registra un solo traslado.
 */
export async function trasladarAction(_previo: EstadoTraslado, formData: FormData): Promise<EstadoTraslado> {
  const casa = await exigirCasa("traslados:manage");
  if (!casa.ok) return casa;
  const app = await appNoDisponible("traslados");
  if (app) return app;
  const leido = leerPedidoDeTraslado({
    clave: formData.get("clave"),
    origen: formData.get("origen"),
    destino: formData.get("destino"),
    productos: formData.getAll("producto"),
    cantidades: formData.getAll("cantidad"),
    nota: formData.get("nota"),
  });
  if (!leido.ok) return leido;
  const pedido = leido.pedido;

  let ubicaciones: Ubicacion[];
  try {
    ubicaciones = ubicacionesDe(casa, await localesDeLaRed(puertos, casa.casaId));
  } catch (e) {
    const f = falloDeLectura(e, "la red para un traslado", casa.casaId);
    return { ok: false, error: `${f.error} No se movió nada.` };
  }
  const v = validarUbicaciones(ubicaciones, pedido.origen, pedido.destino);
  if (!v.ok) return v;

  try {
    const r = await trasladoTransaction({ origen: v.origen.id, destino: v.destino.id }, (fases) =>
      trasladarEnFases(fases, {
        pedido,
        origen: v.origen,
        destino: v.destino,
        casa: casa.nombre,
        usuarioId: casa.user.id,
        por: casa.user.name,
        ahora: new Date(),
      }),
    );
    revalidatePath("/admin/locales/traslados");
    revalidatePath("/admin/locales/stock");
    revalidatePath("/admin/locales");
    const n = r.remito.lineas.length;
    return {
      ok: true,
      yaEstaba: r.yaEstaba,
      clave: r.remito.clave,
      codigo: r.remito.codigo,
      texto: r.yaEstaba
        ? `Ese traslado ya estaba registrado (remito ${r.remito.codigo}): no se movió nada de nuevo.`
        : `Listo: ${n === 1 ? "1 producto salió" : `${n} productos salieron`} de ${r.remito.origen.nombre} y ${n === 1 ? "entró" : "entraron"} en ${r.remito.destino.nombre}. Remito ${r.remito.codigo}.`,
    };
  } catch (e) {
    if (e instanceof TrasladoRechazado) return { ok: false, error: e.message };
    if (esMigracionPendiente(e)) return { ok: false, error: `${MIGRACION_PENDIENTE} No se movió nada.` };
    logger.error("mis-locales", "no se pudo registrar un traslado", e, { casaId: casa.casaId, origen: v.origen.id, destino: v.destino.id });
    return { ok: false, error: "No se pudo registrar el traslado. No se movió nada: probá de nuevo en un rato." };
  }
}
