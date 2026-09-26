// ============================================================================
// QA vuelta 6 — el IVA de UN CUIT con dos locales, las percepciones y las facturas de prueba, contra
// Postgres (base efímera con RLS, src/test/base-efimera.ts).
// ============================================================================
//
// A es la casa de una PyME (CUIT X, punto de venta 3) y B su segundo local (mismo CUIT, punto de venta
// 4). C es OTRO contribuyente al que un vínculo viejo (de antes de la regla del mismo CUIT) dejó en la
// red de A. Se ejecuta lo mismo que corren la dueña y la contadora: `leerDatosPaquete` (el paquete de
// Cierre del mes y el de /contador/paquete) y `leerLibroIvaDelCuit` (la pantalla del Libro IVA).
//   1. las ventas del pv 4 llegan al libro y al paquete de la casa; las de C, nunca;
//   2. el paquete trae las percepciones con el mismo total que la pantalla de recibidos;
//   3. la factura con CAE simulado (STUB) queda aparte, «de prueba», y no suma al débito.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const CUIT = "30712456082";
const OTRO_CUIT = "27384412675";

test("QA vuelta 6 · el libro y el paquete de la casa suman el local del mismo CUIT, sin otro CUIT, con percepciones y sin las de prueba", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { tenantTransaction } = await import("@/lib/rls");
  const { leerDatosPaquete } = await import("@/lib/cierre-mes/paquete-lectura");
  const { armarPaquete } = await import("@/lib/cierre-mes/paquete");
  const { leerComprasConFactura } = await import("@/lib/contador/recibidos-db");
  const { resumirRecibidos } = await import("@/lib/contador/recibidos-formato");
  const { pesosCsv } = await import("@/lib/libros/csv-ar");
  base.alBorrar(() => operatorPrisma.$disconnect());

  const RI = { arcaCondicionIva: "RESPONSABLE_INSCRIPTO" };
  await operatorPrisma.tenant.update({ where: { id: base.a.id }, data: { modules: ["arca", "clients", "reports", "multilocal"], arcaCuit: CUIT, arcaPuntoVenta: 3, ...RI } });
  await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { modules: ["arca", "clients", "reports"], arcaCuit: CUIT, arcaPuntoVenta: 4, ...RI } });
  const sufijo = base.a.id.slice(-6).toLowerCase();
  const c = await operatorPrisma.tenant.create({
    data: { name: "Lucía Benítez Diseño", slug: `lucia-${sufijo}`, subdomain: `lucia-${sufijo}`, arcaCuit: OTRO_CUIT, arcaPuntoVenta: 1, arcaCondicionIva: "MONOTRIBUTO", modules: ["arca"] },
  });
  await operatorPrisma.carteraCliente.create({ data: { tenantId: base.a.id, clienteTenantId: base.b.id, alias: "Bernal", estado: "activa" } });
  await operatorPrisma.carteraCliente.create({ data: { tenantId: base.a.id, clienteTenantId: c.id, alias: "Vínculo viejo", estado: "activa" } });

  const factura = (tenantId: string, tipo: number, pv: number, cae: string, iva: number) =>
    operatorPrisma.invoice.create({
      data: { tenantId, status: "AUTHORIZED", tipoComprobante: tipo, puntoVenta: pv, numero: 1, concepto: 1, docTipo: 99, docNro: "0", fecha: "20260815", neto: 1000, iva, total: 1000 + iva, cae },
    });
  await factura(base.a.id, 6, 3, "76123456789012", 210); // B 0003-00000001, real
  await factura(base.a.id, 1, 3, "STUB00000001", 210); // A 0003-00000001, modo prueba
  await factura(base.b.id, 1, 4, "76123456789013", 210); // A 0004-00000001, del local (mismo CUIT)
  await factura(c.id, 11, 1, "76123456789014", 0); // C 0001-00000001, de OTRO CUIT

  // La misma factura de proveedor, cargada en la casa y en el local: es UNA compra del CUIT.
  const compra = (tenantId: string, code: number) =>
    operatorPrisma.stockPurchase.create({
      data: {
        tenantId, code, kind: "COMPRA", supplier: "FERRETERIA NORTE SA", totalCost: 1330, createdBy: "qa",
        facturaTipo: 1, facturaPuntoVenta: 7, facturaNumero: 900, facturaFecha: "20260810", facturaCuit: "30700000008",
        facturaNeto: 1000, facturaIva: 210, facturaTotal: 1330, facturaOtrosTributos: 90, facturaPercepcionIibb: 30,
        notes: "Importado de Mis Comprobantes Recibidos",
      },
    });
  await compra(base.a.id, 1);
  await compra(base.b.id, 1);

  const ahora = new Date("2026-09-10T12:00:00Z");
  const paquete = armarPaquete(await leerDatosPaquete(base.a.id, "2026-08", { negocio: "Río Chico", pasos: null, ahora }));

  await t.test("1 · las ventas del segundo local llegan al paquete de la casa; las de otro CUIT, no", () => {
    assert.match(paquete, /^2026-08-15;Factura A;00004-00000001;/m, "la A del punto de venta 4");
    assert.match(paquete, /^2026-08-15;Factura B;00003-00000001;/m);
    assert.match(paquete, /^IVA débito \(comprobantes emitidos\);420,00\r?$/m, "210 de la casa + 210 del local, sin la de prueba");
    assert.doesNotMatch(paquete, /00001-00000001/, "nada del negocio de otro CUIT");
    assert.doesNotMatch(paquete, /Lucía|Benítez/);
    assert.match(paquete, /^Locales del mismo CUIT que suma este libro;.*punto de venta 3.* y .*punto de venta 4/m);
  });

  await t.test("2 · el paquete trae las percepciones con el mismo total que la pantalla de recibidos", async () => {
    const pantalla = resumirRecibidos((await tenantTransaction((tx) => leerComprasConFactura(tx, base.a.id, "2026-08"), { tenantId: base.a.id })).compras);
    assert.equal(pantalla.otrosTributos, 120);
    assert.match(paquete, new RegExp(`^Percepciones y otros tributos \\(facturas de proveedor\\);${pesosCsv(pantalla.otrosTributos)}\\r?$`, "m"));
    assert.match(paquete, /^IVA crédito \(facturas de proveedor\);210,00\r?$/m, "la factura cargada en los dos negocios cuenta una vez");
  });

  await t.test("3 · la factura con CAE simulado queda aparte, de prueba, y no suma", () => {
    assert.match(paquete, /^FACTURAS DE PRUEBA \(CAE simulado/m);
    assert.match(paquete, /^2026-08-15;Factura A;00003-00000001;Consumidor final;Consumidor final;1210,00\r?$/m);
    assert.match(paquete, /^Facturas de prueba;1 con CAE simulado/m);
  });

  await t.test("4 · la pantalla del Libro IVA de la casa dice lo mismo; el local solo ve lo suyo; RLS intacto", async () => {
    const { leerLibroIvaDelCuit } = await import("./libro-iva-red");
    const casa = await leerLibroIvaDelCuit(base.a.id, "2026-08");
    assert.deepEqual(casa.comprobantes.map((x) => x.numero), ["00003-00000001", "00004-00000001"]);
    assert.equal(casa.resumen.ivaDebito, 420);
    assert.equal(casa.resumen.dePruebaCount, 1);
    assert.equal(casa.resumen.comprasOtrosTributos, 120);
    assert.deepEqual(casa.negocios?.map((n) => n.puntoVenta), [3, 4]);
    const local = await leerLibroIvaDelCuit(base.b.id, "2026-08");
    assert.deepEqual(local.comprobantes.map((x) => x.numero), ["00004-00000001"], "el local no es casa: no lee a nadie");
    const cruzado = await tenantTransaction((tx) => tx.invoice.count({ where: { tenantId: base.b.id } }), { tenantId: base.a.id });
    assert.equal(cruzado, 0, "con el GUC de la casa no se leen las facturas del local: cada una va en su transacción");
  });

  await t.test("5 · refutador vuelta 4 · el botón del Libro IVA del Inicio de la casa suma el local, igual que la pantalla", async () => {
    const { libroIva } = await import("@/apps/kpis/finanzas.server");
    const { fmtMoneyARS } = await import("@/components/ui/format");
    const { leerLibroIvaDelCuit } = await import("./libro-iva-red");
    const ctx = (tx: unknown, esCasaDeRed: boolean) => ({
      db: tx as never, tenantId: base.a.id, hoy: "2026-08-20", ahora: new Date("2026-08-20T15:00:00Z"), esMostrador: true,
      sustantivo: { uno: "producto", varios: "productos" }, monto: true, esCasaDeRed,
    });
    const pantalla = await leerLibroIvaDelCuit(base.a.id, "2026-08");
    const boton = await tenantTransaction((tx) => libroIva(ctx(tx, true)), { tenantId: base.a.id });
    assert.ok(boton && "valor" in boton, JSON.stringify(boton));
    assert.equal(boton.valor, fmtMoneyARS(pantalla.resumen.ivaDebito, 0), "420 (casa + local), el débito de la pantalla; no 210");
    assert.match(boton.detalle ?? "", /a pagar/);
    // El local no es casa: su botón es lo suyo (210), y un negocio sin red no lee a nadie más.
    const delLocal = await tenantTransaction((tx) => libroIva({ ...ctx(tx, false), tenantId: base.b.id }), { tenantId: base.b.id });
    assert.equal(delLocal && "valor" in delLocal ? delLocal.valor : null, fmtMoneyARS(210, 0));
  });

  await t.test("6 · refutador vuelta 4 · la casa no congela si el local del mismo CUIT tiene días con movimientos sin cerrar", async () => {
    const { leerHechosCierreMes } = await import("@/lib/cierre-mes/lectura");
    const { evaluarPasos, validarCongelar, estadoDesdeAuditoria } = await import("@/lib/cierre-mes/cierre-mes");
    const leer = () => tenantTransaction((tx) => leerHechosCierreMes(tx, base.a.id, "2026-08", { esMostrador: true }), { tenantId: base.a.id });
    const sinCongelar = estadoDesdeAuditoria([]);
    const congelar = (pasos: ReturnType<typeof evaluarPasos>) =>
      validarCongelar({ mes: "2026-08", hoy: new Date("2026-09-10T12:00:00Z"), pasos, estado: sinCongelar, confirmaPendientes: true });
    // Sin movimientos en ningún lado: se puede (los días vacíos se cierran al congelar).
    assert.equal(congelar(evaluarPasos(await leer(), sinCongelar)).ok, true);
    // El local vende el 20/08 y no cierra la caja: la casa NO puede congelar (su IVA va en el paquete).
    await operatorPrisma.cashMovement.create({
      data: { tenantId: base.b.id, type: "INGRESO", amount: 5000, method: "EFECTIVO", reason: "venta de mostrador", occurredAt: new Date("2026-08-20T15:00:00Z"), createdBy: "user:qa" },
    });
    const pasos = evaluarPasos(await leer(), sinCongelar);
    const dias = pasos.find((p) => p.id === "dias-cerrados")!;
    assert.deepEqual([dias.estado, dias.bloquea], ["pendiente", true]);
    assert.match(dias.detalle, /\(punto de venta 4\) tiene días con movimientos de caja sin cerrar hasta el 31\/08\/2026/);
    assert.doesNotMatch(dias.detalle, /Lucía|Benítez/, "el negocio de otro CUIT no cuenta");
    const v = congelar(pasos);
    assert.equal(v.ok, false);
    assert.match(v.ok ? "" : v.error, /punto de venta 4/);
  });

  await t.test("7 · refutador vuelta 4 · el FINAL de un mes congelado no cambia si el local recibe después un CAE con fecha del mes", async () => {
    const { ACCION_CONGELAR, CIERRE_MES_ENTITY } = await import("@/lib/cierre-mes/cierre-mes");
    const { TITULO_DESPUES_DEL_CONGELADO } = await import("./libro-iva-export");
    const { leerLibroIvaDelCuit } = await import("./libro-iva-red");
    const congeladoEl = new Date(Date.now() + 1_000);
    await operatorPrisma.auditLog.create({
      data: { tenantId: base.a.id, actor: "user:qa", action: ACCION_CONGELAR, entity: CIERRE_MES_ENTITY, entityId: "2026-08", changes: { por: "Ana" }, channel: "admin", createdAt: congeladoEl },
    });
    const final = () => leerDatosPaquete(base.a.id, "2026-08", { negocio: "Río Chico", pasos: null, ahora }).then(armarPaquete);
    const antes = await final();
    assert.match(antes, /^Estado;Versión final/m);
    assert.match(antes, /^IVA débito \(comprobantes emitidos\);420,00\r?$/m);
    // Después del congelado, ARCA le autoriza al local una B con fecha 31/08 (un CAE que llegó tarde).
    await operatorPrisma.invoice.create({
      data: {
        tenantId: base.b.id, status: "AUTHORIZED", tipoComprobante: 6, puntoVenta: 4, numero: 2, concepto: 1, docTipo: 99, docNro: "0",
        fecha: "20260831", neto: 1000, iva: 210, total: 1210, cae: "76123456789015", authorizedAt: new Date(congeladoEl.getTime() + 60_000),
      },
    });
    const despues = await final();
    assert.match(despues, /^IVA débito \(comprobantes emitidos\);420,00\r?$/m, "el FINAL es la foto del congelado: no pasa a 630");
    const i = despues.indexOf(TITULO_DESPUES_DEL_CONGELADO);
    assert.ok(i > 0, "lo autorizado después va aparte, a la vista");
    assert.match(despues.slice(i), /^2026-08-31;Factura B;00004-00000002;/m);
    // La pantalla (sin corte) muestra lo de hoy: ahí sí está.
    assert.equal((await leerLibroIvaDelCuit(base.a.id, "2026-08")).resumen.ivaDebito, 630);
  });
});
