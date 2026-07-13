// Alta de tenant (provisioning) — implementación de ADR-019.
//
// QUÉ ES: el alta de un negocio nuevo en el SaaS. Reemplaza el anti-patrón de
// "editar prisma/seed.ts a mano y correrlo contra Neon" (ADR-019 §1). A
// diferencia de ese seed —que tiene `deleteMany` destructivos y los datos
// reales de Carolina— este script es:
//   - idempotente por `slug`   (correrlo dos veces no duplica ni pisa)
//   - transaccional            (todo-o-nada: o el tenant queda completo o nada)
//   - aditivo                  (NUNCA borra; no toca ningún tenant existente)
//   - parametrizado            (nombre, slug, OWNER, timezone, branding)
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
// ESTRUCTURA: el core `provisionTenant(prisma, params)` es una función pura sobre
// un PrismaClient inyectado (así se puede probar en un Postgres efímero sin tocar
// Neon); `main()` es solo el envoltorio CLI y corre únicamente si se ejecuta el
// archivo directo, no al importarlo.
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
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword, generateStrongPassword } from "../src/lib/auth-password";
import {
  getBlueprint,
  resolveBlueprint,
  listBlueprints,
  DEFAULT_BLUEPRINT_ID,
  BLUEPRINT_IDS,
} from "../src/blueprints";
import { defaultModulesForBlueprint } from "../src/blueprints/presets-meta";

const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

// Leyenda pública de horarios por defecto para BusinessSettings (Lun–Sáb 9–19,
// coherente con los WorkingHours que siembra el catálogo). Los horarios OPERATIVOS
// reales viven por profesional en WorkingHours; esto es solo el texto público del
// sitio (src/lib/settings.ts cae a este tipo de default si el campo está vacío).
const DEFAULT_HOURS_LABEL = "Lun a sáb · 9 a 19 h";

// Tablas de negocio sobre las que ADR-018 activaría RLS. Alcanza con verificar
// una para saber si el gate de aislamiento está puesto; usamos varias por si en
// una activación parcial quedara alguna sin política.
//
// OJO: NO incluir "Tenant" acá. `0001_enable_rls.sql` es data-driven sobre las
// tablas con columna `tenantId`, y `Tenant` (la raíz del aislamiento) NO tiene
// `tenantId` → queda EXCLUIDA a propósito, con `relrowsecurity=false`. Si "Tenant"
// fuera centinela, `isRlsActive` (que exige que TODAS estén activas) devolvería
// false aun con RLS correctamente aplicado, y el gate del 2º tenant nunca abriría.
// Centinelas = tablas de-tenant que SÍ reciben policy (Appointment, Client).
const RLS_SENTINEL_TABLES = ["Appointment", "Client"];

// Datos de contacto/branding del negocio (BusinessSettings, módulo Localización).
// Todos opcionales a propósito: si no se pasan, el sitio cae a sus defaults.
export interface TenantBranding {
  shortLabel?: string;
  addressLine?: string;
  city?: string;
  hoursLabel?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  mapsUrl?: string;
  contactNote?: string;
}

export interface ProvisionParams {
  name: string;
  slug: string;
  timezone?: string;
  owner: { name?: string; email: string; password?: string };
  /** Vertical de negocio a sembrar (ADR-002). Default: "servicios" (comportamiento histórico). */
  blueprint?: string;
  /** Omitir el catálogo blueprint de ejemplo (default: sembrarlo). */
  skipCatalog?: boolean;
  branding?: TenantBranding;
  /**
   * Metadata de plataforma (control-plane, ADR-021). La setea el alta desde la
   * consola de operador. Solo se persiste al CREAR el tenant; en re-provisioning
   * no se pisa (la config existente se cambia desde la consola, no re-corriendo el alta).
   */
  platform?: {
    status?: "TRIAL" | "ACTIVE" | "SUSPENDED";
    plan?: string;
    subdomain?: string;
    modules?: string[];
    accentPreset?: string;
    frontTheme?: string;
  };
}

export interface ProvisionResult {
  tenantId: string;
  slug: string;
  /** true si el Tenant no existía y se creó en esta corrida. */
  tenantCreated: boolean;
  ownerEmail: string;
  ownerCreated: boolean;
  settingsCreated: boolean;
  /** Id del blueprint aplicado (vertical del tenant). */
  blueprintId: string;
  catalogSeeded: boolean;
  /** Contraseña generada por el script, SOLO si creó el OWNER sin recibir una. Mostrar una vez. */
  generatedPassword?: string;
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

// Normaliza y valida el slug: es el identificador de direccionamiento del tenant
// (ADR-019 §5.2) y la clave de idempotencia, así que tiene que ser estable y
// URL-safe. No lo "arreglamos" en silencio: si no matchea, cortamos, para que el
// operador lo escriba bien a propósito y no termine con dos slugs casi iguales.
export function assertValidSlug(slug: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      `slug inválido: "${slug}". Debe ser kebab-case URL-safe: minúsculas, ` +
        `dígitos y guiones (ej. "beauty-spa"). No se normaliza automáticamente a propósito.`,
    );
  }
}

export function assertValidEmail(email: string): void {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`owner-email inválido: "${email}".`);
  }
}

// ¿Está activo RLS (ADR-018) sobre las tablas de negocio? pg_class.relrowsecurity
// es true cuando la tabla tiene ENABLE ROW LEVEL SECURITY. Requerimos que TODAS
// las centinela lo tengan; si falta una, el aislamiento no está garantizado.
async function isRlsActive(tx: Tx): Promise<boolean> {
  const rows = await tx.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
    SELECT relname, relrowsecurity
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = ANY(${RLS_SENTINEL_TABLES})
  `;
  if (rows.length === 0) return false;
  return rows.every((r) => r.relrowsecurity === true);
}

/**
 * Core del alta. Idempotente por slug, transaccional (todo-o-nada), aditivo.
 * Aplica el gate de RLS (ADR-018) antes de crear un 2º tenant. Recibe el
 * PrismaClient por inyección para poder probarlo sin tocar producción.
 */
export async function provisionTenant(prisma: PrismaClient, params: ProvisionParams): Promise<ProvisionResult> {
  const name = params.name?.trim();
  const slug = params.slug?.trim();
  const timezone = params.timezone?.trim() || DEFAULT_TIMEZONE;
  const ownerEmail = params.owner?.email?.trim().toLowerCase();
  const ownerName = (params.owner?.name ?? "Dueño/a").trim();

  if (!name) throw new Error("provisionTenant: falta `name`.");
  if (!slug) throw new Error("provisionTenant: falta `slug`.");
  if (!ownerEmail) throw new Error("provisionTenant: falta `owner.email`.");
  assertValidSlug(slug);
  assertValidEmail(ownerEmail);

  // Resuelve el vertical (falla explícito si el id no existe) ANTES de abrir la
  // transacción, así un blueprint inválido no llega a tocar la base.
  const blueprint = getBlueprint(params.blueprint ?? DEFAULT_BLUEPRINT_ID);

  const generatedPassword = params.owner.password ? undefined : generateStrongPassword();
  const ownerPassword = params.owner.password ?? generatedPassword!;

  return prisma.$transaction(async (tx) => {
    // --- Gate compuesto con ADR-018 (§3) ---
    // Si este slug NO existe todavía, el alta crea una fila NUEVA en Tenant. Si ya
    // hay ≥1 tenant y RLS no está activo, eso rompería la app (ADR-015) y correría
    // sin aislamiento de DB (ADR-018). Nos negamos, explícito. Re-provisionar un
    // slug existente no crea filas nuevas → no dispara el gate.
    const existing = await tx.tenant.findUnique({ where: { slug }, select: { id: true } });
    const isNewTenant = existing === null;
    if (isNewTenant) {
      const tenantCount = await tx.tenant.count();
      if (tenantCount >= 1) {
        const rls = await isRlsActive(tx);
        if (!rls) {
          throw new Error(
            "GATE ADR-018 — ALTA ABORTADA: este alta crearía un 2º tenant, pero RLS de Postgres " +
              "no está activo.\nCrear la 2ª fila en Tenant rompe getCurrentTenantId() para toda la app " +
              "(ADR-015) y dejaría al sistema sin aislamiento de datos por tenant (ADR-018).\n" +
              "Antes de dar de alta un tenant nuevo hay que:\n" +
              "  1. Activar RLS + resolución de tenant por request (ADR-018), ensayado en branch de Neon.\n" +
              "  2. Recién entonces correr este script para el tenant nuevo.\n" +
              "Provisioning y RLS son el mismo trabajo (ADR-019 §2.d). Este tenant NO fue creado.",
          );
        }
      }
    }

    // --- Tenant: idempotente por slug ---
    // En re-provisioning respetamos lo que el negocio ya editó: update vacío, solo
    // se fija en el alta nueva. Se persiste el blueprint (vertical) y la metadata de
    // plataforma (control-plane, ADR-021) solo al crear — la config existente se
    // cambia desde la consola de operador, no re-corriendo el alta.
    const plat = params.platform ?? {};
    const tenant = await tx.tenant.upsert({
      where: { slug },
      update: {},
      create: {
        name,
        slug,
        timezone,
        blueprintId: blueprint.id,
        ...(plat.status ? { status: plat.status } : {}),
        ...(plat.plan !== undefined ? { plan: plat.plan } : {}),
        ...(plat.subdomain !== undefined ? { subdomain: plat.subdomain } : {}),
        // OP-2: si el alta no pasa `modules` explícito, no se deja en `[]` — se
        // deriva del blueprint (mismo default que ve el consultor/demo, ver
        // src/blueprints/presets-meta.ts). Así la consola de operador no vuelve a
        // mostrar "0 módulos" en un tenant nuevo por falta de dato, no por bug real.
        modules: plat.modules ?? defaultModulesForBlueprint(blueprint.id),
        ...(plat.accentPreset !== undefined ? { accentPreset: plat.accentPreset } : {}),
        ...(plat.frontTheme !== undefined ? { frontTheme: plat.frontTheme } : {}),
      },
    });
    const tenantId = tenant.id;

    // --- OWNER: idempotente por (tenantId, email) ---
    // En re-provisioning NO se resetea la contraseña ni el estado del usuario ya
    // existente (no se toca).
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

    // --- BusinessSettings: branding/localización (módulo Localización) ---
    // Singleton por tenant (tenantId único). Se crea con la leyenda de horarios por
    // defecto + lo que se haya pasado por branding. En re-provisioning NO se pisa lo
    // que el negocio ya editó (upsert con update vacío).
    // Branding efectivo: defaults del blueprint como base, pisados por lo que el
    // operador haya pasado explícito (los flags no provistos vienen undefined y NO
    // deben borrar el default del vertical).
    const b: TenantBranding = { ...(blueprint.brandingDefaults ?? {}) };
    const provided = params.branding ?? {};
    for (const k of Object.keys(provided) as (keyof TenantBranding)[]) {
      if (provided[k] !== undefined) b[k] = provided[k];
    }
    const existingSettings = await tx.businessSettings.findUnique({
      where: { tenantId },
      select: { id: true },
    });
    let settingsCreated = false;
    if (!existingSettings) {
      await tx.businessSettings.create({
        data: {
          tenantId,
          hoursLabel: b.hoursLabel ?? DEFAULT_HOURS_LABEL,
          shortLabel: b.shortLabel ?? null,
          addressLine: b.addressLine ?? null,
          city: b.city ?? null,
          whatsapp: b.whatsapp ?? null,
          email: b.email ?? null,
          instagram: b.instagram ?? null,
          mapsUrl: b.mapsUrl ?? null,
          contactNote: b.contactNote ?? null,
        },
      });
      settingsCreated = true;
    }

    // --- Catálogo blueprint mínimo editable (ADR-019 §2.b) ---
    // "Nunca vacío" sin ser los datos de nadie. Cada vertical siembra su propio
    // catálogo (servicios → box/servicios/profesional; carnicería → cortes por kg).
    // El seed es idempotente: sólo siembra si el tenant está vacío, así
    // re-provisionar jamás pisa lo que el negocio ya cargó.
    let catalogSeeded = false;
    if (!params.skipCatalog) {
      catalogSeeded = await blueprint.seedCatalog(tx, tenantId);
    }

    return {
      tenantId,
      slug,
      tenantCreated: isNewTenant,
      ownerEmail,
      ownerCreated,
      settingsCreated,
      blueprintId: blueprint.id,
      catalogSeeded,
      generatedPassword: ownerCreated ? generatedPassword : undefined,
    };
  });
}

// --- CLI ------------------------------------------------------------------------

type Args = {
  name?: string;
  slug?: string;
  ownerEmail?: string;
  ownerName?: string;
  timezone?: string;
  password?: string;
  blueprint?: string;
  /** Rubro libre del descubrimiento; si no hay --blueprint, el selector lo resuelve. */
  rubro?: string;
  listBlueprints: boolean;
  skipCatalog: boolean;
  dryRun: boolean;
  branding: TenantBranding;
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
  const str = (k: string, env?: string) =>
    (typeof flags[k] === "string" ? (flags[k] as string) : undefined) ??
    (env ? process.env[env] : undefined) ??
    undefined;

  return {
    name: str("name", "PROVISION_TENANT_NAME"),
    slug: str("slug", "PROVISION_TENANT_SLUG"),
    ownerEmail: str("owner-email", "PROVISION_OWNER_EMAIL"),
    ownerName: str("owner-name", "PROVISION_OWNER_NAME"),
    timezone: str("timezone", "PROVISION_TENANT_TIMEZONE"),
    password: str("password", "PROVISION_OWNER_PASSWORD"),
    blueprint: str("blueprint", "PROVISION_BLUEPRINT"),
    rubro: str("rubro", "PROVISION_RUBRO"),
    listBlueprints: flags["list-blueprints"] === true || flags["list-blueprints"] === "true",
    skipCatalog: flags["skip-catalog"] === true || flags["skip-catalog"] === "true",
    dryRun: flags["dry-run"] === true || flags["dry-run"] === "true",
    branding: {
      shortLabel: str("short-label"),
      addressLine: str("address"),
      city: str("city"),
      hoursLabel: str("hours-label"),
      whatsapp: str("whatsapp"),
      email: str("contact-email"),
      instagram: str("instagram"),
      mapsUrl: str("maps-url"),
      contactNote: str("contact-note"),
    },
  };
}

// Resuelve el blueprint efectivo del alta según la precedencia del onboarding:
//   1. --blueprint explícito (el operador manda) → se valida y se usa tal cual.
//   2. --rubro libre (del descubrimiento) → el selector matchea un vertical o cae al
//      COMODÍN genérico (guardrail: nunca falla ni fuerza desarrollo a medida).
//   3. nada → DEFAULT histórico (servicios), para no romper el comportamiento previo.
// Devuelve el id + una nota legible de cómo se decidió, para logs y dry-run.
function resolveEffectiveBlueprint(args: Args): { id: string; note: string } {
  if (args.blueprint) {
    getBlueprint(args.blueprint); // valida (lanza si el id no existe)
    return { id: args.blueprint, note: `explícito (--blueprint=${args.blueprint})` };
  }
  if (args.rubro) {
    const m = resolveBlueprint(args.rubro);
    return {
      id: m.blueprintId,
      note: m.matched
        ? `rubro "${args.rubro}" → vertical "${m.blueprintId}"`
        : `rubro "${args.rubro}" sin vertical propio → COMODÍN "${m.blueprintId}" (se acomoda sobre lo existente)`,
    };
  }
  return { id: DEFAULT_BLUEPRINT_ID, note: `default histórico (${DEFAULT_BLUEPRINT_ID})` };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // --list-blueprints: lista los verticales disponibles y sale (útil para el
  // configurador/descubrimiento y para el operador). No requiere otros parámetros.
  if (args.listBlueprints) {
    console.log("Blueprints disponibles:\n");
    for (const bp of listBlueprints()) {
      console.log(`  • ${bp.id}${bp.id === DEFAULT_BLUEPRINT_ID ? " (default)" : ""} — ${bp.label}`);
      console.log(`      ${bp.description}`);
    }
    console.log("\nRubro no modelado → cae al comodín \"generico\" (--rubro \"...\").");
    return;
  }

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
        `[--blueprint ${BLUEPRINT_IDS.join("|")}] [--rubro \"texto libre del rubro\"] ` +
        "[--timezone America/...] [--password ...] [--skip-catalog] [--dry-run]\n" +
        "  Ver verticales: --list-blueprints · rubro no modelado → comodín \"generico\".\n" +
        "  Branding opcional: [--city ...] [--address ...] [--whatsapp ...] " +
        "[--instagram ...] [--maps-url ...] [--hours-label ...] [--short-label ...] " +
        "[--contact-email ...] [--contact-note ...]",
    );
  }

  const effectiveBlueprint = resolveEffectiveBlueprint(args);

  console.log("── Provisioning de tenant (ADR-019) ──");
  console.log(`  Negocio:   ${args.name}`);
  console.log(`  Slug:      ${args.slug}`);
  console.log(`  OWNER:     ${args.ownerName ?? "Dueño/a"} <${args.ownerEmail}>`);
  console.log(`  Timezone:  ${args.timezone ?? DEFAULT_TIMEZONE}`);
  console.log(`  Blueprint: ${effectiveBlueprint.id}  [${effectiveBlueprint.note}]`);
  console.log(`  Catálogo:  ${args.skipCatalog ? "omitido (--skip-catalog)" : "catálogo del blueprint si el tenant está vacío"}`);

  if (args.dryRun) {
    // Validaciones que no tocan la base (las de DB —gate RLS, idempotencia— corren
    // dentro de la transacción y no se ejecutan en dry-run).
    assertValidSlug(args.slug!.trim());
    assertValidEmail(args.ownerEmail!.trim().toLowerCase());
    console.log("\n[dry-run] Validaciones de parámetros OK. No se escribió nada en la base.");
    return;
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const result = await provisionTenant(prisma, {
      name: args.name!,
      slug: args.slug!,
      timezone: args.timezone,
      owner: { name: args.ownerName, email: args.ownerEmail!, password: args.password },
      blueprint: effectiveBlueprint.id,
      skipCatalog: args.skipCatalog,
      branding: args.branding,
    });

    console.log("\n✔ Tenant provisionado.");
    console.log(`  tenantId:        ${result.tenantId}`);
    console.log(`  Tenant:          ${result.tenantCreated ? "creado" : "ya existía (re-provisioning)"}`);
    console.log(`  OWNER creado:    ${result.ownerCreated ? "sí" : "no (ya existía)"}`);
    console.log(`  BusinessSettings:${result.settingsCreated ? " creado" : " ya existía"}`);
    console.log(`  Blueprint:       ${result.blueprintId}`);
    console.log(`  Catálogo demo:   ${result.catalogSeeded ? "sembrado" : "no (el tenant ya tenía catálogo o --skip-catalog)"}`);

    if (result.generatedPassword) {
      console.log(
        "\n🔑 Contraseña de bootstrap del OWNER (generada, se muestra UNA sola vez):\n" +
          `     ${result.generatedPassword}\n` +
          "   Comunicásela al OWNER por un canal seguro. NO queda guardada en claro en ningún lado.\n" +
          "   El OWNER debería cambiarla en el primer login.",
      );
    } else if (result.ownerCreated) {
      console.log("\n🔑 OWNER creado con la contraseña provista (no se imprime).");
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Solo corre como CLI si se ejecuta el archivo directo (no al importarlo desde un test).
if (process.argv[1] && /provision-tenant\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error("\n✖ Provisioning abortado:\n" + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
  });
}
