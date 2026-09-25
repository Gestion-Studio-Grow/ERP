// ============================================================================
// ENG-023 · Anular una venta facturada no deja la factura viva (contra Postgres)
// ============================================================================
//
// Ejecuta las Server Actions REALES de anulación (`anularVenta`, order-actions.ts, y
// `anularCobroTurno`, actions.ts: guardia, Prisma con RLS, transacción) con la sesión de la
// dueña, contra una base efímera con todas las migraciones. Antes de ENG-023 las dos pasaban:
// el pedido quedaba anulado, el libro con la devolución y la factura con su CAE vigente.
//
// La nota de crédito todavía no existe (R4-F2): hasta entonces, con factura autorizada o en
// camino, la anulación se rechaza con un motivo claro y no cambia nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

/** Una factura ya decidida (como la deja el despacho de ARCA), enlazada a su origen. */
function factura(
  tenantId: string,
  origen: { orderId: string } | { appointmentId: string },
  status: "PENDING" | "AUTHORIZED" | "REJECTED",
  numero: number,
) {
  return {
    tenantId,
    ...origen,
    puntoVenta: 1,
    tipoComprobante: 11,
    concepto: 1,
    docTipo: 99,
    docNro: "0",
    fecha: "20260924",
    neto: "121000.00",
    iva: "0.00",
    total: "121000.00",
    status,
    ...(status === "AUTHORIZED" ? { cae: "86390000000001", caeVencimiento: "20261004", numero } : {}),
    ...(status === "REJECTED" ? { rechazoMotivo: "10015: prueba" } : {}),
  };
}

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const { operatorPrisma } = await import("@/lib/operator-db");
  return { base, operatorPrisma };
}

test("anularVenta: con factura autorizada o en camino se rechaza y el pedido no se anula; con la rechazada se anula; B no la toca", async (t) => {
  const listo = await preparar(t);
  if (!listo) return;
  const { base, operatorPrisma } = listo;
  const { anularVenta } = await import("@/lib/order-actions");
  const a = base.a;
  const [conCae, enCamino, rechazada] = a.pedidos;

  for (const id of a.pedidos) {
    await operatorPrisma.order.update({ where: { id }, data: { paid: true, total: 121000, status: "DELIVERED" } });
  }
  await operatorPrisma.invoice.create({ data: factura(a.id, { orderId: conCae }, "AUTHORIZED", 1) });
  await operatorPrisma.invoice.create({ data: factura(a.id, { orderId: enCamino }, "PENDING", 0) });
  await operatorPrisma.invoice.create({ data: factura(a.id, { orderId: rechazada }, "REJECTED", 0) });

  const fd = (id: string) => {
    const f = new FormData();
    f.set("id", id);
    f.set("motivo", "El cliente devolvió la mercadería");
    return f;
  };
  const anular = (negocio: typeof a | typeof base.b, id: string) =>
    ejecutarAccion({ negocio, usuario: negocio.duenia }, () => anularVenta({ ok: false, error: "" } as never, fd(id)));

  // El negocio B no puede anular (ni ver) la venta de A.
  const deB = await anular(base.b, conCae);
  assert.equal(deB.tipo, "respuesta");
  if (deB.tipo === "respuesta") assert.equal(deB.valor?.ok, false);

  const r1 = await anular(a, conCae);
  assert.equal(r1.tipo, "respuesta");
  if (r1.tipo === "respuesta") {
    assert.equal(r1.valor?.ok, false, JSON.stringify(r1.valor));
    assert.match(String((r1.valor as { error?: string }).error), /factura electrónica autorizada por ARCA[^]*nota de crédito/);
  }

  const r2 = await anular(a, enCamino);
  assert.equal(r2.tipo, "respuesta");
  if (r2.tipo === "respuesta") {
    assert.equal(r2.valor?.ok, false, JSON.stringify(r2.valor));
    assert.match(String((r2.valor as { error?: string }).error), /esperando la respuesta de ARCA/);
  }

  const r3 = await anular(a, rechazada);
  assert.equal(r3.tipo, "respuesta");
  if (r3.tipo === "respuesta") assert.equal(r3.valor?.ok, true, JSON.stringify(r3.valor));

  const pedidos = await operatorPrisma.order.findMany({ where: { id: { in: a.pedidos } }, select: { id: true, status: true } });
  const estado = new Map(pedidos.map((p) => [p.id, p.status]));
  assert.equal(estado.get(conCae), "DELIVERED", "con CAE: el pedido no quedó anulado");
  assert.equal(estado.get(enCamino), "DELIVERED", "en camino: el pedido no quedó anulado");
  assert.equal(estado.get(rechazada), "CANCELLED", "rechazada por ARCA: se anula como siempre");

  const egresos = await operatorPrisma.cashMovement.count({ where: { tenantId: a.id, orderId: { in: [conCae, enCamino] } } });
  assert.equal(egresos, 0, "ninguna devolución en el libro de las ventas facturadas");
  const viva = await operatorPrisma.invoice.findFirstOrThrow({ where: { orderId: conCae } });
  assert.equal(viva.status, "AUTHORIZED");
});

test("anularCobroTurno: con factura autorizada del turno se rechaza y el cobro sigue en pie; rechazada la factura, se anula", async (t) => {
  const listo = await preparar(t);
  if (!listo) return;
  const { base, operatorPrisma } = listo;
  const { anularCobroTurno } = await import("@/lib/actions");
  const a = base.a;

  const box = await operatorPrisma.box.create({ data: { tenantId: a.id, name: "Gabinete 1" } });
  const prof = await operatorPrisma.professional.create({ data: { tenantId: a.id, name: "Lucía" } });
  const serv = await operatorPrisma.service.create({ data: { tenantId: a.id, name: "Limpieza facial", durationMin: 60, price: 18000 } });
  /** Un turno completado, cobrado en efectivo, con su factura en el estado pedido. */
  const turnoCobradoYFacturado = async (hora: string, status: "AUTHORIZED" | "REJECTED", numero: number) => {
    const turno = await operatorPrisma.appointment.create({
      data: {
        tenantId: a.id,
        clientId: a.clientes[0],
        professionalId: prof.id,
        serviceId: serv.id,
        boxId: box.id,
        startsAt: new Date(`2026-09-24T${hora}:00:00Z`),
        endsAt: new Date(`2026-09-24T${hora}:59:00Z`),
        status: "COMPLETED",
      },
    });
    await operatorPrisma.payment.create({
      data: { tenantId: a.id, appointmentId: turno.id, amount: 18000, method: "EFECTIVO", status: "APPROVED" },
    });
    const cobro = await operatorPrisma.collection.create({
      data: {
        tenantId: a.id,
        originType: "APPOINTMENT",
        originId: turno.id,
        appointmentId: turno.id,
        amount: "18000.00",
        method: "EFECTIVO",
        collectedBy: `user:${a.duenia.id}`,
      },
    });
    await operatorPrisma.invoice.create({ data: factura(a.id, { appointmentId: turno.id }, status, numero) });
    return { turno, cobro };
  };
  const anular = (x: { turno: { id: string }; cobro: { id: string } }) => {
    const f = new FormData();
    f.set("collectionId", x.cobro.id);
    f.set("appointmentId", x.turno.id);
    f.set("motivo", "Se cobró dos veces");
    return ejecutarAccion({ negocio: a, usuario: a.duenia }, () => anularCobroTurno(f));
  };

  const conCae = await turnoCobradoYFacturado("13", "AUTHORIZED", 2);
  const r1 = await anular(conCae);
  assert.equal(r1.tipo, "respuesta");
  if (r1.tipo === "respuesta") {
    assert.equal(r1.valor?.ok, false, JSON.stringify(r1.valor));
    assert.match(String((r1.valor as { error?: string }).error), /^Ese turno tiene factura electrónica autorizada por ARCA/);
  }
  assert.equal(await operatorPrisma.collection.count({ where: { tenantId: a.id, originId: conCae.turno.id } }), 1, "ninguna contrapartida");
  assert.equal((await operatorPrisma.payment.findUniqueOrThrow({ where: { appointmentId: conCae.turno.id } })).amount, 18000);

  // La misma anulación en otro turno igual pero con la factura rechazada por ARCA (sin CAE): pasa.
  // Lo que la frenaba era la factura, no otra cosa del turno. (Un turno aparte: la autorizada no se
  // puede pasar a rechazada ni desligar de su turno, ENG-022.)
  const rechazada = await turnoCobradoYFacturado("15", "REJECTED", 0);
  const r2 = await anular(rechazada);
  assert.equal(r2.tipo, "respuesta");
  if (r2.tipo === "respuesta") assert.equal(r2.valor?.ok, true, JSON.stringify(r2.valor));
  assert.equal(await operatorPrisma.collection.count({ where: { tenantId: a.id, originId: rechazada.turno.id } }), 2, "cobro + contrapartida");
  assert.equal(await operatorPrisma.collection.count({ where: { tenantId: a.id, originId: conCae.turno.id } }), 1, "el turno con CAE, intacto");
});
