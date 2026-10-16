// El lector (plan T-2): prefijo/sufijo, la ráfaga que hace un lector y no una persona, y el
// "¿cayó en un campo?" compartido.

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectorDeRafaga, enCampoDeTexto, enCampoEditable, esCampoDeCantidad, motivoParaNoSumar, quitarPrefijoSufijo, type DetectorDeRafaga, type LecturaDeRafaga } from "./lector-core";

const EAN = "7790895000997";

/** Teclea `texto` (y la tecla final) cada `cadaMs`, desde `t0`. Devuelve la última lectura y el momento final. */
function teclear(d: DetectorDeRafaga, texto: string, fin: string | null, cadaMs: number, t0 = 1000) {
  let t = t0;
  let r: LecturaDeRafaga = null;
  for (const c of texto) {
    r = d.tecla(c, t) ?? r;
    t += cadaMs;
  }
  if (fin) r = d.tecla(fin, t) ?? r;
  return { r, t };
}

test("quitarPrefijoSufijo: prefijo `*` y sufijo Tab/Enter", () => {
  assert.equal(quitarPrefijoSufijo(`*${EAN}\t`, { prefijo: "*", sufijo: "tab" }), EAN);
  assert.equal(quitarPrefijoSufijo(`*${EAN}\r\n`, { prefijo: "*", sufijo: "enter" }), EAN);
  assert.equal(quitarPrefijoSufijo(`]E0${EAN}`, { prefijo: "]E0", sufijo: "enter" }), EAN);
  // Sin prefijo configurado no se toca el principio (un `*` puede ser el multiplicador "3*").
  assert.equal(quitarPrefijoSufijo(`3*${EAN}`, { prefijo: "", sufijo: "enter" }), `3*${EAN}`);
  // El prefijo sólo se saca si está al principio.
  assert.equal(quitarPrefijoSufijo(`${EAN}*`, { prefijo: "*", sufijo: "enter" }), `${EAN}*`);
  assert.equal(quitarPrefijoSufijo(null, { prefijo: "*", sufijo: "enter" }), "");
});

test("quitarPrefijoSufijo: STX/ETX de envoltorio, configurado o no", () => {
  assert.equal(quitarPrefijoSufijo(`\u0002${EAN}\u0003`, { prefijo: "\u0002", sufijo: "ninguno" }), EAN);
  assert.equal(quitarPrefijoSufijo(`\u0002${EAN}\u0003`, { prefijo: "", sufijo: "ninguno" }), EAN);
});

test("ráfaga de 13 dígitos a 10 ms + Enter → código", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "enter" } });
  const { r } = teclear(d, EAN, "Enter", 10);
  assert.deepEqual(r, { tipo: "codigo", valor: EAN });
});

test("ráfaga con prefijo `*` (Shift + 8) y sufijo Tab → el código limpio", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "*", sufijo: "tab" } });
  assert.equal(d.tecla("Shift", 1000), null);
  const { r } = teclear(d, `*${EAN}`, "Tab", 8, 1004);
  assert.deepEqual(r, { tipo: "codigo", valor: EAN });
});

test("con sufijo Tab, el Enter no cierra (y con sufijo Enter, el Tab tampoco)", () => {
  const tab = detectorDeRafaga({ lector: { prefijo: "", sufijo: "tab" } });
  assert.equal(teclear(tab, EAN, "Enter", 10).r, null);
  const enter = detectorDeRafaga({ lector: { prefijo: "", sufijo: "enter" } });
  assert.equal(teclear(enter, EAN, "Tab", 10).r, null);
});

test("tipeo humano a 150 ms → nada (ni con Enter)", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "enter" } });
  assert.equal(teclear(d, EAN, "Enter", 150).r, null);
  // Ni aunque escriba rápido: 80 ms es más que el umbral.
  assert.equal(teclear(d, EAN, "Enter", 80, 9000).r, null);
});

test("una persona que tipea despacio y después aprieta Enter rápido: nada", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "enter" } });
  const { t } = teclear(d, EAN, null, 150);
  assert.equal(d.tecla("Enter", t - 150 + 10), null);
});

test("ráfaga corta (menos de 6) → nada: no es un código de barras", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "enter" } });
  assert.equal(teclear(d, "12345", "Enter", 10).r, null);
});

test("una pausa larga en el medio empieza otra ráfaga: sólo cuenta lo último", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "enter" } });
  teclear(d, "999", null, 10, 1000);
  const { r } = teclear(d, EAN, "Enter", 10, 5000);
  assert.deepEqual(r, { tipo: "codigo", valor: EAN });
});

test("el Enter llega tarde (después del umbral) → nada", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "enter" } });
  const { t } = teclear(d, EAN, null, 10);
  assert.equal(d.tecla("Enter", t + 200), null);
});

test("sufijo «ninguno»: la ráfaga sin Enter cierra por tiempo", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "ninguno" } });
  const { t } = teclear(d, EAN, null, 10);
  const ultima = t - 10;
  assert.equal(d.vencer(ultima + 20), null, "todavía dentro del umbral");
  assert.deepEqual(d.vencer(ultima + 60), { tipo: "codigo", valor: EAN });
  assert.equal(d.vencer(ultima + 120), null, "ya se entregó: no se repite");
});

test("sufijo «ninguno»: el tipeo humano no cierra nunca por tiempo", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "ninguno" } });
  const { t } = teclear(d, EAN, null, 150);
  assert.equal(d.vencer(t + 500), null);
});

test("con sufijo Enter, vencer no hace nada (la lectura la cierra el Enter)", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "enter" } });
  const { t } = teclear(d, EAN, null, 10);
  assert.equal(d.vencer(t + 500), null);
});

test("tecla mantenida apretada (repetición) o una flecha cortan la ráfaga", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "enter" } });
  let t = 1000;
  for (let i = 0; i < 10; i++) d.tecla("1", (t += 30), i > 0);
  assert.equal(d.tecla("Enter", (t += 10)), null);
  const { t: t2 } = teclear(d, "779089", null, 10, 3000);
  d.tecla("ArrowDown", t2);
  // La flecha cortó: lo de antes no se pega a lo de después.
  assert.deepEqual(teclear(d, "5000997", "Enter", 10, t2 + 5).r, { tipo: "codigo", valor: "5000997" });
});

test("reiniciar olvida lo acumulado", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "enter" } });
  const { t } = teclear(d, EAN, null, 10);
  d.reiniciar();
  assert.equal(d.tecla("Enter", t), null);
});

test("enCampoEditable: inputs, textarea, select y editable sí; botones y el cuerpo no", () => {
  assert.equal(enCampoEditable({ tagName: "INPUT" }), true);
  assert.equal(enCampoEditable({ tagName: "TEXTAREA" }), true);
  assert.equal(enCampoEditable({ tagName: "SELECT" }), true);
  assert.equal(enCampoEditable({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(enCampoEditable({ tagName: "BUTTON" }), false);
  assert.equal(enCampoEditable({ tagName: "BODY" }), false);
  assert.equal(enCampoEditable(null), false);
  assert.equal(enCampoEditable(undefined), false);
});

test("ráfaga adentro del peso: devuelve lo que tenía el campo ANTES de empezar", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "enter" } });
  // Una persona tipeó "1,2" despacio (cada tecla ve el valor de antes de escribirse)…
  let campo = "";
  let t = 1000;
  for (const c of "1,2") {
    d.tecla(c, (t += 200), false, campo);
    campo += c;
  }
  // …y después pasa el lector con el foco ahí: el campo se va llenando con el código.
  t += 500;
  let r: LecturaDeRafaga = null;
  for (const c of EAN) {
    r = d.tecla(c, (t += 8), false, campo) ?? r;
    campo += c;
  }
  r = d.tecla("Enter", t + 8, false, campo);
  assert.deepEqual(r, { tipo: "codigo", valor: EAN, antes: "1,2" });
});

test("sin valor del campo (fuera de un campo) la lectura no trae `antes`", () => {
  const d = detectorDeRafaga({ lector: { prefijo: "", sufijo: "ninguno" } });
  const { t } = teclear(d, EAN, null, 10);
  assert.deepEqual(d.vencer(t + 100), { tipo: "codigo", valor: EAN });
});

test("enCampoDeTexto: casillas, opciones y botones no son campo para el lector; los de texto sí", () => {
  for (const type of ["checkbox", "radio", "button", "submit", "RESET"]) assert.equal(enCampoDeTexto({ tagName: "INPUT", type }), false, type);
  for (const type of ["text", "search", "tel", "email", "number", undefined]) assert.equal(enCampoDeTexto({ tagName: "INPUT", type }), true, String(type));
  assert.equal(enCampoDeTexto({ tagName: "TEXTAREA" }), true);
  assert.equal(enCampoDeTexto({ tagName: "SELECT" }), true);
  assert.equal(enCampoDeTexto({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(enCampoDeTexto({ tagName: "BUTTON" }), false);
  assert.equal(enCampoDeTexto(null), false);
  // Los atajos siguen con la regla de siempre: cualquier INPUT es campo.
  assert.equal(enCampoEditable({ tagName: "INPUT", type: "radio" }), true);
});

test("esCampoDeCantidad: sólo los inputs marcados como peso o cantidad", () => {
  assert.equal(esCampoDeCantidad({ tagName: "INPUT", dataset: { tipo: "peso" } }), true);
  assert.equal(esCampoDeCantidad({ tagName: "INPUT", dataset: { tipo: "cantidad" } }), true);
  assert.equal(esCampoDeCantidad({ tagName: "INPUT", dataset: { tipo: "plata" } }), false);
  assert.equal(esCampoDeCantidad({ tagName: "INPUT", dataset: {} }), false);
  assert.equal(esCampoDeCantidad({ tagName: "SPAN", dataset: { tipo: "peso" } }), false);
  assert.equal(esCampoDeCantidad(null), false);
});

test("motivoParaNoSumar: con el cobro en vuelo o en duda el lector no suma", () => {
  assert.match(motivoParaNoSumar({ cobrando: true, cobroEnDuda: false }) ?? "", /Esperá que termine el cobro/);
  assert.match(motivoParaNoSumar({ cobrando: false, cobroEnDuda: true }) ?? "", /cobro sin confirmar/);
  assert.match(motivoParaNoSumar({ cobrando: true, cobroEnDuda: true }) ?? "", /Esperá que termine el cobro/);
  assert.equal(motivoParaNoSumar({ cobrando: false, cobroEnDuda: false }), null);
});
