import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { businessWallTimeToUtc } from "@/lib/datetime";

const laBase = baseEfimeraDelArchivo();
const SQL = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/CH_rendicion_profesional.sql"), "utf8");
const PRECIO = 37_000;

test("CH-011: el cierre de mes con el cliente suelto (prisma, app_rls) ve lo pendiente de rendir igual que dentro de la transacción", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { prisma } = await import("@/lib/prisma");
  const { aplicarCobroTurnoInTx } = await import("@/lib/turnos/cobro-turno-repo");
  const { leerHechosCierreMes } = await import("@/lib/cierre-mes/lectura");
  const A = base.a.id;
  const duenia = { negocio: base.a, usuario: base.a.duenia };

  // 0) Sin tablas de rendicion: no aborta, todo como antes (control).
  const box = await duenio.box.create({ data: { tenantId: A, name: "Box 1" } });
  const servicio = await duenio.service.create({ data: { tenantId: A, name: "Facial", durationMin: 60, price: PRECIO } });
  const p = await duenio.professional.create({ data: { tenantId: A, name: "Laura", boxId: box.id, cobraEnMostrador: false, commissionPercent: 40, services: { connect: [{ id: servicio.id }] } } });
  const u = await duenio.user.create({ data: { tenantId: A, name: "Laura", email: `laura-${randomUUID()}@erp.test`, passwordHash: "x", role: "PROFESSIONAL", professionalId: p.id } });
  const clientId = (await duenio.client.create({ data: { tenantId: A, name: "Clienta", phone: "1150009001" } })).id;
  const startsAt = businessWallTimeToUtc("2026-10-05", "10:00");
  const a = await duenio.appointment.create({ data: { tenantId: A, clientId, professionalId: p.id, serviceId: servicio.id, boxId: box.id, startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), status: "COMPLETED", priceAtBooking: PRECIO } });
  const sinTablas = await tenantTransaction((tx) => leerHechosCierreMes(tx, A, "2026-10", { esMostrador: false }), { tenantId: A });
  console.log("SIN-TABLAS(tx) comisiones=", JSON.stringify(sinTablas.comisiones));

  const pg = await import("pg");
  const cli = new pg.default.Client({ connectionString: base.urlDuenio });
  await cli.connect(); await cli.query(SQL); await cli.end();

  const r = await tenantTransaction((tx) => aplicarCobroTurnoInTx(tx, A, { appointmentId: a.id, status: "COMPLETED", precio: PRECIO, monto: PRECIO, method: "EFECTIVO", actor: `user:${u.id}`, detail: "Turno", idempotencyKey: randomUUID(), withSchema: true, cerradoHasta: null, camino: "cobro" }), { tenantId: A });
  assert.ok(r.applied && r.aRendir, "queda a rendir");

  const enTx = await tenantTransaction((tx) => leerHechosCierreMes(tx, A, "2026-10", { esMostrador: false }), { tenantId: A });
  console.log("CON-TABLAS tenantTransaction comisiones=", JSON.stringify(enTx.comisiones));
  const salida = await ejecutarAccion(duenia, () => leerHechosCierreMes(prisma, A, "2026-10", { esMostrador: false }));
  assert.equal(salida.tipo, "respuesta"); const suelto = (salida as { valor: Awaited<ReturnType<typeof leerHechosCierreMes>> }).valor;
  console.log("CON-TABLAS prisma suelto (page.tsx:57 / acciones.ts:89) comisiones=", JSON.stringify(suelto.comisiones));
  // Aislamiento: B no ve nada de A
  const deB = await tenantTransaction((tx) => leerHechosCierreMes(tx, base.b.id, "2026-10", { esMostrador: false }), { tenantId: base.b.id });
  console.log("TENANT-B comisiones=", JSON.stringify(deB.comisiones));
  assert.deepEqual(enTx.comisiones, { pendientes: 0, esperanSaldo: 0, esperanRendicion: 1 }, "en tx");
  assert.deepEqual(suelto.comisiones, { pendientes: 0, esperanSaldo: 0, esperanRendicion: 1 }, "con el cliente de produccion");
});
