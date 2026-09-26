// ============================================================================
// LA FACTURA DE PRUEBA DE VERDAD — contra Postgres (QA 26/09, bloqueantes 3 y 5)
// ============================================================================
//
// Base efímera (src/test/base-efimera.ts), ARCA en modo prueba (stub, sin ARCA_MODO). Se ejecuta la
// acción real con sesión y host (`ejecutarAccion`):
//   1. un inscripto emite B a consumidor final con numeración correlativa (antes: siempre el 1),
//      guardada con su letra, receptor y CAE simulado; la A frena con el motivo de la decisión;
//   2. un monotributista emite C;
//   3. un negocio sin la facturación asignada no emite nada (y conserva el banco de siempre);
//   4. aislamiento: lo de A no aparece en B;
//   5. ni el banco de pruebas ni la factura de prueba escriben el CUIT en el log.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const CUIT_RI = "30716203456";
const CUIT_MONO = "27314567825";

test("factura de prueba guardada: letra, receptor, numeración, aislamiento y log sin CUIT", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = { auth: process.env.AUTH_SECRET, modo: process.env.ARCA_MODO };
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  delete process.env.ARCA_MODO;
  t.after(() => {
    if (antes.auth === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = antes.auth;
    if (antes.modo !== undefined) process.env.ARCA_MODO = antes.modo;
  });
  prepararAccionesDeServidor();

  // El log: todo lo que el logger escribe (console.log / console.error) durante el test.
  const log: string[] = [];
  const orig = { log: console.log, error: console.error };
  console.log = (...a: unknown[]) => { log.push(a.map(String).join(" ")); };
  console.error = (...a: unknown[]) => { log.push(a.map(String).join(" ")); };
  t.after(() => { console.log = orig.log; console.error = orig.error; });

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { tenantTransaction } = await import("@/lib/rls");
  const { emitirFacturaDePruebaGuardadaAction, emitirFacturaDePruebaAction } = await import("./arca-pruebas-actions");
  base.alBorrar(() => operatorPrisma.$disconnect());

  const fiscal = (cuit: string, condicion: string, pv: number) => ({
    modules: ["arca", "clients", "reports"], arcaCuit: cuit, arcaPuntoVenta: pv, arcaCondicionIva: condicion,
  });
  await operatorPrisma.tenant.update({ where: { id: base.a.id }, data: fiscal(CUIT_RI, "RESPONSABLE_INSCRIPTO", 2) });
  await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: fiscal(CUIT_MONO, "MONOTRIBUTO", 1) });

  type R = Awaited<ReturnType<typeof emitirFacturaDePruebaGuardadaAction>>;
  const emitir = async (negocio: typeof base.a, receptor: unknown) => {
    const s = await ejecutarAccion({ negocio, usuario: negocio.duenia }, () => emitirFacturaDePruebaGuardadaAction(receptor));
    assert.equal(s.tipo, "respuesta", JSON.stringify(s));
    return (s as { valor: R }).valor;
  };
  const facturasDe = (id: string) =>
    tenantTransaction(
      (tx) => tx.invoice.findMany({ where: { tenantId: id }, orderBy: { createdAt: "asc" }, select: { tenantId: true, status: true, tipoComprobante: true, puntoVenta: true, numero: true, cae: true, docTipo: true, total: true } }),
      { tenantId: id },
    );

  await t.test("inscripto: B a consumidor final, correlativa, y A a otro inscripto", async () => {
    const b1 = await emitir(base.a, "consumidor-final");
    assert.deepEqual(b1, { ok: true, comprobante: "Factura B 0002-00000001", cae: "STUB00000001", receptor: "Consumidor final", total: 1210 });
    const b2 = await emitir(base.a, "consumidor-final");
    assert.equal(b2.ok && b2.comprobante, "Factura B 0002-00000002", "la segunda sigue la numeración (antes: otra vez el 1)");
    // A otro inscripto el sistema decide A, y la A exige la clase que asignó ARCA (RG 1575), que
    // todavía no tiene columna (fiscal.ts:121-124): la decisión la frena con su motivo y NO se
    // guarda nada a medias. Es la misma regla que una venta.
    const a1 = await emitir(base.a, "responsable-inscripto");
    assert.equal(a1.ok, false);
    assert.match(a1.ok ? "" : a1.error, /qué Factura A te asignó ARCA/);
    const guardadas = await facturasDe(base.a.id);
    assert.deepEqual(
      guardadas.map((f) => [f.status, f.tipoComprobante, f.numero, f.docTipo, Number(f.total)]),
      [["AUTHORIZED", 6, 1, 99, 1210], ["AUTHORIZED", 6, 2, 99, 1210]],
    );
  });

  await t.test("monotributista: Factura C, a consumidor final y a un inscripto", async () => {
    const c1 = await emitir(base.b, "consumidor-final");
    assert.equal(c1.ok && c1.comprobante, "Factura C 0001-00000001", JSON.stringify(c1));
    const c2 = await emitir(base.b, "responsable-inscripto");
    assert.equal(c2.ok && c2.comprobante, "Factura C 0001-00000002", JSON.stringify(c2));
    assert.equal(c2.ok && c2.receptor, "CUIT 20-11111111-2");
    const deB = await facturasDe(base.b.id);
    assert.deepEqual(deB.map((f) => [f.tipoComprobante, f.numero]), [[11, 1], [11, 2]]);
  });

  await t.test("aislamiento: B no ve ni recibe lo de A; A no ve lo de B", async () => {
    const cruzado = await tenantTransaction((tx) => tx.invoice.findMany({ where: { tenantId: base.a.id } }), { tenantId: base.b.id });
    assert.equal(cruzado.length, 0);
    assert.ok((await facturasDe(base.a.id)).every((f) => f.tenantId === base.a.id));
    assert.equal((await facturasDe(base.a.id)).length, 2, "lo de B no sumó nada en A");
  });

  await t.test("sin la facturación asignada no emite nada; un receptor inventado tampoco", async () => {
    await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { modules: ["clients", "reports"] } });
    const sinModulo = await emitir(base.b, "consumidor-final");
    assert.equal(sinModulo.ok, false);
    const inventado = await emitir(base.a, "cualquiera");
    assert.equal(inventado.ok, false);
    assert.equal((await facturasDe(base.b.id)).length, 2);
    assert.equal((await facturasDe(base.a.id)).length, 2);
  });

  await t.test("el log no guarda el CUIT del negocio (§4)", async () => {
    // El banco de pruebas de siempre (lo que usa CH) también loguea: sin CUIT.
    const s = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => emitirFacturaDePruebaAction());
    assert.equal(s.tipo, "respuesta", JSON.stringify(s));
    const todo = log.join("\n");
    assert.match(todo, /arca\.prueba/, "hubo líneas de arca.prueba");
    assert.doesNotMatch(todo, new RegExp(`${CUIT_RI}|${CUIT_MONO}`), "ningún CUIT del negocio en el log");
  });
});
