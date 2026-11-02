// «Sumar un producto» desde el turno de CH (UAT venta de productos, S.1): la venta arranca con la
// clienta del turno y son dos cobros. La venta queda en su ficha y el turno no se toca.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { hrefSumarProducto, turnoAdmiteProducto } from "@/app/admin/(dashboard)/pedidos/cobrar-una-venta";

const laBase = baseEfimeraDelArchivo();
const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("el enlace lleva el id del turno, nunca los datos de la clienta; turno sin visita, no se ofrece", () => {
  assert.equal(hrefSumarProducto("t/1"), "/admin/pedidos?cobrar=1&turno=t%2F1");
  for (const e of ["PENDING", "CONFIRMED", "COMPLETED"]) assert.equal(turnoAdmiteProducto(e), true, e);
  for (const e of ["CANCELLED", "NO_SHOW"]) assert.equal(turnoAdmiteProducto(e), false, e);
});

test("la ficha del turno lo ofrece, y la venta arranca con la clienta cargada", () => {
  const dash = "../app/admin/(dashboard)/";
  assert.match(fuente(`${dash}turnos/_agenda/TurnoCajon.tsx`), /permisos\.sumarProducto && turnoAdmiteProducto\(t\.estado\)/);
  assert.match(fuente(`${dash}turnos/AgendaRenglon.tsx`), /sumarProducto: cobrarVenta !== null/);
  assert.match(fuente(`${dash}turnos/page.tsx`), /sumarProducto: enlaceCobrarUnaVenta\(slug, user\.role\) !== null/);
  assert.match(fuente(`${dash}vender/nucleo-de-venta.tsx`), /useState\(k\?\.telefono \?\? clienteInicial\?\.telefono \?\? ""\)/);
  assert.match(fuente(`${dash}pedidos/page.tsx`), /clienteInicial=\{clienteInicial\}/);
});

test("leerClientaDelTurno: del negocio y para quien vende; la venta queda en su ficha y el turno no se toca", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "6", DB_CONNECT_TIMEOUT_MS: "15000" });
  const duenio = await prismaComoDuenio(base);
  const { leerClientaDelTurno, createOrder } = await import("@/lib/order-actions");

  const a = base.a;
  const box = await duenio.box.create({ data: { tenantId: a.id, name: "Box" } });
  const prof = await duenio.professional.create({ data: { tenantId: a.id, name: "Laura", boxId: box.id } });
  const serv = await duenio.service.create({ data: { tenantId: a.id, name: "Masaje", durationMin: 60, price: 15_000 } });
  const crema = await duenio.product.create({ data: { tenantId: a.id, name: "Crema", saleUnit: "UNIT", price: 12_000, stock: 5, trackStock: true } });
  const turno = await duenio.appointment.create({
    data: {
      tenantId: a.id,
      clientId: a.clientes[0],
      professionalId: prof.id,
      serviceId: serv.id,
      boxId: box.id,
      startsAt: new Date("2026-11-01T15:00:00Z"),
      endsAt: new Date("2026-11-01T16:00:00Z"),
      status: "COMPLETED",
    },
    select: { id: true, status: true, updatedAt: true },
  });
  const ficha = await duenio.client.findUniqueOrThrow({ where: { id: a.clientes[0] }, select: { name: true, phone: true } });

  const leida = await ejecutarAccion({ negocio: a, usuario: a.recepcion }, () => leerClientaDelTurno(turno.id));
  assert.equal(leida.tipo, "respuesta", JSON.stringify(leida));
  assert.deepEqual((leida as { valor: unknown }).valor, { nombre: ficha.name, telefono: ficha.phone });
  const ajena = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => leerClientaDelTurno(turno.id));
  assert.equal(ajena.tipo, "respuesta", JSON.stringify(ajena));
  assert.equal((ajena as { valor: unknown }).valor, null, "el turno de otro negocio no se lee");

  const fd = new FormData();
  for (const [k, v] of Object.entries({
    channel: "COUNTER",
    fulfillment: "PICKUP",
    customerName: ficha.name,
    customerPhone: ficha.phone,
    paid: "on",
    paymentMethod: "EFECTIVO",
    idempotencyKey: "sumar-producto-1",
  })) {
    fd.set(k, v);
  }
  fd.append("productId", crema.id);
  fd.append("quantity", "1");
  const r = await ejecutarAccion({ negocio: a, usuario: a.recepcion }, () => createOrder(fd));
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  const venta = await duenio.order.findFirstOrThrow({ where: { tenantId: a.id }, orderBy: { createdAt: "desc" }, select: { clientId: true, total: true } });
  assert.equal(venta.clientId, a.clientes[0], "la venta queda en su ficha");
  assert.equal(venta.total, 12_000);
  const despues = await duenio.appointment.findUniqueOrThrow({ where: { id: turno.id }, select: { status: true, updatedAt: true } });
  assert.deepEqual(despues, { status: turno.status, updatedAt: turno.updatedAt }, "el turno no se toca");
  assert.equal(await duenio.payment.count({ where: { appointmentId: turno.id } }), 0, "el cobro del turno es otro");
});
