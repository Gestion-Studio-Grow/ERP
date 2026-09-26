// ============================================================================
// EL SEGUNDO LOCAL ES EL MISMO CONTRIBUYENTE — contra Postgres (QA vuelta 5, bloqueante 1)
// ============================================================================
//
// El local que entra a la red con el CUIT de la casa quedaba sin condición frente al IVA: en modo
// prueba se le asumía monotributo y emitía Factura C con el CUIT de un Responsable inscripto
// (Los Tilos Banfield, qa-5/p5-invoice-db.txt). Acá se ejecuta la corrida real del alta en la red
// (`sumarAltaEnTx` en la transacción del operador, como `sumarAltaALaRedAction`) sobre una base
// efímera con RLS, y después la factura de prueba REAL del local, con su sesión y su host.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { heredarFiscalDeLaCasa } from "./multilocal-core";

const CUIT_RI = "30705442963";
const DEL_CUIT = {
  arcaCondicionIva: "RESPONSABLE_INSCRIPTO",
  arcaRazonSocial: "Mayorista Los Tilos SA",
  arcaDomicilioFiscal: "Av. Hipólito Yrigoyen 8000, Lomas de Zamora",
  arcaInicioActividades: "20100301",
  arcaIibb: "Convenio Multilateral 901-123456-7",
};

test("heredar de la casa: completa lo vacío, no pisa lo cargado y rechaza otra condición con el mismo CUIT", () => {
  const casa = { name: "Casa", ...DEL_CUIT };
  assert.deepEqual(heredarFiscalDeLaCasa(casa, { name: "Local" }), { ok: true, datos: DEL_CUIT });
  const conRazon = heredarFiscalDeLaCasa(casa, { name: "Local", arcaRazonSocial: "Otra razón", arcaIibb: "  " });
  assert.equal(conRazon.ok && conRazon.datos.arcaRazonSocial, undefined, "lo que el local ya tiene no se pisa");
  assert.equal(conRazon.ok && conRazon.datos.arcaIibb, DEL_CUIT.arcaIibb, "un blanco cuenta como vacío");
  const choque = heredarFiscalDeLaCasa(casa, { name: "Banfield", arcaCondicionIva: "MONOTRIBUTO" });
  assert.equal(choque.ok, false);
  assert.match(choque.ok ? "" : choque.motivo, /«Banfield» tiene cargada otra condición frente al IVA que «Casa», con el mismo CUIT/);
  assert.deepEqual(heredarFiscalDeLaCasa({ name: "Casa sin datos" }, { name: "Local" }), { ok: true, datos: {} });
});

test("QA vuelta 5 · el segundo local con el CUIT de la casa hereda la condición y la Factura A: emite B y A, no C", async (t) => {
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

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { tenantTransaction } = await import("@/lib/rls");
  const { sumarAltaEnTx, AltaEnRedRechazada, marcarAltaParaLaRedEnTx, MOTIVO_NO_ES_ALTA_DE_LA_RED } = await import("./multilocal-core");
  const { corregirRegimenFacturaA, leerRegimenFacturaA } = await import("@/lib/fiscal/regimen-factura-a.server");
  const { emitirFacturaDePruebaGuardadaAction } = await import("@/lib/arca-pruebas-actions");
  base.alBorrar(() => operatorPrisma.$disconnect());

  // La casa (A): PyME con la red, inscripta, con su Factura A. El local (B): sin CUIT ni condición
  // (como quedó Banfield). Primero es un negocio que ya existía; después, con la marca, el del alta.
  await operatorPrisma.tenant.update({
    where: { id: base.a.id },
    data: { modules: ["arca", "clients", "reports", "multilocal"], arcaCuit: CUIT_RI, arcaPuntoVenta: 3, ...DEL_CUIT },
  });
  assert.deepEqual(await corregirRegimenFacturaA({ tenantId: base.a.id, operador: "soporte", regimen: "A" }), { ok: true, regimen: "A" });
  await operatorPrisma.tenant.update({
    where: { id: base.b.id },
    data: { modules: ["arca", "clients", "reports"], arcaCuit: null, arcaPuntoVenta: null, arcaCondicionIva: null },
  });

  const FISCAL = { arcaCuit: true, arcaPuntoVenta: true, arcaCondicionIva: true, arcaRazonSocial: true, arcaDomicilioFiscal: true, arcaInicioActividades: true, arcaIibb: true } as const;
  const fiscalDe = (id: string) => operatorPrisma.tenant.findUnique({ where: { id }, select: FISCAL });
  const casaAntes = await fiscalDe(base.a.id);
  const sumar = () =>
    operatorPrisma.$transaction(
      (tx) => sumarAltaEnTx(tx, { casaId: base.a.id, localId: base.b.id, alias: "Banfield", cuit: "", puntoVenta: "4", actor: "operator:soporte", lote: "qa5" }, () => false),
      { timeout: 20_000 },
    );

  const marcar = (casaId: string) =>
    operatorPrisma.$transaction((tx) => marcarAltaParaLaRedEnTx(tx, { localId: base.b.id, casaId, actor: "operator:soporte" }));

  await t.test("refutador vuelta 4 · B ya existía: sin la marca del alta (o con la de otra casa) no entra ni recibe el CUIT", async () => {
    const rechazo = (e: unknown) => e instanceof AltaEnRedRechazada && e.message === MOTIVO_NO_ES_ALTA_DE_LA_RED;
    await assert.rejects(sumar(), rechazo);
    await marcar("otra-casa-de-la-plataforma"); // la marca de OTRA casa no sirve
    await assert.rejects(sumar(), rechazo);
    assert.equal((await fiscalDe(base.b.id))?.arcaCuit, null, "no se le copió el CUIT de la casa");
    assert.equal(await operatorPrisma.carteraCliente.count({ where: { tenantId: base.a.id, clienteTenantId: base.b.id } }), 0, "la casa no ve sus ventas");
    // Desde acá, B es el local que el alta creó para A (lo que deja `commitTenantAction`).
    await marcar(base.a.id);
  });

  await t.test("con OTRA condición cargada en el local, se rechaza y no queda nada escrito", async () => {
    await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { arcaCondicionIva: "MONOTRIBUTO" } });
    await assert.rejects(sumar(), (e: unknown) => e instanceof AltaEnRedRechazada && /otra condición frente al IVA/.test(e.message));
    const b = await fiscalDe(base.b.id);
    assert.equal(b?.arcaCuit, null, "ni el CUIT: la transacción se deshizo entera");
    assert.equal(await operatorPrisma.carteraCliente.count({ where: { tenantId: base.a.id, clienteTenantId: base.b.id } }), 0, "ni el vínculo");
    await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { arcaCondicionIva: null } });
  });

  await t.test("el alta en la red deja al local con lo del CUIT de la casa y su Factura A", async () => {
    const r = await sumar();
    assert.equal(r.condicionIva, "RESPONSABLE_INSCRIPTO");
    assert.deepEqual(await fiscalDe(base.b.id), { arcaCuit: CUIT_RI, arcaPuntoVenta: 4, ...DEL_CUIT });
    assert.equal(await leerRegimenFacturaA(base.b.id), "A");
    const auditoria = await tenantTransaction(
      (tx) => tx.auditLog.findFirst({ where: { tenantId: base.b.id, action: "fiscal.alta-en-red" }, select: { changes: true } }),
      { tenantId: base.b.id },
    );
    assert.deepEqual((auditoria?.changes as { heredadoDeLaCasa?: unknown })?.heredadoDeLaCasa, DEL_CUIT, "queda en la auditoría del local qué heredó");
    // Reintentar (el wizard lo permite) no escribe otra clase de Factura A.
    await sumar();
    const clases = await tenantTransaction((tx) => tx.auditLog.count({ where: { action: "fiscal.regimen_factura_a", entityId: base.b.id } }), { tenantId: base.b.id });
    assert.equal(clases, 1);
  });

  await t.test("la factura de prueba del local sale B a consumidor final y A a un inscripto (antes: C)", async () => {
    type R = Awaited<ReturnType<typeof emitirFacturaDePruebaGuardadaAction>>;
    const emitir = async (receptor: string) => {
      const s = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => emitirFacturaDePruebaGuardadaAction(receptor));
      assert.equal(s.tipo, "respuesta", JSON.stringify(s));
      return (s as { valor: R }).valor;
    };
    const b = await emitir("consumidor-final");
    assert.equal(b.ok && b.comprobante, "Factura B 0004-00000001", JSON.stringify(b));
    const a = await emitir("responsable-inscripto");
    assert.equal(a.ok && a.comprobante, "Factura A 0004-00000001", JSON.stringify(a));
    const tipos = await tenantTransaction(
      (tx) => tx.invoice.findMany({ where: { tenantId: base.b.id }, orderBy: { createdAt: "asc" }, select: { tipoComprobante: true, puntoVenta: true } }),
      { tenantId: base.b.id },
    );
    assert.deepEqual(tipos.map((f) => [f.tipoComprobante, f.puntoVenta]), [[6, 4], [1, 4]], "ninguna C (tipo 11)");
  });

  await t.test("aislamiento: la casa no cambió y no ve el registro fiscal del local, ni el local el de la casa", async () => {
    assert.deepEqual(await fiscalDe(base.a.id), casaAntes);
    assert.equal(await leerRegimenFacturaA(base.a.id), "A");
    const delLocalDesdeLaCasa = await tenantTransaction(
      (tx) => tx.auditLog.count({ where: { entityId: base.b.id, action: { in: ["fiscal.regimen_factura_a", "fiscal.alta-en-red"] } } }),
      { tenantId: base.a.id },
    );
    assert.equal(delLocalDesdeLaCasa, 0);
    const deLaCasaDesdeElLocal = await tenantTransaction(
      (tx) => tx.auditLog.count({ where: { entityId: base.a.id, action: "fiscal.regimen_factura_a" } }),
      { tenantId: base.b.id },
    );
    assert.equal(deLaCasaDesdeElLocal, 0);
    const facturasDeLaCasa = await tenantTransaction((tx) => tx.invoice.count({ where: { tenantId: base.a.id } }), { tenantId: base.a.id });
    assert.equal(facturasDeLaCasa, 0, "lo que emitió el local no aparece en la casa");
  });
});
