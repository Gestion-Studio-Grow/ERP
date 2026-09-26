// ============================================================================
// COMPROBANTES RECIBIDOS — la action real contra Postgres (frente C2)
// ============================================================================
//
// Base efímera (src/test/base-efimera.ts): A es el estudio contable (módulo `cartera`), B es su
// cliente. Se corre `importarRecibidosAction` TAL CUAL, con la sesión de la dueña de A, sobre el
// archivo de ejemplo anonimizado, y se mide en la base con el rol dueño (sin RLS) y con el rol de
// la app (con RLS).
//
// Qué se prueba: aislamiento (fuera de la cartera, pausado, al revés desde B, lectura cruzada
// con RLS), que no se duplica (re-importar el mismo archivo), que no se mueve stock, que la nota
// de crédito resta, el resumen en cifras, y que un archivo de otro CUIT no carga nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const CUIT_DE_B = "30700000067";
const archivoDeEjemplo = () => readFileSync(join(__dirname, "fixtures", "recibidos-por-alicuota.csv"));

function formulario(cliente: string, contenido: Buffer | string, nombre = "recibidos-2026-08.csv"): FormData {
  const f = new FormData();
  f.set("cliente", cliente);
  f.set("archivo", new File([typeof contenido === "string" ? contenido : new Uint8Array(contenido)], nombre, { type: "text/csv" }));
  return f;
}

test("importar recibidos: aislado por cartera, sin duplicar, sin mover stock y con el resumen en cifras", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  t.after(() => {
    if (antes === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = antes;
  });
  prepararAccionesDeServidor();

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { tenantTransaction } = await import("@/lib/rls");
  const { importarRecibidosAction } = await import("./recibidos-actions");
  const { leerComprasConFactura, ACCION_IMPORTACION } = await import("./recibidos-db");
  base.alBorrar(() => operatorPrisma.$disconnect());

  await operatorPrisma.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { arcaCuit: CUIT_DE_B } });

  const comoEstudio = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, fn);
  const comprasDe = (tenantId: string) => operatorPrisma.stockPurchase.count({ where: { tenantId } });
  const stockDe = async (tenantId: string) => ({
    movimientos: await operatorPrisma.stockMovement.count({ where: { tenantId } }),
    renglones: await operatorPrisma.stockPurchaseItem.count({ where: { tenantId } }),
    productos: JSON.stringify(await operatorPrisma.product.findMany({ where: { tenantId }, select: { id: true, stock: true }, orderBy: { id: "asc" } })),
  });
  const valor = <R>(s: { tipo: string; valor?: R }) => {
    assert.equal(s.tipo, "respuesta", JSON.stringify(s));
    return s.valor as R;
  };
  type R = Awaited<ReturnType<typeof importarRecibidosAction>>;

  const comprasDeBAntes = await comprasDe(base.b.id);
  const stockDeBAntes = await stockDe(base.b.id);

  // 1) B todavía no está en la cartera de A: nada.
  const fuera = valor<R>(await comoEstudio(() => importarRecibidosAction(formulario(base.b.id, archivoDeEjemplo()))));
  assert.deepEqual(fuera, { ok: false, error: "Ese cliente no está en tu cartera." });
  assert.equal(await comprasDe(base.b.id), comprasDeBAntes);

  // Un id inventado responde IGUAL (no se infiere si el negocio existe).
  const inventado = valor<R>(await comoEstudio(() => importarRecibidosAction(formulario("no-existe-123", archivoDeEjemplo()))));
  assert.deepEqual(inventado, fuera);

  // 2) B entra a la cartera de A. Un archivo de OTRO CUIT no carga nada.
  await operatorPrisma.carteraCliente.create({ data: { tenantId: base.a.id, clienteTenantId: base.b.id, alias: "Almacén de B" } });
  const deOtro = `Mis Comprobantes Recibidos - CUIT 30-70000005-9\n${archivoDeEjemplo().toString("utf8")}`;
  const otroCuit = valor<R>(await comoEstudio(() => importarRecibidosAction(formulario(base.b.id, deOtro))));
  assert.equal(otroCuit.ok, false);
  assert.match((otroCuit as { error: string }).error, /30-70000005-9.*Almacén de B.*30-70000006-7.*No se cargó nada/);
  assert.equal(await comprasDe(base.b.id), comprasDeBAntes);

  // 3) La importación de verdad.
  const hecha = valor<R>(await comoEstudio(() => importarRecibidosAction(formulario(base.b.id, archivoDeEjemplo()))));
  assert.equal(hecha.ok, true, JSON.stringify(hecha));
  const ok = hecha as Extract<R, { ok: true }>;
  assert.equal(ok.resumen.cantidad, 8, "las 7 facturas y notas + el Tique factura A (81), que da crédito fiscal");
  assert.equal(ok.resumen.notasDeCredito, 1);
  assert.equal(ok.resumen.aRevisar, 1);
  assert.equal(ok.resumen.sinCreditoFiscal, 2);
  assert.equal(ok.resumen.neto, 105050);
  assert.equal(ok.resumen.iva, 21790.5);
  assert.equal(ok.resumen.otrosTributos, 90);
  assert.equal(ok.resumen.total, 133140.5);
  assert.deepEqual(ok.resumen.ivaPorAlicuota, [
    { alicuotaId: 4, etiqueta: "10,5%", base: 2000, importe: 210 },
    { alicuotaId: 5, etiqueta: "21%", base: 102050, importe: 21430.5 },
  ]);
  // Lo marcado va aparte y no suma (QA vuelta 5): el crédito es 210 + 21.430,50, no el IVA total.
  assert.equal(ok.resumen.ivaARevisar, 150);
  assert.equal(ok.resumen.ivaSinAlicuota, 0);
  assert.equal(ok.resumen.creditoFiscal, 21640.5);
  assert.equal(ok.rechazadosTotal, 2);
  assert.equal(ok.yaCargadosTotal, 0);
  // La fila 8 repite la 2 (se toma una sola vez) y la 10 tiene un error: no se mezclan (QA vuelta 7).
  assert.equal(ok.repetidosTotal, 1);
  assert.equal(ok.conErroresTotal, 1);
  assert.deepEqual(ok.rechazados.map((x) => x.fila), [8, 10]);
  assert.equal(ok.aRevisar.length, 1);
  assert.match(ok.aRevisar[0].comprobante, /Factura A 00007-00000900 · FERRETERIA NORTE SA/);

  assert.equal(await comprasDe(base.b.id), comprasDeBAntes + 8);
  assert.equal(await comprasDe(base.a.id), 0, "nada quedó en el estudio");
  assert.deepEqual(await stockDe(base.b.id), stockDeBAntes, "no se movió stock ni hay renglones de mercadería");

  const nc = await operatorPrisma.stockPurchase.findFirst({ where: { tenantId: base.b.id, facturaTipo: 3 } });
  assert.equal(nc?.totalCost, -121, "la nota de crédito resta en los listados de compras");
  assert.equal(nc?.facturaTotal?.toNumber(), 121);
  assert.equal(nc?.createdBy, `estudio:${base.a.id}`);
  const dolar = await operatorPrisma.stockPurchase.findFirst({ where: { tenantId: base.b.id, facturaNumero: 500 } });
  assert.equal(dolar?.facturaTotal?.toNumber(), 121060.5);
  assert.match(dolar?.notes ?? "", /Moneda DOL, tipo de cambio 1000,5/);

  const auditoria = await operatorPrisma.auditLog.findFirst({ where: { tenantId: base.b.id, action: ACCION_IMPORTACION } });
  assert.equal(auditoria?.actor, `estudio:${base.a.id}`, "la dueña ve quién cargó sus compras");
  assert.deepEqual((auditoria?.changes as { cargados?: number })?.cargados, 8);

  // 4) El mismo archivo otra vez: no duplica, dice cuáles ya estaban.
  const otraVez = valor<R>(await comoEstudio(() => importarRecibidosAction(formulario(base.b.id, archivoDeEjemplo()))));
  assert.equal(otraVez.ok, true);
  const ok2 = otraVez as Extract<R, { ok: true }>;
  assert.equal(ok2.resumen.cantidad, 0);
  assert.equal(ok2.rechazadosTotal, 10);
  assert.equal(ok2.rechazados.filter((x) => /Ya estaba cargado/.test(x.motivo)).length, 8);
  // El aviso distingue lo que ya estaba (no se duplica) de lo que tiene errores (QA 26/09).
  assert.equal(ok2.yaCargadosTotal, 8);
  assert.equal(ok2.repetidosTotal, 1);
  assert.equal(ok2.conErroresTotal, 1);
  const { avisoDeLaCarga } = await import("@/lib/contador/recibidos-aviso");
  assert.equal(
    avisoDeLaCarga({
      entraron: 0,
      notasDeCredito: 0,
      aRevisar: 0,
      yaCargados: ok2.yaCargadosTotal,
      repetidosEnElArchivo: ok2.repetidosTotal,
      conErrores: ok2.conErroresTotal,
    }),
    "No entró ningún comprobante nuevo. 8 ya estaban cargados (no se duplican). 1 fila estaba repetida en el archivo (se toma una sola vez). 1 con errores: no se cargó (el detalle está abajo).",
  );
  assert.equal(await comprasDe(base.b.id), comprasDeBAntes + 8);

  // 5) Lectura del mes con RLS: desde B se ven las 8; con el GUC de A, ninguna de B.
  const delMes = await tenantTransaction((tx) => leerComprasConFactura(tx, base.b.id, "2026-08"), { tenantId: base.b.id });
  assert.equal(delMes.completa, true);
  assert.equal(delMes.compras.length, 8);
  assert.ok(delMes.compras.every((c) => c.importada));
  assert.equal(delMes.compras.find((c) => c.numero === 900)?.aRevisar?.includes("21%"), true);
  const cruzada = await tenantTransaction((tx) => leerComprasConFactura(tx, base.b.id, "2026-08"), { tenantId: base.a.id });
  assert.equal(cruzada.compras.length, 0, "RLS: con el negocio A no se leen compras de B");

  // 5b) El listado exportable (la ruta del CSV, tal cual): el estudio baja las 8 de su cliente;
  // un id inventado o el propio estudio responden igual que «no está», y un mes mal escrito, 400.
  const { GET } = await import("@/app/contador/cliente/[clienteId]/recibidos/csv/route");
  type Bajada = { status: number; cuerpo: string; tipo: string };
  const bajar = (clienteId: string, mes = "2026-08") => async (): Promise<Bajada> => {
    const r = await GET(new Request(`http://qa.local/contador/cliente/${clienteId}/recibidos/csv?mes=${mes}`), {
      params: Promise.resolve({ clienteId }),
    });
    return { status: r.status, cuerpo: await r.text(), tipo: r.headers.get("content-type") ?? "" };
  };
  const csvDeB = valor<Bajada>(await comoEstudio(bajar(base.b.id)));
  assert.equal(csvDeB.status, 200);
  assert.match(csvDeB.tipo, /text\/csv/);
  assert.equal(csvDeB.cuerpo.trim().split("\r\n").length, 1 + 8, "títulos + las 8 compras del mes");
  assert.match(csvDeB.cuerpo, /FERRETERIA NORTE SA/);
  const csvInventado = valor<Bajada>(await comoEstudio(bajar("no-existe-123")));
  const csvPropio = valor<Bajada>(await comoEstudio(bajar(base.a.id)));
  assert.deepEqual([csvInventado.status, csvInventado.cuerpo], [404, "Ese cliente no está en tu cartera."]);
  assert.deepEqual([csvPropio.status, csvPropio.cuerpo], [404, "Ese cliente no está en tu cartera."]);
  assert.equal(valor<Bajada>(await comoEstudio(bajar(base.b.id, "agosto"))).status, 400);
  const csvAlReves = valor<Bajada>(await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, bajar(base.a.id)));
  assert.equal(csvAlReves.status, 404, "B no tiene cartera: no baja las compras de nadie");
  assert.doesNotMatch(csvAlReves.cuerpo, /FERRETERIA|;/);

  // 6) Al revés: B no tiene cartera, no puede cargarle nada a A.
  const alReves = valor<R>(
    await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => importarRecibidosAction(formulario(base.a.id, archivoDeEjemplo()))),
  );
  assert.equal(alReves.ok, false);
  assert.equal(await comprasDe(base.a.id), 0);

  // 7) Pausado: se consulta, no se le carga nada.
  await operatorPrisma.carteraCliente.update({
    where: { tenantId_clienteTenantId: { tenantId: base.a.id, clienteTenantId: base.b.id } },
    data: { estado: "pausada" },
  });
  const pausado = valor<R>(await comoEstudio(() => importarRecibidosAction(formulario(base.b.id, archivoDeEjemplo()))));
  assert.equal(pausado.ok, false);
  assert.match((pausado as { error: string }).error, /pausado/);

  // 8) Recepción del estudio (sin `cartera:manage`) no llega a la acción.
  const recepcion = await ejecutarAccion({ negocio: base.a, usuario: base.a.recepcion }, () =>
    importarRecibidosAction(formulario(base.b.id, archivoDeEjemplo())),
  );
  assert.notEqual(recepcion.tipo, "respuesta", "sin permiso, la acción corta antes de responder");
  assert.equal(await comprasDe(base.b.id), comprasDeBAntes + 8);
});
