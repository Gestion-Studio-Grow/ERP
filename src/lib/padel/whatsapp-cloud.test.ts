import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { credencialesCloud, cuerpoMensaje, firmaValida, interpretarRespuesta, modoWhatsApp, responderDesafio } from "./whatsapp-cloud";

const q = (o: Record<string, string>) => new URLSearchParams(o);

test("modo: sólo PADEL_WHATSAPP=cloud prende el envío automático", () => {
  assert.equal(modoWhatsApp({}), "manual");
  assert.equal(modoWhatsApp({ PADEL_WHATSAPP: "CLOUD" }), "manual");
  assert.equal(modoWhatsApp({ PADEL_WHATSAPP: "cloud" }), "cloud");
});

test("credenciales: faltando una, no hay envío", () => {
  assert.equal(credencialesCloud({ WHATSAPP_CLOUD_TOKEN: "x" }), null);
  assert.equal(credencialesCloud({ WHATSAPP_CLOUD_TOKEN: "x", WHATSAPP_PHONE_NUMBER_ID: "abc" }), null);
  assert.deepEqual(credencialesCloud({ WHATSAPP_CLOUD_TOKEN: " t ", WHATSAPP_PHONE_NUMBER_ID: "123456789" }), { token: "t", phoneNumberId: "123456789" });
});

test("desafío de Meta: 503 sin token, 403 si no coincide, eco limpio si coincide", () => {
  const ok = q({ "hub.mode": "subscribe", "hub.verify_token": "secreto-1", "hub.challenge": "1158201444" });
  assert.equal(responderDesafio(ok, undefined).status, 503);
  assert.equal(responderDesafio(ok, "otro").status, 403);
  assert.deepEqual(responderDesafio(ok, "secreto-1"), { status: 200, body: "1158201444" });
  const xss = q({ "hub.mode": "subscribe", "hub.verify_token": "secreto-1", "hub.challenge": "<script>" });
  assert.equal(responderDesafio(xss, "secreto-1").status, 400);
  const modo = q({ "hub.mode": "unsubscribe", "hub.verify_token": "secreto-1", "hub.challenge": "1" });
  assert.equal(responderDesafio(modo, "secreto-1").status, 403);
});

test("firma: HMAC-SHA256 del cuerpo crudo con el App Secret", () => {
  const cuerpo = '{"entry":[]}';
  const firma = "sha256=" + createHmac("sha256", "app-secret").update(cuerpo).digest("hex");
  assert.equal(firmaValida(cuerpo, firma, "app-secret"), true);
  assert.equal(firmaValida(cuerpo + " ", firma, "app-secret"), false, "un byte cambiado");
  assert.equal(firmaValida(cuerpo, firma, undefined), false, "sin secreto, nada pasa");
  assert.equal(firmaValida(cuerpo, null, "app-secret"), false);
  assert.equal(firmaValida(cuerpo, "sha256=abc", "app-secret"), false);
});

test("respuesta del alumno: sí o cancelar; lo demás no se adivina", () => {
  assert.equal(interpretarRespuesta("Sí!"), "confirmar");
  assert.equal(interpretarRespuesta("dale, nos vemos"), "confirmar");
  assert.equal(interpretarRespuesta("CONFIRMO"), "confirmar");
  assert.equal(interpretarRespuesta("no puedo, perdón"), "cancelar");
  assert.equal(interpretarRespuesta("Cancelar"), "cancelar");
  assert.equal(interpretarRespuesta("¿a qué hora era?"), null);
  assert.equal(interpretarRespuesta("nos vemos"), null);
});

test("mensaje: plantilla con sus variables en orden, o texto libre", () => {
  const p = cuerpoMensaje("+54 9 11 5183-9732", { tipo: "plantilla", clave: "confirmada", vars: { nombre: "Juan", dia: "jueves 23/10", hora: "18:00", link: "https://x" } });
  assert.equal(p.to, "5491151839732");
  const t = p.template as { name: string; language: { code: string }; components: { parameters: { text: string }[] }[] };
  assert.equal(t.name, "clase_confirmada");
  assert.equal(t.language.code, "es_AR");
  assert.deepEqual(t.components[0].parameters.map((x) => x.text), ["Juan", "jueves 23/10", "18:00", "https://x"]);
  const txt = cuerpoMensaje("5491151839732", { tipo: "texto", texto: "hola" });
  assert.equal(txt.type, "text");
});
