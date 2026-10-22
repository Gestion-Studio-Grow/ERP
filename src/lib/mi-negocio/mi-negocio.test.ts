// Mi negocio (CH-035/053): qué propone la hoja de cancelar con la seña, el alias para los WhatsApp y el
// formulario → `validarReglas`. Puro.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGLAS_POR_DEFECTO, validarReglas } from "@/lib/settings";
import { aliasParaMensajes, leerFormularioMiNegocio, leerPesos, propuestaDeSenia } from "./mi-negocio";

const D2 = REGLAS_POR_DEFECTO; // 24 h · tarde → retener · no vino → retener (placeholder provisional)

test("CH-035 · «24 h / se pierde la seña»: la clienta cancela 6 h antes → «Se la queda el negocio»", () => {
  const p = propuestaDeSenia(D2, "clienta", 6);
  assert.equal(p.destino, "retener");
  assert.equal(p.titulo, "Se la queda el negocio");
  assert.equal(p.porque, "Avisó con 6 h; la regla pide 24 h.");
  assert.equal(p.editable, true);
});

test("CH-035 · cancela el negocio → «Se la devolvemos», aunque sea sobre la hora", () => {
  for (const h of [100, 1, 0, -2]) {
    const p = propuestaDeSenia(D2, "negocio", h);
    assert.equal(p.destino, "devolver");
    assert.equal(p.titulo, "Se la devolvemos");
  }
});

test("D2 · con aviso suficiente se devuelve; justo en el límite cuenta como a tiempo", () => {
  assert.equal(propuestaDeSenia(D2, "clienta", 24).destino, "devolver");
  assert.equal(propuestaDeSenia(D2, "clienta", 72).porque, "Avisó con 3 días; la regla pide 24 h.");
  assert.equal(propuestaDeSenia(D2, "clienta", 23.9).destino, "retener");
});

test("no vino → la regla de no vino; aviso ilegible o pasado → la regla de aviso tarde (nunca algo más permisivo)", () => {
  const regla = { cancelacionHoras: 12, seniaCancelaTarde: "a-favor" as const, seniaNoVino: "retener" as const };
  assert.equal(propuestaDeSenia(regla, "no-vino", 5).destino, "retener");
  assert.equal(propuestaDeSenia(regla, "clienta", 3).destino, "a-favor");
  assert.equal(propuestaDeSenia(regla, "clienta", 3).titulo, "Queda a favor de la clienta");
  assert.equal(propuestaDeSenia(regla, "clienta", Number.NaN).destino, "a-favor");
  assert.equal(propuestaDeSenia(regla, "clienta", -1).porque, "Avisó sobre la hora; la regla pide 12 h.");
  assert.equal(propuestaDeSenia({ ...regla, cancelacionHoras: 0 }, "clienta", 0).destino, "devolver");
});

test("alias para los WhatsApp: el de Mi negocio, si no el CBU, si no el provisional (null hoy)", () => {
  assert.equal(aliasParaMensajes({ aliasSenia: "ch.estetica.mp", cbuSenia: "0".repeat(22) }, null), "ch.estetica.mp");
  assert.equal(aliasParaMensajes({ aliasSenia: null, cbuSenia: "0".repeat(22) }, null), "0".repeat(22));
  assert.equal(aliasParaMensajes({ aliasSenia: "  ", cbuSenia: null }, null), null);
  assert.equal(aliasParaMensajes(null, "provisional.x"), "provisional.x");
  assert.equal(aliasParaMensajes({ ...D2, activas: false } as never, null), null); // sin migración: sin alias inventado
});

test("el formulario → validarReglas: pesos y horas como los tipea la dueña", () => {
  assert.equal(leerPesos(""), 0);
  assert.equal(leerPesos("2000"), 2000);
  assert.equal(leerPesos("2.000"), 2000);
  assert.equal(leerPesos("$ 2.000,50"), 2000.5);
  assert.ok(Number.isNaN(leerPesos("dos mil")));
  assert.ok(Number.isNaN(leerPesos("-5")));

  const form = new FormData();
  form.set("aliasSenia", " ch.estetica.mp ");
  form.set("cbuSenia", "");
  form.set("cancelacionHoras", "24");
  form.set("seniaCancelaTarde", "retener");
  form.set("seniaNoVino", "a-favor");
  form.set("topeBajaSaldoRecepcion", "0");
  const v = validarReglas(leerFormularioMiNegocio(form));
  assert.deepEqual(v, {
    ok: true,
    reglas: { aliasSenia: "ch.estetica.mp", cbuSenia: null, cancelacionHoras: 24, seniaCancelaTarde: "retener", seniaNoVino: "a-favor", topeBajaSaldoRecepcion: 0 },
  });

  form.set("cancelacionHoras", "veinte");
  assert.equal(validarReglas(leerFormularioMiNegocio(form)).ok, false);
  form.set("cancelacionHoras", "24");
  form.set("seniaNoVino", "regalar");
  assert.equal(validarReglas(leerFormularioMiNegocio(form)).ok, false);
  form.set("seniaNoVino", "retener");
  form.set("topeBajaSaldoRecepcion", "mucho");
  assert.equal(validarReglas(leerFormularioMiNegocio(form)).ok, false);
  // Un campo que no vino (formulario a mano) no se cuela como válido.
  assert.equal(validarReglas(leerFormularioMiNegocio(new FormData())).ok, false);
});
