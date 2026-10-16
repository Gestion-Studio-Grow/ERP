// ============================================================================
// PEDIDOS NUEVOS A SOPORTE GSG y el AVISO de la consola, contra Postgres (UAT 16/10, punto 10)
// ============================================================================
//
// Base efímera (src/test/base-efimera.ts). A y B son DOS estudios contables (módulo `cartera`):
// A tiene a B en su cartera y B tiene a A. Se corre `pedirASoporteAction` TAL CUAL, con la sesión de
// cada dueña, y SIN `RESEND_API_KEY` (no hay mail: el pedido no puede depender de él). Se mide:
//   · los tipos nuevos (certificado, condición frente al IVA, cuadro de monotributo) quedan escritos
//     en la auditoría del estudio que los pidió, uno por tipo aunque se pidan dos veces;
//   · AISLAMIENTO: cada estudio ve sólo SUS pedidos (RLS), aunque los dos tengan cartera;
//   · el aviso de la consola (`contarPedidosDeCartera`, con la conexión de operador `app_rls`) cuenta
//     los de los dos estudios, y la bandeja los lista con su texto; al cerrarlos la cuenta baja.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("pedidos de certificado, condición y cuadro: quedan sin mail, cada estudio ve los suyos y la consola los cuenta", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const guardado = { auth: process.env.AUTH_SECRET, resend: process.env.RESEND_API_KEY };
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  delete process.env.RESEND_API_KEY;
  t.after(() => {
    if (guardado.auth === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = guardado.auth;
    if (guardado.resend !== undefined) process.env.RESEND_API_KEY = guardado.resend;
  });
  prepararAccionesDeServidor();

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { pedirASoporteAction } = await import("./pedido-soporte-actions");
  const { pedidosDelEstudio } = await import("./pedido-soporte.server");
  const { ACCION_PEDIDO_SOPORTE, TEXTO_PEDIDO } = await import("./pedido-soporte");
  const { contarPedidosDeCartera, listarPedidosDeCartera, resolverPedidoDeCartera } = await import(
    "@/app/operador/(console)/pedidos-cartera/pedidos-cartera.server"
  );
  base.alBorrar(() => operatorPrisma.$disconnect());
  const duenio = await prismaComoDuenio(base);

  for (const n of [base.a, base.b]) await duenio.tenant.update({ where: { id: n.id }, data: { modules: ["cartera", "clients"] } });
  await duenio.carteraCliente.create({ data: { tenantId: base.a.id, clienteTenantId: base.b.id, alias: "Kiosco B" } });
  await duenio.carteraCliente.create({ data: { tenantId: base.b.id, clienteTenantId: base.a.id, alias: "Almacén A" } });
  type Negocio = typeof base.a;
  const pedir = async (n: Negocio, cliente: string, tipo: string) => {
    const r = await ejecutarAccion({ negocio: n, usuario: n.duenia }, () => pedirASoporteAction({ cliente, tipo }));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: Awaited<ReturnType<typeof pedirASoporteAction>> }).valor;
  };
  const filasDe = (estudio: string) =>
    duenio.auditLog.findMany({ where: { tenantId: estudio, action: ACCION_PEDIDO_SOPORTE }, select: { entityId: true, changes: true } });

  assert.equal(await contarPedidosDeCartera(operatorPrisma), 0, "sin pedidos, la consola no avisa nada");

  // ── 1) A pide certificado y condición por B (dos veces el certificado: queda uno); B pide el cuadro por A ──
  for (const tipo of ["cargar_certificado", "cargar_certificado", "condicion_iva"]) {
    const r = await pedir(base.a, base.b.id, tipo);
    assert.ok(r.ok, `${tipo}: el pedido queda aunque no haya mail (${JSON.stringify(r)})`);
  }
  const deB = await pedir(base.b, base.a.id, "cuadro_monotributo");
  assert.ok(deB.ok);
  assert.match(deB.ok ? deB.mensaje : "", /bandeja de pedidos de Soporte GSG/);
  const filasA = await filasDe(base.a.id);
  assert.deepEqual(filasA.map((f) => (f.changes as { tipo: string }).tipo).sort(), ["cargar_certificado", "condicion_iva"]);
  assert.ok(filasA.every((f) => f.entityId === base.b.id));
  assert.deepEqual((await filasDe(base.b.id)).map((f) => (f.changes as { tipo: string }).tipo), ["cuadro_monotributo"]);

  // Un tipo inventado no se escribe.
  const raro = await pedir(base.a, base.b.id, "borrar_todo");
  assert.equal(raro.ok, false);
  assert.equal((await filasDe(base.a.id)).length, 2);

  // ── 2) Aislamiento: cada estudio ve sólo sus pedidos, aunque los dos tengan cartera ──
  const vistosPorA = await pedidosDelEstudio(base.a.id);
  const vistosPorB = await pedidosDelEstudio(base.b.id);
  assert.deepEqual(vistosPorA.abiertos.map((p) => [p.clienteTenantId, p.tipo]).sort(), [
    [base.b.id, "cargar_certificado"],
    [base.b.id, "condicion_iva"],
  ]);
  assert.deepEqual(vistosPorB.abiertos.map((p) => [p.clienteTenantId, p.tipo]), [[base.a.id, "cuadro_monotributo"]]);
  // Con el rol de la app y parado en B, las filas de A no existen (RLS), ni pidiéndolas por id.
  const { tenantTransaction } = await import("@/lib/rls");
  const filtradas = await tenantTransaction(
    (tx) => tx.auditLog.count({ where: { tenantId: base.a.id, action: ACCION_PEDIDO_SOPORTE } }),
    { tenantId: base.b.id },
  );
  assert.equal(filtradas, 0, "B no lee los pedidos de A");

  // ── 3) La consola avisa: cuenta los tres y la bandeja los lista con su texto ──
  assert.equal(await contarPedidosDeCartera(operatorPrisma), 3);
  const bandeja = await listarPedidosDeCartera(operatorPrisma);
  assert.deepEqual(bandeja.map((p) => [p.estudio.id, p.tipo]).sort(), [
    [base.a.id, "cargar_certificado"],
    [base.a.id, "condicion_iva"],
    [base.b.id, "cuadro_monotributo"],
  ].sort());
  for (const p of bandeja) assert.ok(TEXTO_PEDIDO[p.tipo].pedido.length > 0);

  // Soporte cierra uno: la cuenta baja.
  const certificado = bandeja.find((p) => p.tipo === "cargar_certificado")!;
  const cierre = await resolverPedidoDeCartera(operatorPrisma, {
    pedidoId: certificado.id,
    estudioTenantId: certificado.estudio.id,
    sesion: { nombre: "soporte-qa", esDuenio: false },
    resultado: "hecho",
    motivo: null,
  });
  assert.ok(cierre.ok, JSON.stringify(cierre));
  assert.equal(await contarPedidosDeCartera(operatorPrisma), 2);
});
