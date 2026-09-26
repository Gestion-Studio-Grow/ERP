// ============================================================================
// FICHA DEL CLIENTE contra Postgres: «Pedir a Soporte GSG» (GSG-22) y el límite del plan real.
// ============================================================================
//
// Base efímera propia (src/test/base-efimera.ts). A hace de estudio contable (módulo `cartera`) y
// tiene a B en su cartera. Se corren las actions TAL CUAL, con la sesión de la dueña, y se mide
// en la base:
//   · el pedido queda en la auditoría de A, una sola vez aunque se haga doble clic simultáneo;
//   · un cliente que no es de la cartera recibe el mismo error que uno inexistente, y no escribe;
//   · B (sin cartera) no puede pedir nada y no se entera de los pedidos de A;
//   · la recepcionista de A (sin permiso de cartera) no llega a la action;
//   · el límite de facturas automáticas de la ficha sale del plan de B (o de la excepción de GSG), no
//     del 159 fijo, y la columna del negocio sólo lo baja;
//   · el pedido le llega a Soporte GSG (/operador/pedidos-cartera), que lo cierra una vez; la
//     contadora ve la respuesta y puede volver a pedirlo; CH sólo la cierra el dueño.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("pedir a Soporte GSG: sólo por clientes de la cartera, una vez, y el límite de la ficha sale del plan", async (t) => {
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
  const { pedirASoporteAction } = await import("./pedido-soporte-actions");
  const { pedidosAbiertosDelEstudio, pedidosDelEstudio } = await import("./pedido-soporte.server");
  const { listarPedidosDeCartera, resolverPedidoDeCartera } = await import("@/app/operador/(console)/pedidos-cartera/pedidos-cartera.server");
  const { filaDeExcepcionDeLimite } = await import("@/planes/limites");
  const { monitorCarteraAction } = await import("@/lib/cartera-actions");
  const { ACCION_PEDIDO_SOPORTE, ACCION_PEDIDO_RESUELTO } = await import("./pedido-soporte");
  const { planPorId } = await import("@/planes/catalogo");
  base.alBorrar(() => operatorPrisma.$disconnect());

  await operatorPrisma.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  await operatorPrisma.carteraCliente.create({ data: { tenantId: base.a.id, clienteTenantId: base.b.id, alias: "Kiosco B" } });
  const comoA = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, fn);
  const pedidosDeA = () => operatorPrisma.auditLog.count({ where: { tenantId: base.a.id, action: ACCION_PEDIDO_SOPORTE } });

  // ── 1) Pedido válido por un cliente de la cartera; doble clic simultáneo = un pedido ──
  const [r1, r2] = await Promise.all([
    comoA(() => pedirASoporteAction({ cliente: base.b.id, tipo: "corregir_cuit", cuit: "20-11111111-2" })),
    comoA(() => pedirASoporteAction({ cliente: base.b.id, tipo: "corregir_cuit", cuit: "20-11111111-2" })),
  ]);
  for (const r of [r1, r2]) assert.ok(r.tipo === "respuesta" && r.valor.ok, "los dos clics contestan bien");
  assert.equal(await pedidosDeA(), 1, "un solo pedido abierto");
  const fila = await operatorPrisma.auditLog.findFirst({ where: { tenantId: base.a.id, action: ACCION_PEDIDO_SOPORTE } });
  assert.equal(fila?.entityId, base.b.id);
  assert.equal(fila?.actor, `user:${base.a.duenia.id}`, "queda quién lo pidió");
  assert.deepEqual((fila?.changes as { cuit?: string })?.cuit, "20111111112");
  const abiertos = await pedidosAbiertosDelEstudio(base.a.id);
  assert.deepEqual(abiertos.map((a) => [a.clienteTenantId, a.tipo]), [[base.b.id, "corregir_cuit"]]);

  // CUIT mal escrito: no se guarda.
  const malo = await comoA(() => pedirASoporteAction({ cliente: base.b.id, tipo: "corregir_cuit", cuit: "20-11111111-3" }));
  assert.ok(malo.tipo === "respuesta" && !malo.valor.ok);
  assert.equal(await pedidosDeA(), 1);

  // ── 2) Aislamiento: un negocio fuera de la cartera = mismo error que uno inexistente ──
  await operatorPrisma.carteraCliente.updateMany({ where: { tenantId: base.a.id }, data: { estado: "baja" } });
  const ajeno = await comoA(() => pedirASoporteAction({ cliente: base.b.id, tipo: "direccion_propia" }));
  const inexistente = await comoA(() => pedirASoporteAction({ cliente: "no-existe", tipo: "direccion_propia" }));
  const propio = await comoA(() => pedirASoporteAction({ cliente: base.a.id, tipo: "direccion_propia" }));
  assert.ok(ajeno.tipo === "respuesta" && inexistente.tipo === "respuesta" && propio.tipo === "respuesta");
  assert.deepEqual(ajeno.valor, inexistente.valor, "no se distingue un negocio ajeno de uno que no existe");
  assert.deepEqual(propio.valor, inexistente.valor);
  assert.equal(await pedidosDeA(), 1, "nada nuevo escrito");
  await operatorPrisma.carteraCliente.updateMany({ where: { tenantId: base.a.id }, data: { estado: "activa" } });

  // B no tiene cartera: no pide nada, y no ve los pedidos de A.
  const desdeB = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () =>
    pedirASoporteAction({ cliente: base.a.id, tipo: "asignar_plan" }),
  );
  assert.ok(desdeB.tipo === "respuesta" && !desdeB.valor.ok);
  assert.equal(await operatorPrisma.auditLog.count({ where: { tenantId: base.b.id, action: ACCION_PEDIDO_SOPORTE } }), 0);
  assert.deepEqual(await pedidosAbiertosDelEstudio(base.b.id), [], "B no lee las filas de A (RLS)");

  // La recepcionista de A no tiene permiso de cartera: la action la manda afuera antes de escribir.
  const recepcion = await ejecutarAccion({ negocio: base.a, usuario: base.a.recepcion }, () =>
    pedirASoporteAction({ cliente: base.b.id, tipo: "asignar_plan" }),
  );
  assert.equal(recepcion.tipo, "redireccion");
  assert.equal(await pedidosDeA(), 1);

  // ── 3) El límite de la ficha sale del plan del cliente ──
  const capDe = async () => {
    const r = await comoA(() => monitorCarteraAction());
    assert.ok(r.tipo === "respuesta" && r.valor.ok, "el panel carga");
    const f = r.tipo === "respuesta" && r.valor.ok ? r.valor.filas.find((x) => x.clienteTenantId === base.b.id) : undefined;
    assert.ok(f, "B está en la cartera");
    return f!;
  };
  await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { plan: null, bancosCapFacturasMes: null } });
  const sinPlan = await capDe();
  assert.equal(sinPlan.capFacturasMes, 159, "sin plan rige el límite de siempre");
  assert.equal(sinPlan.limitePlan?.origen, "sin-plan");
  for (const plan of ["facturacion", "pyme"] as const) {
    await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { plan } });
    const f = await capDe();
    const delCatalogo = planPorId(plan).limites.facturasAutomaticasMes;
    assert.equal(f.limitePlan?.planNombre, planPorId(plan).nombre);
    assert.equal(f.limitePlan?.origen, "plan");
    if (delCatalogo !== null) assert.equal(f.capFacturasMes, delCatalogo, `el número del plan ${plan}`);
  }
  // La columna del negocio sólo BAJA el tope del plan.
  await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { plan: "facturacion", bancosCapFacturasMes: 40 } });
  assert.equal((await capDe()).capFacturasMes, 40);
  // …y NUNCA lo sube: con la columna en 500 vale el del plan (el código viejo mostraba 500).
  const delPlan = planPorId("facturacion").limites.facturasAutomaticasMes;
  assert.ok(delPlan !== null && delPlan < 500, "el plan tiene un tope menor que la columna");
  await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { bancosCapFacturasMes: 500 } });
  assert.equal((await capDe()).capFacturasMes, delPlan, "la columna no le gana al plan");
  // La excepción de GSG (consola) le gana al número del catálogo: 75, con la columna vacía o en 500.
  // Con el código viejo (`columna ?? 159`) esto daba 159 y 500.
  await operatorPrisma.auditLog.create({
    data: filaDeExcepcionDeLimite({ tenantId: base.b.id, operador: "soporte-qa", plan: "facturacion", limite: "facturasAutomaticasMes", valor: 75 }),
  });
  const conExcepcion = await capDe();
  assert.equal(conExcepcion.capFacturasMes, 75, "la excepción de GSG, con la columna en 500");
  assert.equal(conExcepcion.limitePlan?.origen, "excepcion");
  await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { bancosCapFacturasMes: null } });
  assert.equal((await capDe()).capFacturasMes, 75, "la excepción de GSG, sin columna");

  // ── 4) El pedido le LLEGA a Soporte GSG, que lo cierra, y la contadora ve la respuesta (GSG-22) ──
  const SOPORTE = { nombre: "soporte-qa", esDuenio: false };
  const bandeja1 = await listarPedidosDeCartera(operatorPrisma);
  const enBandeja = bandeja1.find((p) => p.estudio.id === base.a.id && p.cliente.id === base.b.id && p.tipo === "corregir_cuit");
  assert.ok(enBandeja, "el pedido de la contadora está en la bandeja de Soporte");
  assert.equal(enBandeja.cliente.alias, "Kiosco B");
  assert.equal(enBandeja.cuit, "20111111112");
  assert.equal(enBandeja.pedidoPor?.email, base.a.duenia.email, "Soporte sabe quién lo pidió");
  assert.deepEqual(bandeja1.map((p) => p.id), [enBandeja.id], "sólo pedidos abiertos, nada inventado");

  // «No corresponde» sin porqué: no se cierra.
  const sinPorque = await resolverPedidoDeCartera(operatorPrisma, { pedidoId: enBandeja.id, sesion: SOPORTE, resultado: "no_corresponde", motivo: " " });
  assert.equal(sinPorque.ok, false);
  const cierres = () => operatorPrisma.auditLog.count({ where: { action: ACCION_PEDIDO_RESUELTO } });
  assert.equal(await cierres(), 0);
  // Un id que no es un pedido de cartera: rechazado sin escribir.
  const noPedido = await resolverPedidoDeCartera(operatorPrisma, { pedidoId: fila!.id + "x", sesion: SOPORTE, resultado: "hecho", motivo: null });
  // Texto libre en vez de un código de la lista: rechazado, sin escribir (refutador 26/09).
  const aMano = await resolverPedidoDeCartera(operatorPrisma, { pedidoId: enBandeja.id, sesion: SOPORTE, resultado: "no_corresponde", motivo: "El CUIT es de QA Kiosco Lab" });
  assert.equal(aMano.ok, false);
  assert.equal(await cierres(), 0);
  assert.deepEqual(noPedido, { ok: false, error: "Ese pedido no existe." });

  // Doble clic simultáneo: se cierra UNA vez.
  // Un formulario forjado que además manda texto libre en `respuesta`: se ignora (no se guarda).
  const forjado = { pedidoId: enBandeja.id, sesion: SOPORTE, resultado: "no_corresponde", motivo: "ya-estaba", respuesta: "El CUIT es de QA Kiosco Lab" };
  const [c1, c2] = await Promise.all([resolverPedidoDeCartera(operatorPrisma, forjado), resolverPedidoDeCartera(operatorPrisma, forjado)]);
  assert.deepEqual([c1.ok, c2.ok].sort(), [false, true], "uno cierra, el otro ve que ya estaba resuelto");
  assert.equal(await cierres(), 1);
  const cierre = await operatorPrisma.auditLog.findFirst({ where: { action: ACCION_PEDIDO_RESUELTO } });
  assert.equal(cierre?.tenantId, base.a.id, "el cierre queda en la auditoría del ESTUDIO");
  assert.equal(cierre?.actor, "operator:soporte-qa");
  assert.ok(!JSON.stringify(cierre?.changes).includes("Kiosco"), "la fila del cierre no guarda texto libre");
  assert.equal((cierre?.changes as { motivo?: string })?.motivo, "ya-estaba");

  // Sale de la bandeja y de la ficha; la contadora ve la respuesta y puede volver a pedirlo.
  assert.deepEqual(await listarPedidosDeCartera(operatorPrisma), []);
  const deA = await pedidosDelEstudio(base.a.id);
  assert.deepEqual(deA.abiertos, []);
  assert.deepEqual(
    deA.respuestas.map((r) => [r.clienteTenantId, r.tipo, r.resultado, r.respuesta]),
    [[base.b.id, "corregir_cuit", "no_corresponde", "Ya estaba así: no hacía falta cambiar nada."]],
  );
  assert.deepEqual(await pedidosDelEstudio(base.b.id), { abiertos: [], respuestas: [] }, "B no ve la respuesta a A (RLS)");
  const otraVez = await comoA(() => pedirASoporteAction({ cliente: base.b.id, tipo: "corregir_cuit", cuit: "20-11111111-2" }));
  assert.ok(otraVez.tipo === "respuesta" && otraVez.valor.ok && /bandeja de pedidos de Soporte GSG/.test(otraVez.valor.mensaje) && /^Listo/.test(otraVez.valor.mensaje));
  assert.equal(await pedidosDeA(), 2, "cerrado el anterior, se puede pedir de nuevo");

  // CH (beauty-spa) sólo la cierra el dueño de GSG.
  const slugA = base.a.slug;
  await operatorPrisma.tenant.update({ where: { id: base.a.id }, data: { slug: "beauty-spa" } });
  try {
    const nuevo = (await listarPedidosDeCartera(operatorPrisma))[0];
    assert.ok(nuevo);
    const soporte = await resolverPedidoDeCartera(operatorPrisma, { pedidoId: nuevo.id, sesion: SOPORTE, resultado: "hecho", motivo: null });
    assert.equal(soporte.ok, false, "Soporte no toca CH");
    assert.equal(await cierres(), 1);
    const duenio = await resolverPedidoDeCartera(operatorPrisma, { pedidoId: nuevo.id, sesion: { nombre: "duenio", esDuenio: true }, resultado: "hecho", motivo: null });
    assert.deepEqual(duenio, { ok: true });
  } finally {
    await operatorPrisma.tenant.update({ where: { id: base.a.id }, data: { slug: slugA } });
  }
});
