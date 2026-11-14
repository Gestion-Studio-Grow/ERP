// ============================================================================
// SEG-021 · Endurecimiento de las funciones trigger de contabilidad (base efímera con RLS).
// ============================================================================
//
// `prisma/pending-gate2/SEG021_contabilidad_funciones.sql` (preparada, sin aplicar) re-crea las 4
// funciones SECURITY DEFINER de la ola 1 con las lecturas acotadas al negocio de la fila y al
// negocio vigente, y les saca EXECUTE a PUBLIC (mínimo privilegio). Este archivo:
//   1. documenta el estado de hoy (sin el SQL): `app_rls` tiene EXECUTE en las 4;
//   2. aplica el SQL como el dueño (leído del archivo, dos veces: es idempotente) y comprueba que
//      `app_rls` ya no tiene EXECUTE, que los controles siguen disparando para `app_rls` (el gestor
//      de triggers no exige EXECUTE al que escribe), que una referencia a otro negocio termina en
//      el error de FK y que una fila de otro negocio termina en el error genérico 42501.
// Sin el SQL aplicado, las aserciones del paso 2 fallan.
// Fechas fijas dentro del ejercicio 2026: no depende del reloj.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, ROL_APP, type BaseEfimera } from "@/test/base-efimera";
import type { LineaAsiento } from "./contabilidad/asiento";

const laBase = baseEfimeraDelArchivo();
const SQL = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/SEG021_contabilidad_funciones.sql"), "utf8");
const FUNCIONES = [
  "contabilidad_controlar_cuadre",
  "contabilidad_asiento_inmutable",
  "contabilidad_asiento_en_ejercicio",
  "contabilidad_controlar_ejercicio",
] as const;
const dia = (s: string) => new Date(`${s}T00:00:00Z`);
const L = (cuentaId: string, debe: number, haber: number): LineaAsiento => ({ cuentaId, debe: BigInt(debe), haber: BigInt(haber) });

interface Escenario {
  repo: typeof import("./contabilidad/repo");
  cuentasA: [string, string];
  /** Asientos de B: uno confirmado y uno en borrador. */
  bConfirmado: string;
  bBorrador: string;
  cuentaB: string;
  ejercicioB: string;
}

let prep: Promise<Escenario> | null = null;
function preparar(base: BaseEfimera): Promise<Escenario> {
  prep ??= (async () => {
    apuntarLaAppA(base);
    const repo = await import("./contabilidad/repo");
    assert.equal((await repo.sembrarPlanModelo(base.a.id, "comercio")).ok, true);
    assert.equal((await repo.sembrarPlanModelo(base.b.id, "servicios")).ok, true);
    for (const t of [base.a.id, base.b.id]) {
      assert.equal((await repo.abrirEjercicio(t, { fechaInicio: dia("2026-01-01"), fechaCierre: dia("2026-12-31") })).ok, true);
    }
    const [a1, a2] = await dosCuentas(base, base.a.id);
    const [b1, b2] = await dosCuentas(base, base.b.id);
    const conf = await repo.registrarAsiento(base.b.id, { fecha: dia("2026-03-02"), descripcion: "B conf", lineas: [L(b1, 100, 0), L(b2, 0, 100)], confirmar: true });
    const borr = await repo.registrarAsiento(base.b.id, { fecha: dia("2026-03-03"), descripcion: "B borr", lineas: [L(b1, 100, 0), L(b2, 0, 100)] });
    assert.ok(conf.ok && borr.ok);
    const ejB = await (await prismaComoDuenio(base)).ejercicio.findFirst({ where: { tenantId: base.b.id }, select: { id: true } });
    assert.ok(ejB);
    return { repo, cuentasA: [a1, a2], bConfirmado: conf.asientoId, bBorrador: borr.asientoId, cuentaB: b1, ejercicioB: ejB.id };
  })();
  return prep;
}

async function dosCuentas(base: BaseEfimera, t: string): Promise<[string, string]> {
  const d = await prismaComoDuenio(base);
  const cs = await d.cuentaContable.findMany({ where: { tenantId: t, imputable: true }, select: { id: true }, take: 2, orderBy: { codigo: "asc" } });
  assert.equal(cs.length, 2);
  return [cs[0]!.id, cs[1]!.id];
}

async function conectar(url: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

/** Corre `pasos` como `app_rls` en una transacción con el negocio puesto; devuelve el error o null. */
async function comoApp(base: BaseEfimera, tenantId: string, pasos: (c: pg.Client) => Promise<unknown>): Promise<(Error & { code?: string }) | null> {
  const c = await conectar(base.urlApp);
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantId]);
    await pasos(c);
    await c.query("COMMIT");
    return null;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    return e as Error & { code?: string };
  } finally {
    await c.end();
  }
}

async function privilegios(base: BaseEfimera): Promise<Record<string, boolean>> {
  const c = await conectar(base.urlDuenio);
  try {
    const out: Record<string, boolean> = {};
    for (const f of FUNCIONES) {
      const r = await c.query<{ p: boolean }>(`SELECT has_function_privilege($1, $2, 'EXECUTE') AS p`, [ROL_APP, `public.${f}()`]);
      out[f] = r.rows[0]!.p;
    }
    return out;
  } finally {
    await c.end();
  }
}

async function aplicarSql(base: BaseEfimera): Promise<void> {
  const c = await conectar(base.urlDuenio);
  try {
    await c.query(SQL);
  } finally {
    await c.end();
  }
}

/** Una línea de A colgada de `asientoId` (de B), como `app_rls` con el negocio A puesto. */
function lineaDeAEn(base: BaseEfimera, e: Escenario, asientoId: string, id: string) {
  return comoApp(base, base.a.id, (c) =>
    c.query(`INSERT INTO "AsientoLinea"(id,"tenantId","asientoId","cuentaId",debe,"updatedAt") VALUES ($1,$2,$3,$4,1,now())`, [id, base.a.id, asientoId, e.cuentasA[0]]),
  );
}

test("SEG-021 · antes del SQL: app_rls tiene EXECUTE en las 4 funciones (estado de hoy)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const e = await preparar(base);
  assert.deepEqual(await privilegios(base), Object.fromEntries(FUNCIONES.map((f) => [f, true])));
  // Línea de base del caso de FK que compara el paso 2.
  const err = await lineaDeAEn(base, e, e.bConfirmado, "seg021_pre");
  assert.equal(err?.code, "23514");
});

test("SEG-021 · después del SQL: sin EXECUTE para app_rls, controles vigentes y lecturas acotadas al negocio", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const e = await preparar(base);
  await aplicarSql(base);
  await aplicarSql(base); // idempotente

  await t.test("app_rls ya no tiene EXECUTE en ninguna de las 4", async () => {
    assert.deepEqual(await privilegios(base), Object.fromEntries(FUNCIONES.map((f) => [f, false])));
  });

  await t.test("un asiento descuadrado sigue rechazado al confirmar (cuadre diferido)", async () => {
    const [a1, a2] = e.cuentasA;
    const r = await e.repo.registrarAsiento(base.a.id, { fecha: dia("2026-04-01"), descripcion: "borr A", lineas: [L(a1, 100, 0), L(a2, 0, 100)] });
    assert.ok(r.ok);
    const err = await comoApp(base, base.a.id, async (c) => {
      await c.query(`UPDATE "AsientoLinea" SET haber = 90 WHERE "asientoId" = $1 AND haber > 0`, [r.asientoId]);
      await c.query(`UPDATE "Asiento" SET estado = 'CONFIRMADO', numero = 900 WHERE id = $1`, [r.asientoId]);
    });
    assert.equal(err?.code, "23514");
    assert.match(err?.message ?? "", /descuadrado/);
  });

  await t.test("un asiento confirmado sigue inmutable (cabecera y líneas)", async () => {
    const [a1, a2] = e.cuentasA;
    const r = await e.repo.registrarAsiento(base.a.id, { fecha: dia("2026-04-02"), descripcion: "conf A", lineas: [L(a1, 100, 0), L(a2, 0, 100)], confirmar: true });
    assert.ok(r.ok);
    const cab = await comoApp(base, base.a.id, (c) => c.query(`UPDATE "Asiento" SET descripcion = 'x' WHERE id = $1`, [r.asientoId]));
    assert.equal(cab?.code, "23514");
    assert.match(cab?.message ?? "", /confirmado/);
    const lin = await comoApp(base, base.a.id, (c) => c.query(`DELETE FROM "AsientoLinea" WHERE "asientoId" = $1`, [r.asientoId]));
    assert.equal(lin?.code, "23514");
    assert.match(lin?.message ?? "", /confirmado/);
  });

  await t.test("el ejercicio con borradores sigue sin poder cerrarse", async () => {
    const err = await comoApp(base, base.a.id, (c) => c.query(`UPDATE "Ejercicio" SET estado = 'CERRADO' WHERE "tenantId" = $1`, [base.a.id]));
    assert.equal(err?.code, "23514");
    assert.match(err?.message ?? "", /borrador/);
  });

  await t.test("una línea de A hacia un asiento de B termina en la FK, sea cual sea el estado del de B", async () => {
    const conf = await lineaDeAEn(base, e, e.bConfirmado, "seg021_conf");
    const borr = await lineaDeAEn(base, e, e.bBorrador, "seg021_borr");
    assert.equal(conf?.code, "23503", conf?.message);
    assert.equal(borr?.code, "23503", borr?.message);
  });

  await t.test("con el negocio A vigente, una fila con tenantId de B termina en el error genérico 42501", async () => {
    const GENERICO = "El registro no pertenece al negocio vigente";
    const asiento = await comoApp(base, base.a.id, (c) =>
      c.query(`INSERT INTO "Asiento"(id,"tenantId","ejercicioId",fecha,descripcion,"updatedAt") VALUES ('seg021_asB',$1,$2,'2099-01-01','d',now())`, [base.b.id, e.ejercicioB]),
    );
    assert.equal(asiento?.code, "42501", asiento?.message);
    assert.equal(asiento?.message, GENERICO);
    const linea = await comoApp(base, base.a.id, (c) =>
      c.query(`INSERT INTO "AsientoLinea"(id,"tenantId","asientoId","cuentaId",debe,"updatedAt") VALUES ('seg021_linB',$1,$2,$3,1,now())`, [base.b.id, e.bConfirmado, e.cuentaB]),
    );
    assert.equal(linea?.code, "42501", linea?.message);
    assert.equal(linea?.message, GENERICO);
  });
});
