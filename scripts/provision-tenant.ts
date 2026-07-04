// Alta de tenant (provisioning) — implementación de ADR-019.
//
// QUÉ ES: el alta de un negocio nuevo en el SaaS. Reemplaza el anti-patrón de
// "editar prisma/seed.ts a mano y correrlo contra Neon" (ADR-019 §1). A
// diferencia de ese seed —que tiene `deleteMany` destructivos y los datos
// reales de Carolina— este script es:
//   - idempotente por `slug`   (correrlo dos veces no duplica ni pisa)
//   - transaccional            (todo-o-nada: o el tenant queda completo o nada)
//   - aditivo                  (NUNCA borra; no toca ningún tenant existente)
//   - parametrizado            (nombre, slug, email del OWNER, timezone)
//   - neutral                  (catálogo blueprint de EJEMPLO, no datos de nadie)
//
// NO comparte código con `prisma/seed.ts` (ADR-019 §3): son dos cosas distintas
// —siembra de demo vs. alta real— y mezclarlas fue justamente el problema.
//
// GATE COMPUESTO CON ADR-018 (§2.d / §3): crear el 2º tenant rompe la app en el
// acto —`getCurrentTenantId()` lanza (ADR-015) en cuanto hay ≠1 fila en Tenant—.
// Por eso este script se NIEGA a crear una 2ª fila de Tenant si RLS de Postgres
// (ADR-018) no está activo. Re-provisionar un tenant que YA existe (mismo slug)
// es seguro siempre: no crea filas nuevas, así que no dispara el gate.
//
// RUNTIME NODE (tsx), operado por el equipo con la autorización permanente de
// deploy. No es un portal público ni un panel super-admin (ADR-019 §2.a: ambos
// diferidos). Ejecutar:  npm run provision -- --name "..." --slug ... --owner-email ...
//
// La contraseña de bootstrap del OWNER NUNCA vive en el repo (ADR-017 / ADR-019
// §5.4): se pasa por --password / env PROVISION_OWNER_PASSWORD, o —si no se da—
// se genera una aleatoria fuerte y se imprime UNA sola vez en stdout para que el
// operador la comunique por canal seguro y la retire del entorno.

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth-password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

// Tablas de negocio sobre las que ADR-018 activaría RLS. Alcanza con verificar
// una para saber si el gate de aislamiento está puesto; usamos varias por si en
// una activación parcial quedara alguna sin política.
const RLS_SENTINEL_TABLES = ["Tenant", "Appointment", "Client"];

type Args = {
  name?: string;
  slug?: string;
  ownerEmail?: string;
  ownerName?: string;
  timezone: string;
  password?: string;
  skipCatalog: boolean;
  dryRun: boolean;
};

// Parser mínimo de --flag value / --flag=value, con caída a variables de entorno
// (PROVISION_*). Sin dependencias: es un script operado, no una CLI pública.
function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith("--")) continue;
    const eq = tok.indexOf("=");
    if (eq !== -1) {
      flags[tok.slice(2, eq)] = tok.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[tok.slice(2)] = next;
        i++;
      } else {
        flags[tok.slice(2)] = true;
      }
    }
  }
  const str = (k: string, env: string) =>
    (typeof flags[k] === "string" ? (flags[k] as string) : undefined) ??
    process.env[env] ??
    undefined;

  return {
    name: str("name", "PROVISION_TENANT_NAME"),
    slug: str("slug", "PROVISION_TENANT_SLUG"),
    ownerEmail: str("owner-email", "PROVISION_OWNER_EMAIL"),
    ownerName: str("owner-name", "PROVISION_OWNER_NAME"),
    timezone: str("timezone", "PROVISION_TENANT_TIMEZONE") ?? DEFAULT_TIMEZONE,
    password: str("password", "PROVISION_OWNER_PASSWORD"),
    skipCatalog: flags["skip-catalog"] === true || flags["skip-catalog"] === "true",
    dryRun: flags["dry-run"] === true || flags["dry-run"] === "true",
  };
}

// Normaliza y valida el slug: es el identificador de direccionamiento del tenant
// (ADR-019 §5.2) y la clave de idempotencia, así que tiene que ser estable y
// URL-safe. No lo "arreglamos" en silencio: si no matchea, cortamos, para que el
// operador lo escriba bien a propósito y no termine con dos slugs casi iguales.
function assertValidSlug(slug: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      `slug inválido: "${slug}". Debe ser kebab-case URL-safe: minúsculas, ` +
        `dígitos y guiones (ej. "beauty-spa"). No se normaliza automáticamente a propósito.`,
    );
  }
}

function assertValidEmail(email: string): void {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`owner-email inválido: "${email}".`);
  }
}

// Password de bootstrap fuerte y legible (base64url ~ 24 chars). Solo se usa si
// el operador no pasó una; se imprime una vez y no se persiste en claro.
function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

// ¿Está activo RLS (ADR-018) sobre las tablas de negocio? pg_class.relrowsecurity
// es true cuando la tabla tiene ENABLE ROW LEVEL SECURITY. Requerimos que TODAS
// las centinela lo tengan; si falta una, el aislamiento no está garantizado.
async function isRlsActive(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
    SELECT relname, relrowsecurity
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = ANY(${RLS_SENTINEL_TABLES})
  `;
  if (rows.length === 0) return false;
  return rows.every((r) => r.relrowsecurity === true);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // --- Validación de parámetros (fail-fast, antes de tocar la base) ---
  const missing: string[] = [];
  if (!args.name) missing.push("--name (o PROVISION_TENANT_NAME)");
  if (!args.slug) missing.push("--slug (o PROVISION_TENANT_SLUG)");
  if (!args.ownerEmail) missing.push("--owner-email (o PROVISION_OWNER_EMAIL)");
  if (missing.length > 0) {
    throw new Error(
      "Faltan parámetros obligatorios:\n  - " +
        missing.join("\n  - ") +
        "\n\nUso: npm run provision -- --name \"Negocio SA\" --slug negocio-sa " +
        "--owner-email owner@negocio.com [--owner-name \"Nombre\"] " +
        "[--timezone America/...] [--password ...] [--skip-catalog] [--dry-run]",
    );
  }

  const name = args.name!.trim();
  const slug = args.slug!.trim();
  const ownerEmail = args.ownerEmail!.trim().toLowerCase();
  const ownerName = (args.ownerName ?? "Dueño/a").trim();
  assertValidSlug(slug);
  assertValidEmail(ownerEmail);

  // --- Gate compuesto con ADR-018 (§3) ---
  // Si este slug NO existe todavía, el alta crea una fila NUEVA en Tenant. Si ya
  // hay ≥1 tenant y RLS no está activo, eso rompería la app (ADR-015) y correría
  // sin aislamiento de DB (ADR-018). Nos negamos, explícito. Re-provisionar un
  // slug existente no crea filas nuevas → no dispara el gate.
  const existing = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  const isNewTenant = existing === null;
  if (isNewTenant) {
    const tenantCount = await prisma.tenant.count();
    if (tenantCount >= 1) {
      const rls = await isRlsActive();
      if (!rls) {
        throw new Error(
          "GATE ADR-018: este alta crearía un 2º tenant, pero RLS de Postgres no está " +
            "activo.\nCrear la 2ª fila en Tenant rompe getCurrentTenantId() para toda la app " +
            "(ADR-015) y dejaría al sistema sin aislamiento de datos por tenant (ADR-018).\n" +
            "Antes de dar de alta un tenant nuevo hay que:\n" +
            "  1. Activar RLS + resolución de tenant por request (ADR-018), ensayado en branch de Neon.\n" +
            "  2. Recién entonces correr este script para el tenant nuevo.\n" +
            "Provisioning y RLS son el mismo trabajo (ADR-019 §2.d).",
        );
      }
    }
  }

  // --- Resolución de la contraseña del OWNER ---
  const passwordProvided = Boolean(args.password);
  const ownerPassword = args.password ?? generatePassword();

  console.log("── Provisioning de tenant (ADR-019) ──");
  console.log(`  Negocio:   ${name}`);
  console.log(`  Slug:      ${slug}`);
  console.log(`  OWNER:     ${ownerName} <${ownerEmail}>`);
  console.log(`  Timezone:  ${args.timezone}`);
  console.log(`  Modo:      ${existing ? "RE-PROVISIONING (slug existente)" : "ALTA NUEVA"}`);
  console.log(`  Catálogo:  ${args.skipCatalog ? "omitido (--skip-catalog)" : "blueprint mínimo si el tenant no tiene servicios"}`);
  if (args.dryRun) {
    console.log("\n[dry-run] Validaciones OK. No se escribió nada en la base.");
    return;
  }

  // --- Alta transaccional (todo-o-nada, ADR-019 §3) ---
  const result = await prisma.$transaction(async (tx) => {
    // Tenant: idempotente por slug. En re-provisioning respetamos lo que el
    // negocio ya editó (name/timezone): solo se fijan en el alta, no se pisan.
    const tenant = await tx.tenant.upsert({
      where: { slug },
      update: {},
      create: { name, slug, timezone: args.timezone },
    });
    const tenantId = tenant.id;

    // OWNER: idempotente por (tenantId, email). En re-provisioning NO se resetea
    // la contraseña ni el estado del usuario ya existente (update vacío).
    const existingOwner = await tx.user.findUnique({
      where: { tenantId_email: { tenantId, email: ownerEmail } },
      select: { id: true },
    });
    let ownerCreated = false;
    if (!existingOwner) {
      const passwordHash = await hashPassword(ownerPassword);
      await tx.user.create({
        data: { tenantId, name: ownerName, email: ownerEmail, passwordHash, role: "OWNER" },
      });
      ownerCreated = true;
    }

    // Catálogo blueprint mínimo editable (ADR-019 §2.b): "nunca vacío" sin ser
    // los datos de nadie. Se siembra SOLO si el tenant todavía no tiene ningún
    // servicio — así re-provisionar jamás pisa lo que el negocio ya cargó.
    let catalogSeeded = false;
    if (!args.skipCatalog) {
      const serviceCount = await tx.service.count({ where: { tenantId } });
      if (serviceCount === 0) {
        const box = await tx.box.create({
          data: { tenantId, name: "Box de ejemplo (editable)" },
        });
        const category = await tx.serviceCategory.create({
          data: { tenantId, name: "General", order: 0 },
        });
        const serviceA = await tx.service.create({
          data: {
            tenantId,
            categoryId: category.id,
            name: "Servicio de ejemplo A (editable)",
            durationMin: 60,
            price: 0,
          },
        });
        const serviceB = await tx.service.create({
          data: {
            tenantId,
            categoryId: category.id,
            name: "Servicio de ejemplo B (editable)",
            durationMin: 30,
            price: 0,
          },
        });
        // Horarios de atención por defecto Lun–Sáb 9–19 (como el seed), colgados
        // de un profesional de ejemplo enlazado al box y a los servicios.
        const mondayToSaturday = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          tenantId,
          dayOfWeek,
          startTime: "09:00",
          endTime: "19:00",
        }));
        await tx.professional.create({
          data: {
            tenantId,
            name: "Profesional de ejemplo (editable)",
            boxId: box.id,
            services: { connect: [{ id: serviceA.id }, { id: serviceB.id }] },
            workingHours: { create: mondayToSaturday },
          },
        });
        catalogSeeded = true;
      }
    }

    return { tenantId, ownerCreated, catalogSeeded };
  });

  // --- Reporte ---
  console.log("\n✔ Tenant provisionado.");
  console.log(`  tenantId:        ${result.tenantId}`);
  console.log(`  OWNER creado:    ${result.ownerCreated ? "sí" : "no (ya existía)"}`);
  console.log(`  Catálogo demo:   ${result.catalogSeeded ? "sembrado" : "no (el tenant ya tenía servicios o --skip-catalog)"}`);

  if (result.ownerCreated && !passwordProvided) {
    console.log(
      "\n🔑 Contraseña de bootstrap del OWNER (generada, se muestra UNA sola vez):\n" +
        `     ${ownerPassword}\n` +
        "   Comunicásela al OWNER por un canal seguro. NO queda guardada en claro en ningún lado.\n" +
        "   El OWNER debería cambiarla en el primer login.",
    );
  } else if (result.ownerCreated && passwordProvided) {
    console.log("\n🔑 OWNER creado con la contraseña provista (no se imprime).");
  }
}

main()
  .catch((e) => {
    console.error("\n✖ Provisioning abortado:\n" + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
