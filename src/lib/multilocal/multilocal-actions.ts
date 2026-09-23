"use server";

// ============================================================================
// MIS LOCALES — las lecturas de la red, cableadas a la base.
// ============================================================================
//
// Cada export de este archivo es un ENDPOINT (así funciona "use server"), así que cada uno
// arranca con `exigirCasa` (capability + módulo `multilocal` leído de Tenant.modules) y
// NINGUNO recibe un id de negocio: la casa sale de la sesión y los locales, de SUS filas de la
// red, leídas con el GUC de la casa. Llamarlos desde la consola del navegador con un id ajeno
// no tiene dónde meterlo. El `?local=` de las pantallas se resuelve después, contra los locales
// que devolvió la pasada (`elegirLocal`, multilocal-core.ts): un id ajeno da error.
//
// AISLAMIENTO (el molde de la cartera del contador, cartera-actions.ts):
//   · las filas de la red, con `tenantTransaction` y el GUC de la CASA (RLS de CarteraCliente);
//   · los datos de cada local, con UNA `tenantTransaction` por local y SU GUC, en serie
//     (`recorrerLocales`), y adentro sólo el `tx` de esa transacción;
//   · la única lectura con el cliente base es la tabla Tenant (fuera de RLS por diseño), para
//     el nombre, el CUIT y el punto de venta de locales ya verificados.
// Jamás `operatorPrisma` en este camino.
//
// UNA PASADA POR REQUEST: el Inicio (los números de las cuatro apps) y la pantalla piden lo
// mismo, y `react.cache` hace que la base se recorra una sola vez. Esa caché dura el request;
// entre requests no hay ninguna (una caché compartida filtraría números entre negocios).

import { cache } from "react";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { roleHasCapability } from "@/lib/capabilities";
import { CIERRE_DIARIO_ACTION, CIERRE_DIARIO_ENTITY, lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { todayInBusinessTz } from "@/lib/datetime";
import type { DayKey } from "@/lib/caja/cierre-diario";
import { logger } from "@/lib/logger";
import { AppNoDisponibleError, requireAppAccion } from "@/lib/require-app";
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
  matrizDeStock,
  recolectarLocal,
  recorrerLocales,
  resumirRed,
  sumarVentas,
  ventasDe,
  ventasPorDia,
  type ColumnaStock,
  type ContextoPasada,
  type FilaCaja,
  type FilaStock,
  type GrupoCuit,
  type LocalConPasada,
  type MetaLocal,
  type PuertosRed,
  type Rango,
  type ResumenRed,
  type Ventas,
  type VentasDeUnLocal,
} from "./multilocal-core";

// ── Resultados (los consumen las pantallas de /admin/locales y los números del Inicio) ──

/** Una tabla que el código espera y la base todavía no tiene (migración sin aplicar). */
const MIGRACION_PENDIENTE =
  "Falta aplicar una migración de la base (paso del dueño). Cuando se aplique, esta pantalla se enciende sola.";

export type ResultadoRed =
  | { ok: true; casa: string; hoy: DayKey; red: LocalConPasada[]; resumen: ResumenRed }
  | { ok: false; error: string };

export type ResultadoStock =
  | {
      ok: true;
      casa: string;
      columnas: { id: string; nombre: string; esCasa: boolean }[];
      filas: FilaStock[];
      resumen: Pick<ResumenRed, "stockBajo" | "stockNegativo">;
      /** Locales de la red (sin contar la casa). */
      locales: number;
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
    }
  | { ok: false; error: string };

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
 * Lo que la pantalla dice cuando la lectura de un local falla por otra cosa (la base no
 * contestó, un local dado de baja a mitad de la pasada). La dueña ve qué pasó y qué hacer, no
 * la pantalla genérica de error; el detalle queda en el log, con la casa, nunca en pantalla.
 */
const NO_SE_PUDO_LEER =
  "No se pudo leer la información de tus locales en este momento. Probá de nuevo en un rato; si sigue, escribinos a Gestión Studio Grow.";

function falloDeLectura(e: unknown, que: string, casaId: string): { ok: false; error: string } {
  if (esMigracionPendiente(e)) return { ok: false, error: MIGRACION_PENDIENTE };
  logger.error("mis-locales", `no se pudo leer ${que}`, e, { casaId });
  return { ok: false, error: NO_SE_PUDO_LEER };
}

// ── Las pasadas, cacheadas por request ───────────────────────────────────────

/**
 * La pasada completa de la red (ventas de hoy y de la semana, caja, cierres y stock), una
 * transacción por local. Recibe el id de la casa que YA verificó `exigirCasa`; no se exporta.
 */
const pasadaDeLaCasa = cache(async (casaId: string, hoy: DayKey): Promise<LocalConPasada[]> => {
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

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * La red de la casa: cómo viene hoy cada local. La usan Mis locales, Cajas de los locales y
 * los números del Inicio. Sólo la dueña (`multilocal:manage`).
 */
export async function redDeLaCasaAction(): Promise<ResultadoRed> {
  const casa = await exigirCasa("multilocal:manage");
  if (!casa.ok) return casa;
  const hoy = todayInBusinessTz();
  try {
    const red = await pasadaDeLaCasa(casa.casaId, hoy);
    return { ok: true, casa: casa.nombre, hoy, red, resumen: resumirRed(red) };
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
  try {
    await requireAppAccion("stock-por-local");
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
    throw e;
  }
  try {
    const locales = roleHasCapability(casa.user.role, "multilocal:manage")
      ? (await pasadaDeLaCasa(casa.casaId, todayInBusinessTz())).map(({ local, dato }) => ({ local, dato: dato.stock }))
      : await stockDeLaCasa(casa.casaId);
    // El stock de la propia casa: es el negocio del request, así que su id sale de la sesión.
    const propio = await tenantTransaction((tx) => leerStock(tx, casa.casaId), { tenantId: casa.casaId });
    const columnas: ColumnaStock[] = [
      // La casa va sólo si tiene productos: una casa que no es obrador no suma una columna vacía.
      ...(propio.length > 0 ? [{ id: casa.casaId, nombre: casa.nombre, esCasa: true, productos: propio }] : []),
      ...locales.map(({ local, dato }) => ({ id: local.localTenantId, nombre: local.alias, esCasa: false, productos: dato })),
    ];
    return {
      ok: true,
      casa: casa.nombre,
      columnas: columnas.map(({ id, nombre, esCasa }) => ({ id, nombre, esCasa })),
      filas: matrizDeStock(columnas),
      resumen: contarStock(locales.map((l) => l.dato)),
      locales: locales.length,
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
    const red = await recorrerLocales(puertos, casa.casaId, async (tx, local) =>
      (await tx.cashMovement.findMany(consultaFilasDeVentas(local.localTenantId, desde, hasta))) as FilaCaja[],
    );
    const locales: VentasDeUnLocal[] = red.map(({ local, dato }) => ({
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
    };
  } catch (e) {
    return falloDeLectura(e, "las ventas de la red", casa.casaId);
  }
}
