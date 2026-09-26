// Los recordatorios simulados no dejan datos personales en los logs (estándar §4, T1-E):
// se corre `sendAppointmentReminder` REAL contra una base efímera (lee la plantilla del negocio
// con RLS) y se mira todo lo que escribió en la consola.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";

test("el recordatorio simulado no escribe email, teléfono ni nombre de la clienta en el log", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  t.after(() => {
    if (antes !== undefined) process.env.RESEND_API_KEY = antes;
  });
  const { sendAppointmentReminder } = await import("@/lib/notifications");

  const lineas: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lineas.push(args.map(String).join(" "));
  let r;
  try {
    r = await sendAppointmentReminder({
      tenantId: base.a.id,
      clientName: "Mariela Quiroga",
      clientEmail: "mariela.quiroga@ejemplo.test",
      clientPhone: "+54 9 11 5555-0199",
      serviceName: "Limpieza facial",
      professionalName: "Sofi",
      startsAt: new Date("2026-10-01T13:00:00-03:00"),
    });
  } finally {
    console.log = original;
  }
  assert.equal(r.email.channel, "email");
  assert.equal(r.whatsapp.channel, "whatsapp");
  assert.equal(lineas.length, 2, lineas.join("\n"));
  const todo = lineas.join("\n");
  for (const dato of ["mariela.quiroga@ejemplo.test", "5555-0199", "5555", "Mariela", "Quiroga"]) {
    assert.ok(!todo.includes(dato), `el log no puede tener «${dato}»: ${todo}`);
  }
  assert.match(todo, new RegExp(`negocio ${base.a.id}`));
});
