// ============================================================================
// CONTABILIDAD · PARAMETRIZACIÓN (R2) — ATAQUES CONTRA LA BASE (base efímera con RLS).
// ============================================================================
//
// Migraciones 20261112130000_contabilidad_param_a y 20261112130100_contabilidad_param_b (sin
// aplicar a Neon). «SQL directo» = la conexión de la app (`app_rls`, con RLS), sin el repo: lo que
// se prueba es la regla de la BASE. Negocio A con la capa prendida (`parametrizacion = 'V1'`);
// negocio B sin prender, para probar que la capa es inerte (F15 parcial: nada cambia sin `V1`).
//
//   F1 período cerrado por clase de cuenta · F2 cierre vs asiento en vuelo · F3 numerador de la base
//   F5 cotización sólo-agregar + foto · F8 catálogos con CHECK · F9 rastro · F10 FK compuestas
//   F16 estado de campos · F17 claveOrigen única (idempotente) · inerte sin `parametrizacion`.
//   H1–H4 (certificación, vuelta 1): permisos de app_rls sin pg_trigger_depth · alta de período por
//   clase vs asiento en vuelo (y REPEATABLE READ) · numerador en REPEATABLE READ · confirmar+cerrar sin 40P01.
//   H5–H9 (certificación, vuelta 2): sin EXECUTE para PUBLIC en las SECURITY DEFINER · rastro forjado en
//   una TEMP · numerador quemado vía TEMP · B no traba la GENERAL de A · guarda de tabla en cada trigger.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";
import { ROLES_CUENTA } from "./roles";

const laBase = baseEfimeraDelArchivo();
const ACTOR = "contadora@negocio-a";
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Cuentas = Record<string, string>;
interface Contexto {
  ejA: string;
  ejB: string;
  a: Cuentas;
  b: Cuentas;
  claseMan: string;
}

async function conectar(url: string) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

/** Corre `pasos` en una transacción del negocio, como la app. Devuelve el error (o null si commiteó). */
async function enTx(
  base: BaseEfimera,
  tenantId: string,
  pasos: (c: pg.Client) => Promise<unknown>,
  actor: string | null = ACTOR,
): Promise<(Error & { code?: string }) | null> {
  const c = await conectar(base.urlApp);
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantId]);
    if (actor) await c.query("SELECT set_config('app.current_actor',$1,true)", [actor]);
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

/** Como el dueño de las tablas (sin RLS): para ver lo que quedó y para armar escenarios. */
async function comoDuenio<T>(base: BaseEfimera, fn: (c: pg.Client) => Promise<T>, actor: string | null = ACTOR): Promise<T> {
  const c = await conectar(base.urlDuenio);
  try {
    await c.query("BEGIN");
    if (actor) await c.query("SELECT set_config('app.current_actor',$1,true)", [actor]);
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

async function insertar(c: pg.Client, tabla: string, fila: Record<string, unknown>): Promise<string> {
  const datos: Record<string, unknown> = { id: randomUUID(), ...fila };
  if (!("updatedAt" in datos) && !["Cotizacion", "ParamCambio"].includes(tabla)) datos.updatedAt = new Date();
  const cols = Object.keys(datos);
  await c.query(
    `INSERT INTO "${tabla}" (${cols.map((k) => `"${k}"`).join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`,
    cols.map((k) => datos[k]),
  );
  return datos.id as string;
}

interface Linea {
  cuenta: string;
  debe?: number;
  haber?: number;
  extra?: Record<string, unknown>;
}

/** Alta de un asiento por SQL directo: cabecera + líneas en borrador y, si se pide, confirmación (con un número inventado). */
async function asiento(
  c: pg.Client,
  t: string,
  ej: string,
  o: { fecha: string; lineas: Linea[]; cab?: Record<string, unknown>; confirmar?: boolean; numero?: number },
): Promise<string> {
  const id = await insertar(c, "Asiento", { tenantId: t, ejercicioId: ej, fecha: o.fecha, descripcion: "ataque", ...(o.cab ?? {}) });
  for (const l of o.lineas) {
    await insertar(c, "AsientoLinea", { tenantId: t, asientoId: id, cuentaId: l.cuenta, debe: l.debe ?? 0, haber: l.haber ?? 0, ...(l.extra ?? {}) });
  }
  if (o.confirmar !== false) await confirmar(c, id, o.numero ?? 999);
  return id;
}

const confirmar = (c: pg.Client, id: string, numero = 999) =>
  c.query(`UPDATE "Asiento" SET "estado"='CONFIRMADO', "numero"=$2 WHERE "id"=$1`, [id, numero]);

let prep: Promise<Contexto> | null = null;
/** Una vez por archivo: planes de A y B, ejercicio 2026, y la capa prendida en A (período, numerador, clase MAN). */
function preparar(base: BaseEfimera): Promise<Contexto> {
  prep ??= (async () => {
    apuntarLaAppA(base);
    const repo = await import("./repo");
    assert.equal((await repo.sembrarPlanModelo(base.a.id, "comercio")).ok, true);
    assert.equal((await repo.sembrarPlanModelo(base.b.id, "servicios")).ok, true);
    for (const t of [base.a.id, base.b.id]) {
      assert.equal((await repo.abrirEjercicio(t, { fechaInicio: new Date("2026-01-01T00:00:00Z"), fechaCierre: new Date("2026-12-31T00:00:00Z") })).ok, true);
    }
    return comoDuenio(base, async (c) => {
      const cuentas = async (t: string) => {
        const r = await c.query(`SELECT "codigo", "id" FROM "CuentaContable" WHERE "tenantId"=$1`, [t]);
        return Object.fromEntries(r.rows.map((x) => [x.codigo, x.id])) as Cuentas;
      };
      const ej = async (t: string) => (await c.query(`SELECT "id" FROM "Ejercicio" WHERE "tenantId"=$1`, [t])).rows[0].id as string;
      const a = await cuentas(base.a.id);
      const b = await cuentas(base.b.id);
      for (const k of ["1.1.1.01", "1.1.1.02", "1.1.1.03", "1.1.3.03", "2.1.2.01", "4.1.01", "5.1.01"]) assert.ok(a[k] && b[k], `falta la cuenta ${k}`);
      const ctx: Contexto = { ejA: await ej(base.a.id), ejB: await ej(base.b.id), a, b, claseMan: "" };
      // Antes de prender la capa: Banco es de clase BANCOS; Mercado Pago, cuenta en USD.
      await c.query(`UPDATE "CuentaContable" SET "claseCuenta"='BANCOS' WHERE "id"=$1`, [a["1.1.1.02"]]);
      await c.query(`UPDATE "CuentaContable" SET "monedaCuenta"='USD' WHERE "id"=$1`, [a["1.1.1.03"]]);
      await c.query(
        `INSERT INTO "ConfigContable" ("tenantId","updatedAt","parametrizacion") VALUES ($1, now(), 'V1')
         ON CONFLICT ("tenantId") DO UPDATE SET "parametrizacion"='V1'`,
        [base.a.id],
      );
      await insertar(c, "PeriodoApertura", { tenantId: base.a.id, claseCuenta: "GENERAL", abiertoDesde: "2026-01-01", abiertoHasta: "2026-12-31" });
      await insertar(c, "NumeradorContable", { tenantId: base.a.id, ejercicioId: ctx.ejA, codigo: "DIARIO", desde: 1, hasta: 1_000_000, ultimo: 0 });
      ctx.claseMan = await insertar(c, "ClaseAsiento", { tenantId: base.a.id, codigo: "MAN", permiteManual: true });
      return ctx;
    });
  })();
  return prep;
}

const reabrir = (base: BaseEfimera) =>
  comoDuenio(base, (c) =>
    c.query(`UPDATE "PeriodoApertura" SET "abiertoDesde"='2026-01-01', "abiertoHasta"='2026-12-31' WHERE "tenantId"=$1`, [base.a.id]),
  );

const estadoDe = (base: BaseEfimera, id: string) =>
  comoDuenio(base, async (c) => (await c.query(`SELECT "estado","numero" FROM "Asiento" WHERE "id"=$1`, [id])).rows[0] as { estado: string; numero: number | null } | undefined);

test("F1: período cerrado por clase de cuenta — lo frena la base, también al confirmar un borrador viejo", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  const cab = { claseAsientoId: x.claseMan };
  let borrador = "";
  assert.equal(await enTx(base, A, async (c) => {
    borrador = await asiento(c, A, x.ejA, { fecha: "2026-10-15", cab, confirmar: false, lineas: [{ cuenta: x.a["1.1.1.01"], debe: 100 }, { cuenta: x.a["4.1.01"], haber: 100 }] });
  }), null);
  try {
    // Se cierra octubre (GENERAL abierto desde el 1/11).
    assert.equal(await enTx(base, A, (c) => c.query(`UPDATE "PeriodoApertura" SET "abiertoDesde"='2026-11-01' WHERE "claseCuenta"='GENERAL'`)), null);
    const e1 = await enTx(base, A, (c) => confirmar(c, borrador));
    assert.equal(e1?.code, "23514");
    assert.match(e1!.message, /período cerrado/);
    assert.equal((await estadoDe(base, borrador))?.estado, "BORRADOR");
    const e2 = await enTx(base, A, (c) => asiento(c, A, x.ejA, { fecha: "2026-10-20", cab, lineas: [{ cuenta: x.a["1.1.1.01"], debe: 100 }, { cuenta: x.a["4.1.01"], haber: 100 }] }));
    assert.equal(e2?.code, "23514");

    // Por clase: BANCOS abierto recién desde el 1/12. Noviembre con Banco rebota; sin Banco, pasa.
    await comoDuenio(base, (c) => insertar(c, "PeriodoApertura", { tenantId: A, claseCuenta: "BANCOS", abiertoDesde: "2026-12-01", abiertoHasta: "2026-12-31" }));
    const e3 = await enTx(base, A, (c) => asiento(c, A, x.ejA, { fecha: "2026-11-15", cab, lineas: [{ cuenta: x.a["1.1.1.02"], debe: 100 }, { cuenta: x.a["4.1.01"], haber: 100 }] }));
    assert.equal(e3?.code, "23514");
    assert.match(e3!.message, /clase BANCOS/);
    assert.equal(await enTx(base, A, (c) => asiento(c, A, x.ejA, { fecha: "2026-11-15", cab, lineas: [{ cuenta: x.a["1.1.1.01"], debe: 100 }, { cuenta: x.a["4.1.01"], haber: 100 }] })), null);

    // Sin fila GENERAL: rechazo que nombra el nodo (nunca «sin fila = abierto»).
    const e4 = await enTx(base, A, async (c) => {
      await c.query(`DELETE FROM "PeriodoApertura" WHERE "claseCuenta"='GENERAL'`);
      await asiento(c, A, x.ejA, { fecha: "2026-11-16", cab, lineas: [{ cuenta: x.a["1.1.1.01"], debe: 100 }, { cuenta: x.a["4.1.01"], haber: 100 }] });
    });
    assert.match(e4!.message, /Falta parametrizar: Períodos contables → GENERAL/);
  } finally {
    await comoDuenio(base, (c) => c.query(`DELETE FROM "PeriodoApertura" WHERE "tenantId"=$1 AND "claseCuenta"='BANCOS'`, [A]));
    await reabrir(base);
    await enTx(base, A, (c) => c.query(`DELETE FROM "Asiento" WHERE "id"=$1`, [borrador]));
  }
});

test("F2: el cierre espera al asiento en vuelo; el siguiente rebota", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  const cab = { claseAsientoId: x.claseMan };
  const lineas = [{ cuenta: x.a["1.1.1.01"], debe: 250 }, { cuenta: x.a["4.1.01"], haber: 250 }];
  const cA = await conectar(base.urlApp);
  const cB = await conectar(base.urlApp);
  try {
    for (const c of [cA, cB]) {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.current_tenant_id',$1,true), set_config('app.current_actor',$2,true)", [A, ACTOR]);
    }
    const enVuelo = await asiento(cA, A, x.ejA, { fecha: "2026-06-10", cab, lineas });
    let cerro = false;
    const cierre = cB.query(`UPDATE "PeriodoApertura" SET "abiertoDesde"='2026-07-01' WHERE "claseCuenta"='GENERAL'`).then(() => (cerro = true));
    await dormir(400);
    assert.equal(cerro, false, "el cierre espera a la confirmación en vuelo");
    await cA.query("COMMIT");
    await cierre;
    await cB.query("COMMIT");
    assert.equal((await estadoDe(base, enVuelo))?.estado, "CONFIRMADO");
    const e = await enTx(base, A, (c) => asiento(c, A, x.ejA, { fecha: "2026-06-20", cab, lineas }));
    assert.equal(e?.code, "23514");
    assert.match(e!.message, /período cerrado/);
  } finally {
    await cA.end();
    await cB.end();
    await reabrir(base);
  }
});

test("F3: el número lo pone la base — 50 en paralelo con 10 rechazos quedan correlativos; rango agotado o superpuesto rebota", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  const cab = { claseAsientoId: x.claseMan };
  const ultimo = async () => comoDuenio(base, async (c) => (await c.query(`SELECT "ultimo" FROM "NumeradorContable" WHERE "tenantId"=$1 AND "codigo"='DIARIO'`, [A])).rows[0].ultimo as number);
  const antes = await ultimo();

  const ids: string[] = [];
  const resultados = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      enTx(base, A, async (c) => {
        const malo = i % 5 === 0; // 10 de 50: descuadrados, los frena el cuadre al COMMIT
        const id = await asiento(c, A, x.ejA, {
          fecha: "2026-08-01",
          cab: { ...cab, descripcion: `paralelo ${i}` },
          numero: 999, // la app manda cualquier número: queda el de la base
          lineas: [{ cuenta: x.a["1.1.1.01"], debe: 1000 }, { cuenta: x.a["4.1.01"], haber: malo ? 900 : 1000 }],
        });
        ids.push(id);
      }),
    ),
  );
  assert.equal(resultados.filter((r) => r === null).length, 40);
  assert.ok(resultados.filter((r) => r !== null).every((r) => r?.code === "23514"));
  const numeros = await comoDuenio(base, async (c) =>
    (await c.query(`SELECT "numero" FROM "Asiento" WHERE "tenantId"=$1 AND "descripcion" LIKE 'paralelo %' ORDER BY "numero"`, [A])).rows.map((r) => r.numero as number),
  );
  assert.deepEqual(numeros, Array.from({ length: 40 }, (_, i) => antes + 1 + i), "1..40 sin huecos ni repetidos");
  assert.equal(await ultimo(), antes + 40, "los rechazos devolvieron su número");

  // La app no mueve el contador: no tiene UPDATE sobre «ultimo» (42501). El dueño lo intenta y lo frena el trigger.
  const e1 = await enTx(base, A, (c) => c.query(`UPDATE "NumeradorContable" SET "ultimo"="ultimo"+5 WHERE "codigo"='DIARIO'`));
  assert.equal(e1?.code, "42501", e1?.message ?? "pasó");
  await assert.rejects(
    comoDuenio(base, (c) => c.query(`UPDATE "NumeradorContable" SET "ultimo"="ultimo"+5 WHERE "tenantId"=$1 AND "codigo"='DIARIO'`, [A])),
    /lo asigna la base/,
  );
  // Rango superpuesto en el mismo ejercicio.
  const e2 = await enTx(base, A, (c) => insertar(c, "NumeradorContable", { tenantId: A, ejercicioId: x.ejA, codigo: "OTRO", desde: 500, hasta: 600, ultimo: 499 }));
  assert.match(e2!.message, /se superpone/);
  // Rango disponible de un solo número: el primero lo toma, el segundo rebota.
  assert.equal(await enTx(base, A, async (c) => {
    await insertar(c, "NumeradorContable", { tenantId: A, ejercicioId: x.ejA, codigo: "CHICO", desde: 1_000_001, hasta: 1_000_001, ultimo: 1_000_000 });
    await insertar(c, "ClaseAsiento", { tenantId: A, codigo: "REV", permiteManual: true, numeradorCodigo: "CHICO" });
  }), null);
  const rev = await comoDuenio(base, async (c) => (await c.query(`SELECT "id" FROM "ClaseAsiento" WHERE "tenantId"=$1 AND "codigo"='REV'`, [A])).rows[0].id as string);
  let primero = "";
  assert.equal(await enTx(base, A, async (c) => {
    primero = await asiento(c, A, x.ejA, { fecha: "2026-08-02", cab: { claseAsientoId: rev }, lineas: [{ cuenta: x.a["1.1.1.01"], debe: 10 }, { cuenta: x.a["4.1.01"], haber: 10 }] });
  }), null);
  assert.equal((await estadoDe(base, primero))?.numero, 1_000_001);
  const e3 = await enTx(base, A, (c) => asiento(c, A, x.ejA, { fecha: "2026-08-02", cab: { claseAsientoId: rev }, lineas: [{ cuenta: x.a["1.1.1.01"], debe: 10 }, { cuenta: x.a["4.1.01"], haber: 10 }] }));
  assert.match(e3!.message, /se agotó/);
});

test("F5: corregir una cotización no cambia lo contabilizado; la cotización no se edita ni se borra", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  const cab = { claseAsientoId: x.claseMan };
  let tipo = "";
  assert.equal(await enTx(base, A, async (c) => {
    tipo = await insertar(c, "TipoCotizacion", { tenantId: A, codigo: "BNA_VEND_DIVISA", fuente: "BNA", maxDiasAtras: 1 });
    await insertar(c, "Cotizacion", { tenantId: A, tipoCotizacionId: tipo, moneda: "USD", fecha: "2026-11-10", valor: 1_000_000_000, version: 1 });
  }), null);
  // USD 100,00 a 1.000 = $ 100.000,00 (10.000.000 centavos), en la cuenta en USD.
  const usd = { moneda: "USD", importeOrigen: 10_000, cotizacion: 1_000_000_000 };
  let id = "";
  assert.equal(await enTx(base, A, async (c) => {
    id = await asiento(c, A, x.ejA, { fecha: "2026-11-10", cab, lineas: [{ cuenta: x.a["1.1.1.03"], debe: 10_000_000, extra: usd }, { cuenta: x.a["4.1.01"], haber: 10_000_000 }] });
  }), null);
  const mayor = () => comoDuenio(base, async (c) => (await c.query(`SELECT "cuentaId","debe","haber","cotizacion" FROM "AsientoLinea" WHERE "asientoId"=$1 ORDER BY "id"`, [id])).rows);
  const foto = await mayor();

  // Versión 2 a 1.100: lo contabilizado queda idéntico.
  assert.equal(await enTx(base, A, (c) => insertar(c, "Cotizacion", { tenantId: A, tipoCotizacionId: tipo, moneda: "USD", fecha: "2026-11-10", valor: 1_100_000_000, version: 2 })), null);
  assert.deepEqual(await mayor(), foto);
  // UPDATE / DELETE por SQL → rechazo; versión salteada → rechazo.
  assert.match((await enTx(base, A, (c) => c.query(`UPDATE "Cotizacion" SET "valor"=1 WHERE "tipoCotizacionId"=$1`, [tipo])))!.message, /no se cambia ni se borra/);
  assert.match((await enTx(base, A, (c) => c.query(`DELETE FROM "Cotizacion" WHERE "tipoCotizacionId"=$1`, [tipo])))!.message, /no se cambia ni se borra/);
  assert.match((await enTx(base, A, (c) => insertar(c, "Cotizacion", { tenantId: A, tipoCotizacionId: tipo, moneda: "USD", fecha: "2026-11-10", valor: 1, version: 4 })))!.message, /exige la 3/);
  const cargado = await comoDuenio(base, async (c) => (await c.query(`SELECT "cargadoPor" FROM "Cotizacion" WHERE "tipoCotizacionId"=$1 AND "version"=2`, [tipo])).rows[0].cargadoPor);
  assert.equal(cargado, ACTOR);

  // Conversión: un centavo de diferencia sin tolerancia rebota al COMMIT; con tolerancia 1, pasa.
  const conDif = (c: pg.Client) =>
    asiento(c, A, x.ejA, { fecha: "2026-11-11", cab, lineas: [{ cuenta: x.a["1.1.1.03"], debe: 10_000_001, extra: usd }, { cuenta: x.a["4.1.01"], haber: 10_000_001 }] });
  assert.match((await enTx(base, A, conDif))!.message, /Conversión de la cuenta/);
  assert.equal(await enTx(base, A, (c) => insertar(c, "Tolerancia", { tenantId: A, codigo: "REDONDEO_CONVERSION_CENTAVOS", valor: 1, vigenteDesde: "2026-11-01" })), null);
  assert.equal(await enTx(base, A, conDif), null);
  // Cuenta en USD imputada en pesos → rechazo.
  const e = await enTx(base, A, (c) => asiento(c, A, x.ejA, { fecha: "2026-11-11", cab, lineas: [{ cuenta: x.a["1.1.1.03"], debe: 500 }, { cuenta: x.a["4.1.01"], haber: 500 }] }));
  assert.match(e!.message, /es en USD/);
});

test("F8: cada catálogo rechaza un valor inventado (23514)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  const casos: Array<[string, (c: pg.Client) => Promise<unknown>]> = [
    ["ConfigContable.parametrizacion", (c) => c.query(`UPDATE "ConfigContable" SET "parametrizacion"='V9'`)],
    ["ConfigContable.monedaFuncional", (c) => c.query(`UPDATE "ConfigContable" SET "monedaFuncional"='pesos'`)],
    ["CuentaContable.claseCuenta", (c) => c.query(`UPDATE "CuentaContable" SET "claseCuenta"='OTRA' WHERE "id"=$1`, [x.a["5.1.01"]])],
    ["PeriodoApertura.claseCuenta", (c) => insertar(c, "PeriodoApertura", { tenantId: A, claseCuenta: "ACTIVOS", abiertoDesde: "2026-01-01", abiertoHasta: "2026-12-31" })],
    ["PeriodoApertura.rango", (c) => insertar(c, "PeriodoApertura", { tenantId: A, claseCuenta: "MAYOR", abiertoDesde: "2026-12-01", abiertoHasta: "2026-01-01" })],
    ["NumeradorContable.rango", (c) => insertar(c, "NumeradorContable", { tenantId: A, ejercicioId: x.ejA, codigo: "MAL", desde: 0, hasta: 5, ultimo: 0 })],
    ["ClaseAsiento.codigo", (c) => insertar(c, "ClaseAsiento", { tenantId: A, codigo: "XYZ" })],
    ["ClaseAsiento.origenTipo", (c) => insertar(c, "ClaseAsiento", { tenantId: A, codigo: "FAC", origenTipo: "TICKET" })],
    ["ClaseAsiento.clasesCuentaPermitidas", (c) => insertar(c, "ClaseAsiento", { tenantId: A, codigo: "PAG", clasesCuentaPermitidas: ["MAYOR", "OTRA"] })],
    ["CentroCosto.tipo", (c) => insertar(c, "CentroCosto", { tenantId: A, codigo: "X", nombre: "x", tipo: "SUCURSAL", vigenteDesde: "2026-01-01" })],
    ["TipoCotizacion.codigo", (c) => insertar(c, "TipoCotizacion", { tenantId: A, codigo: "BLUE" })],
    ["IndicadorImpuesto.clase", (c) => insertar(c, "IndicadorImpuesto", { tenantId: A, codigo: "X", clase: "IVA_RARO", vigenteDesde: "2026-11-01" })],
    ["IndicadorImpuesto.alicuotaBp", (c) => insertar(c, "IndicadorImpuesto", { tenantId: A, codigo: "X", clase: "EXENTO", alicuotaBp: 20_000, vigenteDesde: "2026-11-01" })],
    ["RegimenRetencion.impuesto", (c) => insertar(c, "RegimenRetencion", { tenantId: A, codigo: "X", impuesto: "SELLOS", sentido: "SUFRIDA", cuentaId: x.a["1.1.3.03"], vigenteDesde: "2026-11-01" })],
    ["RegimenRetencion.sentido", (c) => insertar(c, "RegimenRetencion", { tenantId: A, codigo: "X", impuesto: "IIBB", sentido: "AMBOS", cuentaId: x.a["1.1.3.03"], vigenteDesde: "2026-11-01" })],
    ["DeterminacionCuenta.rol", (c) => insertar(c, "DeterminacionCuenta", { tenantId: A, rol: "INVENTADO", dimension: "MONEDA", clave: "USD", cuentaId: x.a["1.1.1.03"], vigenteDesde: "2026-11-01" })],
    ["DeterminacionCuenta.dimension", (c) => insertar(c, "DeterminacionCuenta", { tenantId: A, rol: "BANCO", dimension: "COLOR", clave: "USD", cuentaId: x.a["1.1.1.03"], vigenteDesde: "2026-11-01" })],
    ["Tolerancia.codigo", (c) => insertar(c, "Tolerancia", { tenantId: A, codigo: "LO_QUE_SEA", valor: 1, vigenteDesde: "2026-11-01" })],
    ["Tolerancia.valor", (c) => insertar(c, "Tolerancia", { tenantId: A, codigo: "DIFERENCIA_COBRO_CENTAVOS", valor: -1, vigenteDesde: "2026-11-01" })],
    ["GrupoCampos.estado", (c) => insertar(c, "GrupoCampos", { tenantId: A, codigo: "G", centroCosto: "X" })],
    ["Asiento.tipoCotizacionCodigo", (c) => insertar(c, "Asiento", { tenantId: A, ejercicioId: x.ejA, fecha: "2026-11-01", descripcion: "x", tipoCotizacionCodigo: "BLUE", cotizacion: 1, fechaCotizacion: "2026-11-01" })],
    ["AsientoLinea.moneda sin cotización", async (c) => {
      const id = await insertar(c, "Asiento", { tenantId: A, ejercicioId: x.ejA, fecha: "2026-11-01", descripcion: "x" });
      await insertar(c, "AsientoLinea", { tenantId: A, asientoId: id, cuentaId: x.a["1.1.1.01"], debe: 10, moneda: "USD", importeOrigen: 10 });
    }],
  ];
  for (const [nombre, paso] of casos) {
    const e = await enTx(base, A, paso);
    assert.equal(e?.code, "23514", `${nombre}: ${e?.message ?? "pasó"}`);
  }
  // El CHECK de roles es el catálogo de roles.ts, ni más ni menos.
  const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261112130100_contabilidad_param_b/migration.sql"), "utf8");
  const bloque = /"DeterminacionCuenta_rol_check" CHECK \("rol" IN \(([^)]*)\)\)/.exec(sql)![1];
  const enSql = [...bloque.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(enSql, Object.keys(ROLES_CUENTA).sort());
});

test("F9: todo cambio de parámetro deja rastro con actor; sin actor rebota; el rastro no se toca", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  let ind = "";
  assert.equal(await enTx(base, A, async (c) => {
    await c.query("SELECT set_config('app.current_motivo','alta del IVA ventas',true)");
    ind = await insertar(c, "IndicadorImpuesto", { tenantId: A, codigo: "IVA21_VTA", nombre: "IVA 21", clase: "IVA_DEBITO", alicuotaBp: 2100, cuentaId: x.a["2.1.2.01"], vigenteDesde: "2026-11-01" });
  }), null);
  assert.equal(await enTx(base, A, (c) => c.query(`UPDATE "IndicadorImpuesto" SET "nombre"='IVA 21 % ventas' WHERE "id"=$1`, [ind])), null);
  const rastro = await comoDuenio(base, async (c) => (await c.query(`SELECT "operacion","antes","despues","actor","motivo" FROM "ParamCambio" WHERE "registroId"=$1 ORDER BY "en", "operacion"`, [ind])).rows);
  assert.equal(rastro.length, 2);
  assert.equal(rastro[0].operacion, "INSERT");
  assert.equal(rastro[0].motivo, "alta del IVA ventas");
  assert.equal(rastro[1].operacion, "UPDATE");
  assert.equal(rastro[1].antes.nombre, "IVA 21");
  assert.equal(rastro[1].despues.nombre, "IVA 21 % ventas");
  assert.ok(rastro.every((r) => r.actor === ACTOR));

  // Lo sustantivo no se edita (va otra versión); la cuenta tiene que ser del tipo del impuesto.
  assert.match((await enTx(base, A, (c) => c.query(`UPDATE "IndicadorImpuesto" SET "alicuotaBp"=2700 WHERE "id"=$1`, [ind])))!.message, /no se edita/);
  assert.match((await enTx(base, A, (c) => insertar(c, "IndicadorImpuesto", { tenantId: A, codigo: "IVA21_CPA", clase: "IVA_CREDITO", alicuotaBp: 2100, cuentaId: x.a["2.1.2.01"], vigenteDesde: "2026-11-01" })))!.message, /tiene que ser de ACTIVO/);
  // Una vigencia dentro del período cerrado rebota.
  assert.match((await enTx(base, A, async (c) => {
    await c.query(`UPDATE "PeriodoApertura" SET "abiertoDesde"='2026-11-01' WHERE "claseCuenta"='GENERAL'`);
    await insertar(c, "IndicadorImpuesto", { tenantId: A, codigo: "IVA21_VTA", clase: "IVA_DEBITO", alicuotaBp: 2700, cuentaId: x.a["2.1.2.01"], vigenteDesde: "2026-10-01" });
  }))!.message, /período cerrado/);

  // Sin actor, con la capa prendida: rechazo (también para apagarla).
  assert.match((await enTx(base, A, (c) => c.query(`UPDATE "IndicadorImpuesto" SET "nombre"='otro' WHERE "id"=$1`, [ind]), null))!.message, /sin actor/);
  assert.match((await enTx(base, A, (c) => c.query(`UPDATE "ConfigContable" SET "parametrizacion"=NULL`), null))!.message, /sin actor/);
  // El rastro es sólo-agregar y sólo lo escribe la base: la app no tiene permiso de escribirlo (42501)…
  const falso = (c: pg.Client) => insertar(c, "ParamCambio", { tenantId: A, tabla: "Tolerancia", registroId: "x", operacion: "INSERT", actor: "yo" });
  const ataques: Array<[string, (c: pg.Client) => Promise<unknown>]> = [
    ["DELETE", (c) => c.query(`DELETE FROM "ParamCambio"`)],
    ["UPDATE", (c) => c.query(`UPDATE "ParamCambio" SET "actor"='otro'`)],
    ["TRUNCATE", (c) => c.query(`TRUNCATE "ParamCambio"`)],
    ["INSERT", falso],
  ];
  for (const [nombre, paso] of ataques) {
    const e = await enTx(base, A, paso);
    assert.equal(e?.code, "42501", `app ${nombre}: ${e?.message ?? "pasó"}`);
  }
  // …y el dueño de las tablas choca con el trigger (también el de TRUNCATE).
  for (const [nombre, paso] of ataques) {
    const e: (Error & { code?: string }) | null = await comoDuenio(base, paso).then(() => null, (err: Error & { code?: string }) => err);
    assert.equal(e?.code, "23514", `dueño ${nombre}: ${e?.message ?? "pasó"}`);
    assert.match(e!.message, nombre === "INSERT" ? /lo escribe la base/ : new RegExp(`sólo-agregar.*\\(${nombre}\\)`));
  }
  // RLS: B no ve el rastro de A.
  const deB = await enTx(base, base.b.id, async (c) => {
    const n = (await c.query(`SELECT count(*)::int AS n FROM "ParamCambio"`)).rows[0].n;
    assert.equal(n, 0);
  });
  assert.equal(deB, null);
});

test("F10: toda FK nueva es compuesta con tenantId — una fila de A no apunta a una de B (23503)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  const B = base.b.id;
  // Filas de B (como dueño: sin RLS, para que sólo quede la FK).
  const deB = await comoDuenio(base, async (c) => {
    const proyecto = await insertar(c, "Proyecto", { tenantId: B, numero: 9001, clientId: base.b.clientes[0], nombre: "Proyecto B", servicio: "EVENTOS" });
    return {
      proyecto,
      clase: await insertar(c, "ClaseAsiento", { tenantId: B, codigo: "MAN" }),
      centro: await insertar(c, "CentroCosto", { tenantId: B, codigo: "ADM", nombre: "Adm", tipo: "AREA", vigenteDesde: "2026-01-01" }),
      grupo: await insertar(c, "GrupoCampos", { tenantId: B, codigo: "G" }),
      tipo: await insertar(c, "TipoCotizacion", { tenantId: B, codigo: "MEP" }),
      indicador: await insertar(c, "IndicadorImpuesto", { tenantId: B, codigo: "EXENTO", clase: "EXENTO", vigenteDesde: "2026-01-01" }),
      regimen: await insertar(c, "RegimenRetencion", { tenantId: B, codigo: "IIBB_SUF", impuesto: "IIBB", sentido: "SUFRIDA", cuentaId: x.b["1.1.3.03"], vigenteDesde: "2026-01-01" }),
    };
  });
  const borradorA = await comoDuenio(base, (c) => insertar(c, "Asiento", { tenantId: A, ejercicioId: x.ejA, fecha: "2026-11-02", descripcion: "fk" }));
  const casos: Array<[string, (c: pg.Client) => Promise<unknown>]> = [
    ["NumeradorContable.ejercicioId", (c) => insertar(c, "NumeradorContable", { tenantId: A, ejercicioId: x.ejB, codigo: "FK", desde: 2_000_000, hasta: 2_000_010, ultimo: 1_999_999 })],
    ["ClaseAsiento.claseAnulacionId", (c) => insertar(c, "ClaseAsiento", { tenantId: A, codigo: "ANU", claseAnulacionId: deB.clase })],
    ["CentroCosto.proyectoId", (c) => insertar(c, "CentroCosto", { tenantId: A, codigo: "P1", nombre: "p", tipo: "PROYECTO", proyectoId: deB.proyecto, vigenteDesde: "2026-01-01" })],
    ["CentroCosto.padreId", (c) => insertar(c, "CentroCosto", { tenantId: A, codigo: "H1", nombre: "h", tipo: "AREA", padreId: deB.centro, vigenteDesde: "2026-01-01" })],
    ["Asiento.claseAsientoId", (c) => insertar(c, "Asiento", { tenantId: A, ejercicioId: x.ejA, fecha: "2026-11-02", descripcion: "x", claseAsientoId: deB.clase })],
    ["AsientoLinea.centroCostoId", (c) => insertar(c, "AsientoLinea", { tenantId: A, asientoId: borradorA, cuentaId: x.a["1.1.1.01"], debe: 1, centroCostoId: deB.centro })],
    ["AsientoLinea.indicadorImpuestoId", (c) => insertar(c, "AsientoLinea", { tenantId: A, asientoId: borradorA, cuentaId: x.a["1.1.1.01"], debe: 1, indicadorImpuestoId: deB.indicador })],
    ["AsientoLinea.regimenRetencionId", (c) => insertar(c, "AsientoLinea", { tenantId: A, asientoId: borradorA, cuentaId: x.a["1.1.1.01"], debe: 1, regimenRetencionId: deB.regimen })],
    ["Cotizacion.tipoCotizacionId", (c) => insertar(c, "Cotizacion", { tenantId: A, tipoCotizacionId: deB.tipo, moneda: "USD", fecha: "2026-11-02", valor: 1 })],
    ["IndicadorImpuesto.cuentaId", (c) => insertar(c, "IndicadorImpuesto", { tenantId: A, codigo: "IVA_B", clase: "IVA_DEBITO", cuentaId: x.b["2.1.2.01"], vigenteDesde: "2026-11-02" })],
    ["RegimenRetencion.cuentaId", (c) => insertar(c, "RegimenRetencion", { tenantId: A, codigo: "R_B", impuesto: "IIBB", sentido: "SUFRIDA", cuentaId: x.b["1.1.3.03"], vigenteDesde: "2026-11-02" })],
    ["DeterminacionCuenta.cuentaId", (c) => insertar(c, "DeterminacionCuenta", { tenantId: A, rol: "BANCO", dimension: "MONEDA", clave: "USD", cuentaId: x.b["1.1.1.02"], vigenteDesde: "2026-11-02" })],
    ["CuentaContable.grupoCamposId", (c) => c.query(`UPDATE "CuentaContable" SET "grupoCamposId"=$1 WHERE "id"=$2`, [deB.grupo, x.a["5.1.01"]])],
  ];
  const duenio = await conectar(base.urlDuenio);
  try {
    for (const [nombre, paso] of casos) {
      await duenio.query("BEGIN");
      await duenio.query("SELECT set_config('app.current_actor',$1,true)", [ACTOR]);
      const e = await paso(duenio).then(() => null, (err: Error & { code?: string }) => err);
      await duenio.query("ROLLBACK");
      // 23503 directo, o el trigger de la cuenta que no encuentra la de A (23514) antes de llegar a la FK.
      assert.ok(e && (e.code === "23503" || (nombre.endsWith("cuentaId") && e.code === "23514")), `${nombre}: ${e?.code} ${e?.message ?? "pasó"}`);
    }
  } finally {
    await duenio.end();
  }
});

test("F10 genérico: toda FK de las tablas contables incluye tenantId (salvo la de Tenant); toda tabla nueva tiene RLS", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  await preparar(base);
  const nuevas = ["PeriodoApertura", "NumeradorContable", "ClaseAsiento", "CentroCosto", "ParamCambio", "TipoCotizacion", "Cotizacion", "IndicadorImpuesto", "RegimenRetencion", "DeterminacionCuenta", "Tolerancia", "GrupoCampos"];
  const tablas = [...nuevas, "CuentaContable", "CuentaRol", "ConfigContable", "Ejercicio", "Asiento", "AsientoLinea", "ObligacionFiscal", "VencimientoFiscal"];
  const fks = await comoDuenio(base, async (c) =>
    (
      await c.query(
        `SELECT con.conname, rel.relname AS tabla, ref.relname AS destino,
                (SELECT array_agg(a.attname::text) FROM pg_attribute a WHERE a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)) AS cols,
                (SELECT array_agg(a.attname::text) FROM pg_attribute a WHERE a.attrelid = con.confrelid AND a.attnum = ANY (con.confkey)) AS refcols
           FROM pg_constraint con
           JOIN pg_class rel ON rel.oid = con.conrelid
           JOIN pg_class ref ON ref.oid = con.confrelid
          WHERE con.contype = 'f' AND rel.relname = ANY ($1)`,
        [tablas],
      )
    ).rows as Array<{ conname: string; tabla: string; destino: string; cols: string[]; refcols: string[] }>,
  );
  assert.ok(fks.length >= 30, `pocas FK: ${fks.length}`);
  const sinTenant = fks.filter((f) => f.destino !== "Tenant" && !(f.cols.includes("tenantId") && f.refcols.includes("tenantId")));
  assert.deepEqual(sinTenant.map((f) => f.conname), [], "FK que no incluyen tenantId");
  for (const n of nuevas) assert.ok(fks.some((f) => f.tabla === n && f.destino === "Tenant"), `${n} sin FK a Tenant`);
  const rls = await comoDuenio(base, async (c) =>
    (await c.query(`SELECT c.relname FROM pg_class c WHERE c.relname = ANY ($1) AND c.relrowsecurity AND EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation')`, [nuevas])).rows.map((r) => r.relname),
  );
  assert.deepEqual(rls.sort(), [...nuevas].sort());
});

test("F16: estado de campos — requerido sin dato, suprimido con dato y clase vs cuenta contradictorias rebotan", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  const cab = { claseAsientoId: x.claseMan };
  const costo = x.a["5.1.01"];
  let adm = "";
  let viejo = "";
  assert.equal(await enTx(base, A, async (c) => {
    const req = await insertar(c, "GrupoCampos", { tenantId: A, codigo: "RES_CC", centroCosto: "R" });
    await c.query(`UPDATE "CuentaContable" SET "grupoCamposId"=$1 WHERE "id"=$2`, [req, costo]);
    adm = await insertar(c, "CentroCosto", { tenantId: A, codigo: "ADM", nombre: "Administración", tipo: "AREA", vigenteDesde: "2026-01-01" });
    viejo = await insertar(c, "CentroCosto", { tenantId: A, codigo: "VIEJO", nombre: "Cerrado", tipo: "AREA", vigenteDesde: "2026-01-01", vigenteHasta: "2026-03-31" });
  }), null);
  const gasto = (centro?: string) => (c: pg.Client) =>
    asiento(c, A, x.ejA, { fecha: "2026-11-03", cab, lineas: [{ cuenta: costo, debe: 700, extra: centro ? { centroCostoId: centro } : {} }, { cuenta: x.a["1.1.1.01"], haber: 700 }] });
  assert.match((await enTx(base, A, gasto()))!.message, /Falta el centro de costo/);
  assert.match((await enTx(base, A, gasto(viejo)))!.message, /no está vigente/);
  assert.equal(await enTx(base, A, gasto(adm)), null);

  // Cuenta que suprime el centro: con dato rebota.
  const supr = await enTx(base, A, async (c) => {
    const s = await insertar(c, "GrupoCampos", { tenantId: A, codigo: "SIN_CC", centroCosto: "S" });
    await c.query(`UPDATE "CuentaContable" SET "grupoCamposId"=$1 WHERE "id"=$2`, [s, x.a["4.1.01"]]);
    await asiento(c, A, x.ejA, { fecha: "2026-11-03", cab, lineas: [{ cuenta: x.a["1.1.1.01"], debe: 50 }, { cuenta: x.a["4.1.01"], haber: 50, extra: { centroCostoId: adm } }] });
  });
  assert.match(supr!.message, /no admite el centro de costo/);
  // Clase que exige centro + cuenta de resultado que lo suprime: rebota al guardar.
  const conflicto = await enTx(base, A, async (c) => {
    const s = await insertar(c, "GrupoCampos", { tenantId: A, codigo: "SIN_CC", centroCosto: "S" });
    await c.query(`UPDATE "CuentaContable" SET "grupoCamposId"=$1 WHERE "id"=$2`, [s, x.a["4.1.01"]]);
    await c.query(`UPDATE "ClaseAsiento" SET "exigeCentroCosto"=true WHERE "id"=$1`, [x.claseMan]);
  });
  assert.match(conflicto!.message, /contradictoria/);
  // Clase que exige referencia: sin referencia rebota.
  const sinRef = await enTx(base, A, async (c) => {
    await c.query(`UPDATE "ClaseAsiento" SET "exigeReferencia"=true WHERE "id"=$1`, [x.claseMan]);
    await asiento(c, A, x.ejA, { fecha: "2026-11-03", cab, lineas: [{ cuenta: x.a["1.1.1.01"], debe: 50 }, { cuenta: x.a["4.1.01"], haber: 50 }] });
  });
  assert.match(sinRef!.message, /Falta la referencia/);
  // Clase inactiva, o sin clase: rechazo.
  assert.match((await enTx(base, A, (c) => asiento(c, A, x.ejA, { fecha: "2026-11-03", lineas: [{ cuenta: x.a["1.1.1.01"], debe: 5 }, { cuenta: x.a["4.1.01"], haber: 5 }] })))!.message, /Falta parametrizar: Clases de asiento/);
});

test("F17: claveOrigen única por negocio — dos confirmaciones paralelas del mismo cobro dejan un asiento", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  // El alta idempotente que usa la app: INSERT … ON CONFLICT DO NOTHING; si no insertó, devuelve el id existente.
  const idempotente = (ids: string[]) => (c: pg.Client) =>
    (async () => {
      const r = await c.query(
        `INSERT INTO "Asiento" ("id","tenantId","ejercicioId","fecha","descripcion","updatedAt","claseAsientoId","claveOrigen")
         VALUES ($1,$2,$3,'2026-11-04','cobro',now(),$4,'cobro:123')
         ON CONFLICT ("tenantId","claveOrigen") WHERE "claveOrigen" IS NOT NULL DO NOTHING RETURNING "id"`,
        [randomUUID(), A, x.ejA, x.claseMan],
      );
      if (r.rowCount === 1) {
        const id = r.rows[0].id as string;
        await insertar(c, "AsientoLinea", { tenantId: A, asientoId: id, cuentaId: x.a["1.1.1.01"], debe: 300, haber: 0 });
        await insertar(c, "AsientoLinea", { tenantId: A, asientoId: id, cuentaId: x.a["4.1.01"], debe: 0, haber: 300 });
        await confirmar(c, id);
        await dormir(150); // la otra llamada queda esperando el COMMIT de ésta
        ids.push(id);
      } else {
        ids.push((await c.query(`SELECT "id" FROM "Asiento" WHERE "claveOrigen"='cobro:123'`)).rows[0].id as string);
      }
    })();
  const ids: string[] = [];
  const r = await Promise.all([enTx(base, A, idempotente(ids)), enTx(base, A, idempotente(ids))]);
  assert.deepEqual(r, [null, null]);
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1], "la segunda llamada devuelve el MISMO asiento");
  const fila = await comoDuenio(base, async (c) => (await c.query(`SELECT "id","estado" FROM "Asiento" WHERE "claveOrigen"='cobro:123'`)).rows);
  assert.deepEqual(fila, [{ id: ids[0], estado: "CONFIRMADO" }]);
  // Sin ON CONFLICT, la base lo rechaza con 23505 (nunca un segundo asiento).
  const e = await enTx(base, A, (c) =>
    asiento(c, A, x.ejA, { fecha: "2026-11-04", cab: { claseAsientoId: x.claseMan, claveOrigen: "cobro:123" }, lineas: [{ cuenta: x.a["1.1.1.01"], debe: 300 }, { cuenta: x.a["4.1.01"], haber: 300 }] }),
  );
  assert.equal(e?.code, "23505");
  // Otro negocio puede usar la misma clave.
  assert.equal(await enTx(base, base.b.id, async (c) => {
    const ej = x.ejB;
    await insertar(c, "Asiento", { tenantId: base.b.id, ejercicioId: ej, fecha: "2026-11-04", descripcion: "b", claveOrigen: "cobro:123" });
  }), null);
});

test("inerte sin parametrizacion: el negocio B confirma como antes, sin clase, período, numerador ni rastro", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const B = base.b.id;
  const repo = await import("./repo");
  const r1 = await repo.registrarAsiento(B, {
    fecha: new Date("2026-05-05T00:00:00Z"),
    descripcion: "venta",
    lineas: [{ cuentaId: x.b["1.1.1.01"], debe: BigInt(1000), haber: BigInt(0) }, { cuentaId: x.b["4.1.01"], debe: BigInt(0), haber: BigInt(1000) }],
    confirmar: true,
  });
  assert.ok(r1.ok);
  // SQL directo con actor y un número de la app: queda el de la app; sin foto de actor; conversión sin controlar.
  let id = "";
  assert.equal(await enTx(base, B, async (c) => {
    id = await asiento(c, B, x.ejB, {
      fecha: "2026-05-06",
      numero: 4242,
      lineas: [{ cuenta: x.b["1.1.1.01"], debe: 1, extra: { moneda: "USD", importeOrigen: 100, cotizacion: 1_000_000_000 } }, { cuenta: x.b["4.1.01"], haber: 1 }],
    });
  }), null);
  const fila = await comoDuenio(base, async (c) => (await c.query(`SELECT "numero","creadoPor","confirmadoPor","confirmadoEn" FROM "Asiento" WHERE "id"=$1`, [id])).rows[0]);
  assert.deepEqual(fila, { numero: 4242, creadoPor: null, confirmadoPor: null, confirmadoEn: null });
  // Cambios del plan de B: sin rastro; cambiar el tipo de una cuenta con asientos sigue como antes (lo decide la app).
  assert.equal(await enTx(base, B, (c) => c.query(`UPDATE "CuentaContable" SET "nombre"='Caja chica' WHERE "id"=$1`, [x.b["1.1.1.01"]]), null), null);
  const rastroB = await comoDuenio(base, async (c) => (await c.query(`SELECT count(*)::int AS n FROM "ParamCambio" WHERE "tenantId"=$1 AND "tabla" IN ('CuentaContable','CuentaRol','ConfigContable')`, [B])).rows[0].n);
  assert.equal(rastroB, 0);
});

// ── Vuelta 1 de certificación: cada hallazgo, su ataque ─────────────────────────────────────────

const ultimoDiario = (base: BaseEfimera) =>
  comoDuenio(base, async (c) => (await c.query(`SELECT "ultimo" FROM "NumeradorContable" WHERE "tenantId"=$1 AND "codigo"='DIARIO'`, [base.a.id])).rows[0].ultimo as number);

/** Abre una transacción de la app en el negocio, con el aislamiento pedido. */
async function txAbierta(base: BaseEfimera, tenantId: string, aislamiento = "READ COMMITTED") {
  const c = await conectar(base.urlApp);
  await c.query(`BEGIN ISOLATION LEVEL ${aislamiento}`);
  await c.query("SELECT set_config('app.current_tenant_id',$1,true), set_config('app.current_actor',$2,true)", [tenantId, ACTOR]);
  return c;
}
const cerrarTx = async (c: pg.Client) => {
  await c.query("ROLLBACK").catch(() => {});
  await c.end().catch(() => {});
};
const resultado = (p: Promise<unknown>) => p.then(() => null, (e: Error & { code?: string }) => e);

test("H1: un trigger TEMP de la app (profundidad falsa) no baja «ultimo» ni fabrica rastro; la app sí ajusta el rango", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  const conGatillo = (cuerpo: string) =>
    enTx(base, A, async (c) => {
      await c.query(`CREATE TEMP TABLE gatillo (x int)`);
      await c.query(`CREATE FUNCTION pg_temp.gatillo_f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${cuerpo}; RETURN NEW; END $$`);
      await c.query(`CREATE TRIGGER g BEFORE INSERT ON pg_temp.gatillo FOR EACH ROW EXECUTE FUNCTION pg_temp.gatillo_f()`);
      await c.query(`INSERT INTO pg_temp.gatillo VALUES (1)`);
    });
  const antes = await ultimoDiario(base);
  const e1 = await conGatillo(`UPDATE "NumeradorContable" SET "ultimo" = 0 WHERE "codigo" = 'DIARIO'`);
  assert.equal(e1?.code, "42501", e1?.message ?? "bajó el numerador");
  assert.equal(await ultimoDiario(base), antes);
  const e2 = await conGatillo(
    `INSERT INTO "ParamCambio" ("id","tenantId","tabla","registroId","operacion","actor","motivo") VALUES (gen_random_uuid()::text, '${A}', 'Tolerancia', 'x', 'DELETE', 'auditor', 'rastro fabricado')`,
  );
  assert.equal(e2?.code, "42501", e2?.message ?? "fabricó rastro");
  const falsos = await comoDuenio(base, async (c) => (await c.query(`SELECT count(*)::int AS n FROM "ParamCambio" WHERE "motivo"='rastro fabricado'`)).rows[0].n);
  assert.equal(falsos, 0);
  // La app sigue pudiendo dar de alta un numerador y ajustar su rango (desde/hasta).
  assert.equal(await enTx(base, A, async (c) => {
    const id = await insertar(c, "NumeradorContable", { tenantId: A, ejercicioId: x.ejA, codigo: "H1", desde: 3_000_000, hasta: 3_000_010, ultimo: 2_999_999 });
    await c.query(`UPDATE "NumeradorContable" SET "hasta"=3_000_020, "updatedAt"=now() WHERE "id"=$1`, [id]);
  }), null);
});

test("H2: abrir un período por clase CREANDO su fila espera al asiento en vuelo; en REPEATABLE READ la confirmación no se cuela", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  const cab = { claseAsientoId: x.claseMan };
  const lineas = [{ cuenta: x.a["1.1.1.01"], debe: 120 }, { cuenta: x.a["4.1.01"], haber: 120 }]; // clase MAYOR
  const mayor = { tenantId: A, claseCuenta: "MAYOR", abiertoDesde: "2026-07-01", abiertoHasta: "2026-12-31" };
  const borrarMayor = () => comoDuenio(base, (c) => c.query(`DELETE FROM "PeriodoApertura" WHERE "tenantId"=$1 AND "claseCuenta"='MAYOR'`, [A]));
  const cA = await txAbierta(base, A);
  const cB = await txAbierta(base, A);
  try {
    await asiento(cA, A, x.ejA, { fecha: "2026-06-10", cab, lineas });
    let cerro = false;
    const alta = resultado(insertar(cB, "PeriodoApertura", mayor).then(() => (cerro = true)));
    await dormir(400);
    const espero = !cerro;
    await cA.query("COMMIT");
    assert.equal(await alta, null);
    await cB.query("COMMIT");
    assert.equal(espero, true, "el alta del período MAYOR espera a la confirmación en vuelo");
  } finally {
    await cerrarTx(cA);
    await cerrarTx(cB);
    await borrarMayor();
  }
  // REPEATABLE READ: la foto del asiento es anterior al cierre de MAYOR; confirmar no puede leer el período viejo.
  const cR = await txAbierta(base, A, "REPEATABLE READ");
  try {
    const borrador = await asiento(cR, A, x.ejA, { fecha: "2026-06-11", cab, lineas, confirmar: false });
    assert.equal(await enTx(base, A, (c) => insertar(c, "PeriodoApertura", mayor)), null);
    const e = await resultado(confirmar(cR, borrador));
    assert.ok(e && ["40001", "23514"].includes(e.code ?? ""), `confirmó con la foto vieja: ${e?.message ?? "pasó"}`);
  } finally {
    await cerrarTx(cR);
    await borrarMayor();
  }
});

test("H3: dos altas de numerador superpuestas en REPEATABLE READ no quedan las dos", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  const t1 = await txAbierta(base, A, "REPEATABLE READ");
  const t2 = await txAbierta(base, A, "REPEATABLE READ");
  try {
    for (const c of [t1, t2]) await c.query(`SELECT count(*) FROM "NumeradorContable"`); // fija la foto
    const r1 = await resultado(insertar(t1, "NumeradorContable", { tenantId: A, ejercicioId: x.ejA, codigo: "RRUNO", desde: 5_000_000, hasta: 5_000_100, ultimo: 4_999_999 }));
    const p2 = resultado(insertar(t2, "NumeradorContable", { tenantId: A, ejercicioId: x.ejA, codigo: "RRDOS", desde: 5_000_050, hasta: 5_000_200, ultimo: 5_000_049 }));
    const c1 = r1 ? r1 : await resultado(t1.query("COMMIT"));
    const r2 = await p2;
    const c2 = r2 ? r2 : await resultado(t2.query("COMMIT"));
    const n = await comoDuenio(base, async (c) => (await c.query(`SELECT count(*)::int AS n FROM "NumeradorContable" WHERE "codigo" IN ('RRUNO','RRDOS')`)).rows[0].n);
    assert.ok(n <= 1, `quedaron ${n} numeradores superpuestos`);
    for (const e of [c1, c2].filter(Boolean)) assert.ok(["23514", "40001"].includes(e!.code ?? ""), e!.message);
    assert.match((c1 ?? c2)!.message, /READ COMMITTED/);
  } finally {
    await cerrarTx(t1);
    await cerrarTx(t2);
    await comoDuenio(base, (c) => c.query(`DELETE FROM "NumeradorContable" WHERE "codigo" IN ('RRUNO','RRDOS')`));
  }
});

test("H4: confirmar y cerrar en la misma transacción, contra otra confirmación: sin deadlock, la otra rebota limpia", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  const cab = { claseAsientoId: x.claseMan };
  const lineas = [{ cuenta: x.a["1.1.1.01"], debe: 80 }, { cuenta: x.a["4.1.01"], haber: 80 }];
  const t1 = await txAbierta(base, A);
  const t2 = await txAbierta(base, A);
  try {
    await asiento(t1, A, x.ejA, { fecha: "2026-09-01", cab, lineas });
    const p2 = resultado(asiento(t2, A, x.ejA, { fecha: "2026-09-01", cab, lineas }));
    await dormir(300);
    const r1 = await resultado(t1.query(`UPDATE "PeriodoApertura" SET "abiertoDesde"='2026-09-02' WHERE "claseCuenta"='GENERAL'`));
    const fin1 = r1 ?? (await resultado(t1.query("COMMIT")));
    const e2 = await p2;
    assert.equal(fin1, null, `confirmar+cerrar: ${fin1?.code} ${fin1?.message}`);
    assert.equal(e2?.code, "23514", `la otra confirmación: ${e2?.code ?? "pasó"} ${e2?.message ?? ""}`);
    assert.match(e2!.message, /período cerrado/);
  } finally {
    await cerrarTx(t1);
    await cerrarTx(t2);
    await reabrir(base);
  }
});

// ── Certificación, vuelta 2: las funciones SECURITY DEFINER no se reusan desde afuera ─────────────
// `app_rls` puede crear tablas TEMP con triggers. Sin `REVOKE EXECUTE ... FROM PUBLIC`, un trigger
// TEMP apuntado a una función nuestra corría como el dueño de las tablas, con la fila que quisiera.

/** TODAS las funciones SECURITY DEFINER de public, no sólo las de contabilidad: sin `ALTER DEFAULT
 *  PRIVILEGES`, una función SECURITY DEFINER futura nace con EXECUTE para PUBLIC y este test la caza. */
const funcionesDefiner = (base: BaseEfimera) =>
  comoDuenio(base, async (c) =>
    (await c.query(`SELECT p.oid::regprocedure::text AS f FROM pg_proc p
                     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
                     ORDER BY 1`)).rows.map((r) => r.f as string),
  );

test("H5: app_rls no ejecuta ninguna función SECURITY DEFINER de public (ni directo ni en un trigger TEMP)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  await preparar(base);
  const fs = await funcionesDefiner(base);
  assert.ok(fs.length >= 18, `pocas funciones SECURITY DEFINER: ${fs.join(", ")}`);
  const ejecutables = await comoDuenio(base, async (c) =>
    (await c.query(`SELECT f FROM unnest($1::text[]) f WHERE has_function_privilege('app_rls', f::regprocedure, 'EXECUTE')`, [fs])).rows.map((r) => r.f),
  );
  assert.deepEqual(ejecutables, [], "app_rls tiene EXECUTE");
});

test("H6 (X1): un trigger TEMP «Tolerancia» con contabilidad_param_rastro no deja rastro falso de OTRO negocio", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  await preparar(base);
  const A = base.a.id;
  const e = await enTx(base, base.b.id, async (c) => {
    await c.query(`CREATE TEMP TABLE "Tolerancia" (id text, "tenantId" text, motivo text)`);
    await c.query(`CREATE TRIGGER f AFTER INSERT ON pg_temp."Tolerancia" FOR EACH ROW EXECUTE FUNCTION public.contabilidad_param_rastro()`);
    await c.query(`SELECT set_config('app.current_motivo','rastro fabricado H6',true)`);
    await c.query(`INSERT INTO pg_temp."Tolerancia" VALUES ('falso-1', $1, 'x')`, [A]);
  });
  assert.equal(e?.code, "42501", e?.message ?? "el trigger TEMP corrió");
  const falsos = await comoDuenio(base, async (c) => (await c.query(`SELECT count(*)::int AS n FROM "ParamCambio" WHERE "motivo"='rastro fabricado H6'`)).rows[0].n);
  assert.equal(falsos, 0);
});

test("H7 (X2): contabilidad_param_al_confirmar no se llama ni directo ni desde un trigger TEMP: «ultimo» no se adelanta", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  let id = "";
  assert.equal(await enTx(base, A, async (c) => {
    id = await asiento(c, A, x.ejA, { fecha: "2026-03-03", cab: { claseAsientoId: x.claseMan }, lineas: [{ cuenta: x.a["1.1.1.01"], debe: 50 }, { cuenta: x.a["4.1.01"], haber: 50 }], confirmar: false });
  }), null);
  const antes = await ultimoDiario(base);
  const directo = await enTx(base, A, (c) => c.query(`SELECT contabilidad_param_al_confirmar(a) FROM "Asiento" a WHERE "id"=$1`, [id]));
  assert.equal(directo?.code, "42501", directo?.message ?? "la llamada directa pasó");
  const viaTemp = await enTx(base, A, async (c) => {
    await c.query(`CREATE TEMP TABLE g (x int)`);
    await c.query(`CREATE FUNCTION pg_temp.gf() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM contabilidad_param_al_confirmar(a) FROM "Asiento" a WHERE a."id"='${id}'; RETURN NEW; END $$`);
    await c.query(`CREATE TRIGGER g BEFORE INSERT ON pg_temp.g FOR EACH ROW EXECUTE FUNCTION pg_temp.gf()`);
    await c.query(`INSERT INTO pg_temp.g SELECT generate_series(1,5)`);
  });
  assert.equal(viaTemp?.code, "42501", viaTemp?.message ?? "el trigger TEMP pasó");
  assert.equal(await ultimoDiario(base), antes);
  // El trigger legítimo sigue numerando sin EXECUTE para PUBLIC.
  assert.equal(await enTx(base, A, (c) => confirmar(c, id)), null);
  assert.equal(await ultimoDiario(base), antes + 1);
});

test("H8 (X3): el negocio B no traba la fila GENERAL de A — ni con un trigger TEMP ni escribiendo una fila de A en la tabla real", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const x = await preparar(base);
  const A = base.a.id;
  const B = base.b.id;
  const ataques: Record<string, (c: pg.Client) => Promise<unknown>> = {
    "TEMP periodo": async (c) => {
      await c.query(`CREATE TEMP TABLE "PeriodoApertura" (LIKE public."PeriodoApertura" INCLUDING DEFAULTS)`);
      await c.query(`CREATE TRIGGER s BEFORE INSERT ON pg_temp."PeriodoApertura" FOR EACH ROW EXECUTE FUNCTION public.contabilidad_param_periodo()`);
      await c.query(`INSERT INTO pg_temp."PeriodoApertura" (id,"tenantId","claseCuenta","abiertoDesde","abiertoHasta","updatedAt") VALUES ('x',$1,'BANCOS','2026-01-01','2026-12-31',now())`, [A]);
    },
    "TEMP vigencia": async (c) => {
      await c.query(`CREATE TEMP TABLE "Tolerancia" (id text, "tenantId" text, "vigenteDesde" date)`);
      await c.query(`CREATE TRIGGER v BEFORE INSERT ON pg_temp."Tolerancia" FOR EACH ROW EXECUTE FUNCTION public.contabilidad_param_vigencia()`);
      await c.query(`INSERT INTO pg_temp."Tolerancia" VALUES ('x',$1,'2026-12-01')`, [A]);
    },
    // La WITH CHECK de RLS corre DESPUÉS de los triggers BEFORE: la traba tomada con la fila de A
    // duraría hasta el ROLLBACK de B (que la deja colgada en una transacción abortada).
    "real periodo": (c) =>
      c.query(`INSERT INTO "PeriodoApertura" (id,"tenantId","claseCuenta","abiertoDesde","abiertoHasta","updatedAt") VALUES ($2,$1,'BANCOS','2026-01-01','2026-12-31',now())`, [A, randomUUID()]),
    "real vigencia": (c) =>
      c.query(`INSERT INTO "Tolerancia" (id,"tenantId","codigo","valor","vigenteDesde","updatedAt") VALUES ($2,$1,'REDONDEO_CONVERSION_CENTAVOS',1,'2026-12-01',now())`, [A, randomUUID()]),
    "real asiento": (c) =>
      c.query(`INSERT INTO "Asiento" (id,"tenantId","ejercicioId",fecha,descripcion,estado,"claseAsientoId","updatedAt") VALUES ($3,$1,$2,'2026-03-04','x','CONFIRMADO',$4,now())`, [A, x.ejA, randomUUID(), x.claseMan]),
  };
  for (const [via, ataque] of Object.entries(ataques)) {
    const atk = await txAbierta(base, B);
    try {
      const ea = await resultado(ataque(atk));
      assert.equal(ea?.code, "42501", `${via}: ${ea?.code ?? "pasó"} ${ea?.message ?? ""}`);
      // En la tabla real lo frena la guarda del trigger, ANTES de la WITH CHECK de RLS (que también da 42501).
      if (via.startsWith("real")) assert.match(ea!.message, /otro negocio/, via);
      // B queda en la transacción abortada, sin ROLLBACK: A confirma igual.
      const ev = await enTx(base, A, async (c) => {
        await c.query("SET LOCAL lock_timeout='1500ms'");
        await asiento(c, A, x.ejA, { fecha: "2026-03-04", cab: { claseAsientoId: x.claseMan }, lineas: [{ cuenta: x.a["1.1.1.01"], debe: 7 }, { cuenta: x.a["4.1.01"], haber: 7 }] });
      });
      assert.equal(ev, null, `${via}: A no confirmó: ${ev?.code} ${ev?.message}`);
    } finally {
      await cerrarTx(atk);
    }
  }
});

test("H9: cada función de trigger SECURITY DEFINER rechaza (42501) una tabla que no es la suya, aun con EXECUTE (dueño)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  await preparar(base);
  const fs = (await funcionesDefiner(base)).filter((f) => f.endsWith("()"));
  assert.ok(fs.length >= 14, `pocas funciones de trigger: ${fs.join(", ")}`);
  const c = await conectar(base.urlDuenio);
  try {
    for (const f of fs) {
      for (const tabla of ["Tolerancia", "Asiento", "x"]) {
        await c.query("BEGIN");
        const e = await resultado((async () => {
          await c.query(`CREATE TEMP TABLE "${tabla}" (id text, "tenantId" text, "asientoId" text)`);
          await c.query(`CREATE TRIGGER g BEFORE INSERT ON pg_temp."${tabla}" FOR EACH ROW EXECUTE FUNCTION public.${f}`);
          await c.query(`INSERT INTO pg_temp."${tabla}" VALUES ('x', 'y', 'z')`);
        })());
        await c.query("ROLLBACK");
        assert.equal(e?.code, "42501", `${f} en TEMP "${tabla}": ${e?.code ?? "pasó"} ${e?.message ?? ""}`);
      }
    }
  } finally {
    await c.end();
  }
});
