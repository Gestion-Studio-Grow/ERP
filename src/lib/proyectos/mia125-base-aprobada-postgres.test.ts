// MIA T06 · M2 (GSG-MIA-125) — test de carrera, escrito ANTES del código: una sola versión base aprobada por proyecto,
// garantizada por la base. Postgres real, la app como `app_rls` (sin BYPASSRLS), Server Actions reales.
//
// C-O10: dos aprobaciones de dos versiones a la vez dejan UNA aprobada, en varias rondas (por la ficha y por el link del
// cliente, mezcladas); aprobar una segunda base después se rechaza con el mensaje del adicional; enviar una versión base
// nueva con una base aprobada se rechaza. Con el caso «dos aprobadas» sembrado, M2 frena antes de aplicar y lo cuenta;
// la vuelta atrás borra sólo lo de M2 y la migración se puede volver a correr. M2: RLS forzada y política por negocio en
// las 4 tablas nuevas; el negocio B no ve lo del A.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const TABLAS = ["ProyectoAdicional", "ProyectoAdicionalLinea", "ProyectoLineaDetalle", "ProyectoPrevisionEstado"];
const CARPETA = path.resolve(__dirname, "..", "..", "..", "prisma", "migrations", "20261119110000_mia_m2_presupuesto");
const RONDAS = 6;
const MENSAJE_BASE = /Ya hay una versión base aprobada.*adicional/;

test("M2 · una sola base aprobada (C-O10): carrera en Postgres real, rechazo, M2 frena con dos aprobadas, aislamiento", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const { registrarRespuesta, enviarCotizacion } = await import("./acciones-ficha");
  const { responderPropuesta } = await import("./acciones");

  // ── M2 en la base: RLS forzada, política por negocio y el índice parcial ──
  const forzada = await duenio.$queryRaw<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ANY(${TABLAS}) ORDER BY relname`;
  assert.deepEqual(forzada.map((r) => [r.relname, r.relrowsecurity, r.relforcerowsecurity]), [...TABLAS].sort().map((n) => [n, true, true]));
  const politicas = await duenio.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = ANY(${TABLAS}) ORDER BY tablename`;
  assert.deepEqual(politicas.map((p) => p.tablename), [...TABLAS].sort());
  const indice = await duenio.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE indexname = 'ProyectoPresupuesto_una_base_aprobada'`;
  assert.match(indice[0]?.indexdef ?? "", /UNIQUE INDEX .*\("tenantId", "proyectoId"\) WHERE \(estado = 'APROBADO'::text\)/);

  let numero = (await duenio.proyecto.count()) + 500;
  /** Un proyecto de A con las versiones 1 y 2 ENVIADAS (lo que deja una carrera entre enviar y responder). */
  const proyectoConDosEnviadas = async () => {
    const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Carrera ${numero}`, servicio: "EVENTOS", etapa: "PROPUESTA" }, select: { id: true } });
    const versiones = [];
    for (const version of [1, 2]) {
      const v = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version, estado: "ENVIADO", token: `tok-carrera-${p.id}-${version}-xxxxxxxxxx`, ivaPct: 21, enviadoEl: new Date(), aprobadoInternoEl: new Date(), aprobadoInternoPor: "Dirección" }, select: { id: true, token: true } });
      await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: v.id, rubro: "General", descripcion: "Stand", cantidad: 1, costo: 600, precio: 1000 } });
      versiones.push(v);
    }
    return { proyectoId: p.id, versiones };
  };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const enFicha = async <R>(fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const enLink = async <R>(fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: null }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const aprobadas = (proyectoId: string) => duenio.proyectoPresupuesto.count({ where: { tenantId: a.id, proyectoId, estado: "APROBADO" } });
  const aprobarPorFicha = (id: string) => enFicha(() => registrarRespuesta(form({ id, respuesta: "APROBADO", nombre: "Cliente por teléfono" })));
  const aprobarPorLink = (token: string) => enLink(() => responderPropuesta({ token, aprueba: true, nombre: "Cliente en su link" }));

  // ── Carrera: las dos versiones aprobadas a la vez, varias rondas, por la ficha y por el link mezclados ──
  for (let ronda = 0; ronda < RONDAS; ronda++) {
    const { proyectoId, versiones: [v1, v2] } = await proyectoConDosEnviadas();
    const modo = ronda % 3;
    const [r1, r2] = await Promise.all([
      modo === 2 ? aprobarPorLink(v1.token) : aprobarPorFicha(v1.id),
      modo === 1 ? aprobarPorLink(v2.token) : aprobarPorFicha(v2.id),
    ]);
    assert.equal(await aprobadas(proyectoId), 1, `ronda ${ronda}: una sola base aprobada`);
    const resultados = [r1, r2];
    assert.equal(resultados.filter((r) => r.ok).length, 1, `ronda ${ronda}: ${JSON.stringify(resultados)}`);
    const perdedora = resultados.find((r) => !r.ok) as { ok: false; error: string };
    assert.match(perdedora.error, MENSAJE_BASE, `ronda ${ronda}: el que pierde dice por qué`);
    const otra = await duenio.proyectoPresupuesto.findFirstOrThrow({ where: { tenantId: a.id, proyectoId, estado: { not: "APROBADO" } }, select: { estado: true } });
    assert.equal(otra.estado, "ENVIADO", `ronda ${ronda}: la que perdió queda como estaba`);
  }

  // ── Después: aprobar la otra versión, sola, también se rechaza; y una versión base nueva no se puede enviar ──
  const { proyectoId, versiones: [v1, v2] } = await proyectoConDosEnviadas();
  assert.deepEqual(await aprobarPorFicha(v1.id), { ok: true });
  const segunda = (await aprobarPorFicha(v2.id)) as { ok: false; error: string };
  assert.equal(segunda.ok, false);
  assert.match(segunda.error, MENSAJE_BASE);
  const porLink = (await aprobarPorLink(v2.token)) as { ok: false; error: string };
  assert.equal(porLink.ok, false);
  assert.match(porLink.error, MENSAJE_BASE);
  assert.equal(await aprobadas(proyectoId), 1);
  const v3 = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId, version: 3, estado: "BORRADOR", token: `tok-v3-${proyectoId}-xxxxxxxxxx`, ivaPct: 21, aprobadoInternoEl: new Date(), aprobadoInternoPor: "Dirección" }, select: { id: true } });
  await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: v3.id, rubro: "General", descripcion: "Stand más grande", cantidad: 1, costo: 700, precio: 1200 } });
  const envio = (await enFicha(() => enviarCotizacion(form({ id: v3.id })))) as { ok: false; error: string };
  assert.equal(envio.ok, false);
  assert.match(envio.error, MENSAJE_BASE);
  assert.equal((await duenio.proyectoPresupuesto.findUniqueOrThrow({ where: { id: v3.id }, select: { estado: true } })).estado, "BORRADOR");

  // ── Aislamiento: lo de M2 del negocio A no lo ve el B (la app como app_rls, con el negocio fijado) ──
  const adicionalA = await duenio.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
    const ad = await tx.proyectoAdicional.create({ data: { tenantId: a.id, proyectoId, numero: 1, nombre: "Pantalla extra", creadoPor: "Prueba" }, select: { id: true } });
    await tx.proyectoAdicionalLinea.create({ data: { tenantId: a.id, adicionalId: ad.id, sector: "Producción", categoria: "Escenografía", detalle: "Pantalla", costoCentavos: BigInt(10_000), precioCentavos: BigInt(15_000) } });
    return ad.id;
  });
  const { tenantTransaction } = await import("@/lib/rls");
  const veB = await ejecutarAccion({ negocio: b, usuario: { id: b.duenia.id } }, () =>
    tenantTransaction(async (tx) => ({ adicionales: await tx.proyectoAdicional.count(), lineas: await tx.proyectoAdicionalLinea.count(), esa: await tx.proyectoAdicional.findFirst({ where: { id: adicionalA } }) })),
  );
  assert.deepEqual((veB as { valor: unknown }).valor, { adicionales: 0, lineas: 0, esa: null }, "B no ve los adicionales de A");
  const veA = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, () => tenantTransaction((tx) => tx.proyectoAdicional.count()));
  assert.equal((veA as { valor: number }).valor, 1, "A sí ve el suyo");
  // B no puede escribir con el tenantId de A (WITH CHECK).
  const cruzado = await ejecutarAccion({ negocio: b, usuario: { id: b.duenia.id } }, () =>
    tenantTransaction((tx) => tx.proyectoAdicional.create({ data: { tenantId: a.id, proyectoId, numero: 9, nombre: "Ajeno", creadoPor: "B" } })).then(
      () => "escribió",
      (e: Error) => e.message,
    ),
  );
  assert.notEqual((cruzado as { valor: string }).valor, "escribió", "B no escribe en A");

  // ── M2 frena con dos aprobadas sembradas, lo cuenta, y la vuelta atrás + segunda corrida funcionan ──
  const migracion = await readFile(path.join(CARPETA, "migration.sql"), "utf8");
  const rollback = await readFile(path.join(CARPETA, "rollback.sql"), "utf8");
  const conteo = await readFile(path.resolve(__dirname, "..", "..", "..", "scripts", "proyectos", "m2-conteo-dos-aprobadas.sql"), "utf8");
  const sql = new pg.Client({ connectionString: base.urlDuenio });
  await sql.connect();
  try {
    const cuantas = async () => Number((await sql.query(`SELECT COUNT(*) AS n FROM "ProyectoPresupuesto" WHERE "estado" = 'APROBADO'`)).rows[0].n);
    const tablasM2 = async () => Number((await sql.query(`SELECT COUNT(*) AS n FROM pg_class WHERE relname = ANY($1)`, [[...TABLAS, "ProyectoPresupuesto_una_base_aprobada"]])).rows[0].n);
    // Vuelta atrás: borra sólo lo de M2; las versiones existentes no se tocan.
    const antes = await cuantas();
    await sql.query("BEGIN");
    await sql.query(rollback);
    await sql.query("COMMIT");
    assert.equal(await tablasM2(), 0, "la vuelta atrás borra las 4 tablas y el índice");
    assert.equal(await cuantas(), antes, "la vuelta atrás no toca las versiones");
    // Sin el índice, el caso «dos aprobadas» entra (es lo que puede haber hoy en la base).
    await sql.query(`UPDATE "ProyectoPresupuesto" SET "estado" = 'APROBADO' WHERE "id" = $1`, [v2.id]);
    const dobles = await sql.query(conteo);
    assert.deepEqual(dobles.rows.map((r) => [r.proyectoId, Number(r.aprobadas), r.versiones]), [[proyectoId, 2, [1, 2]]], "el conteo previo lo reporta");
    await sql.query("BEGIN");
    await assert.rejects(sql.query(migracion), /M2 frenada: 1 proyecto\(s\) con dos o más versiones APROBADAS/);
    await sql.query("ROLLBACK");
    assert.equal(await tablasM2(), 0, "frenada: no aplicó nada");
    // Resuelto a mano, M2 aplica, y una segunda corrida no cambia nada.
    await sql.query(`UPDATE "ProyectoPresupuesto" SET "estado" = 'ENVIADO' WHERE "id" = $1`, [v2.id]);
    for (const vez of [1, 2]) {
      await sql.query("BEGIN");
      await sql.query(migracion);
      await sql.query("COMMIT");
      assert.equal(await tablasM2(), 5, `corrida ${vez}: 4 tablas + el índice`);
    }
    assert.equal(await cuantas(), antes);
  } finally {
    await sql.end();
  }
});
