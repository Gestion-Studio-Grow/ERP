// ============================================================================
// CONSOLA DE SOPORTE T1 contra Postgres (base efímera, src/test/base-efimera.ts).
// ============================================================================
//
// A es un estudio contable (módulo `cartera`) con B en su cartera. Con la app y la consola como
// `app_rls` (igual que producción) se mide:
//   · «Pedir a Soporte GSG» abre UN ticket (doble clic = uno) y el pedido sigue en AuditLog;
//   · AISLAMIENTO: parada en B, la consola y la app no ven, no cambian ni escriben tickets de A;
//   · los cambios (estado, prioridad, nota, respuesta, tomar) validan contra lo guardado y dejan
//     historial; dos altas simultáneas no repiten número;
//   · «Traer pedidos sin ticket» es idempotente;
//   · sin la tabla (migración sin aplicar) el pedido se guarda igual y la consola lo dice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("tickets de soporte: alta desde el pedido, aislamiento por negocio, cambios con historial y tolerancia sin tabla", async (t) => {
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

  const { operatorPrisma, enElNegocio } = await import("@/lib/operator-db");
  const { tenantTransaction } = await import("@/lib/rls");
  const { pedirASoporteAction } = await import("@/app/contador/pedido-soporte-actions");
  const { ACCION_PEDIDO_SOPORTE, ENTIDAD_PEDIDO_SOPORTE } = await import("@/app/contador/pedido-soporte");
  const { cambiarTicket, fichaDeTicket, listarTickets, traerPedidosSinTicket } = await import("./tickets.server");
  const { crearTicketEnTx } = await import("./alta.server");
  const { ticketDesdePedido, venceElPara, filtrosDesdeQuery } = await import("./tickets-core");
  base.alBorrar(() => operatorPrisma.$disconnect());
  const duenio = await prismaComoDuenio(base);

  await duenio.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  await duenio.carteraCliente.create({ data: { tenantId: base.a.id, clienteTenantId: base.b.id, alias: "Kiosco B" } });
  const comoA = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, fn);
  const todos = filtrosDesdeQuery({ estado: undefined });

  // ── 1) El pedido abre un ticket; doble clic = uno ──
  const [r1, r2] = await Promise.all([
    comoA(() => pedirASoporteAction({ cliente: base.b.id, tipo: "corregir_cuit", cuit: "20-11111111-2", nota: "lo necesita hoy" })),
    comoA(() => pedirASoporteAction({ cliente: base.b.id, tipo: "corregir_cuit", cuit: "20-11111111-2" })),
  ]);
  for (const r of [r1, r2]) assert.ok(r.tipo === "respuesta" && r.valor.ok);
  const pedido = await duenio.auditLog.findFirstOrThrow({ where: { tenantId: base.a.id, action: ACCION_PEDIDO_SOPORTE } });
  const tickets = await duenio.supportTicket.findMany({ where: { tenantId: base.a.id } });
  assert.equal(tickets.length, 1, "un pedido, un ticket");
  const tk = tickets[0];
  assert.equal(tk.numero, 1);
  assert.equal(tk.origenId, pedido.id);
  assert.equal(tk.prioridad, "P1");
  assert.equal(tk.estado, "nuevo");
  assert.equal(tk.clienteTenantId, base.b.id);
  assert.equal(await duenio.supportTicketEvento.count({ where: { ticketId: tk.id, tipo: "creado" } }), 1);

  // ── 2) AISLAMIENTO: parada en B no se ve, no se cambia ni se escribe nada de A ──
  assert.equal(await enElNegocio(base.b.id, (tx) => tx.supportTicket.count(), operatorPrisma), 0, "la consola parada en B no ve tickets de A");
  assert.equal(await enElNegocio(base.b.id, (tx) => tx.supportTicketEvento.count(), operatorPrisma), 0);
  assert.equal(await tenantTransaction((tx) => tx.supportTicket.count(), { tenantId: base.b.id }), 0, "la app de B tampoco");
  assert.equal(await tenantTransaction((tx) => tx.supportTicket.count(), { tenantId: base.a.id }), 1, "la app de A sí ve el suyo");
  assert.equal(await fichaDeTicket(operatorPrisma, base.b.id, 1), null, "#1 de B no existe aunque #1 de A sí");
  const cruzado = await cambiarTicket(operatorPrisma, { tenantId: base.b.id, numero: 1, operador: "soporte-qa", cambio: { que: "estado", valor: "cerrado" } });
  assert.deepEqual(cruzado, { ok: false, error: "Ese ticket no existe." });
  await assert.rejects(
    enElNegocio(base.b.id, (tx) => tx.supportTicket.update({ where: { id: tk.id }, data: { estado: "cerrado" } }), operatorPrisma),
    "parada en B, un update por id de un ticket de A no lo encuentra",
  );
  await assert.rejects(
    enElNegocio(
      base.b.id,
      (tx) => tx.supportTicket.create({ data: { tenantId: base.a.id, numero: 99, tipo: "otro", prioridad: "P3", asunto: "x", canal: "consola", creadoPor: "operator:x" } }),
      operatorPrisma,
    ),
    "parada en B no se puede escribir un ticket a nombre de A (WITH CHECK)",
  );
  assert.equal((await duenio.supportTicket.findUniqueOrThrow({ where: { id: tk.id } })).estado, "nuevo");

  // ── 3) La consola los lista (parada en cada negocio) y la ficha trae el historial ──
  const lista = await listarTickets(operatorPrisma, todos);
  assert.ok("tickets" in lista && lista.tickets.length === 1 && lista.tickets[0].negocio.id === base.a.id);
  const ficha = await fichaDeTicket(operatorPrisma, base.a.id, 1);
  assert.equal(ficha?.cliente?.id, base.b.id);
  assert.equal(ficha?.eventos.length, 1);

  // ── 4) Cambios: validan contra lo guardado y dejan historial ──
  const cambio = (c: Parameters<typeof cambiarTicket>[1]["cambio"]) =>
    cambiarTicket(operatorPrisma, { tenantId: base.a.id, numero: 1, operador: "soporte-qa", cambio: c });
  assert.equal((await cambio({ que: "estado", valor: "en_curso" })).ok, true);
  assert.equal((await cambio({ que: "estado", valor: "en_curso" })).ok, false, "ya estaba en curso");
  assert.equal((await cambio({ que: "estado", valor: "inventado" })).ok, false);
  assert.equal((await cambio({ que: "prioridad", valor: "P3" })).ok, true);
  assert.equal((await cambio({ que: "nota", texto: "Llamé al estudio" })).ok, true);
  assert.equal((await cambio({ que: "nota", texto: "  " })).ok, false);
  assert.equal((await cambio({ que: "respuesta", texto: "Ya quedó corregido." })).ok, true);
  assert.equal((await cambio({ que: "tomar" })).ok, true);
  assert.equal((await cambio({ que: "estado", valor: "resuelto" })).ok, true);
  const guardado = await duenio.supportTicket.findUniqueOrThrow({ where: { id: tk.id } });
  assert.equal(guardado.estado, "resuelto");
  assert.equal(guardado.prioridad, "P3");
  assert.equal(guardado.venceEl?.getTime(), venceElPara("P3", guardado.createdAt).getTime(), "el vencimiento sigue a la prioridad");
  assert.equal(guardado.respuesta, "Ya quedó corregido.");
  assert.ok(guardado.respondidoEl && guardado.resueltoEl);
  assert.equal(guardado.asignadoA, "soporte-qa");
  assert.equal(await duenio.supportTicketEvento.count({ where: { ticketId: tk.id } }), 7, "creado + 6 cambios válidos");

  // ── 5) Dos altas simultáneas en A no repiten número ──
  const datos = (id: string) =>
    ticketDesdePedido({ pedidoId: id, actor: "user:x", clienteTenantId: base.b.id, alias: "Kiosco B", pedido: { tipo: "asignar_plan", cuit: null, nota: null } }, new Date());
  const altas = await Promise.all(["p-x", "p-y"].map((id) => enElNegocio(base.a.id, (tx) => crearTicketEnTx(tx, base.a.id, datos(id)), operatorPrisma)));
  assert.deepEqual(altas.map((a) => a?.numero).sort(), [2, 3]);

  // ── 6) Traer pedidos sin ticket: idempotente ──
  await duenio.auditLog.create({
    data: { tenantId: base.a.id, actor: "user:viejo", action: ACCION_PEDIDO_SOPORTE, entity: ENTIDAD_PEDIDO_SOPORTE, entityId: base.b.id, channel: "admin", changes: { tipo: "direccion_propia", alias: "Kiosco B" } },
  });
  const puede = () => true;
  assert.deepEqual(await traerPedidosSinTicket(operatorPrisma, puede), { creados: 1 });
  assert.deepEqual(await traerPedidosSinTicket(operatorPrisma, puede), { creados: 0 });
  assert.deepEqual(await traerPedidosSinTicket(operatorPrisma, () => false), { creados: 0 }, "un estudio que el operador no puede tocar se saltea");

  // ── 7) Sin la tabla (Gate 2): el pedido se guarda igual y la consola lo dice ──
  // Base efímera propia del test: se borran las tablas para simular la migración sin aplicar.
  await duenio.$executeRawUnsafe(`DROP TABLE "SupportTicketEvento"`);
  await duenio.$executeRawUnsafe(`DROP TABLE "SupportTicket"`);
  const sinTabla = await comoA(() => pedirASoporteAction({ cliente: base.b.id, tipo: "condicion_iva" }));
  assert.ok(sinTabla.tipo === "respuesta" && sinTabla.valor.ok, "el pedido no se rompe sin la tabla");
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.a.id, action: ACCION_PEDIDO_SOPORTE } }), 3);
  assert.deepEqual(await listarTickets(operatorPrisma, todos), { sinTabla: true });
  assert.equal(await fichaDeTicket(operatorPrisma, base.a.id, 1), null);
  await duenio.$disconnect();
});
