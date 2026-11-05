// ============================================================================
// FACTUROQUE · dos toques contra una base efímera con RLS y ARCA simulado (stub)
// ============================================================================
//
// El camino de verdad: guardar un producto → emitir desde el atajo (la acción real, el motor del
// Core, el despacho) y mirar las filas que quedaron.
//  · Doble toque: dos pedidos SIMULTÁNEOS con la misma clave dejan UNA factura, UN envío y UN CAE.
//  · La clave es por negocio: la misma clave en otro negocio no le devuelve una factura ajena.
//  · Mis productos y «Repetir la última» son del negocio: el otro no los ve ni los puede sacar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  const duenio = await prismaComoDuenio(base);
  for (const n of [base.a, base.b]) {
    await duenio.tenant.update({
      where: { id: n.id },
      data: { arcaCuit: "20111111112", arcaPuntoVenta: 2, arcaHomologacion: true, arcaCondicionIva: "MONOTRIBUTO", blueprintId: "facturita" },
    });
  }
  const acciones = await import("@/lib/facturita-actions");
  const como = <T,>(negocio: typeof base.a, fn: () => Promise<T>) =>
    ejecutarAccion({ negocio, usuario: negocio.duenia }, fn).then((s) => {
      assert.equal(s.tipo, "respuesta", JSON.stringify(s));
      return (s as { valor: T }).valor;
    });
  return { base, duenio, acciones, como };
}

test("dos toques: guardar → tocar el producto → emitir por $X, y el doble toque deja UNA factura", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio, acciones, como } = p;
  const { emisionDesdeAtajo, nuevaClaveEmision, esCaminoCorto } = await import("@/lib/facturita-atajos");

  const g = await como(base.a, () => acciones.guardarAtajoFacturitaAction({ detalle: "Torta de chocolate", precio: "25.000" }));
  assert.ok(g.ok, JSON.stringify(g));
  const { productos } = await como(base.a, () => acciones.atajosFacturitaAction());
  assert.equal(productos.length, 1);
  const atajo = productos[0];
  assert.ok(esCaminoCorto(atajo, "MONOTRIBUTO"));

  // Toque 2 dos veces a la vez (el dedo que rebota): misma clave, en paralelo.
  const clave = nuevaClaveEmision();
  const todos = await Promise.all(Array.from({ length: 6 }, () =>
    como(base.a, () => acciones.emitirFacturitaAction(emisionDesdeAtajo(atajo, clave))),
  ));
  const [r1, r2] = todos;
  assert.equal(new Set(todos.map((r) => r.ok && r.invoiceId)).size, 1, "todos devuelven la MISMA factura");
  assert.ok(r1.ok && r2.ok, JSON.stringify([r1, r2]));
  assert.equal(r1.invoiceId, r2.invoiceId, "los dos pedidos devuelven la MISMA factura");

  const facturas = await duenio.invoice.findMany({ where: { tenantId: base.a.id }, select: { id: true, status: true, cae: true, total: true, docTipo: true, tipoComprobante: true } });
  assert.equal(facturas.length, 1, "una sola factura");
  assert.equal(facturas[0].status, "AUTHORIZED");
  assert.ok(facturas[0].cae, "con CAE (de prueba)");
  assert.equal(Number(facturas[0].total), 25000);
  assert.equal(facturas[0].docTipo, 99, "consumidor final");
  assert.equal(facturas[0].tipoComprobante, 11, "Factura C");
  const envios = await duenio.outboxEvent.count({ where: { tenantId: base.a.id, payload: { path: ["invoiceId"], equals: facturas[0].id } } });
  assert.equal(envios, 1, "un solo envío a ARCA");

  // El reintento después (red que se cortó) tampoco crea otra ni gasta otra del tope.
  const r3 = await como(base.a, () => acciones.emitirFacturitaAction(emisionDesdeAtajo(atajo, clave)));
  assert.ok(r3.ok && r3.invoiceId === r1.invoiceId && r3.repetida === true);
  assert.equal(r3.ok && r3.limite.usadas, 1);

  // Una venta nueva del mismo producto (clave nueva) sí es otra factura.
  const r4 = await como(base.a, () => acciones.emitirFacturitaAction(emisionDesdeAtajo(atajo, nuevaClaveEmision())));
  assert.ok(r4.ok && r4.invoiceId !== r1.invoiceId);

  // «Repetir la última» aparece y es la de consumidor final.
  const { ultima } = await como(base.a, () => acciones.atajosFacturitaAction());
  assert.deepEqual(ultima && { detalle: ultima.detalle, precio: ultima.precio }, { detalle: "Torta de chocolate", precio: 25000 });

  // La clave es por negocio: la misma en el otro negocio emite SU factura, no le devuelve la ajena.
  const rb = await como(base.b, () => acciones.emitirFacturitaAction(emisionDesdeAtajo(atajo, clave)));
  assert.ok(rb.ok && rb.invoiceId !== r1.invoiceId);
  const deB = await duenio.invoice.findUniqueOrThrow({ where: { id: rb.ok ? rb.invoiceId : "" }, select: { tenantId: true } });
  assert.equal(deB.tenantId, base.b.id);
});

test("Mis productos es del negocio: el otro no lo ve ni lo saca; clave mal formada no emite", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio, acciones, como } = p;
  const g = await como(base.a, () => acciones.guardarAtajoFacturitaAction({ detalle: "Clase de yoga", precio: 8000, concepto: "servicios" }));
  assert.ok(g.ok);
  const deB = await como(base.b, () => acciones.atajosFacturitaAction());
  assert.equal(deB.productos.some((a) => a.detalle === "Clase de yoga"), false, "B no ve los productos de A");
  const quitarAjeno = await como(base.b, () => acciones.quitarAtajoFacturitaAction(g.ok ? g.atajo.id : ""));
  assert.equal(quitarAjeno.ok, false, "B no puede sacar un producto de A");
  const sigue = await duenio.product.findUniqueOrThrow({ where: { id: g.ok ? g.atajo.id : "" }, select: { active: true, unit: true } });
  assert.deepEqual(sigue, { active: true, unit: "servicio" });
  const quitar = await como(base.a, () => acciones.quitarAtajoFacturitaAction(g.ok ? g.atajo.id : ""));
  assert.equal(quitar.ok, true);

  const antes = await duenio.invoice.count({ where: { tenantId: base.a.id } });
  const mala = await como(base.a, () => acciones.emitirFacturitaAction({ descripcion: "Torta", total: 100, claveEmision: "x" }));
  assert.equal(mala.ok, false);
  assert.equal(await duenio.invoice.count({ where: { tenantId: base.a.id } }), antes, "no se creó factura");
});
