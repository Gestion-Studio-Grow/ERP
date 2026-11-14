// T8 · Datos demo de Magra contra una base de verdad (Postgres del arnés o PGlite:
// `node scripts/qa/p1-pglite.mjs src/lib/carniceria/demo-datos-postgres.test.ts`).
//
// Recorre la corrida real (`ejecutarDemoMagra`, la misma del script): guarda con slug inexistente
// y ajeno; dry-run sin migraciones (aviso Gate 2, no escribe); dry-run con migraciones (no escribe);
// aplicar (respeta la etiqueta ya guardada); aplicar otra vez (plan vacío, mismos conteos); y las
// filas de beauty-spa idénticas antes y después. Nunca toca Neon: el arnés exige un servidor local.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const leerSql = (f: string) => readFileSync(path.join(process.cwd(), "prisma/pending-gate2", f), "utf8");

test("demo magra: guarda, dry-run, aplicar idempotente, beauty-spa intacto", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { ejecutarDemoMagra, DemoAbortada, planVacio, AVISO_GATE2_LOTES, AVISO_GATE2_FRIO, CORTES_DEMO, LOTES_DEMO, LECTURAS_DEMO, NOTA_DEMO } =
    await import("./demo-datos");
  const { tenantTransaction } = await import("@/lib/rls");
  const { guardarEtiquetaPaqueteEnTx, leerConfigCaja } = await import("@/lib/supermercado/config-repo");
  const HOY = "2026-11-10";
  const dry = { slug: "magra", aplicar: false, confirmo: undefined };
  const aplicar = { slug: "magra", aplicar: true, confirmo: "magra" };
  const abortada = (e: unknown) => e instanceof DemoAbortada;

  // Guarda: el negocio magra todavía no existe → aborta (aun en dry-run).
  await assert.rejects(ejecutarDemoMagra(dry, HOY), abortada);

  // beauty-spa con sus datos (un corte con el mismo nombre que uno demo, una config guardada).
  const spa = await duenio.tenant.create({ data: { slug: "beauty-spa", name: "Beauty Spa (prueba)" }, select: { id: true } });
  await duenio.product.create({ data: { tenantId: spa.id, name: "Lomo", price: 100, stock: 1 } });
  await tenantTransaction(
    (tx) => guardarEtiquetaPaqueteEnTx(tx, spa.id, { etiquetaPaquete: { leyenda: "Del spa", altoMm: 40 }, actor: "user:spa", versionLeida: null }),
    { tenantId: spa.id },
  );
  const magra = await duenio.tenant.create({ data: { slug: "magra", name: "Magra (prueba)" }, select: { id: true } });
  // Magra ya guardó SU etiqueta: no se pisa.
  await tenantTransaction(
    (tx) => guardarEtiquetaPaqueteEnTx(tx, magra.id, { etiquetaPaquete: { leyenda: "La de Magra", altoMm: 55 }, actor: "user:magra", versionLeida: null }),
    { tenantId: magra.id },
  );

  const fotoDe = async (tenantId: string) => {
    const [productos, audit, movs] = await Promise.all([
      duenio.product.findMany({ where: { tenantId }, orderBy: { id: "asc" } }),
      duenio.auditLog.findMany({ where: { tenantId }, orderBy: { id: "asc" } }),
      duenio.stockMovement.findMany({ where: { tenantId }, orderBy: { id: "asc" } }),
    ]);
    return JSON.stringify({ productos, audit, movs });
  };
  const crudas = async (tenantId: string) => {
    const lotes = await duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "ProductBatch" WHERE "tenantId" = ${tenantId}`;
    const frio = await duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "RegistroFrio" WHERE "tenantId" = ${tenantId}`;
    return { lotes: lotes[0].n, frio: frio[0].n };
  };
  const spaAntes = await fotoDe(spa.id);

  // Guarda: slugs ajenos y escritura sin confirmación.
  for (const slug of ["beauty-spa", "magra-demo"]) {
    await assert.rejects(ejecutarDemoMagra({ ...aplicar, slug }, HOY), abortada);
  }
  await assert.rejects(ejecutarDemoMagra({ ...aplicar, confirmo: undefined }, HOY), abortada);

  // Dry-run sin migraciones: aviso Gate 2 y nada escrito.
  const magraVacia = await fotoDe(magra.id);
  const r0 = await ejecutarDemoMagra(dry, HOY);
  assert.equal(r0.creado, null);
  assert.deepEqual(r0.plan.avisos, [AVISO_GATE2_LOTES, AVISO_GATE2_FRIO]);
  assert.equal(r0.plan.cortes.length, CORTES_DEMO.length);
  assert.equal(r0.plan.etiqueta, null, "la etiqueta ya estaba guardada");
  assert.ok(r0.plan.rango);
  assert.equal(await fotoDe(magra.id), magraVacia);

  // Las migraciones de Gate 2, como las correría psql (dos veces: son idempotentes).
  const { Client } = await import("pg");
  const pg = new Client({ connectionString: base.urlDuenio });
  await pg.connect();
  try {
    for (const f of ["CarniceriaRubro.sql", "CadenaDeFrio.sql"]) {
      await pg.query(leerSql(f));
      await pg.query(leerSql(f));
    }
  } finally {
    await pg.end();
  }

  // Dry-run con migraciones: el plan trae lotes y lecturas; sigue sin escribir.
  const r1 = await ejecutarDemoMagra(dry, HOY);
  assert.equal(r1.creado, null);
  assert.deepEqual(r1.plan.avisos, []);
  assert.equal(r1.plan.lotes.length, LOTES_DEMO.length);
  assert.equal(r1.plan.lecturas.length, LECTURAS_DEMO.length);
  assert.equal(await fotoDe(magra.id), magraVacia);
  assert.deepEqual(await crudas(magra.id), { lotes: 0, frio: 0 });

  // Aplicar.
  const r2 = await ejecutarDemoMagra(aplicar, HOY);
  assert.deepEqual(r2.creado, { cortes: CORTES_DEMO.length, etiqueta: false, rango: true, lotes: LOTES_DEMO.length, lecturas: LECTURAS_DEMO.length });
  const cfg = await tenantTransaction((tx) => leerConfigCaja(tx, magra.id), { tenantId: magra.id });
  assert.equal(cfg.etiquetaPaquete.leyenda, "La de Magra", "no pisó la etiqueta guardada");
  assert.equal(cfg.etiquetaPaquete.altoMm, 55);
  assert.deepEqual(cfg.rangoFrio, { minC: 0, maxC: 4 });
  assert.equal(await duenio.product.count({ where: { tenantId: magra.id } }), CORTES_DEMO.length);
  // El stock inicial pasa por el ledger: cada corte con su movimiento y el saldo que lo explica.
  const lomo = await duenio.product.findFirstOrThrow({ where: { tenantId: magra.id, name: "Lomo" }, select: { id: true, stock: true } });
  assert.equal(lomo.stock, CORTES_DEMO.find((c) => c.name === "Lomo")!.stock);
  const movLomo = await duenio.stockMovement.findMany({ where: { tenantId: magra.id, productId: lomo.id } });
  assert.equal(movLomo.length, 1);
  assert.equal(movLomo[0].balanceAfter, lomo.stock);
  assert.deepEqual(await crudas(magra.id), { lotes: LOTES_DEMO.length, frio: LECTURAS_DEMO.length });
  const notas = await duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "RegistroFrio" WHERE "tenantId" = ${magra.id} AND "nota" = ${NOTA_DEMO}`;
  assert.equal(notas[0].n, LECTURAS_DEMO.length);

  // Aplicar otra vez: plan vacío y mismo resultado.
  const despues = await fotoDe(magra.id);
  const r3 = await ejecutarDemoMagra(aplicar, HOY);
  assert.equal(planVacio(r3.plan), true);
  assert.equal(r3.creado, null);
  assert.equal(await fotoDe(magra.id), despues);
  assert.deepEqual(await crudas(magra.id), { lotes: LOTES_DEMO.length, frio: LECTURAS_DEMO.length });

  // beauty-spa: idéntico, y sin lotes ni lecturas.
  assert.equal(await fotoDe(spa.id), spaAntes);
  assert.deepEqual(await crudas(spa.id), { lotes: 0, frio: 0 });
});
