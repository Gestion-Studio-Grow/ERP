import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { instalarEnPool } from "@/lib/pg-begin-con-negocio";
import { empaquetarBeginConNegocio, limitesDelPool } from "@/lib/db-pool";

// Cliente Prisma CRUDO (base). Conecta con el rol de DATABASE_URL tal cual
// (hoy `neondb_owner`, que está EXENTO de RLS por ser dueño de las tablas).
//
// Este módulo es una HOJA a propósito: no importa a nadie de la capa de tenant,
// para no crear ciclos. `@/lib/prisma` re-exporta desde acá + desde `db.ts` el
// cliente conmutado por flag. Reglas de uso:
//   * Código de runtime (actions, loaders, session): importa `prisma` de
//     `@/lib/prisma` → obtiene el cliente conmutado (RLS cuando el flag está ON).
//   * Resolución de tenant (`tenant.ts`), seed y scripts de provisioning: importan
//     `basePrisma` de acá → SIEMPRE el crudo, sin RLS (evita recursión en el
//     extension y permite escritura cross-tenant en el bootstrap).

// En desarrollo el cliente se guarda en `globalThis` para que la recarga en caliente no abra
// un pool nuevo por cada archivo que cambia. La CLAVE lleva la versión de cómo se arma el pool:
// si cambia el armado (como ahora, con el BEGIN junto al negocio), la clave nueva hace que el
// server de desarrollo que ya estaba andando arme el cliente nuevo en vez de seguir con el
// viejo. En producción no se guarda: cada instancia arranca de cero.
const CLAVE_DEL_CLIENTE = "prismaBase:v2-begin-con-negocio";
const globalForPrisma = globalThis as unknown as Record<string, PrismaClient | undefined>;

// Pool de conexiones ACOTADO (hardening $0, carril de confiabilidad). Cada
// instancia (lambda/worker) abre como mucho `max` conexiones al pooler de Neon;
// sin este techo, bajo carga o muchas instancias concurrentes el pooler se agota
// y las requests empiezan a fallar. `connectionTimeoutMillis` hace fallar RÁPIDO
// (en vez de colgar) si el pool está saturado. Todo por env con default
// conservador → reversible, sin costo, sin tocar Neon. Los números y el valor
// recomendado para Vercel: src/lib/db-pool.ts y .env.vercel.template.
//
// El pool se arma acá (y no dentro del adaptador) para enchufarle a cada conexión el
// empaquetado del BEGIN con el negocio (src/lib/pg-begin-con-negocio.ts): una transacción con
// RLS sale con un viaje menos, sin cambiar qué sentencias corren ni en qué orden. APAGADO por
// defecto: sólo `DB_BEGIN_CON_NEGOCIO=on` (db-pool.ts) lo prende, sin tocar código.
// `disposeExternalPool`: `$disconnect()` cierra el pool, como antes, así los scripts terminan.
function crearCliente(): PrismaClient {
  const limites = limitesDelPool(process.env);
  // Apagado (el defecto, db-pool.ts): el adaptador arma su pool como siempre, con los mismos números.
  if (!empaquetarBeginConNegocio(process.env)) {
    return new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: limites.conexiones,
        connectionTimeoutMillis: limites.esperaConexionMs,
        idleTimeoutMillis: limites.ociosaMs,
      }),
    });
  }
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: limites.conexiones,
    connectionTimeoutMillis: limites.esperaConexionMs,
    idleTimeoutMillis: limites.ociosaMs,
  });
  instalarEnPool(pool);
  return new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
}

export const basePrisma = globalForPrisma[CLAVE_DEL_CLIENTE] ?? crearCliente();

if (process.env.NODE_ENV !== "production") globalForPrisma[CLAVE_DEL_CLIENTE] = basePrisma;

// Flag maestro del candado RLS (ADR-018). OFF por defecto: mientras no valga
// exactamente "on", la app usa el cliente crudo y NADA cambia respecto de hoy.
// Se enciende en el go-live, en la misma pasada que se rota DATABASE_URL al rol
// `app_rls` (sin ese rol, encenderlo solo agrega overhead sin enforcement).
export const RLS_ENFORCEMENT = process.env.RLS_ENFORCEMENT === "on";
