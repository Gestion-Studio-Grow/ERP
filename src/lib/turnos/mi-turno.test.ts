// "Tu turno" (página pública): la lectura trae lo que la página muestra y NADA de la ficha de la
// profesional ni del pago. Se ejecuta `leerMiTurno` contra una base falsa que proyecta el
// `select` como Prisma (sólo devuelve lo pedido) sobre una fila COMPLETA, como la de la base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerMiTurno } from "./mi-turno";

const FILA = {
  id: "ap_1",
  tenantId: "t_ch",
  status: "CONFIRMED",
  startsAt: new Date("2026-10-01T15:00:00Z"),
  professionalId: "pro_1",
  serviceId: "svc_1",
  clientId: "cli_1",
  priceAtBooking: 25000,
  notes: "nota interna",
  service: { id: "svc_1", name: "Limpieza facial", price: 25000, tenantId: "t_ch" },
  professional: { id: "pro_1", name: "Caro", email: "caro@ch.com", phone: "1140000000", commissionPercent: 40 },
  box: { id: "box_1", name: "Box 2" },
  payment: { id: "pay_1", amount: 5000, status: "APPROVED", mpPaymentId: "mp_99" },
  review: { rating: 5, comment: "genial" },
};

/** Proyecta un `select` de Prisma (anidado) sobre un objeto. */
function proyectar(fila: Record<string, unknown>, select: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(select)) {
    if (v === true) out[k] = fila[k];
    else if (v && typeof v === "object" && "select" in v) {
      const hijo = fila[k] as Record<string, unknown> | null;
      out[k] = hijo ? proyectar(hijo, (v as { select: Record<string, unknown> }).select) : null;
    }
  }
  return out;
}

const db = {
  appointment: {
    findFirst: async (a: { where: { id: string; tenantId: string }; select: Record<string, unknown> }) =>
      a.where.id === FILA.id && a.where.tenantId === FILA.tenantId ? proyectar(FILA, a.select) : null,
  },
};

test("la página pública del turno recibe lo que muestra y nada de la profesional ni del pago", async () => {
  const t = (await leerMiTurno(db as never, "t_ch", "ap_1")) as unknown as Record<string, unknown>;
  assert.deepEqual(t.professional, { name: "Caro" }, "sin email, teléfono ni comisión");
  assert.deepEqual(t.service, { name: "Limpieza facial" });
  assert.deepEqual(t.box, { name: "Box 2" });
  assert.deepEqual(t.review, { rating: 5 });
  assert.equal(t.payment, undefined);
  assert.equal(t.notes, undefined);
  assert.equal(t.priceAtBooking, undefined);
  // Lo que usan la página y los botones (cancelar, reprogramar, reseñar).
  for (const k of ["id", "status", "startsAt", "professionalId", "serviceId"]) assert.ok(k in t, k);
  assert.doesNotMatch(JSON.stringify(t), /caro@ch\.com|1140000000|commission|mp_99/);
});

test("la consulta que arma leerMiTurno va acotada al negocio que recibe (id Y tenantId en el where)", async () => {
  // Lo que se prueba es lo que `leerMiTurno` le PIDE a la base, no lo que contesta una base falsa:
  // se captura el argumento real de `findFirst`.
  const pedidos: { where: unknown }[] = [];
  const espia = {
    appointment: {
      findFirst: async (a: { where: unknown }) => {
        pedidos.push(a);
        return null;
      },
    },
  };
  await leerMiTurno(espia as never, "t_magra", "ap_1");
  assert.equal(pedidos.length, 1);
  assert.deepEqual(pedidos[0].where, { id: "ap_1", tenantId: "t_magra" }, "sin el tenantId, el id de otro negocio se encontraría");
});
