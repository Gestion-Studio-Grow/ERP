import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Pool de conexiones ACOTADO (hardening $0, carril de confiabilidad). Cada
// instancia (lambda/worker) abre como mucho `max` conexiones al pooler de Neon;
// sin este techo, bajo carga o muchas instancias concurrentes el pooler se agota
// y las requests empiezan a fallar. `connectionTimeoutMillis` hace fallar RÁPIDO
// (en vez de colgar) si el pool está saturado. Todo por env con default
// conservador → reversible, sin costo, sin tocar Neon.
function envPosInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: envPosInt(process.env.DB_CONNECTION_LIMIT, 5),
  connectionTimeoutMillis: envPosInt(process.env.DB_CONNECT_TIMEOUT_MS, 10_000),
  idleTimeoutMillis: envPosInt(process.env.DB_IDLE_TIMEOUT_MS, 30_000),
});

export const basePrisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = basePrisma;

// Flag maestro del candado RLS (ADR-018). OFF por defecto: mientras no valga
// exactamente "on", la app usa el cliente crudo y NADA cambia respecto de hoy.
// Se enciende en el go-live, en la misma pasada que se rota DATABASE_URL al rol
// `app_rls` (sin ese rol, encenderlo solo agrega overhead sin enforcement).
export const RLS_ENFORCEMENT = process.env.RLS_ENFORCEMENT === "on";
