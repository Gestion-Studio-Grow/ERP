// ============================================================================
// CONTABILIDAD OLA 1 — ATAQUES DE LA CERTIFICACIÓN, COMO REGRESIÓN (base efímera con RLS).
// ============================================================================
//
// Cada caso reproduce un hallazgo y exige que la base (o el repo) lo frene:
//   · A11: cambiar de negocio antes del COMMIT no saltea el cuadre diferido;
//   · A1/A1b: una transacción REPEATABLE READ con foto vieja no toca líneas de un asiento ya confirmado;
//   · A6/A7: doble anulación / doble confirmación simultáneas → YA_ANULADO / YA_CONFIRMADO;
//   · A9: anular aunque una cuenta del original esté dada de baja; A8: monto > BIGINT → ASIENTO_INVALIDO;
//   · ejercicio: fecha fuera, ejercicio cerrado, cierre con borradores.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import type { LineaAsiento } from "./asiento";

const laBase = baseEfimeraDelArchivo();
const dia = (s: string) => new Date(`${s}T00:00:00Z`);
const L = (cuentaId: string, debe: number, haber: number): LineaAsiento => ({ cuentaId, debe: BigInt(debe), haber: BigInt(haber) });

let prep: Promise<void> | null = null;
async function preparar(base: BaseEfimera) {
  prep ??= (async () => {
    apuntarLaAppA(base);
    const repo = await import("./repo");
    assert.equal((await repo.sembrarPlanModelo(base.a.id, "comercio")).ok, true);
    assert.equal((await repo.sembrarPlanModelo(base.b.id, "servicios")).ok, true);
    for (const t of [base.a.id, base.b.id]) {
      assert.equal((await repo.abrirEjercicio(t, { fechaInicio: dia("2026-01-01"), fechaCierre: dia("2026-12-31") })).ok, true);
    }
  })();
  await prep;
  return import("./repo");
}

/** Conexión cruda como la app (`app_rls`, con RLS). */
async function cli(base: BaseEfimera) {
  const c = new pg.Client({ connectionString: base.urlApp });
  await c.connect();
  return c;
}

/** Corre `pasos` en una transacción del negocio y devuelve el error (o null si commiteó). */
async function enTx(base: BaseEfimera, tenantId: string, pasos: (c: pg.Client) => Promise<unknown>, nivel = ""): Promise<unknown> {
  const c = await cli(base);
  try {
    await c.query(`BEGIN${nivel ? ` ISOLATION LEVEL ${nivel}` : ""}`);
    await c.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantId]);
    await pasos(c);
    await c.query("COMMIT");
    return null;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    return e;
  } finally {
    await c.end();
  }
}

async function dosCuentas(base: BaseEfimera, t: string) {
  const d = await prismaComoDuenio(base);
  const cs = await d.cuentaContable.findMany({ where: { tenantId: t, imputable: true }, select: { id: true }, take: 2, orderBy: { codigo: "asc" } });
  return cs.map((c) => c.id);
}

async function asientoDe(base: BaseEfimera, asientoId: string) {
  const d = await prismaComoDuenio(base);
  return d.asiento.findUnique({ where: { id: asientoId }, select: { estado: true, lineas: { select: { id: true } } } });
}

test("A11: cambiar de negocio antes del COMMIT no saltea el cuadre diferido", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  await preparar(base);
  const [c1] = await dosCuentas(base, base.a.id);
  const d = await prismaComoDuenio(base);
  const ej = await d.ejercicio.findFirst({ where: { tenantId: base.a.id } });
  const err = await enTx(base, base.a.id, async (c) => {
    await c.query(`INSERT INTO "Asiento"(id,"tenantId","ejercicioId",fecha,descripcion,"updatedAt") VALUES ('atk11',$1,$2,'2026-05-01','x',now())`, [base.a.id, ej!.id]);
    await c.query(`INSERT INTO "AsientoLinea"(id,"tenantId","asientoId","cuentaId",debe,"updatedAt") VALUES ('l11',$1,'atk11',$2,5000,now())`, [base.a.id, c1]);
    await c.query(`UPDATE "Asiento" SET estado='CONFIRMADO', numero=900 WHERE id='atk11'`);
    await c.query("SELECT set_config('app.current_tenant_id',$1,true)", [base.b.id]);
  });
  assert.ok(err, "el COMMIT tenía que rechazar el asiento descuadrado");
  assert.equal(await asientoDe(base, "atk11"), null);
});

for (const [nombre, accion] of [
  ["A1: borrar", "DELETE"],
  ["A1b: insertar", "INSERT"],
] as const) {
  test(`${nombre} una línea en REPEATABLE READ con foto previa a la confirmación`, async (t) => {
    const base = await laBase(t);
    if (!base) return;
    const repo = await preparar(base);
    const [c1, c2] = await dosCuentas(base, base.a.id);
    const r = await repo.registrarAsiento(base.a.id, { fecha: dia("2026-06-01"), descripcion: `rr ${accion}`, lineas: [L(c1, 100, 0), L(c2, 0, 100)] });
    assert.ok(r.ok);
    const d = await prismaComoDuenio(base);
    const linea = await d.asientoLinea.findFirst({ where: { asientoId: r.asientoId } });
    const err = await enTx(
      base,
      base.a.id,
      async (x) => {
        await x.query(`SELECT count(*) FROM "Asiento"`); // toma la foto
        const conf = await repo.confirmarAsiento(base.a.id, r.asientoId);
        assert.ok(conf.ok, "confirmó");
        if (accion === "DELETE") await x.query(`DELETE FROM "AsientoLinea" WHERE id=$1`, [linea!.id]);
        else
          await x.query(`INSERT INTO "AsientoLinea"(id,"tenantId","asientoId","cuentaId",debe,"updatedAt") VALUES ('l1b',$1,$2,$3,777,now())`, [base.a.id, r.asientoId, c1]);
      },
      "REPEATABLE READ",
    );
    assert.ok(err, "la base tenía que rechazarlo");
    assert.notEqual((err as Error).name, "AssertionError", String(err));
    const a = await asientoDe(base, r.asientoId);
    assert.equal(a?.estado, "CONFIRMADO");
    assert.equal(a?.lineas.length, 2);
  });
}

test("A6/A7: doble anulación y doble confirmación simultáneas → YA_ANULADO / YA_CONFIRMADO", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const repo = await preparar(base);
  const [c1, c2] = await dosCuentas(base, base.a.id);
  const r = await repo.registrarAsiento(base.a.id, { fecha: dia("2026-07-01"), descripcion: "dd", lineas: [L(c1, 100, 0), L(c2, 0, 100)], confirmar: true });
  assert.ok(r.ok);
  const an = await Promise.all([repo.anularAsiento(base.a.id, r.asientoId), repo.anularAsiento(base.a.id, r.asientoId)]);
  assert.deepEqual(an.map((x) => (x.ok ? "ok" : x.error)).sort(), ["YA_ANULADO", "ok"]);

  const b = await repo.registrarAsiento(base.a.id, { fecha: dia("2026-07-02"), descripcion: "cc", lineas: [L(c1, 100, 0), L(c2, 0, 100)] });
  assert.ok(b.ok);
  const co = await Promise.all([repo.confirmarAsiento(base.a.id, b.asientoId), repo.confirmarAsiento(base.a.id, b.asientoId)]);
  assert.deepEqual(co.map((x) => (x.ok ? "ok" : x.error)).sort(), ["YA_CONFIRMADO", "ok"]);
});

test("A9/A8/RLS: anular con cuenta dada de baja, monto > BIGINT, asiento de otro negocio", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const repo = await preparar(base);
  const [c1, c2] = await dosCuentas(base, base.a.id);
  const r = await repo.registrarAsiento(base.a.id, { fecha: dia("2026-08-01"), descripcion: "baja", lineas: [L(c1, 100, 0), L(c2, 0, 100)], confirmar: true });
  assert.ok(r.ok);
  const d = await prismaComoDuenio(base);
  await d.cuentaContable.update({ where: { id: c2 }, data: { activa: false } });
  try {
    const an = await repo.anularAsiento(base.a.id, r.asientoId);
    assert.ok(an.ok, an.ok ? "" : an.mensaje);
    // Una cuenta inactiva que NO estaba en el original sigue rechazada en un asiento nuevo.
    const nuevo = await repo.registrarAsiento(base.a.id, { fecha: dia("2026-08-01"), descripcion: "x", lineas: [L(c1, 100, 0), L(c2, 0, 100)] });
    assert.equal(nuevo.ok ? "ok" : nuevo.error, "ASIENTO_INVALIDO");
  } finally {
    await d.cuentaContable.update({ where: { id: c2 }, data: { activa: true } });
  }

  const big = BigInt(2) ** BigInt(63);
  const o = await repo.registrarAsiento(base.a.id, { fecha: dia("2026-08-02"), descripcion: "ovf", lineas: [{ cuentaId: c1, debe: big, haber: BigInt(0) }, { cuentaId: c2, debe: BigInt(0), haber: big }] });
  assert.equal(o.ok ? "ok" : o.error, "ASIENTO_INVALIDO");

  const [b1, b2] = await dosCuentas(base, base.b.id);
  const rb = await repo.registrarAsiento(base.b.id, { fecha: dia("2026-08-03"), descripcion: "deB", lineas: [L(b1, 100, 0), L(b2, 0, 100)], confirmar: true });
  assert.ok(rb.ok);
  const x1 = await repo.anularAsiento(base.a.id, rb.asientoId);
  const x2 = await repo.confirmarAsiento(base.a.id, rb.asientoId);
  assert.equal(x1.ok ? "ok" : x1.error, "NO_ENCONTRADO");
  assert.equal(x2.ok ? "ok" : x2.error, "NO_ENCONTRADO");
  let visto = -1;
  const err = await enTx(base, base.a.id, async (c) => {
    visto = (await c.query(`SELECT count(*)::int n FROM "Asiento" WHERE "tenantId"=$1`, [base.b.id])).rows[0].n;
    await c.query(`INSERT INTO "AsientoLinea"(id,"tenantId","asientoId","cuentaId",debe,"updatedAt") VALUES ('lx',$1,$2,$3,1,now())`, [base.a.id, rb.asientoId, c1]);
  });
  assert.equal(visto, 0);
  assert.ok(err, "A no puede colgar una línea en un asiento de B");
});

test("Ejercicio: la base rechaza fecha fuera, ejercicio cerrado y cierre con borradores", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const repo = await preparar(base);
  const [c1, c2] = await dosCuentas(base, base.a.id);
  const d = await prismaComoDuenio(base);
  const ej26 = await d.ejercicio.findFirst({ where: { tenantId: base.a.id, fechaInicio: dia("2026-01-01") } });

  // Fecha fuera del ejercicio, aunque sea borrador.
  const fuera = await enTx(base, base.a.id, (c) =>
    c.query(`INSERT INTO "Asiento"(id,"tenantId","ejercicioId",fecha,descripcion,"updatedAt") VALUES ('fx',$1,$2,'2031-01-01','x',now())`, [base.a.id, ej26!.id]),
  );
  assert.equal((fuera as { code?: string } | null)?.code, "23514");

  // Con un borrador adentro, el ejercicio no se cierra.
  const borr = await repo.registrarAsiento(base.a.id, { fecha: dia("2026-09-01"), descripcion: "borr", lineas: [L(c1, 100, 0), L(c2, 0, 100)] });
  assert.ok(borr.ok);
  const cierre = await enTx(base, base.a.id, (c) => c.query(`UPDATE "Ejercicio" SET estado='CERRADO' WHERE id=$1`, [ej26!.id]));
  assert.equal((cierre as { code?: string } | null)?.code, "23514");
  assert.equal((await d.ejercicio.findUnique({ where: { id: ej26!.id } }))?.estado, "ABIERTO");

  // Un ejercicio cerrado no admite asientos nuevos (ni siquiera escritos a mano).
  const ej27 = await repo.abrirEjercicio(base.a.id, { fechaInicio: dia("2027-01-01"), fechaCierre: dia("2027-12-31") });
  assert.ok(ej27.ok);
  assert.equal(await enTx(base, base.a.id, (c) => c.query(`UPDATE "Ejercicio" SET estado='CERRADO' WHERE id=$1`, [ej27.ejercicioId])), null);
  const enCerrado = await enTx(base, base.a.id, (c) =>
    c.query(`INSERT INTO "Asiento"(id,"tenantId","ejercicioId",fecha,descripcion,"updatedAt") VALUES ('fc',$1,$2,'2027-03-01','x',now())`, [base.a.id, ej27.ejercicioId]),
  );
  assert.equal((enCerrado as { code?: string } | null)?.code, "23514");
});
