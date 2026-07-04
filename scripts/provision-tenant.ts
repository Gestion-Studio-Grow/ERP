import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth-password";

// Alta de un tenant nuevo (provisioning) — ADR-019.
//
// POR QUÉ un script y no un portal/panel (ADR-019 §2): con un solo cliente y
// altas ~1 cada muchos meses, un script operado, versionado en git, idempotente
// por `slug` y transaccional es la Fase 1 correcta. Repetible y auditable (queda
// en el repo), no un `seed.ts` editado a mano y perdido. Portal self-service,
// panel super-admin e importador CSV quedan diferidos hasta que las altas
// frecuentes los justifiquen.
//
// POR QUÉ NO reusa `prisma/seed.ts`: el seed es la carga de demo de Carolina
// (SUS servicios, SUS precios) y arranca con `deleteMany` de todas las tablas —
// en producción es una bomba. El alta de un tenant nuevo es ADITIVA y con datos
// neutros. Son dos cosas distintas y se mantienen separadas a propósito.
//
// GATE COMPUESTO CON ADR-018 (RLS): crear la 2ª fila en `Tenant` rompe
// `getCurrentTenantId()` para toda la app (ADR-015, por diseño), porque todavía
// no hay RLS de Postgres ni resolución de tenant por request. Por eso este script
// se NIEGA a crear un 2º tenant si no detecta RLS activo (ver `assertRlsReadyFor`).
// El fail-closed de ADR-015 es la red; este guard es el candado explícito.
//
// USO:
//   OWNER_BOOTSTRAP_PASSWORD=... tsx scripts/provision-tenant.ts \
//     --name "Nombre del Negocio" --slug nombre-negocio --owner-email dueño@mail.com \
//     [--owner-name "Nombre Apellido"] [--timezone America/Argentina/Buenos_Aires]
//
// Si no se pasa OWNER_BOOTSTRAP_PASSWORD, el script genera una contraseña fuerte
// y la imprime UNA vez: hay que comunicársela al OWNER por canal seguro (nunca
// queda en el repo, patrón ADR-017) y rotarla después del primer login.
//
// IDEMPOTENTE POR SLUG: correrlo dos veces con el mismo `slug` no duplica ni pisa
// datos que el negocio ya haya cargado (upsert del tenant, OWNER solo si falta,
// catálogo de ejemplo solo si el tenant todavía no tiene servicios).

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Tablas de negocio de muestra para verificar el estado de RLS. Si estas tienen
// RLS habilitado + policy, asumimos que la migración de ADR-018 se aplicó.
const RLS_PROBE_TABLES = ["Appointment", "Client", "Payment", "Service"];

type Args = {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  timezone: string;
};

function parseArgs(argv: string[]): Args {
  const raw: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key.includes("=")) {
      const [k, ...rest] = key.split("=");
      raw[k] = rest.join("=");
    } else {
      raw[key] = argv[i + 1] ?? "";
      i++;
    }
  }

  const name = (raw["name"] ?? "").trim();
  const slug = (raw["slug"] ?? "").trim().toLowerCase();
  const ownerEmail = (raw["owner-email"] ?? "").trim().toLowerCase();
  const ownerName = (raw["owner-name"] ?? "").trim() || "Dueño/a";
  const timezone = (raw["timezone"] ?? "").trim() || "America/Argentina/Buenos_Aires";

  const errors: string[] = [];
  if (!name) errors.push("--name es obligatorio (nombre del negocio).");
  if (!slug) errors.push("--slug es obligatorio (identificador único, minúsculas).");
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    errors.push("--slug debe ser minúsculas, números y guiones (ej: estudio-canning).");
  if (!ownerEmail || !ownerEmail.includes("@"))
    errors.push("--owner-email es obligatorio y debe ser un email válido.");

  if (errors.length) {
    console.error("Argumentos inválidos:\n  " + errors.join("\n  "));
    console.error(
      "\nUso:\n  tsx scripts/provision-tenant.ts --name \"Negocio\" --slug negocio " +
        "--owner-email dueño@mail.com [--owner-name \"Nombre\"] [--timezone Zona/Horaria]",
    );
    process.exit(1);
  }

  return { name, slug, ownerEmail, ownerName, timezone };
}

// ¿La base tiene RLS de ADR-018 aplicado? Considera RLS activo solo si TODAS las
// tablas de muestra tienen `ROW LEVEL SECURITY` habilitado Y al menos una policy.
// Un estado a medias (unas sí, otras no) se trata como NO activo — es un RLS roto
// y provisionar encima sería peor que no tener nada.
async function isRlsActive(): Promise<boolean> {
  const rows = await prisma.$queryRaw<
    { relname: string; relrowsecurity: boolean; policies: bigint }[]
  >`
    SELECT c.relname,
           c.relrowsecurity,
           count(p.policyname) AS policies
    FROM pg_class c
    LEFT JOIN pg_policies p ON p.tablename = c.relname
    WHERE c.relname = ANY(${RLS_PROBE_TABLES})
    GROUP BY c.relname, c.relrowsecurity
  `;

  if (rows.length < RLS_PROBE_TABLES.length) return false;
  return rows.every((r) => r.relrowsecurity && Number(r.policies) > 0);
}

// Guard del gate compuesto (ADR-019 §3 + ADR-018): si esta alta crea una 2ª (o
// posterior) fila en `Tenant` y RLS no está activo, se aborta. Crear un tenant
// nuevo cuando ya existe otro, sin RLS ni resolución por request, dejaría la app
// entera lanzando en `getCurrentTenantId()`.
async function assertRlsReadyFor(slug: string): Promise<void> {
  const [tenantCount, existing] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.findUnique({ where: { slug }, select: { id: true } }),
  ]);

  // Re-run sobre un slug que ya existe: no agrega fila, no dispara el gate.
  if (existing) return;

  // Primer tenant de una base vacía: permitido sin RLS (el diferimiento de
  // ADR-010/018 sigue en pie mientras haya uno solo).
  if (tenantCount === 0) return;

  // Habría 2+ tenants: RLS es prerrequisito duro.
  if (!(await isRlsActive())) {
    throw new Error(
      "Abortado: crear el tenant '" +
        slug +
        "' haría que haya más de un tenant, pero RLS de Postgres (ADR-018) no está " +
        "activo en esta base. El alta del 2º tenant y la activación de RLS son el mismo " +
        "trabajo: primero aplicar la migración de RLS (ensayada en una branch de Neon), " +
        "recién después correr este script. Sin RLS, la 2ª fila en Tenant rompe " +
        "getCurrentTenantId() para toda la app (ADR-015).",
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // El guard va ANTES de la transacción de escritura: es una validación de
  // precondición, no parte del alta.
  await assertRlsReadyFor(args.slug);

  // La contraseña de bootstrap nunca vive en el repo (patrón ADR-017). Si no la
  // pasan por entorno, se genera y se imprime una sola vez.
  const envPassword = process.env.OWNER_BOOTSTRAP_PASSWORD?.trim();
  const bootstrapPassword = envPassword || randomBytes(12).toString("base64url");
  const passwordWasGenerated = !envPassword;
  const ownerPasswordHash = await hashPassword(bootstrapPassword);

  const result = await prisma.$transaction(async (tx) => {
    // 1) Tenant — idempotente por slug. El update se limita a la identidad
    //    (nombre/zona horaria) que provee el operador; no toca datos de negocio.
    const tenant = await tx.tenant.upsert({
      where: { slug: args.slug },
      update: { name: args.name, timezone: args.timezone },
      create: { name: args.name, slug: args.slug, timezone: args.timezone },
    });
    const tenantId = tenant.id;

    // 2) OWNER — patrón ADR-017 (scrypt, email como identificador de login).
    //    Solo se crea si falta: un re-run NO resetea la contraseña de un OWNER
    //    ya sembrado (para eso está el reset desde /admin/usuarios).
    const existingOwner = await tx.user.findFirst({
      where: { tenantId, email: args.ownerEmail },
      select: { id: true },
    });
    let ownerCreated = false;
    if (!existingOwner) {
      await tx.user.create({
        data: {
          tenantId,
          name: args.ownerName,
          email: args.ownerEmail,
          role: "OWNER",
          passwordHash: ownerPasswordHash,
        },
      });
      ownerCreated = true;
    }

    // 3) Catálogo blueprint mínimo y editable (ADR-019 §2.b: "nunca vacío", pero
    //    datos NEUTROS de ejemplo, no los de nadie). Solo se siembra si el tenant
    //    todavía no tiene servicios — así un re-run no duplica ni pisa lo que el
    //    negocio ya cargó. Todo queda claramente marcado "(ejemplo)" para borrar.
    const serviceCount = await tx.service.count({ where: { tenantId } });
    let catalogSeeded = false;
    if (serviceCount === 0) {
      const category = await tx.serviceCategory.create({
        data: { tenantId, name: "Servicios (ejemplo)", order: 0 },
      });

      const serviceA = await tx.service.create({
        data: {
          tenantId,
          categoryId: category.id,
          name: "Servicio de ejemplo 1",
          durationMin: 60,
          price: 0,
        },
      });
      const serviceB = await tx.service.create({
        data: {
          tenantId,
          categoryId: category.id,
          name: "Servicio de ejemplo 2",
          durationMin: 30,
          price: 0,
        },
      });

      // Horarios por defecto Lun–Sáb 9–19 (como el seed). En este modelo los
      // horarios cuelgan de un profesional, así que el andamiaje incluye un
      // profesional de ejemplo con esos horarios — el negocio lo edita o borra.
      const mondayToSaturday = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        tenantId,
        dayOfWeek,
        startTime: "09:00",
        endTime: "19:00",
      }));

      await tx.professional.create({
        data: {
          tenantId,
          name: "Profesional de ejemplo",
          services: { connect: [{ id: serviceA.id }, { id: serviceB.id }] },
          workingHours: { create: mondayToSaturday },
        },
      });

      catalogSeeded = true;
    }

    return { tenantId, slug: tenant.slug, ownerCreated, catalogSeeded };
  });

  console.log(`\n✓ Tenant '${result.slug}' provisionado (id: ${result.tenantId}).`);
  console.log(`  OWNER (${args.ownerEmail}): ${result.ownerCreated ? "creado" : "ya existía (sin cambios)"}`);
  console.log(
    `  Catálogo de ejemplo: ${result.catalogSeeded ? "sembrado (editable/borrable)" : "omitido (el tenant ya tenía servicios)"}`,
  );

  if (result.ownerCreated) {
    if (passwordWasGenerated) {
      console.log(
        "\n  Contraseña de bootstrap del OWNER (se muestra UNA vez — comunicar por canal seguro y rotar):\n" +
          `    ${bootstrapPassword}`,
      );
    } else {
      console.log("\n  Contraseña de bootstrap del OWNER: la provista en OWNER_BOOTSTRAP_PASSWORD.");
    }
    console.log("  El OWNER debe cambiarla en su primer ingreso (reset desde /admin/usuarios).");
  }
}

main()
  .catch((e) => {
    console.error("\n✗ Provisioning abortado:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
