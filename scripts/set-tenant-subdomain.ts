// Setear/consultar el `Tenant.subdomain` de uno o varios tenants (routing por
// subdominio, ADR-018 §4 / deploy-vercel). Aditivo e idempotente: sólo actualiza
// la columna `subdomain` por `slug`; no crea ni borra nada, no toca otros campos.
//
// Corre con el rol OWNER (DATABASE_URL = neondb_owner): el subdominio es metadata
// de plataforma y `Tenant` está fuera de RLS. NO imprime secretos.
//
//   Listar:   node --import tsx scripts/set-tenant-subdomain.ts --list
//   Setear:   node --import tsx scripts/set-tenant-subdomain.ts beauty-spa=chestetica magra=magra
//   Dry-run:  ... --dry-run beauty-spa=chestetica
//
// Una sola conexión para todos los pares (barato para el plan free de Neon).

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Un subdominio es un label DNS: minúsculas, dígitos y guiones (no al borde).
// Mismo criterio kebab que el slug, para que la URL sea estable y válida.
export function assertValidSubdomain(sub: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sub)) {
    throw new Error(
      `subdomain inválido: "${sub}". Debe ser un label DNS: minúsculas, dígitos y guiones ` +
        `internos (ej. "chestetica"). No se normaliza automáticamente.`,
    );
  }
}

// Parsea "slug=subdomain" → [slug, subdomain]. Valida ambos lados.
export function parsePair(token: string): { slug: string; subdomain: string } {
  const eq = token.indexOf("=");
  if (eq <= 0 || eq === token.length - 1) {
    throw new Error(`par inválido: "${token}". Formato esperado: slug=subdomain.`);
  }
  const slug = token.slice(0, eq).trim();
  const subdomain = token.slice(eq + 1).trim().toLowerCase();
  assertValidSubdomain(subdomain);
  return { slug, subdomain };
}

type TenantRow = { id: string; slug: string; subdomain: string | null; blueprintId: string | null };

/** Actualiza el subdomain de un slug. Falla si el tenant no existe. Idempotente. */
export async function setSubdomain(
  prisma: PrismaClient,
  slug: string,
  subdomain: string,
): Promise<{ slug: string; before: string | null; after: string }> {
  const existing = await prisma.tenant.findUnique({
    where: { slug },
    select: { subdomain: true },
  });
  if (!existing) {
    throw new Error(`No existe un tenant con slug "${slug}" — no se setea nada (fail-closed).`);
  }
  if (existing.subdomain !== subdomain) {
    await prisma.tenant.update({ where: { slug }, data: { subdomain } });
  }
  return { slug, before: existing.subdomain, after: subdomain };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const list = argv.includes("--list");
  const dryRun = argv.includes("--dry-run");
  const pairs = argv.filter((a) => !a.startsWith("--")).map(parsePair);

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    if (list || pairs.length === 0) {
      const tenants = (await prisma.tenant.findMany({
        select: { id: true, slug: true, subdomain: true, blueprintId: true },
        orderBy: { createdAt: "asc" },
      })) as TenantRow[];
      console.log("── Tenants (slug · subdomain · blueprint) ──");
      for (const t of tenants) {
        console.log(`  ${t.slug.padEnd(14)} subdomain=${t.subdomain ?? "(null)"}  blueprint=${t.blueprintId ?? "(null)"}`);
      }
      if (pairs.length === 0 && !list) {
        console.log("\n(sin pares slug=subdomain → solo listado. Pasá pares para setear.)");
      }
      return;
    }

    console.log(dryRun ? "── DRY-RUN (no escribe) ──" : "── Seteando subdomains ──");
    for (const { slug, subdomain } of pairs) {
      if (dryRun) {
        console.log(`  ${slug} → ${subdomain}  [dry-run]`);
        continue;
      }
      const r = await setSubdomain(prisma, slug, subdomain);
      const changed = r.before !== r.after;
      console.log(
        `  ${r.slug} → ${r.after}  ${changed ? `(antes: ${r.before ?? "(null)"})` : "(sin cambio)"}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && /set-tenant-subdomain\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error("\n✖ Abortado:\n" + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
  });
}
