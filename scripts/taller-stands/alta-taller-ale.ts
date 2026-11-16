// ============================================================================
// ALTA DEL TENANT DEL TALLER DE STANDS (GSG-MIA-004) — idempotente, sin usuarios.
// ============================================================================
//
// Crea el negocio del taller de Ale como un tenant aparte del motor (rubro `taller-stands`), con
// los módulos de su preset. NO comparte nada con MIA Producciones: cada uno ve sólo su base (RLS).
//
// Qué hace y qué no:
//   - Idempotente por slug: correrlo dos veces no duplica ni pisa (el update es vacío).
//   - Transaccional y aditivo: nunca borra, nunca toca otro tenant.
//   - Respeta el gate de ADR-018 (no crea un 2º tenant sin RLS activo), igual que provision-tenant.
//   - NO crea usuarios ni manda credenciales: dar acceso a Ale es decisión del dueño (owner-level).
//   - Nombre comercial y CUIT: provisionales a confirmar por el dueño; acá no se carga CUIT.
//
// Frenos antes de tocar una base:
//   1. TALLER_STANDS_ENABLED tiene que estar prendido (default apagado).
//   2. La base tiene que ser local (localhost/127.0.0.1) o una rama de Neon nombrada a mano con
//      --rama-neon <id-de-endpoint>, que tiene que aparecer en el host. Nunca producción.
//
// Uso:  TALLER_STANDS_ENABLED=1 npx tsx scripts/taller-stands/alta-taller-ale.ts [--rama-neon ep-xxxx]

import "dotenv/config";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { defaultModulesForBlueprint } from "../../src/blueprints/presets-meta";
import { tallerStandsEnabled } from "../../src/modules/flags";
import { isRlsActive } from "../provision-tenant";

export const SLUG_TALLER = "taller-ale"; // provisional a confirmar
export const NOMBRE_TALLER = "Taller de Ale (provisional a confirmar)";
export const RUBRO_TALLER = "taller-stands";

export interface AltaTallerResult {
  tenantId: string;
  creado: boolean;
  modules: string[];
}

/**
 * ¿Se puede correr el alta contra esta base? Devuelve el motivo del freno o null. PURA.
 * Sólo local o una rama de Neon nombrada explícitamente (su id de endpoint en el host).
 */
export function motivoFreno(
  databaseUrl: string | undefined,
  ramaNeon: string | undefined,
  env: Record<string, string | undefined>,
): string | null {
  if (!tallerStandsEnabled(env)) return "TALLER_STANDS_ENABLED está apagado.";
  if (!databaseUrl) return "falta DATABASE_URL.";
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    return "DATABASE_URL no es una URL legible.";
  }
  if (host === "localhost" || host === "127.0.0.1") return null;
  if (host.endsWith(".neon.tech")) {
    if (!ramaNeon || !/^ep-[a-z0-9-]+$/.test(ramaNeon)) {
      return "la base es Neon: hace falta --rama-neon <ep-…> con el endpoint de una rama de prueba.";
    }
    if (!host.startsWith(`${ramaNeon}.`) && !host.startsWith(`${ramaNeon}-pooler.`)) {
      return "el host de DATABASE_URL no es el endpoint dado en --rama-neon.";
    }
    return null;
  }
  return `host no permitido: ${host}.`;
}

/** Core del alta: idempotente por slug, transaccional, sin usuarios. Prisma inyectado. */
export async function altaTallerAle(prisma: PrismaClient): Promise<AltaTallerResult> {
  const modules = defaultModulesForBlueprint(RUBRO_TALLER);
  return prisma.$transaction(async (tx) => {
    const existente = await tx.tenant.findUnique({ where: { slug: SLUG_TALLER }, select: { id: true, modules: true } });
    if (existente) return { tenantId: existente.id, creado: false, modules: existente.modules };

    if ((await tx.tenant.count()) >= 1 && !(await isRlsActive(tx))) {
      throw new Error("GATE ADR-018: RLS no está activo; no se crea un tenant nuevo.");
    }
    const tenant = await tx.tenant.create({
      data: { name: NOMBRE_TALLER, slug: SLUG_TALLER, blueprintId: RUBRO_TALLER, status: "TRIAL", modules },
      select: { id: true },
    });
    return { tenantId: tenant.id, creado: true, modules };
  });
}

async function main() {
  const i = process.argv.indexOf("--rama-neon");
  const ramaNeon = i > 0 ? process.argv[i + 1] : undefined;
  const freno = motivoFreno(process.env.DATABASE_URL, ramaNeon, process.env);
  if (freno) {
    console.error(`✖ FRENADO: ${freno}`);
    process.exit(1);
  }
  const { PrismaClient } = await import("../../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const r = await altaTallerAle(prisma);
    console.log(`${r.creado ? "✔ creado" : "= ya existía"} · slug ${SLUG_TALLER} · módulos: ${r.modules.join(", ")}`);
    console.log("Sin usuarios: el acceso de Ale lo decide el dueño.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && /alta-taller-ale\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
