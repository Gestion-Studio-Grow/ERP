/**
 * Fantasma Agenda, EJECUTADO contra Postgres con RLS (rol `app_rls`), con dos negocios:
 *
 *   · A (interruptor «fantasma-agenda» prendido): el cliente pide un turno por WhatsApp, confirma y
 *     queda un Appointment PENDING con la nota del bot, sólo en A;
 *   · B (apagado): el mismo teléfono escribe y no pasa nada: ni turno, ni mensaje, ni respuesta;
 *   · wamid repetido (Meta reintenta): no se atiende dos veces, sigue habiendo un solo turno;
 *   · slot ocupado al confirmar: no crea turno y la respuesta ofrece otros horarios;
 *   · tope de charlas del mes alcanzado: no atiende, avisa, y no crea turno;
 *   · dos «sí» simultáneos del mismo cliente: un solo turno (toma de la conversación + solapamiento);
 *   · hora que no está en la grilla ofrecida: se rechaza como «se ocupó».
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const TEL = "5491140001111";
const TEL2 = "5491140002222";
const TEL3 = "5491140003333";

type Sembrado = { base: BaseEfimera; atender: typeof import("./atender.server").atenderMensaje };
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  delete process.env.WHATSAPP_CLOUD_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.FANTASMA_TOPE_CHARLAS_MES;
  const duenio = await prismaComoDuenio(base);

  for (const tenantId of [base.a.id, base.b.id]) {
    const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
    const corte = await duenio.service.create({ data: { tenantId, name: "Corte", durationMin: 30, price: 8000 } });
    const pro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id, services: { connect: [{ id: corte.id }] } } });
    await duenio.workingHours.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId, professionalId: pro.id, dayOfWeek, startTime: "00:00", endTime: "23:59" })),
    });
  }
  await duenio.auditLog.create({
    data: { tenantId: base.a.id, actor: "operator:test", action: "interruptor.encender", entity: "Interruptor", entityId: "fantasma-agenda", channel: "operador", changes: {} },
  });

  const { atenderMensaje } = await import("./atender.server");
  sembrado = { base, atender: atenderMensaje };
  return sembrado;
}

async function turnos(s: Sembrado, tenantId: string) {
  const duenio = await prismaComoDuenio(s.base);
  return duenio.appointment.findMany({ where: { tenantId }, select: { status: true, notes: true, priceAtBooking: true } });
}

const PEDIDO = "quiero un turno de corte mañana a las 15:00";

test("A prendido: el bot deja el turno PENDING sólo en A", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const r1 = await s.atender({ tenantId: s.base.a.id, from: TEL, text: PEDIDO, wamid: "w1", contactName: "Ana", now: new Date() });
  assert.equal(r1.atendido, true);
  assert.match(r1.respuesta ?? "", /Confirmame/);
  const r2 = await s.atender({ tenantId: s.base.a.id, from: TEL, text: "sí", wamid: "w2", now: new Date() });
  assert.equal(r2.atendido, true);
  assert.match(r2.respuesta ?? "", /pendiente/i);

  const enA = await turnos(s, s.base.a.id);
  assert.equal(enA.length, 1);
  assert.equal(enA[0].status, "PENDING");
  assert.equal(enA[0].priceAtBooking, 8000);
  assert.match(enA[0].notes ?? "", /Fantasma Agenda/);
  assert.equal((await turnos(s, s.base.b.id)).length, 0);

  const duenio = await prismaComoDuenio(s.base);
  const salida = await duenio.mensajeWhatsapp.findMany({ where: { tenantId: s.base.a.id, direccion: "salida" } });
  assert.equal(salida.length, 2);
  assert.ok(salida.every((m) => m.estadoEntrega === "sin-credenciales"));
});

test("B apagado: el mismo teléfono no recibe nada ni deja filas", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const r = await s.atender({ tenantId: s.base.b.id, from: TEL, text: PEDIDO, wamid: "w1", now: new Date() });
  assert.deepEqual(r, { atendido: false, motivo: "apagado", respuesta: null });
  const duenio = await prismaComoDuenio(s.base);
  assert.equal(await duenio.mensajeWhatsapp.count({ where: { tenantId: s.base.b.id } }), 0);
  assert.equal(await duenio.conversacionWhatsapp.count({ where: { tenantId: s.base.b.id } }), 0);
  assert.equal((await turnos(s, s.base.b.id)).length, 0);
});

test("wamid repetido: no se atiende dos veces, un solo turno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const r = await s.atender({ tenantId: s.base.a.id, from: TEL, text: "sí", wamid: "w2", now: new Date() });
  assert.equal(r.atendido, false);
  if (!r.atendido) assert.equal(r.motivo, "duplicado");
  assert.equal((await turnos(s, s.base.a.id)).length, 1);
});

test("slot ocupado al confirmar: sin turno y ofrece otro horario", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const r1 = await s.atender({ tenantId: s.base.a.id, from: TEL2, text: PEDIDO, wamid: "x1", now: new Date() });
  assert.match(r1.respuesta ?? "", /Confirmame/);
  const r2 = await s.atender({ tenantId: s.base.a.id, from: TEL2, text: "dale", wamid: "x2", now: new Date() });
  assert.equal(r2.atendido, true);
  assert.match(r2.respuesta ?? "", /ocupó/);
  assert.match(r2.respuesta ?? "", /\d{2}:\d{2}/);
  assert.equal((await turnos(s, s.base.a.id)).length, 1);
});

test("tope de charlas del mes alcanzado: avisa y no crea turno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const charlas = await duenio.auditLog.count({ where: { tenantId: s.base.a.id, entity: "FantasmaCharla" } });
  assert.equal(charlas, 2);
  process.env.FANTASMA_TOPE_CHARLAS_MES = String(charlas);
  try {
    const r1 = await s.atender({ tenantId: s.base.a.id, from: TEL3, text: PEDIDO, wamid: "y1", now: new Date() });
    assert.equal(r1.atendido, false);
    if (!r1.atendido) assert.equal(r1.motivo, "tope");
    assert.match(r1.respuesta ?? "", /este mes/);
    const r2 = await s.atender({ tenantId: s.base.a.id, from: TEL3, text: "sí", wamid: "y2", now: new Date() });
    assert.deepEqual(r2, { atendido: false, motivo: "tope", respuesta: null });
    assert.equal((await turnos(s, s.base.a.id)).length, 1);
    assert.equal(await duenio.auditLog.count({ where: { tenantId: s.base.a.id, entity: "FantasmaCharla" } }), 2);
  } finally {
    delete process.env.FANTASMA_TOPE_CHARLAS_MES;
  }
});

test("dos 'sí' simultáneos del mismo cliente con dos profesionales libres: un solo turno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const duenio = await prismaComoDuenio(s.base);
  const color = await duenio.service.create({ data: { tenantId: A, name: "Color", durationMin: 30, price: 10000 } });
  for (const nombre of ["Ana", "Bea"]) {
    const box = await duenio.box.create({ data: { tenantId: A, name: `Box ${nombre}` } });
    const pro = await duenio.professional.create({ data: { tenantId: A, name: nombre, boxId: box.id, services: { connect: [{ id: color.id }] } } });
    await duenio.workingHours.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId: A, professionalId: pro.id, dayOfWeek, startTime: "00:00", endTime: "23:59" })),
    });
  }
  const tel = "5491140004444";
  const r1 = await s.atender({ tenantId: A, from: tel, text: "quiero un turno de color mañana a las 16:00", wamid: "z1", now: new Date() });
  assert.match(r1.respuesta ?? "", /Confirmame/);
  await Promise.allSettled([
    s.atender({ tenantId: A, from: tel, text: "sí", wamid: "z2", now: new Date() }),
    s.atender({ tenantId: A, from: tel, text: "si", wamid: "z3", now: new Date() }),
  ]);
  assert.equal(await duenio.appointment.count({ where: { tenantId: A, serviceId: color.id } }), 1);
  // La conversación no queda tomada: el siguiente mensaje se atiende.
  const r4 = await s.atender({ tenantId: A, from: tel, text: "hola", wamid: "z4", now: new Date() });
  assert.equal(r4.atendido, true);
});

test("hora fuera de la grilla ofrecida (18:07): sin turno y ofrece los horarios del día", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const tel = "5491140005555";
  await s.atender({ tenantId: A, from: tel, text: "quiero un turno de corte mañana a las 18:07", wamid: "h1", now: new Date() });
  const r = await s.atender({ tenantId: A, from: tel, text: "sí", wamid: "h2", now: new Date() });
  assert.match(r.respuesta ?? "", /\d{2}:\d{2}/);
  const duenio = await prismaComoDuenio(s.base);
  assert.equal(await duenio.appointment.count({ where: { tenantId: A, client: { phone: tel } } }), 0);
});
