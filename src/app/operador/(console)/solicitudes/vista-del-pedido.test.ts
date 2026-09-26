// La hoja del pedido de alta no pierde «Pasale esto» cuando la consola vuelve a armar la página
// (hallazgo QA 26/09, paso 2: 3 de 3 altas perdieron la contraseña temporal del dueño).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { vistaDelPedido } from "./vista-del-pedido";
import type { ResultadoConfigurador } from "./configurador.server";

const altaRecienHecha = { ok: true, yaConfigurada: false } as Extract<ResultadoConfigurador, { ok: true }>;

test("si el alta acaba de salir bien, se ve «Pasale esto» aunque el pedido ya figure cerrado", () => {
  assert.equal(vistaDelPedido(true, altaRecienHecha), "pasale-esto");
  assert.equal(vistaDelPedido(false, altaRecienHecha), "pasale-esto");
});

test("un pedido cerrado que se abre de nuevo (sin alta en esta pantalla) dice que está cerrado", () => {
  assert.equal(vistaDelPedido(true, null), "cerrado");
  assert.equal(vistaDelPedido(true, { ok: false, error: "x" }), "cerrado");
});

test("un pedido abierto muestra el formulario, también después de un error", () => {
  assert.equal(vistaDelPedido(false, null), "formulario");
  assert.equal(vistaDelPedido(false, { ok: false, error: "El CUIT no es válido." }), "formulario");
});

// React conserva el estado de un componente sólo si, al volver a armar la página, sigue en el mismo
// lugar. Si la página elige entre el aviso de cerrado y el configurador, lo desmonta y el resultado
// del alta (con la contraseña) se pierde. Esto mira la página tal cual está escrita.
test("la página monta el configurador siempre, sin elegirlo según si el pedido está cerrado", () => {
  const ruta = fileURLToPath(new URL("./[id]/page.tsx", import.meta.url));
  const fuente = ts.createSourceFile(ruta, readFileSync(ruta, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const usos: ts.JsxSelfClosingElement[] = [];
  const recorrer = (n: ts.Node) => {
    if (ts.isJsxSelfClosingElement(n) && n.tagName.getText() === "ConfiguradorClient") usos.push(n);
    ts.forEachChild(n, recorrer);
  };
  recorrer(fuente);
  assert.equal(usos.length, 1, "la página usa el configurador una sola vez");
  const uso = usos[0];
  for (let p: ts.Node | undefined = uso.parent; p && !ts.isFunctionLike(p); p = p.parent) {
    assert.ok(!ts.isConditionalExpression(p), "el configurador no puede estar dentro de un «? :»");
    assert.ok(
      !(ts.isBinaryExpression(p) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(p.operatorToken.kind)),
      "el configurador no puede estar dentro de un «&&» o «||»",
    );
  }
  const props = uso.attributes.properties.map((a) => (ts.isJsxAttribute(a) ? a.name.getText() : ""));
  assert.ok(props.includes("cerrada"), "el configurador recibe si el pedido está cerrado y decide él");
});

// ── Qué botón ofrece (QA 26/09: duplicado sin CUIT y «Sumar» cuando ya está en la cartera) ──
import { accionDelPedido } from "./vista-del-pedido";

test("si el negocio del CUIT ya está en la cartera de este estudio, no se ofrece «Sumar a la cartera»", () => {
  assert.deepEqual(accionDelPedido({ yaExisten: [{ enCartera: true }], parecidos: [], duplicado: "", autorizaVinculo: true }), { tipo: "ya-en-cartera" });
  assert.deepEqual(accionDelPedido({ yaExisten: [{ enCartera: false }], parecidos: [], duplicado: "", autorizaVinculo: false }), { tipo: "sumar", habilitado: false });
  assert.deepEqual(accionDelPedido({ yaExisten: [{ enCartera: false }], parecidos: [], duplicado: "", autorizaVinculo: true }), { tipo: "sumar", habilitado: true });
});

test("con parecidos sin CUIT, «Crear el cliente» queda apagado hasta marcar «Es otro negocio»", () => {
  const parecidos = [{ id: "kiosco" }];
  assert.deepEqual(accionDelPedido({ yaExisten: [], parecidos, duplicado: "", autorizaVinculo: false }), { tipo: "crear", habilitado: false });
  assert.deepEqual(accionDelPedido({ yaExisten: [], parecidos, duplicado: "otro", autorizaVinculo: false }), { tipo: "crear", habilitado: true });
  assert.deepEqual(accionDelPedido({ yaExisten: [], parecidos: [], duplicado: "", autorizaVinculo: false }), { tipo: "crear", habilitado: true });
});

test("«Es este» pide la misma autorización del dueño que «Sumar a la cartera»", () => {
  const parecidos = [{ id: "kiosco" }];
  assert.deepEqual(accionDelPedido({ yaExisten: [], parecidos, duplicado: "es:kiosco", autorizaVinculo: false }), { tipo: "cargar-cuit", tenantId: "kiosco", habilitado: false });
  assert.deepEqual(accionDelPedido({ yaExisten: [], parecidos, duplicado: "es:kiosco", autorizaVinculo: true }), { tipo: "cargar-cuit", tenantId: "kiosco", habilitado: true });
  // Un id que no está entre los parecidos no habilita nada.
  assert.deepEqual(accionDelPedido({ yaExisten: [], parecidos, duplicado: "es:ajeno", autorizaVinculo: true }), { tipo: "crear", habilitado: false });
});
