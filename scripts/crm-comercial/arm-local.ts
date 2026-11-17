// ============================================================================
// AMBIENTE LOCAL DEL ARM — tres negocios en un Postgres de esta máquina, con RLS de verdad (GSG-CRM-017).
// ============================================================================
//
// Arma una base nueva en el Postgres local (el mismo del arnés de tests: crearBaseEfimera, con `app_rls` sin
// BYPASSRLS), aplica TODAS las migraciones y las políticas, y deja:
//   · arm-mia           → el ARM: sólo el CRM comercial (interruptor prendido, Dirección, comerciales, puestos y leads).
//   · mia-producciones  → el destino Agencia (seed de la demo de MIA).
//   · mia-taller        → el destino Taller (un tercer negocio, vacío).
// y carga los dos vínculos con scripts/crm-comercial/cargar-vinculo.ts, como lo haría GSG. Después arranca la app
// conectada como `app_rls`. Al cerrar (Ctrl+C) la base se borra. Nada de esto toca Neon.
//
//   npx tsx scripts/crm-comercial/arm-local.ts             → app en http://arm-mia.localhost:3219/admin/crm
//   npx tsx scripts/crm-comercial/arm-local.ts --sin-app   → prepara, informa y sale (borra la base)
//
// Ingreso: Dirección del ARM direccion@crm-prueba.example (clave de docs/crm-comercial/PRUEBA.md);
// dueño de MIA admin@mia-producciones.demo (clave de prisma/seed-mia-producciones.ts). Ambas son de demo local.

import "dotenv/config";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { crearBaseEfimera } from "../../src/test/base-efimera";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { provisionTenant } from "../provision-tenant";

const RAIZ = path.resolve(__dirname, "..", "..");
const PUERTO = Number(process.env.PORT ?? 3219);
const log = (m: string) => process.stderr.write(`[arm-local] ${m}\n`);

const correr = (args: string[], env: Record<string, string>): Promise<number> =>
  new Promise((ok) => {
    const p = spawn("npx", args, { cwd: RAIZ, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, ...env } });
    p.on("exit", (c) => ok(c ?? 1));
  });

/**
 * Una oportunidad ficticia ya calificada y con destino Agencia confirmado, para probar «Asignar» sin recorrer todo el
 * embudo: el mismo camino que la pantalla (consulta → contacto → conversación → datos → calificada → destino).
 */
async function listaParaAsignar(url: string) {
  process.env.DATABASE_URL = url; // antes de cargar el repo: el cliente de la app lee la URL al importarse
  const repo = await import("../../src/lib/crm-comercial/repo");
  const { basePrisma } = await import("../../src/lib/prisma-base");
  const arm = await basePrisma.tenant.findUniqueOrThrow({ where: { slug: "arm-mia" }, select: { id: true } });
  const dir = await basePrisma.user.findFirstOrThrow({ where: { tenantId: arm.id, email: "direccion@crm-prueba.example" }, select: { id: true } });
  const ctx = { tenantId: arm.id, userId: dir.id };
  const ahora = new Date();
  const paso = { proximoPaso: "Llamar para cerrar la propuesta", proximoPasoEl: new Date(ahora.getTime() + 3 * 86_400_000) };
  const ok = <T,>(r: { ok: true } & T | { ok: false; motivo: string }, que: string): T => {
    if (!r.ok) throw new Error(`${que}: ${r.motivo}`);
    return r as T;
  };
  const op = ok(await repo.proponerOportunidad(ctx, { tipo: "CONSULTA", marca: { nombre: "Bodega Demo del Sur", dominio: "bodega-demo.example" }, consultaTexto: "Hola, somos Bodega Demo del Sur y queremos un stand para la feria de vinos de marzo.", ...paso }, ahora), "consulta") as { id: string };
  ok(await repo.crearContacto(ctx, { oportunidadId: op.id, nombre: "Ana Demo", email: "ana@bodega-demo.example", telefono: "11 2345 6789", deConsultaEntrante: true, papel: "DECIDE" }, ahora), "contacto");
  ok(await repo.comprobarIdentidad(ctx, op.id, { emailDeQuienEscribe: "ana@bodega-demo.example" }, ahora), "identidad");
  ok(await repo.aplicarPase(ctx, op.id, "EN_CONVERSACION", {}, ahora), "conversación");
  ok(await repo.registrarRespuesta(ctx, op.id, "Necesitamos 36 m2 con barra de degustación para la feria de marzo.", ahora), "respuesta");
  ok(await repo.actualizarDatos(ctx, op.id, { datos: { fechaEvento: "2027-03-10", tipoTrabajo: "experiencia", presupuestoMin: 5_000_000, presupuestoMax: 8_000_000, quienDecide: "Gerencia de marketing", encaje: true }, monto: 6_500_000, moneda: "ARS" }, ahora), "datos");
  ok(await repo.aplicarPase(ctx, op.id, "CALIFICADA", {}, ahora), "calificada");
  ok(await repo.confirmarDestino(ctx, op.id, "AGENCIA", ahora), "destino");
  await basePrisma.$disconnect();
  log(`lista para asignar: /admin/crm/${op.id}`);
}

async function main() {
  const base = await crearBaseEfimera();
  const cerrar = async (codigo: number) => {
    await base.borrar().catch(() => {});
    process.exit(codigo);
  };
  log(`base ${base.nombre} lista (migraciones + RLS)`);
  // GSG-CRM-018: la tabla de apoyo de la carga no es una migración (no va a producción); se aplica sólo acá.
  const sql = new pg.Client({ connectionString: base.urlDuenio });
  await sql.connect();
  try {
    await sql.query(readFileSync(path.join(RAIZ, "scripts", "crm-comercial", "local", "filas-de-prueba.sql"), "utf8"));
  } finally {
    await sql.end();
  }
  const duenio = { DATABASE_URL: base.urlDuenio, SEED_DB_MAX: "1", DB_CONNECTION_LIMIT: "1" };

  if ((await correr(["tsx", "prisma/seed-mia-producciones.ts"], duenio)) !== 0) return cerrar(1);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.urlDuenio, max: 1 }) });
  try {
    // El ARM nace con el blueprint genérico y SIN módulos; cargar-vinculo.ts --marcar-arm lo marca como ARM.
    for (const [slug, name] of [
      ["arm-mia", "ARM MIA"],
      ["mia-taller", "MIA Taller"],
    ] as const) {
      if (await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })) continue;
      await provisionTenant(prisma, {
        name,
        slug,
        owner: { name: `Dueño de ${name}`, email: `admin@${slug}.demo`, password: process.env.MIA_DEMO_PASSWORD ?? "mia-demo-2026" },
        blueprint: slug === "arm-mia" ? "generico" : "productora",
        platform: { status: "ACTIVE", subdomain: slug, modules: [] },
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  const carpeta = "docs/tenants/mia-producciones/crm-prueba";
  if ((await correr(["tsx", "scripts/crm-comercial/cargar-vinculo.ts", "--arm", "arm-mia", "--destino", "AGENCIA", "--negocio", "mia-producciones", "--marcar-arm", "--apply"], duenio)) !== 0) return cerrar(1);
  if ((await correr(["tsx", "scripts/crm-comercial/cargar-vinculo.ts", "--arm", "arm-mia", "--destino", "TALLER", "--negocio", "mia-taller", "--apply"], duenio)) !== 0) return cerrar(1);
  if ((await correr(["tsx", "scripts/crm-comercial/preparar-local.ts", "--negocio", "arm-mia", "--leads", `${carpeta}/leads.json`, "--clientes", `${carpeta}/clientes-activos.json`], duenio)) !== 0) return cerrar(1);
  await listaParaAsignar(base.urlDuenio);
  log("arm-mia (CRM), mia-producciones (Agencia) y mia-taller (Taller) listos, con sus vínculos");

  if (process.argv.includes("--sin-app")) return cerrar(0);

  const app = spawn("npx", ["next", "dev", "-p", String(PUERTO)], {
    cwd: RAIZ,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: base.urlApp, // la app entra como app_rls: RLS de verdad
      OPERATOR_DATABASE_URL: base.urlApp,
      RLS_ENFORCEMENT: "on", // con el candado de la app prendido, como en producción
      DB_CONNECTION_LIMIT: "4",
      APP_BASE_DOMAIN: "localhost",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "ambiente-local-del-arm-no-es-un-secreto-real-0123456789",
      OPERATOR_SECRET: process.env.OPERATOR_SECRET ?? "ambiente-local-del-arm-operador-no-es-secreto-0123456789",
      MODULE_REGISTRY_ENABLED: "on",
      PORT: String(PUERTO),
    },
  });
  log(`app en http://arm-mia.localhost:${PUERTO}/admin/crm · destino en http://mia-producciones.localhost:${PUERTO}/admin`);
  log(`base para mirar como dueño: ${base.urlDuenio}`);
  const fin = () => {
    app.kill();
    void cerrar(0);
  };
  process.on("SIGINT", fin);
  process.on("SIGTERM", fin);
  app.on("exit", () => void cerrar(0));
}

main().catch((e) => {
  log(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
