// ============================================================================
// EL CRON DE RECORDATORIOS CON LAS CONEXIONES DE PRODUCCIÓN — base efímera con RLS.
// ============================================================================
//
// `/api/cron/reminders` corre sin pedido ni host. En producción tanto la conexión de la app como la
// de la consola (`OPERATOR_DATABASE_URL`) están sujetas a RLS (26/09/2026). El barrido leía los
// turnos de todos los negocios de una vez con la conexión de la consola: sin negocio puesto, esa
// lectura vuelve vacía y sin error, y no salía ningún recordatorio (CH es un cliente vivo).
//
// Acá se ejecuta la ruta REAL del cron con las dos conexiones como `app_rls` y se mira desde afuera,
// como dueño de las tablas:
//   · encuentra el turno que vence de CADA negocio y lo marca como avisado;
//   · cada recordatorio sale con la plantilla de SU negocio (se leyó parado en él);
//   · no toca los turnos que no le tocan (otro horario, sin confirmar), de ningún negocio.
// El email sale por Resend: `fetch` a la API de Resend se intercepta y se anota; nada sale de acá.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";

const HORA_MS = 60 * 60 * 1000;
const API_DE_RESEND = "https://api.resend.com/emails";

interface EmailEnviado {
  to: string;
  text: string;
}

test("cron de recordatorios con la consola sujeta a RLS: encuentra el turno de cada negocio, con su plantilla, y no toca los demás", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  const antes = { ...env };
  Object.assign(env, {
    // Como producción: la consola NO es la dueña de las tablas.
    OPERATOR_DATABASE_URL: base.urlApp,
    CRON_SECRET: "secreto-del-cron-qa",
    RESEND_API_KEY: "re_prueba_no_sale",
    DB_CONNECTION_LIMIT: "3",
    DB_CONNECT_TIMEOUT_MS: "5000",
  });
  const fetchReal = globalThis.fetch;
  const emails: EmailEnviado[] = [];
  globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    if (url !== API_DE_RESEND) return fetchReal(entrada, init);
    const cuerpo = JSON.parse(String(init?.body ?? "{}")) as { to: string; text: string };
    emails.push({ to: cuerpo.to, text: cuerpo.text });
    return new Response(JSON.stringify({ id: `email_${emails.length}` }), { status: 200 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = fetchReal;
    for (const k of ["OPERATOR_DATABASE_URL", "CRON_SECRET", "RESEND_API_KEY", "DB_CONNECTION_LIMIT", "DB_CONNECT_TIMEOUT_MS"]) {
      if (antes[k] === undefined) delete env[k];
      else env[k] = antes[k];
    }
  });

  const duenio = await prismaComoDuenio(base);
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { GET } = await import("@/app/api/cron/reminders/route");
  const { NextRequest } = await import("next/server");

  // La consola de verdad está sujeta a RLS: sin negocio no ve ni un turno ni un usuario.
  assert.equal(await operatorPrisma.user.count(), 0, "la conexión de la consola tiene que estar sujeta a RLS");

  const ahora = Date.now();
  /** Box, profesional, servicio con recordatorio a 24 h, plantilla de email propia y una clienta. */
  const armar = async (n: NegocioDePrueba, letra: "A" | "B") => {
    const box = await duenio.box.create({ data: { tenantId: n.id, name: `Box ${letra}` } });
    const profesional = await duenio.professional.create({ data: { tenantId: n.id, name: `Profesional ${letra}`, boxId: box.id } });
    const servicio = await duenio.service.create({
      data: { tenantId: n.id, name: `Servicio ${letra}`, durationMin: 60, price: 1000, reminderEnabled: true, reminderHoursBefore: 24 },
    });
    await duenio.messageTemplate.create({
      data: {
        tenantId: n.id,
        type: "APPOINTMENT_REMINDER",
        channel: "EMAIL",
        subject: `Recordatorio ${letra}`,
        body: `Plantilla del negocio ${letra}: {{clientName}}, te esperamos {{startsAt}}.`,
      },
    });
    const clienta = await duenio.client.create({
      data: { tenantId: n.id, name: `Clienta ${letra}`, phone: `11${letra === "A" ? 3 : 4}0000000`, email: `clienta-${letra.toLowerCase()}@${n.subdominio}.test` },
    });
    const turno = (horasHasta: number, status: "CONFIRMED" | "PENDING") => {
      const startsAt = new Date(ahora + horasHasta * HORA_MS);
      return duenio.appointment.create({
        data: {
          tenantId: n.id,
          clientId: clienta.id,
          professionalId: profesional.id,
          serviceId: servicio.id,
          boxId: box.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + HORA_MS),
          status,
        },
      });
    };
    return { clienta, turno };
  };
  const a = await armar(base.a, "A");
  const b = await armar(base.b, "B");
  const vence = { a: await a.turno(24, "CONFIRMED"), b: await b.turno(24, "CONFIRMED") };
  const noLeToca = {
    aSinConfirmar: await a.turno(24, "PENDING"),
    bOtroHorario: await b.turno(30, "CONFIRMED"), // dentro de las 72 h, fuera de la ventana de hoy
  };
  const fotoDe = (id: string) =>
    duenio.appointment.findUniqueOrThrow({ where: { id }, select: { reminderSentAt: true, updatedAt: true, status: true } });
  const noLeTocaAntes = { a: await fotoDe(noLeToca.aSinConfirmar.id), b: await fotoDe(noLeToca.bOtroHorario.id) };

  const r = await GET(
    new NextRequest("http://erp.test/api/cron/reminders", { headers: { authorization: "Bearer secreto-del-cron-qa" } }),
  );
  assert.equal(r.status, 200);
  const resumen = (await r.json()) as { checked: number; due: number; sent: number; failed: number; failures: unknown[] };

  // Encontró los turnos confirmados de los DOS negocios dentro de las 72 h (3) y le tocaban 2.
  assert.deepEqual(
    { checked: resumen.checked, due: resumen.due, sent: resumen.sent, failed: resumen.failed },
    { checked: 3, due: 2, sent: 2, failed: 0 },
    `resumen del cron: ${JSON.stringify(resumen)}`,
  );

  // Cada recordatorio a la clienta de su negocio, con la plantilla de su negocio.
  const porDestino = new Map(emails.map((e) => [e.to, e.text]));
  assert.equal(emails.length, 2);
  assert.match(porDestino.get(a.clienta.email!) ?? "", /^Plantilla del negocio A: Clienta A,/);
  assert.match(porDestino.get(b.clienta.email!) ?? "", /^Plantilla del negocio B: Clienta B,/);

  // Los que vencían quedaron avisados; los otros, de los dos negocios, sin tocar.
  assert.notEqual((await fotoDe(vence.a.id)).reminderSentAt, null);
  assert.notEqual((await fotoDe(vence.b.id)).reminderSentAt, null);
  assert.deepEqual(await fotoDe(noLeToca.aSinConfirmar.id), noLeTocaAntes.a);
  assert.deepEqual(await fotoDe(noLeToca.bOtroHorario.id), noLeTocaAntes.b);

  // Una segunda corrida no vuelve a mandar nada: los avisados ya no entran.
  const otra = await GET(
    new NextRequest("http://erp.test/api/cron/reminders", { headers: { authorization: "Bearer secreto-del-cron-qa" } }),
  );
  const segunda = (await otra.json()) as { checked: number; due: number };
  assert.deepEqual({ checked: segunda.checked, due: segunda.due }, { checked: 1, due: 0 });
  assert.equal(emails.length, 2);
});
