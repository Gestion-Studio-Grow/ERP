// Botón de arrepentimiento y Botón de baja de Factoque: el núcleo puro (src/lib/factoque-tramites.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoParaGsg, constanciaPorMail, esTipoTramite, leerFormularioTramite, mensajeDelTramite, numeroDeTramite } from "@/lib/factoque-tramites";

test("número de trámite: tipo, día y 5 caracteres que se dictan sin confundir", () => {
  assert.match(numeroDeTramite("arrepentimiento", "2026-11-08"), /^ARR-20261108-[A-HJ-NP-Z2-9]{5}$/);
  assert.match(numeroDeTramite("baja", "2026-11-08"), /^BAJ-20261108-[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(numeroDeTramite("baja", "2026-11-08", (n) => n - 1), "BAJ-20261108-99999");
});

test("formulario: email y CUIT obligatorios; motivo opcional y acotado", () => {
  assert.deepEqual(leerFormularioTramite("x", "20111111112", ""), { ok: false, error: "Poné un email válido: ahí te mandamos la constancia.", campo: "email" });
  const malCuit = leerFormularioTramite("ana@x.com", "20111111113", "");
  assert.equal(malCuit.ok, false);
  assert.ok(!malCuit.ok && malCuit.campo === "cuit");
  const ok = leerFormularioTramite("  Ana@X.com ", "20-11111111-2", "  ya   no lo uso ");
  assert.deepEqual(ok, { ok: true, datos: { email: "ana@x.com", cuit: "20111111112", motivo: "ya no lo uso" } });
  const largo = leerFormularioTramite("ana@x.com", "20111111112", "a".repeat(500));
  assert.ok(largo.ok && largo.datos.motivo.length === 300);
});

test("tipo: sólo arrepentimiento o baja", () => {
  assert.ok(esTipoTramite("baja") && esTipoTramite("arrepentimiento"));
  assert.ok(!esTipoTramite("borrar") && !esTipoTramite(undefined));
});

test("mensaje: qué pasó con el plan y el plazo de la constancia", () => {
  const arr = mensajeDelTramite("arrepentimiento", "plan_a_gratis");
  assert.match(arr, /volviste a Factoque Gratis/);
  assert.match(arr, /devolvemos lo que pagaste/);
  assert.match(arr, /24 horas/);
  const baja = mensajeDelTramite("baja", "plan_a_gratis");
  assert.match(baja, /No se te cobra más/);
  assert.match(baja, /72 horas/);
  assert.match(mensajeDelTramite("baja", "ya_era_gratis"), /cerrar la cuenta/);
  assert.match(mensajeDelTramite("arrepentimiento", "registrado"), /Recibimos tu pedido/);
});

test("aviso a GSG: trámite, CUIT, email, motivo y estado", () => {
  const t = avisoParaGsg("baja", "BAJ-1", { email: "a@b.com", cuit: "20111111112", motivo: "" }, "plan_a_gratis");
  assert.match(t, /Botón de baja · trámite BAJ-1/);
  assert.match(t, /CUIT: 20111111112/);
  assert.match(t, /Motivo: \(no lo dijo\)/);
  assert.match(t, /ya está en Gratis/);
});

test("constancia por mail: número, fecha, CUIT y qué pasó; con mail conectado el mensaje lo dice", () => {
  const c = constanciaPorMail("arrepentimiento", "ARR-20261108-AB2CD", { email: "a@b.com", cuit: "20111111112", motivo: "" }, "plan_a_gratis", "8/11/2026, 10:00:00");
  assert.equal(c.asunto, "Factoque · Botón de arrepentimiento · trámite ARR-20261108-AB2CD");
  assert.match(c.cuerpo, /Número de trámite: ARR-20261108-AB2CD/);
  assert.match(c.cuerpo, /Fecha: 8\/11\/2026/);
  assert.match(c.cuerpo, /volviste a Factoque Gratis/);
  assert.doesNotMatch(c.cuerpo, /dentro de las 24 horas/);
  assert.match(mensajeDelTramite("baja", "registrado", true), /constancia a tu mail/);
  assert.match(mensajeDelTramite("baja", "registrado", false), /72 horas/);
});
