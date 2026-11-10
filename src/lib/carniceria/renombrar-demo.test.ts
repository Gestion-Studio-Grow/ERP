// D11 a · Renombrar «Magra» en mails y comprobantes: el plan (puro). Contra base: renombrar-demo-postgres.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MARCA_DEMO_GSG } from "@/lib/marca-demo";
import { describirPlanRenombre, nombraMagra, planRenombre, planSinCambios, reemplazarMagra, type EstadoRenombre } from "./renombrar-demo";

const N = MARCA_DEMO_GSG.nombre;
const sinFiscal = { arcaRazonSocial: null, arcaDomicilioFiscal: null, bancosDomicilioEmisor: null, arcaIibb: null };
const estado = (o: Partial<EstadoRenombre["tenant"]> = {}, plantillasMail: EstadoRenombre["plantillasMail"] = []): EstadoRenombre => ({
  tenant: { id: "t1", name: "Magra — DEMO (carnicería)", ...sinFiscal, ...o },
  plantillasMail,
});

test("el nombre nuevo sale de MARCA_DEMO_GSG", () => {
  assert.equal(N, "GSG Carnes al vacío");
});

test("la palabra: con mayúscula, entera y fuera de direcciones", () => {
  assert.equal(nombraMagra("Hola de Magra"), true);
  assert.equal(nombraMagra("Magra — DEMO"), true);
  assert.equal(nombraMagra("magra"), false, "el slug en minúscula no es el nombre");
  assert.equal(nombraMagra("Magras y Magrado"), false);
  assert.equal(nombraMagra("entrá a https://Magra.gsg.com.ar/turnos"), false);
  assert.equal(nombraMagra("escribinos a ventas@Magra"), false);
  assert.equal(nombraMagra(null), false);
  assert.equal(reemplazarMagra("Te espera Magra. Magra.gsg.com.ar"), `Te espera ${N}. Magra.gsg.com.ar`);
});

test("Tenant.name pasa entero; las plantillas cambian sólo la palabra", () => {
  const p = planRenombre(
    estado({}, [
      { id: "m2", subject: "Tu turno en Magra", body: "Hola {cliente}, te esperamos en Magra." },
      { id: "m1", subject: null, body: "Sin el nombre" },
    ]),
  );
  assert.deepEqual(p.cambios, [
    { tabla: "Tenant", id: "t1", campo: "name", viejo: "Magra — DEMO (carnicería)", nuevo: N },
    { tabla: "MessageTemplate", id: "m2", campo: "subject", viejo: "Tu turno en Magra", nuevo: `Tu turno en ${N}` },
    { tabla: "MessageTemplate", id: "m2", campo: "body", viejo: "Hola {cliente}, te esperamos en Magra.", nuevo: `Hola {cliente}, te esperamos en ${N}.` },
  ]);
  assert.deepEqual(p.fiscales, []);
});

test("lo fiscal con «Magra» se lista y no se cambia", () => {
  const p = planRenombre(estado({ name: "Otro", arcaRazonSocial: "Magra SRL", arcaDomicilioFiscal: "Calle 1", arcaIibb: "Magra 123" }));
  assert.deepEqual(p.cambios, []);
  assert.deepEqual(p.fiscales, [
    { tabla: "Tenant", id: "t1", campo: "arcaRazonSocial", actual: "Magra SRL" },
    { tabla: "Tenant", id: "t1", campo: "arcaIibb", actual: "Magra 123" },
  ]);
  const lineas = describirPlanRenombre(p);
  assert.ok(lineas.includes("Tenant · t1 · arcaRazonSocial · «Magra SRL» · no se cambia (fiscal): decide el dueño"));
  assert.ok(lineas.at(-1)!.startsWith("Nada que cambiar"));
});

test("idempotente: aplicado el plan, el siguiente está vacío", () => {
  const plantillas = [{ id: "m1", subject: "Magra te recuerda", body: "Magra\nMagra" }];
  const p1 = planRenombre(estado({}, plantillas));
  assert.equal(p1.cambios.length, 3);
  const aplicado = estado(
    { name: p1.cambios[0].nuevo },
    [{ id: "m1", subject: reemplazarMagra(plantillas[0].subject), body: reemplazarMagra(plantillas[0].body) }],
  );
  assert.equal(planSinCambios(planRenombre(aplicado)), true);
  assert.deepEqual(describirPlanRenombre(planRenombre(aplicado)), ["Nada que cambiar: mails y comprobantes ya no dicen «Magra»."]);
});

test("la descripción: una línea por campo, saltos visibles", () => {
  const p = planRenombre(estado({}, [{ id: "m1", subject: null, body: "Magra\nchau" }]));
  assert.deepEqual(describirPlanRenombre(p), [
    `Tenant · t1 · name · «Magra — DEMO (carnicería)» → «${N}»`,
    `MessageTemplate · m1 · body · «Magra⏎chau» → «${N}⏎chau»`,
  ]);
});
