// ============================================================================
// ABONOS DEL CONTADOR A UN CLIENTE FACTOQUE — contra Postgres (base efímera, app_rls)
// ============================================================================
// El lote del estudio (A) a un cliente Factoque (B) respeta el tope del PLAN de B (Gratis 5,
// Plus 40) y no el tope genérico de Comerciante (certificación de la integración T1+T2, obs. 1).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const CUIT_CLIENTE = "20111111112";
const CUIT_RECEPTOR = "20222222223";

test("abono a un cliente Factoque: respeta el tope de SU plan (Gratis 5 frena; Plus deja pasar)", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = { auth: process.env.AUTH_SECRET, arca: process.env.ARCA_INVOICING_ENABLED };
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  delete process.env.ARCA_INVOICING_ENABLED;
  t.after(() => {
    if (antes.auth === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = antes.auth;
    if (antes.arca !== undefined) process.env.ARCA_INVOICING_ENABLED = antes.arca;
  });
  prepararAccionesDeServidor();
  const acciones = await import("@/lib/cartera-abonos-actions");
  const { mesDelNegocio } = await import("@/lib/libros/fecha-fiscal");
  const duenio = await prismaComoDuenio(base);
  const mes = mesDelNegocio();

  await duenio.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  await duenio.tenant.update({
    where: { id: base.b.id },
    data: { blueprintId: "facturita", plan: null, arcaCuit: CUIT_CLIENTE, arcaPuntoVenta: 3, arcaCondicionIva: "MONOTRIBUTO", arcaHomologacion: true },
  });
  await duenio.carteraCliente.create({ data: { tenantId: base.a.id, clienteTenantId: base.b.id, alias: "Yoga Ana", estado: "activa" } });
  // 5 del mes ya usadas (Gratis = 5). Ocupan cupo: no rechazadas, sin comprobante asociado.
  for (let i = 0; i < 5; i++) {
    await duenio.invoice.create({
      data: { tenantId: base.b.id, puntoVenta: 3, concepto: 2, docTipo: 99, docNro: "0", fecha: "20261108", neto: 100, iva: 0, total: 100, status: "PENDING" },
    });
  }
  const comoEstudio = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, fn);
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    clienteTenantId: base.b.id, descripcion: "Honorarios", importe: "1.000", concepto: "servicios", receptorNombre: "Cliente",
    receptorDocTipo: "CUIT", receptorDocNro: CUIT_RECEPTOR, receptorCondicionIva: "MONOTRIBUTO", diasVencimiento: "10", desde: mes, hasta: "",
  })) fd.set(k, v);
  const regla = await comoEstudio(() => acciones.guardarReglaAction(null, fd));
  assert.ok(regla.tipo === "respuesta" && (regla.valor as { ok: boolean }).ok, JSON.stringify(regla));

  const lote = async () => {
    const r = await comoEstudio(() => acciones.emitirLoteAction(mes));
    assert.equal(r.tipo, "respuesta");
    const v = r.valor as Awaited<ReturnType<typeof acciones.emitirLoteAction>>;
    assert.ok(v.ok, JSON.stringify(v));
    return v.resultado;
  };
  const gratis = await lote();
  assert.equal(gratis.emitidas, 0, "Gratis con 5/5: el abono no pasa el tope de Factoque");
  assert.equal(gratis.porLimite, 1);
  assert.equal(await duenio.invoice.count({ where: { tenantId: base.b.id } }), 5);

  await duenio.tenant.update({ where: { id: base.b.id }, data: { plan: "factoque-plus" } });
  const plus = await lote();
  assert.equal(plus.emitidas, 1, "en Plus (40) el abono sale");
  assert.equal(await duenio.invoice.count({ where: { tenantId: base.b.id } }), 6);
});
