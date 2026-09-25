// ============================================================================
// LÍMITES DEL POOL DE CONEXIONES A LA BASE — un solo lugar para los números.
// ============================================================================
//
// Los usa src/lib/prisma-base.ts para armar el pool de cada instancia del servidor. La fila de
// números del Inicio (src/apps/kpis/nucleo.server.ts, `enParaleloDelPool`) tiene que tener el
// MISMO tamaño que el pool: si la fila es más grande, los números esperan conexión adentro del
// tope de 1,5 s; si es más chica, el Inicio tarda más sin ganar nada (medido, ver nucleo.server.ts).
//
// Hoja sin dependencias: la puede importar cualquier módulo, también los que corren en los tests.
//
// VALORES (se cambian por variable de entorno, sin tocar código; ver .env.vercel.template):
//   · DB_CONNECTION_LIMIT   conexiones por instancia. Por defecto 5 (lo de siempre).
//   · DB_BEGIN_CON_NEGOCIO  `on` junta el BEGIN con el negocio (pg-begin-con-negocio.ts). Apagado.
//   · DB_TENANT_DIRECTO     `on` lee las columnas propias de `Tenant` sin transacción (rls.ts). Apagado.
//   · DB_CONNECT_TIMEOUT_MS cuánto se espera una conexión libre antes de fallar. 10 s.
//   · DB_IDLE_TIMEOUT_MS    cuánto vive una conexión sin uso antes de cerrarse. 30 s.
//
// POR QUÉ SE PROPONE 10 (Y POR QUÉ EL DEFECTO SIGUE EN 5). Con RLS, cada lectura del panel es una transacción que ocupa una conexión
// mientras dura. El Inicio por apps pide unas 40 de esas transacciones; con 5 conexiones salen de
// a 5 y el total crece con cada viaje a la base. Medido (banco de la capa de datos: el código
// real contra una copia de la base del laboratorio, 30 ms de ida y vuelta, informe de performance
// del 2026-09-24): los números del Inicio de MAGRA tardan 940 ms con 5 conexiones y 575 ms con
// 10 (la fila del mismo tamaño que el pool), con el mismo resultado. El techo real lo pone el
// pooler de Neon (PgBouncer en modo transacción: hasta 10.000 clientes y, por rol y base,
// 0,9 × max_connections de la compute — unas 100 en la más chica, 377 en 1 CU —, según
// neon.com/docs/connect/connection-pooling; no medido acá): 10 por instancia deja margen para
// varias instancias a la vez. Si Vercel tiene DB_CONNECTION_LIMIT puesta, manda ésa.
//
// LAS TRES MEJORAS VIENEN APAGADAS. Cambian cómo habla con la base TODO negocio, CH incluido (que
// está en producción), y ninguna se probó contra el pooler de Neon. Hasta que el dueño lo autorice
// y se verifiquen en un preview contra Neon, el defecto es el camino de siempre: 5 conexiones, el
// BEGIN aparte y `Tenant` por la transacción. Se prenden por variable de entorno, sin tocar código.

export interface LimitesDelPool {
  /** Conexiones abiertas como mucho por instancia (`max` del pool de pg). */
  conexiones: number;
  /** Cuánto espera un pedido por una conexión libre antes de fallar (ms). */
  esperaConexionMs: number;
  /** Cuánto vive una conexión ociosa antes de cerrarse (ms). */
  ociosaMs: number;
}

export const LIMITES_POR_DEFECTO: Readonly<LimitesDelPool> = {
  conexiones: 5,
  esperaConexionMs: 10_000,
  ociosaMs: 30_000,
};

function enteroPositivo(raw: string | undefined, porDefecto: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : porDefecto;
}

/** Los límites que manda el entorno, con los de por defecto donde falten o no sirvan. PURA. */
export function limitesDelPool(env: Record<string, string | undefined>): LimitesDelPool {
  return {
    conexiones: enteroPositivo(env.DB_CONNECTION_LIMIT, LIMITES_POR_DEFECTO.conexiones),
    esperaConexionMs: enteroPositivo(env.DB_CONNECT_TIMEOUT_MS, LIMITES_POR_DEFECTO.esperaConexionMs),
    ociosaMs: enteroPositivo(env.DB_IDLE_TIMEOUT_MS, LIMITES_POR_DEFECTO.ociosaMs),
  };
}

function prendida(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "on";
}

/**
 * ¿Se junta el BEGIN con el negocio en un solo mensaje (src/lib/pg-begin-con-negocio.ts)? SÓLO
 * con `DB_BEGIN_CON_NEGOCIO=on`. Verificado contra el Postgres del laboratorio; contra el pooler
 * de Neon, todavía no: por eso viene apagado. Apagado, el cliente se arma exactamente como antes
 * (prisma-base.ts) y cada transacción sale con su BEGIN aparte. PURA.
 */
export function empaquetarBeginConNegocio(env: Record<string, string | undefined>): boolean {
  return prendida(env.DB_BEGIN_CON_NEGOCIO);
}

/**
 * ¿Las lecturas de columnas propias de `Tenant` salen sin la transacción con el negocio puesto
 * (rls.ts, `esLecturaDirectaDeTenant`)? SÓLO con `DB_TENANT_DIRECTO=on`. `Tenant` no tiene RLS
 * (prisma/rls/0001_enable_rls.sql), así que el resultado es el mismo; lo que cambia es el camino
 * de las consultas en producción, y eso espera el OK del dueño. PURA.
 */
export function leerTenantSinTransaccion(env: Record<string, string | undefined>): boolean {
  return prendida(env.DB_TENANT_DIRECTO);
}
