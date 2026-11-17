/**
 * Carga y limpieza de la PRUEBA del CRM comercial (GSG-CRM-011 parte 3), EJECUTADO contra Postgres con RLS
 * (base efímera local, dos negocios). Usa los archivos ficticios de la prueba (leads.json y
 * clientes-activos.json; la clave no se lee). Sin Postgres local se saltea diciendo por qué (en CI falla).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import type { ClienteDePrueba, LeadDePrueba } from "./carga-prueba";

const laBase = baseEfimeraDelArchivo();
const AHORA = new Date("2026-11-16T15:00:00Z");
const CARPETA = path.join(process.cwd(), "docs", "tenants", "mia-producciones", "crm-prueba");
const LEADS = (JSON.parse(readFileSync(path.join(CARPETA, "leads.json"), "utf8")) as { leads: LeadDePrueba[] }).leads;
const CLIENTES = (JSON.parse(readFileSync(path.join(CARPETA, "clientes-activos.json"), "utf8")) as { clientes: ClienteDePrueba[] }).clientes;

type Carga = typeof import("./carga-prueba");
interface Fixture {
  base: BaseEfimera;
  carga: Carga;
  repo: typeof import("./repo");
  dueno: Awaited<ReturnType<typeof prismaComoDuenio>>;
  realOpA: string;
  realMarcaA: string;
}

let prep: Promise<Fixture> | null = null;
async function preparar(t: import("node:test").TestContext): Promise<Fixture | null> {
  const base = await laBase(t);
  if (!base) return null;
  prep ??= (async () => {
    apuntarLaAppA(base);
    const carga = await import("./carga-prueba");
    const repo = await import("./repo");
    const c = new pg.Client({ connectionString: base.urlDuenio });
    await c.connect();
    const usuarios: [string, string, string][] = [];
    try {
      // GSG-CRM-018: la tabla de apoyo no viene en las migraciones (no va a producción): se aplica como en el
      // ambiente local, como dueño de las tablas (los privilegios por defecto se la dan a app_rls, con su RLS).
      await c.query(readFileSync(path.join(process.cwd(), "scripts", "crm-comercial", "local", "filas-de-prueba.sql"), "utf8"));
      for (const n of [base.a, base.b]) {
        for (const k of ["com1", "com2", "desc"]) {
          const id = `carga-${n.slug}-${k}`;
          usuarios.push([n.id, id, k]);
          await c.query(`INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, "updatedAt") VALUES ($1, $2, $3, $4, 'x', 'RECEPTION'::"UserRole", now())`, [id, n.id, `Usuario ${k}`, `${k}@${n.slug}.example`]);
        }
      }
    } finally {
      await c.end();
    }
    const dueno = await prismaComoDuenio(base);
    for (const n of [base.a, base.b]) await dueno.miembroCrmComercial.create({ data: { tenantId: n.id, userId: n.duenia.id, rol: "DIRECCION" } });
    for (const [tenantId, userId, k] of usuarios) {
      await dueno.miembroCrmComercial.create({ data: { tenantId, userId, rol: k === "desc" ? "PUESTO" : "COMERCIAL", puesto: k === "desc" ? "descubridor" : null } });
    }
    // Algo de A que NO es de la prueba: la limpieza no lo puede tocar.
    const real = await repo.proponerOportunidad(
      { tenantId: base.a.id, userId: base.a.duenia.id },
      { tipo: "CONSULTA", marca: { nombre: "Marca Real del Negocio", dominio: "marcareal.example" }, proximoPaso: "Llamar", proximoPasoEl: new Date("2026-11-20T15:00:00Z") },
      AHORA,
    );
    assert.equal(real.ok, true, JSON.stringify(real));
    const op = await dueno.oportunidad.findUniqueOrThrow({ where: { id: (real as { id: string }).id }, select: { id: true, marcaId: true } });
    return { base, carga, repo, dueno, realOpA: op.id, realMarcaA: op.marcaId as string };
  })();
  return prep;
}

async function conteo(f: Fixture, tenantId: string) {
  const d = f.dueno;
  const [ops, marcas, eventos, contactos, tareas, actividades, filas] = await Promise.all([
    d.oportunidad.count({ where: { tenantId } }),
    d.marcaRelevada.count({ where: { tenantId } }),
    d.eventoRelevado.count({ where: { tenantId } }),
    d.contactoComercial.count({ where: { tenantId } }),
    d.tareaComercial.count({ where: { tenantId } }),
    d.actividadComercial.count({ where: { tenantId } }),
    d.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "FilaDePruebaCrm" WHERE "tenantId" = ${tenantId}`.then((r) => r[0].n),
  ]);
  return { ops, marcas, eventos, contactos, tareas, actividades, filas };
}

test("guarda: una DATABASE_URL de Neon se rechaza antes de conectar (carga y limpieza)", async (t) => {
  await preparar(t); // la app se apunta a la base efímera ANTES de importar el módulo (lee el entorno al importarse)
  const { guardaDeBase, cargarPrueba, limpiarPrueba } = await import("./carga-prueba");
  const neon = "postgresql://u:p@ep-algo-123.us-east-2.aws.neon.tech/neondb?sslmode=require";
  assert.equal(guardaDeBase(neon).ok, false);
  assert.equal(guardaDeBase(undefined).ok, false);
  assert.equal(guardaDeBase("postgresql://postgres@localhost:5433/x").ok, true);
  const antes = process.env.DATABASE_URL;
  process.env.DATABASE_URL = neon;
  try {
    await assert.rejects(cargarPrueba({ slug: "cualquiera", leads: [], clientes: [] }), /Neon/);
    await assert.rejects(limpiarPrueba({ slug: "cualquiera", aplicar: true }), /Neon/);
  } finally {
    if (antes === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = antes;
  }
});

test("leerFechas y regionDe: el texto de los archivos, sin inventar días", async (t) => {
  await preparar(t); // la app se apunta a la base efímera ANTES de importar el módulo (lee el entorno al importarse)
  const { leerFechas, regionDe } = await import("./carga-prueba");
  assert.deepEqual(leerFechas("14 al 17/04/2027"), { desde: "2027-04-14", hasta: "2027-04-17" });
  assert.deepEqual(leerFechas("30/11 al 02/12/2027"), { desde: "2027-11-30", hasta: "2027-12-02" });
  assert.deepEqual(leerFechas("28/12 al 02/01/2027"), { desde: "2026-12-28", hasta: "2027-01-02" });
  assert.deepEqual(leerFechas("jueves 19/11/2026"), { desde: "2026-11-19", hasta: null });
  assert.equal(leerFechas("marzo 2027 (sin día)"), null);
  assert.equal(leerFechas("31/02/2027"), null);
  assert.equal(regionDe("Predio ferial de Junín, Buenos Aires"), "Buenos Aires");
  assert.equal(regionDe("no informa"), null);
});

test("carga P2: consulta → RECIBIDA, prospecto → DETECTADA, clientes → GANADA; dos veces no duplica; la limpieza borra sólo lo anotado de ESE negocio", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { base, carga } = f;
  const a = base.a;
  const b = base.b;

  const antesB = await conteo(f, b.id);
  const r1 = await carga.cargarPrueba({ slug: a.slug, leads: LEADS, clientes: CLIENTES, ahora: AHORA });
  assert.equal(r1.leads.length, 20);
  assert.equal(r1.clientes.length, 3);
  for (const l of r1.leads) {
    if (l.resultado === "CREADA") assert.equal(l.etapa, l.tipo === "CONSULTA" ? "RECIBIDA" : "DETECTADA", `${l.id}: ${JSON.stringify(l)}`);
    else assert.ok(["UNIDA", "FRENADA"].includes(l.resultado), `${l.id}: ${JSON.stringify(l)}`);
  }
  // La marca que ya es cliente (C01) no se prospecta en frío: el motor la frena y queda anotada (E17).
  const frenada = r1.leads.find((l) => l.resultado === "FRENADA");
  assert.ok(frenada && /ya es cliente/.test(frenada.motivo ?? ""), JSON.stringify(r1.leads));
  assert.equal(r1.porEtapa.GANADA, 3);
  const clientes = await f.dueno.oportunidad.findMany({ where: { tenantId: a.id, etapa: "GANADA" }, select: { duenoUserId: true } });
  assert.ok(clientes.every((c) => c.duenoUserId?.startsWith(`carga-${a.slug}-com`)), "los clientes activos quedan con un comercial como dueño");
  // Cada oportunidad nueva deja su primera tarea; cada consulta con remitente, su contacto «de consulta entrante».
  const tareas = await f.dueno.tareaComercial.count({ where: { tenantId: a.id, idempotencia: { startsWith: "prueba-" } } });
  assert.equal(tareas, r1.leads.filter((l) => l.resultado === "CREADA").length);
  assert.ok((await f.dueno.contactoComercial.count({ where: { tenantId: a.id, origen: "CONSULTA_ENTRANTE" } })) >= 9);

  const tras1 = await conteo(f, a.id);
  const r2 = await carga.cargarPrueba({ slug: a.slug, leads: LEADS, clientes: CLIENTES, ahora: AHORA });
  assert.ok(r2.leads.every((l) => l.resultado === "YA_CARGADA"), "la segunda corrida no carga nada nuevo");
  assert.ok(r2.clientes.every((c) => c.resultado === "YA_CARGADO"));
  assert.deepEqual(await conteo(f, a.id), tras1, "dos corridas no duplican");
  assert.equal(r2.oportunidadesDePrueba, r1.oportunidadesDePrueba);
  assert.deepEqual(await conteo(f, b.id), antesB, "cargar A no toca B");

  // B también tiene su carga: la limpieza de A no la puede tocar.
  await carga.cargarPrueba({ slug: b.slug, leads: LEADS, clientes: CLIENTES, ahora: AHORA });
  const conB = await conteo(f, b.id);
  assert.ok(conB.ops >= 20);

  // Simulacro (por defecto): cifras reales, nada borrado.
  const sim = await carga.limpiarPrueba({ slug: a.slug });
  assert.equal(sim.aplicado, false);
  assert.equal(sim.borradas.oportunidades, r1.oportunidadesDePrueba);
  assert.ok(sim.borradas.marcas > 0 && sim.borradas.eventos > 0 && sim.borradas.contactos > 0 && sim.borradas.tareas > 0);
  assert.deepEqual(await conteo(f, a.id), tras1, "el simulacro no borra nada");

  const hecho = await carga.limpiarPrueba({ slug: a.slug, aplicar: true });
  assert.equal(hecho.aplicado, true);
  assert.deepEqual(hecho.borradas, sim.borradas, "el simulacro dijo lo mismo que se borró");
  const despues = await conteo(f, a.id);
  assert.equal(despues.ops, 1, "en A queda sólo la oportunidad que no era de la prueba");
  assert.equal(despues.filas, 0);
  assert.equal(despues.eventos, 0);
  assert.ok(await f.dueno.oportunidad.findUnique({ where: { id: f.realOpA }, select: { id: true } }), "lo no marcado sigue");
  assert.ok(await f.dueno.marcaRelevada.findUnique({ where: { id: f.realMarcaA }, select: { id: true } }), "la marca no marcada sigue");
  assert.deepEqual(await conteo(f, b.id), conB, "limpiar A no toca B");

  // Se puede volver a cargar después de limpiar (las claves de idempotencia se fueron con lo borrado).
  const r3 = await carga.cargarPrueba({ slug: a.slug, leads: LEADS, clientes: CLIENTES, ahora: AHORA });
  assert.equal(r3.oportunidadesDePrueba, r1.oportunidadesDePrueba);
});

test("GSG-CRM-018 · la tabla de apoyo de la prueba no va a producción: ninguna migración ni el modelo la crean; el ambiente local sí", () => {
  const raiz = process.cwd();
  const dir = path.join(raiz, "prisma", "migrations");
  const conLaTabla = readdirSync(dir)
    .filter((m) => existsSync(path.join(dir, m, "migration.sql")))
    .filter((m) => /FilaDePruebaCrm/.test(readFileSync(path.join(dir, m, "migration.sql"), "utf8")));
  assert.deepEqual(conLaTabla, []);
  assert.doesNotMatch(readFileSync(path.join(raiz, "prisma", "schema.prisma"), "utf8"), /model FilaDePruebaCrm\b/);
  assert.match(readFileSync(path.join(raiz, "scripts", "crm-comercial", "prueba-local.mjs"), "utf8"), /local", "filas-de-prueba\.sql"/);
});
