// ============================================================================
// Probe de schema-ahead — ¿está aplicada la migración carnicería (Gate 2)?, y ¿este negocio
// usa Lotes y Despiece?
// ============================================================================
//
// `main` auto-deploya. Las tablas/columnas del rubro cárnico (ProductBatch,
// ProcessingRun/Output, Product.category/cost) viven en prisma/pending-gate2/ y NO en
// schema.prisma, para no repetir el schema-ahead que tiró CH. El código las accede por
// SQL crudo (src/lib/carniceria/*-actions.ts); ANTES de mostrar cualquier pantalla nueva
// se pregunta acá si existen. Si no: "En preparación" y cero query → nada rompe en prod
// hasta que el dueño aplique la migración (mismo espíritu que getActiveProfile).
//
// La migración es de TODA la base (los cuatro negocios comparten Postgres): aplicada para
// MAGRA, también está para Shine y A Dos Manos. Por eso "la tabla existe" no alcanza para
// mostrar Lotes y Despiece: además el negocio tiene que vender perecederos (el dato
// `perecederos` de su rubro en el blueprint). Sin esto, el día que se aplique la migración
// una tienda de velas vería "Lotes al vacío" y "Despiece" en su barra.
//
// La tabla se pregunta a information_schema (no es una tabla de tenant → no la toca la RLS);
// todo cacheado por request (react.cache). Cualquier error → false (fail-safe: ocultar).

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { runInTenantContext } from "@/lib/tenant-context";
import { rubroConPerecederos } from "@/blueprints/retail/rubros";
import { getCurrentTenantRubro, rubroDeLaFila } from "./rubro";

/** ¿Está aplicada la migración cárnica en esta base? */
export const migracionCarniceriaAplicada = cache(async (): Promise<boolean> => {
  try {
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'ProductBatch'`;
    return Number(rows?.[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
});

/**
 * Cómo están Lotes y Despiece en ESTE negocio. PURA.
 *   · "lista": vende perecederos y la migración está aplicada.
 *   · "falta-migracion": vende perecederos pero la base todavía no tiene las tablas → la
 *     pantalla dice "En preparación" (es lo que ve MAGRA hasta la ola 9).
 *   · "no-aplica": no vende perecederos (velas, pádel, un negocio de servicios).
 */
export type EstadoLotesYDespiece = "lista" | "falta-migracion" | "no-aplica";

export function estadoLotesYDespiece(perecederos: boolean, migrada: boolean): EstadoLotesYDespiece {
  if (!perecederos) return "no-aplica";
  return migrada ? "lista" : "falta-migracion";
}

/** ¿El negocio del request vende perecederos? Error → false (fail-safe: ocultar). */
const perecederosDelNegocio = cache(async (): Promise<boolean> => {
  try {
    return rubroConPerecederos((await getCurrentTenantRubro()).rubro?.id);
  } catch {
    return false;
  }
});

/** El estado de Lotes y Despiece del negocio del request (lo leen sus páginas). */
export const leerEstadoLotesYDespiece = cache(async (): Promise<EstadoLotesYDespiece> => {
  const [perecederos, migrada] = await Promise.all([perecederosDelNegocio(), migracionCarniceriaAplicada()]);
  return estadoLotesYDespiece(perecederos, migrada);
});

/**
 * ¿Este negocio tiene Lotes y Despiece listos? Es lo que la barra de hoy (layout.tsx) y el
 * contexto de apps (contexto.server.ts, `carniceriaLista`) leen para el rubro "carniceria"
 * de esas dos apps. Sin la migración (producción hoy) contesta sin leer el negocio: la barra de
 * cada página no suma una consulta.
 *
 * Contesta "migración aplicada Y rubro de perecederos" (ver la cabecera). Antes se llamaba
 * `hasCarniceriaSchema`, cuando sólo preguntaba por la tabla.
 */
export const lotesYDespieceListos = cache(async (): Promise<boolean> => (await migracionCarniceriaAplicada()) && (await perecederosDelNegocio()));

// ── La guarda de la VENTA (Magra T3b): ¿se controlan los lotes vencidos en este alta? ──────────

/**
 * Cache de PROCESO, sólo del SÍ. Una migración aplicada no se desaplica (DROP está bloqueado por
 * norma): un "sí" visto una vez sigue valiendo. El "no" NO se guarda: si el dueño aplica la
 * migración con el proceso vivo, la próxima venta la ve (un "no" viejo apagaría la guarda).
 */
let migracionVistaAplicada = false;

async function migracionAplicadaParaLaVenta(): Promise<boolean> {
  if (migracionVistaAplicada) return true;
  const aplicada = await migracionCarniceriaAplicada();
  if (aplicada) migracionVistaAplicada = true;
  return aplicada;
}

/** Sólo para los tests: olvida el "sí" del proceso (cada base efímera arranca sin migración). */
export function olvidarMigracionVistaParaTests(): void {
  migracionVistaAplicada = false;
}

/**
 * ¿El alta de ESTE negocio tiene que frenar los cortes vencidos? (`lotesVencidos` del alta,
 * order-core.ts). Lo preguntan los cinco caminos que venden: el mostrador, la tienda, la API
 * externa, la caja con lector y el cobro del turno con productos.
 *
 * Con el `tenantId` explícito (la tienda y la API externa no tienen "negocio del request" de
 * backoffice). PRIMERO el rubro, con una lectura por clave primaria: un negocio que no vende
 * perecederos (CH, Shine, una tienda de velas) contesta `false` sin preguntar a
 * information_schema. Después la migración, con el sí cacheado por proceso. Cualquier error →
 * `false` (la venta de siempre, sin la consulta que abortaría la transacción si falta la tabla).
 */
export async function lotesListosParaVender(tenantId: string): Promise<boolean> {
  try {
    // Con el contexto del MISMO negocio explícito: la lectura no depende de que quien llama ya lo
    // tenga (un camino sin él contestaría "no" y apagaría la guarda en silencio).
    const fila = await runInTenantContext(tenantId, async () =>
      await prisma.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true, slug: true } }),
    );
    if (!fila) return false;
    if (!rubroConPerecederos(rubroDeLaFila(fila.blueprintId, fila.slug).rubro?.id)) return false;
    return await migracionAplicadaParaLaVenta();
  } catch {
    return false;
  }
}

/** La opción `lotesVencidos` del alta para este negocio y este día del negocio, o `null`. */
export async function opcionLotesVencidos(tenantId: string, hoy: string): Promise<{ hoy: string } | null> {
  return (await lotesListosParaVender(tenantId)) ? { hoy } : null;
}
