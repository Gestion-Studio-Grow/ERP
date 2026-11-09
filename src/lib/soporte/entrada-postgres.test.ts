// ============================================================================
// ENTRADA DE TICKETS POR CANAL contra Postgres (base efímera, src/test/base-efimera.ts).
// ============================================================================
//
// La consola como `app_rls` (igual que producción) parada en cada negocio:
//   · idempotencia: el mismo mensaje dos veces, y dos veces en paralelo, deja UN ticket;
//   · aislamiento: parada en B no se ve el ticket de A; el mismo id de mensaje en B es OTRO ticket;
//   · un secreto nunca persiste (ni en el ticket ni en sus eventos) y queda el evento «secreto_tapado»;
//   · un mensaje que no dispara no escribe nada;
//   · sin la tabla (migración sin aplicar) → {sinTabla}.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("entrada por canal: idempotente, aislada por negocio, sin secretos guardados y tolerante sin tabla", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor(); // `server-only` → módulo vacío, como en el bundle de servidor

  const { operatorPrisma, enElNegocio } = await import("@/lib/operator-db");
  const { crearTicketDesdeCanal } = await import("./entrada.server");
  base.alBorrar(() => operatorPrisma.$disconnect());
  const duenio = await prismaComoDuenio(base);
  const A = base.a.id;
  const B = base.b.id;
  const wa = (idExterno: string, texto = "AYUDA no anda la caja") => ({ canal: "whatsapp", idExterno, texto, remitente: "+54 9 11 5555-0000" });

  // ── 1) Idempotencia: secuencial y en paralelo ──
  assert.deepEqual(await crearTicketDesdeCanal(operatorPrisma, A, wa("wamid.1")), { numero: 1, nuevo: true });
  assert.deepEqual(await crearTicketDesdeCanal(operatorPrisma, A, wa("wamid.1")), { numero: 1, nuevo: false }, "el reintento del webhook no duplica");
  const paralelo = await Promise.all([crearTicketDesdeCanal(operatorPrisma, A, wa("wamid.2")), crearTicketDesdeCanal(operatorPrisma, A, wa("wamid.2"))]);
  assert.deepEqual(paralelo.map((r) => ("numero" in r ? r.numero : null)), [2, 2]);
  assert.equal(paralelo.filter((r) => "nuevo" in r && r.nuevo).length, 1, "uno solo lo crea");
  assert.equal(await duenio.supportTicket.count({ where: { tenantId: A } }), 2);
  const tk1 = await duenio.supportTicket.findUniqueOrThrow({ where: { tenantId_origenId: { tenantId: A, origenId: "whatsapp:wamid.1" } } });
  assert.equal(tk1.canal, "whatsapp");
  assert.equal(tk1.tipo, "problema");
  assert.equal(tk1.creadoPor, "cliente:whatsapp");
  assert.equal(await duenio.supportTicketEvento.count({ where: { ticketId: tk1.id } }), 1, "sólo «creado»: sin secretos no hay evento de más");

  // ── 2) Aislamiento ──
  assert.equal(await enElNegocio(B, (tx) => tx.supportTicket.count(), operatorPrisma), 0, "parada en B no ve los tickets de A");
  assert.equal(await enElNegocio(B, (tx) => tx.supportTicketEvento.count(), operatorPrisma), 0);
  assert.deepEqual(await crearTicketDesdeCanal(operatorPrisma, B, wa("wamid.1")), { numero: 1, nuevo: true }, "el mismo id en B es otro ticket, con su propio número");
  assert.equal(await enElNegocio(B, (tx) => tx.supportTicket.count(), operatorPrisma), 1);
  assert.equal(await enElNegocio(A, (tx) => tx.supportTicket.count(), operatorPrisma), 2, "A sigue con los suyos");

  // ── 3) Secretos: ni en el ticket ni en los eventos; queda «secreto_tapado» con la cantidad ──
  const SECRETOS = ["Hunter2!", "4111 1111 1111 1111", "4111111111111111", "sk-ant-api03-AbCdEfGhIjKlMn", "0170099220000067797370"];
  const conSecretos = {
    canal: "mail",
    idExterno: "<m-secreto@mail>",
    asunto: "[AYUDA] no entra con contraseña: Hunter2!",
    texto: "Mi tarjeta 4111 1111 1111 1111, la key sk-ant-api03-AbCdEfGhIjKlMn y el CBU 0170099220000067797370.",
    remitente: "ana@estudio.com",
  };
  const r3 = await crearTicketDesdeCanal(operatorPrisma, A, conSecretos);
  assert.ok("numero" in r3 && r3.nuevo);
  const tk3 = await duenio.supportTicket.findUniqueOrThrow({ where: { tenantId_origenId: { tenantId: A, origenId: "mail:<m-secreto@mail>" } }, include: { eventos: true } });
  const guardado = JSON.stringify(tk3);
  for (const s of SECRETOS) assert.ok(!guardado.includes(s), `el secreto «${s.slice(0, 4)}…» no se guardó`);
  const tapado = tk3.eventos.filter((e) => e.tipo === "secreto_tapado");
  assert.equal(tapado.length, 1);
  assert.deepEqual(tapado[0].datos, { cantidad: 4, canal: "mail" });
  assert.equal(tapado[0].actor, "cliente:mail");
  assert.equal(tapado[0].texto, null);
  // El reintento no suma otro evento.
  await crearTicketDesdeCanal(operatorPrisma, A, conSecretos);
  assert.equal(await duenio.supportTicketEvento.count({ where: { ticketId: tk3.id, tipo: "secreto_tapado" } }), 1);

  // ── 4) Lo que no dispara no escribe nada ──
  const antes = await duenio.supportTicket.count();
  const r4 = await crearTicketDesdeCanal(operatorPrisma, A, wa("wamid.9", "hola, ¿cómo va?"));
  assert.ok("rechazado" in r4 && r4.motivo.length > 0);
  assert.ok("rechazado" in (await crearTicketDesdeCanal(operatorPrisma, "", wa("wamid.10"))));
  assert.equal(await duenio.supportTicket.count(), antes);

  // ── 5) Sin la tabla (Gate 2) ──
  await duenio.$executeRawUnsafe(`DROP TABLE IF EXISTS "SupportTicketEvento"`);
  assert.deepEqual(await crearTicketDesdeCanal(operatorPrisma, A, { ...conSecretos, idExterno: "<otro@mail>" }), { sinTabla: true }, "falta sólo la de eventos: se deshace todo");
  assert.equal(await duenio.supportTicket.count({ where: { tenantId: A, origenId: "mail:<otro@mail>" } }), 0);
  await duenio.$executeRawUnsafe(`DROP TABLE "SupportTicket"`);
  assert.deepEqual(await crearTicketDesdeCanal(operatorPrisma, A, wa("wamid.11")), { sinTabla: true });
  await duenio.$disconnect();
});
