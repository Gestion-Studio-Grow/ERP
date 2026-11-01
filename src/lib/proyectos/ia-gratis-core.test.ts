import assert from "node:assert/strict";
import test from "node:test";
import { CUPO_AGOTADO, errorDeGratis, imagenDeGratis, pedidoDeImagen, pedidoDeTexto, textoDeGratis, urlGratis } from "./ia-gratis-core";

test("la dirección lleva la cuenta y el modelo", () => {
  assert.equal(urlGratis("abc", "@cf/x/y"), "https://api.cloudflare.com/client/v4/accounts/abc/ai/run/@cf/x/y");
});

test("el pedido de texto pone las instrucciones primero y el esquema sólo si hay", () => {
  const p = pedidoDeTexto({ sistema: "s", mensajes: [{ role: "user", content: "hola" }] });
  assert.deepEqual(p.messages, [{ role: "system", content: "s" }, { role: "user", content: "hola" }]);
  assert.equal("response_format" in p, false);
  const e = { type: "object" };
  assert.deepEqual(pedidoDeTexto({ sistema: "s", mensajes: [], esquema: e }).response_format, { type: "json_schema", json_schema: e });
});

test("el pedido de imagen respeta el largo máximo del modelo", () => {
  assert.equal((pedidoDeImagen("x".repeat(3000)).prompt as string).length, 2048);
});

test("el cupo agotado se distingue de una clave mala y de otros errores", () => {
  assert.equal(errorDeGratis(200, { success: true }), null);
  assert.equal(errorDeGratis(429, null), CUPO_AGOTADO);
  assert.equal(errorDeGratis(400, { success: false, errors: [{ code: 4006 }] }), CUPO_AGOTADO);
  assert.match(errorDeGratis(403, null)!, /CLOUDFLARE_AI_TOKEN/);
  assert.match(errorDeGratis(404, null)!, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(errorDeGratis(500, null)!, /Probá de nuevo/);
  assert.match(errorDeGratis(200, { success: false })!, /Probá de nuevo/);
});

test("el texto llega como cadena o como objeto JSON", () => {
  assert.deepEqual(textoDeGratis({ result: { response: " hola " } }, 100), { texto: "hola", cortada: false });
  assert.deepEqual(JSON.parse(textoDeGratis({ result: { response: { concepto: "c" } } }, 100)!.texto), { concepto: "c" });
  assert.equal(textoDeGratis({ result: { response: { a: 1 }, usage: { completion_tokens: 100 } } }, 100)!.cortada, true);
  assert.equal(textoDeGratis({ result: {} }, 100), null);
  assert.equal(textoDeGratis(null, 100), null);
});

test("sólo pasa una imagen en base64", () => {
  assert.equal(imagenDeGratis({ result: { image: "QUJD" } }), "data:image/jpeg;base64,QUJD");
  assert.equal(imagenDeGratis({ result: { image: "<svg onload=x>" } }), null);
  assert.equal(imagenDeGratis({ result: {} }), null);
});
