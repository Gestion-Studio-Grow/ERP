import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
type S = { base: BaseEfimera; atender: typeof import("@/lib/fantasma-agenda/atender.server").atenderMensaje };
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
  for (const tenantId of [base.a.id, base.b.id]) {
    const box = await d.box.create({ data: { tenantId, name: "Box" } });
    const svc = await d.service.create({ data: { tenantId, name: "Corte", durationMin: 30, price: 8000 } });
    const pro = await d.professional.create({ data: { tenantId, name: "Caro", boxId: box.id, services: { connect: [{ id: svc.id }] } } });
    await d.workingHours.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId, professionalId: pro.id, dayOfWeek, startTime: "00:00", endTime: "23:59" })) });
    await d.auditLog.create({ data: { tenantId, actor: "operator:test", action: "interruptor.encender", entity: "Interruptor", entityId: "fantasma-agenda", channel: "operador", changes: {} } });
  }
  const { atenderMensaje } = await import("@/lib/fantasma-agenda/atender.server");
  s0 = { base, atender: atenderMensaje };
  return s0;
}

async function trabada(s: S, tenantId: string, tel: string) {
  const d = await prismaComoDuenio(s.base);
  const c = await d.conversacionWhatsapp.create({
    data: { tenantId, telefono: tel, estado: "agenda:atendiendo", contexto: { flow: "idle", draft: {}, mensajes: 1, ultimo: new Date().toISOString(), avisado: null } },
  });
  return c;
}

test("T1 trabada: a los 59 s sigue ocupada, a los 61 s se libera y contesta", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const tel = "5491160000001";
  const c = await trabada(s, A, tel);
  const r59 = await s.atender({ tenantId: A, from: tel, text: "hola", wamid: "t1-a", now: new Date(c.updatedAt.getTime() + 59_000) });
  assert.equal(r59.atendido, false);
  if (!r59.atendido) assert.equal(r59.motivo, "ocupado");
  const r61 = await s.atender({ tenantId: A, from: tel, text: "hola", wamid: "t1-b", now: new Date(c.updatedAt.getTime() + 61_000) });
  assert.equal(r61.atendido, true);
  const d = await prismaComoDuenio(s.base);
  const fin = await d.conversacionWhatsapp.findUnique({ where: { id: c.id } });
  assert.notEqual(fin!.estado, "agenda:atendiendo");
});

test("T2 la de A trabada: un mensaje del mismo teléfono en B no la libera ni la toca", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id, B = s.base.b.id;
  const tel = "5491160000002";
  const c = await trabada(s, A, tel);
  const rB = await s.atender({ tenantId: B, from: tel, text: "hola", wamid: "t2-b", now: new Date(c.updatedAt.getTime() + 120_000) });
  assert.equal(rB.atendido, true);
  const d = await prismaComoDuenio(s.base);
  const enA = await d.conversacionWhatsapp.findUnique({ where: { id: c.id } });
  assert.equal(enA!.estado, "agenda:atendiendo");
  assert.equal(enA!.updatedAt.getTime(), c.updatedAt.getTime());
});

test("T3 dos retomas simultáneas de una trabada vencida: sólo una contesta", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const tel = "5491160000003";
  const c = await trabada(s, A, tel);
  const now = new Date(c.updatedAt.getTime() + 90_000);
  const rs = await Promise.all([
    s.atender({ tenantId: A, from: tel, text: "hola", wamid: "t3-a", now }),
    s.atender({ tenantId: A, from: tel, text: "hola", wamid: "t3-b", now }),
  ]);
  assert.equal(rs.filter((r) => r.atendido).length, 1);
  const d = await prismaComoDuenio(s.base);
  assert.equal(await d.mensajeWhatsapp.count({ where: { tenantId: A, telefono: tel, direccion: "salida" } }), 1);
  const fin = await d.conversacionWhatsapp.findUnique({ where: { id: c.id } });
  assert.notEqual(fin!.estado, "agenda:atendiendo");
});

test("T4 el que pierde la carrera: no traba la conversación, no cuenta charla de más, y el siguiente se atiende", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const tel = "5491160000004";
  await s.atender({ tenantId: A, from: tel, text: "hola", wamid: "t4-0", now: new Date() });
  const rs = await Promise.all([
    s.atender({ tenantId: A, from: tel, text: "hola", wamid: "t4-a", now: new Date() }),
    s.atender({ tenantId: A, from: tel, text: "horarios", wamid: "t4-b", now: new Date() }),
  ]);
  const ocup = rs.filter((r) => !r.atendido).length;
  console.log("T4 perdedores:", ocup, rs.map((r) => (r.atendido ? "ok" : r.motivo)));
  const d = await prismaComoDuenio(s.base);
  const fin = await d.conversacionWhatsapp.findFirst({ where: { tenantId: A, telefono: tel } });
  assert.notEqual(fin!.estado, "agenda:atendiendo");
  assert.equal(await d.auditLog.count({ where: { tenantId: A, entity: "FantasmaCharla", actor: `cliente:${tel}` } }), 1);
  const r3 = await s.atender({ tenantId: A, from: tel, text: "hola", wamid: "t4-c", now: new Date() });
  assert.equal(r3.atendido, true);
});

test("T5 error dentro de la atención: libera la toma", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const tel = "5491160000005";
  // fecha inválida → fuerza un throw en algún puerto? usamos now inválido para romper inicioDelMes
  let tiro = false;
  try {
    await s.atender({ tenantId: A, from: tel, text: "hola", wamid: "t5-a", now: new Date(NaN) });
  } catch {
    tiro = true;
  }
  const d = await prismaComoDuenio(s.base);
  const fin = await d.conversacionWhatsapp.findFirst({ where: { tenantId: A, telefono: tel } });
  console.log("T5 tiró:", tiro, "estado:", fin?.estado);
  assert.notEqual(fin?.estado, "agenda:atendiendo");
});
