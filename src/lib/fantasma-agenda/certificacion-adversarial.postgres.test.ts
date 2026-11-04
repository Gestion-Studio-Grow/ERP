import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
type S = { base: BaseEfimera; atender: typeof import("@/lib/fantasma-agenda/atender.server").atenderMensaje; colorA: string; corteB: string };
let s0: S | null = null;

async function preparar(t: import("node:test").TestContext): Promise<S | null> {
  if (s0) return s0;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "8", DB_CONNECT_TIMEOUT_MS: "3000" });
  delete process.env.WHATSAPP_CLOUD_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.FANTASMA_TOPE_CHARLAS_MES;
  const d = await prismaComoDuenio(base);
  // A: "Color" con DOS profesionales (dos boxes). B: "Corte" con una.
  const tA = base.a.id;
  const color = await d.service.create({ data: { tenantId: tA, name: "Color", durationMin: 30, price: 10000 } });
  for (const n of ["Ana", "Bea"]) {
    const box = await d.box.create({ data: { tenantId: tA, name: `Box ${n}` } });
    const pro = await d.professional.create({ data: { tenantId: tA, name: n, boxId: box.id, services: { connect: [{ id: color.id }] } } });
    await d.workingHours.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId: tA, professionalId: pro.id, dayOfWeek, startTime: "00:00", endTime: "23:59" })) });
  }
  const tB = base.b.id;
  const boxB = await d.box.create({ data: { tenantId: tB, name: "Box B" } });
  const corteB = await d.service.create({ data: { tenantId: tB, name: "Corte", durationMin: 30, price: 5000 } });
  const proB = await d.professional.create({ data: { tenantId: tB, name: "Zoe", boxId: boxB.id, services: { connect: [{ id: corteB.id }] } } });
  await d.workingHours.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId: tB, professionalId: proB.id, dayOfWeek, startTime: "00:00", endTime: "23:59" })) });
  await d.auditLog.create({ data: { tenantId: tA, actor: "operator:test", action: "interruptor.encender", entity: "Interruptor", entityId: "fantasma-agenda", channel: "operador", changes: {} } });
  const { atenderMensaje } = await import("@/lib/fantasma-agenda/atender.server");
  s0 = { base, atender: atenderMensaje, colorA: color.id, corteB: corteB.id };
  return s0;
}

const now = () => new Date();

test("C1 doble 'sí' simultáneo del mismo cliente con 2 profesionales: un solo turno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const tel = "5491150000001";
  const r1 = await s.atender({ tenantId: A, from: tel, text: "quiero un turno de color mañana a las 16:00", wamid: "c1-1", now: now() });
  assert.match(r1.respuesta ?? "", /Confirmame/);
  const rs = await Promise.allSettled([
    s.atender({ tenantId: A, from: tel, text: "sí", wamid: "c1-2", now: now() }),
    s.atender({ tenantId: A, from: tel, text: "si", wamid: "c1-3", now: now() }),
  ]);
  const d = await prismaComoDuenio(s.base);
  const ts = await d.appointment.findMany({ where: { tenantId: A, serviceId: s.colorA } });
  console.log("C1 turnos:", ts.length, rs.map((r) => r.status));
  assert.equal(ts.length, 1, "el mismo cliente quedó con dos turnos en el mismo horario");
});

test("C2 dos clientes distintos, mismo hueco, sólo 1 profesional libre: un turno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const B = s.base.b.id;
  const d = await prismaComoDuenio(s.base);
  await d.auditLog.create({ data: { tenantId: B, actor: "operator:test", action: "interruptor.encender", entity: "Interruptor", entityId: "fantasma-agenda", channel: "operador", changes: {} } });
  const pedido = "quiero un turno de corte mañana a las 11:00";
  await s.atender({ tenantId: B, from: "5491150000011", text: pedido, wamid: "c2-1", now: now() });
  await s.atender({ tenantId: B, from: "5491150000012", text: pedido, wamid: "c2-2", now: now() });
  await Promise.allSettled([
    s.atender({ tenantId: B, from: "5491150000011", text: "sí", wamid: "c2-3", now: now() }),
    s.atender({ tenantId: B, from: "5491150000012", text: "sí", wamid: "c2-4", now: now() }),
  ]);
  const ts = await d.appointment.findMany({ where: { tenantId: B } });
  assert.equal(ts.length, 1);
  assert.ok(ts.every((x) => x.status === "PENDING"));
});

test("C3 mismo wamid simultáneo en conversación nueva: una sola respuesta", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const tel = "5491150000021";
  const rs = await Promise.allSettled([
    s.atender({ tenantId: A, from: tel, text: "hola", wamid: "c3", now: now() }),
    s.atender({ tenantId: A, from: tel, text: "hola", wamid: "c3", now: now() }),
  ]);
  console.log("C3:", rs.map((r) => (r.status === "fulfilled" ? JSON.stringify(r.value).slice(0, 60) : String((r as PromiseRejectedResult).reason).slice(0, 80))));
  const d = await prismaComoDuenio(s.base);
  assert.equal(await d.mensajeWhatsapp.count({ where: { tenantId: A, telefono: tel, direccion: "salida" } }), 1);
  assert.equal(await d.auditLog.count({ where: { tenantId: A, entity: "FantasmaCharla", actor: `cliente:${tel}` } }), 1);
});

test("C4 hora fuera de la grilla ofrecida (16:07) no debería entrar", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const tel = "5491150000031";
  await s.atender({ tenantId: A, from: tel, text: "quiero un turno de color mañana a las 18:07", wamid: "c4-1", now: now() });
  const r = await s.atender({ tenantId: A, from: tel, text: "sí", wamid: "c4-2", now: now() });
  const d = await prismaComoDuenio(s.base);
  const ts = await d.appointment.findMany({ where: { tenantId: A, client: { phone: tel } }, select: { startsAt: true } });
  console.log("C4:", (r.respuesta ?? "").slice(0, 80), ts.map((x) => x.startsAt.toISOString()));
  assert.equal(ts.length, 0, "aceptó un horario fuera de la grilla de 30 min");
});

test("C5 servicio borrado entre oferta y confirmación: sin turno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const tel = "5491150000041";
  const d = await prismaComoDuenio(s.base);
  const svc = await d.service.create({ data: { tenantId: A, name: "Brushing", durationMin: 30, price: 3000 } });
  const p = await d.professional.findFirst({ where: { tenantId: A, name: "Ana" } });
  await d.professional.update({ where: { id: p!.id }, data: { services: { connect: [{ id: svc.id }] } } });
  const r1 = await s.atender({ tenantId: A, from: tel, text: "quiero un turno de brushing mañana a las 20:00", wamid: "c5-1", now: now() });
  assert.match(r1.respuesta ?? "", /Confirmame/);
  await d.service.update({ where: { id: svc.id }, data: { deletedAt: new Date() } });
  await s.atender({ tenantId: A, from: tel, text: "sí", wamid: "c5-2", now: now() });
  assert.equal(await d.appointment.count({ where: { serviceId: svc.id } }), 0);
});

test("C6 serviceId de B inyectado en la conversación de A: no crea turno en ningún negocio", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const tel = "5491150000051";
  const d = await prismaComoDuenio(s.base);
  await d.conversacionWhatsapp.create({
    data: { tenantId: A, telefono: tel, estado: "agenda:confirm_booking", contexto: { flow: "confirm_booking", draft: { serviceId: s.corteB, serviceName: "Corte", dateISO: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), time: "10:00" }, mensajes: 1, ultimo: new Date().toISOString(), avisado: null } },
  });
  const antesB = await d.appointment.count({ where: { tenantId: s.base.b.id } });
  await s.atender({ tenantId: A, from: tel, text: "sí", wamid: "c6-1", now: now() });
  assert.equal(await d.appointment.count({ where: { serviceId: s.corteB, client: { phone: tel } } }), 0);
  assert.equal(await d.appointment.count({ where: { tenantId: s.base.b.id } }), antesB);
});

test("C7 charla larga: mensaje 13+ no responde ni cuenta charla", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const tel = "5491150000061";
  for (let i = 0; i < 12; i++) await s.atender({ tenantId: A, from: tel, text: "hola", wamid: `c7-${i}`, now: now() });
  const r13 = await s.atender({ tenantId: A, from: tel, text: "hola", wamid: "c7-13", now: now() });
  const r14 = await s.atender({ tenantId: A, from: tel, text: "quiero un turno de color mañana a las 21:00", wamid: "c7-14", now: now() });
  assert.equal(r13.atendido, false);
  assert.ok(r13.respuesta);
  assert.deepEqual(r14, { atendido: false, motivo: "charla-larga", respuesta: null });
  const d = await prismaComoDuenio(s.base);
  assert.equal(await d.auditLog.count({ where: { tenantId: A, entity: "FantasmaCharla", actor: `cliente:${tel}` } }), 1);
});

test("C8 nombre hostil y texto larguísimo: no rompe, nombre no va a notes", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const tel = "5491150000071";
  const r0 = await s.atender({ tenantId: A, from: tel, text: "x".repeat(100_000), wamid: "c8-0", contactName: "'); DROP TABLE x;--", now: now() });
  assert.ok(r0.atendido);
  await s.atender({ tenantId: A, from: tel, text: "quiero un turno de color mañana a las 22:00", wamid: "c8-1", contactName: "'); DROP TABLE x;--", now: now() });
  await s.atender({ tenantId: A, from: tel, text: "sí", wamid: "c8-2", contactName: "'); DROP TABLE x;--", now: now() });
  const d = await prismaComoDuenio(s.base);
  const ts = await d.appointment.findMany({ where: { tenantId: A, client: { phone: tel } }, select: { notes: true, status: true } });
  assert.equal(ts.length, 1);
  assert.equal(ts[0].status, "PENDING");
  assert.doesNotMatch(ts[0].notes ?? "", /DROP/);
});
