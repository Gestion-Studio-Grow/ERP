// D11 a · Renombrar «Magra» contra una base de verdad (Postgres del arnés o PGlite:
// `node scripts/qa/p1-pglite.mjs src/lib/carniceria/renombrar-demo-postgres.test.ts`).
//
// Recorre la corrida real (`ejecutarRenombreMagra`, la misma del script): guarda (inexistente, ajeno,
// sin confirmación); dry-run que lista y no escribe; aplicar con rastro en AuditLog; 2.ª corrida
// vacía; lo fiscal intacto y listado; la plantilla de WhatsApp intacta; beauty-spa byte-idéntico.
// Nunca toca Neon: el arnés exige un servidor local.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("renombrar magra: guarda, dry-run, aplicar idempotente, fiscal y beauty-spa intactos", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { DemoAbortada } = await import("./demo-datos");
  const { ejecutarRenombreMagra, describirPlanRenombre, planSinCambios, NOMBRE_NUEVO, ACTOR_RENOMBRE, ACCION_RENOMBRE } = await import("./renombrar-demo");
  const dry = { slug: "magra", aplicar: false, confirmo: undefined };
  const aplicar = { slug: "magra", aplicar: true, confirmo: "magra" };
  const abortada = (e: unknown) => e instanceof DemoAbortada;

  // Guarda: el negocio magra todavía no existe → aborta (aun en dry-run).
  await assert.rejects(ejecutarRenombreMagra(dry), abortada);

  // beauty-spa con una plantilla que también dice «Magra»: no es suya la corrida.
  const spa = await duenio.tenant.create({ data: { slug: "beauty-spa", name: "Beauty Spa (prueba)" }, select: { id: true } });
  await duenio.messageTemplate.create({ data: { tenantId: spa.id, type: "APPOINTMENT_REMINDER", channel: "EMAIL", subject: "Magra", body: "Magra" } });
  const FISCAL = { arcaRazonSocial: "Magra Carnes SRL", arcaCuit: "20111111112", arcaCondicionIva: "RESPONSABLE_INSCRIPTO", arcaPuntoVenta: 3, arcaDomicilioFiscal: "Calle Falsa 123" };
  const magra = await duenio.tenant.create({
    data: { slug: "magra", name: "Magra — DEMO (carnicería)", subdomain: "magra", ...FISCAL },
    select: { id: true },
  });
  const mail = await duenio.messageTemplate.create({
    data: { tenantId: magra.id, type: "APPOINTMENT_REMINDER", channel: "EMAIL", subject: "Tu pedido en Magra", body: "Hola {cliente}, Magra te espera. magra.gsg.com.ar" },
    select: { id: true },
  });
  const wa = await duenio.messageTemplate.create({
    data: { tenantId: magra.id, type: "APPOINTMENT_REMINDER", channel: "WHATSAPP", body: "Magra por WhatsApp" },
    select: { id: true },
  });

  const fotoDe = async (tenantId: string) => {
    const [tenant, plantillas, audit] = await Promise.all([
      duenio.tenant.findUnique({ where: { id: tenantId } }),
      duenio.messageTemplate.findMany({ where: { tenantId }, orderBy: { id: "asc" } }),
      duenio.auditLog.findMany({ where: { tenantId }, orderBy: { id: "asc" } }),
    ]);
    return JSON.stringify({ tenant, plantillas, audit });
  };
  const spaAntes = await fotoDe(spa.id);

  // Guarda: slugs ajenos y escritura sin confirmación.
  for (const slug of ["beauty-spa", "magra-demo", "Magra"]) await assert.rejects(ejecutarRenombreMagra({ ...aplicar, slug }), abortada);
  await assert.rejects(ejecutarRenombreMagra({ ...aplicar, confirmo: undefined }), abortada);
  await assert.rejects(ejecutarRenombreMagra({ ...aplicar, confirmo: "beauty-spa" }), abortada);

  // Dry-run: lista cada campo y no escribe.
  const magraAntes = await fotoDe(magra.id);
  const r0 = await ejecutarRenombreMagra(dry);
  assert.equal(r0.cambiados, null);
  const lineas = describirPlanRenombre(r0.plan);
  for (const l of lineas) t.diagnostic(`dry-run: ${l}`);
  assert.deepEqual(lineas, [
    `Tenant · ${magra.id} · name · «Magra — DEMO (carnicería)» → «${NOMBRE_NUEVO}»`,
    `MessageTemplate · ${mail.id} · subject · «Tu pedido en Magra» → «Tu pedido en ${NOMBRE_NUEVO}»`,
    `MessageTemplate · ${mail.id} · body · «Hola {cliente}, Magra te espera. magra.gsg.com.ar» → «Hola {cliente}, ${NOMBRE_NUEVO} te espera. magra.gsg.com.ar»`,
    `Tenant · ${magra.id} · arcaRazonSocial · «Magra Carnes SRL» · no se cambia (fiscal): decide el dueño`,
  ]);
  assert.equal(await fotoDe(magra.id), magraAntes);

  // Aplicar.
  const r1 = await ejecutarRenombreMagra(aplicar);
  assert.equal(r1.cambiados, 3);
  const tn = await duenio.tenant.findUniqueOrThrow({ where: { id: magra.id } });
  assert.equal(tn.name, NOMBRE_NUEVO);
  assert.equal(tn.slug, "magra");
  assert.equal(tn.subdomain, "magra");
  for (const [k, v] of Object.entries(FISCAL)) assert.equal(tn[k as keyof typeof FISCAL], v, `fiscal ${k} intacto`);
  const m = await duenio.messageTemplate.findUniqueOrThrow({ where: { id: mail.id } });
  assert.equal(m.subject, `Tu pedido en ${NOMBRE_NUEVO}`);
  assert.equal(m.body, `Hola {cliente}, ${NOMBRE_NUEVO} te espera. magra.gsg.com.ar`);
  assert.equal((await duenio.messageTemplate.findUniqueOrThrow({ where: { id: wa.id } })).body, "Magra por WhatsApp");

  // Rastro: una fila por fila cambiada, con el valor viejo (rollback).
  const rastro = await duenio.auditLog.findMany({ where: { tenantId: magra.id, actor: ACTOR_RENOMBRE, action: ACCION_RENOMBRE }, orderBy: { entity: "asc" } });
  assert.deepEqual(
    rastro.map((a) => ({ entity: a.entity, entityId: a.entityId, changes: a.changes })),
    [
      {
        entity: "MessageTemplate",
        entityId: mail.id,
        changes: {
          subject: { antes: "Tu pedido en Magra", despues: `Tu pedido en ${NOMBRE_NUEVO}` },
          body: { antes: "Hola {cliente}, Magra te espera. magra.gsg.com.ar", despues: `Hola {cliente}, ${NOMBRE_NUEVO} te espera. magra.gsg.com.ar` },
        },
      },
      { entity: "Tenant", entityId: magra.id, changes: { name: { antes: "Magra — DEMO (carnicería)", despues: NOMBRE_NUEVO } } },
    ],
  );

  // 2.ª corrida: nada que cambiar (sólo el aviso fiscal), y nada escrito.
  const despues = await fotoDe(magra.id);
  const r2 = await ejecutarRenombreMagra(aplicar);
  assert.equal(planSinCambios(r2.plan), true);
  assert.equal(r2.cambiados, null);
  assert.equal(r2.plan.fiscales.length, 1);
  assert.ok(describirPlanRenombre(r2.plan).at(-1)!.startsWith("Nada que cambiar"));
  assert.equal(await fotoDe(magra.id), despues);

  // beauty-spa: byte-idéntico.
  assert.equal(await fotoDe(spa.id), spaAntes);
});
