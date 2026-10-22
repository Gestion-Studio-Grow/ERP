import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { botonRespuestaMeta, credencialesCloud, cuerpoMensaje, firmaValida, interpretarRespuesta, modoWhatsApp, respuestaAlAlumno, responderDesafio } from "./whatsapp-cloud";

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

test("respuesta del alumno: sólo la palabra CANCELAR cancela; lo demás pregunta o va a la bandeja", () => {
  // Un sí entero confirma; un sí con más texto va a la bandeja (no se adivina).
  assert.equal(interpretarRespuesta("Sí!"), "confirmar");
  assert.equal(interpretarRespuesta("CONFIRMO"), "confirmar");
  assert.equal(interpretarRespuesta("dale"), "confirmar");
  assert.equal(interpretarRespuesta("dale, nos vemos"), null, "antes confirmaba: ahora es texto para leer");
  // B3/H10: un «no…» suelto NUNCA cancela.
  assert.equal(interpretarRespuesta("no hay drama, voy"), null);
  assert.equal(interpretarRespuesta("no sé si llego"), null);
  assert.equal(interpretarRespuesta("No gracias"), null, "un «no gracias» no cancela");
  assert.equal(interpretarRespuesta("no"), "quiereCancelar");
  assert.equal(interpretarRespuesta("No puedo, perdón"), "quiereCancelar", "pregunta, no cancela");
  assert.equal(interpretarRespuesta("no voy a poder"), "quiereCancelar");
  assert.equal(interpretarRespuesta("cancelo"), "quiereCancelar");
  assert.equal(interpretarRespuesta("cancelar la de mañana"), "quiereCancelar", "sólo la palabra sola cancela");
  // Lo único que cancela: CANCELAR entero o el botón rápido.
  assert.equal(interpretarRespuesta("CANCELAR"), "cancelar");
  assert.equal(interpretarRespuesta(" cancelar "), "cancelar", "espacios a los costados y minúsculas se perdonan");
  assert.equal(interpretarRespuesta("cancelar!"), "quiereCancelar", "O-4: con signos pregunta");
  assert.equal(interpretarRespuesta(" Cancelar. "), "quiereCancelar", "O-4: con punto pregunta");
  assert.equal(interpretarRespuesta("No puedo", "CANCELAR"), "cancelar", "payload del botón rápido");
  assert.equal(interpretarRespuesta("Voy", "VOY"), "confirmar");
  assert.equal(interpretarRespuesta("¿a qué hora era?"), null);
  assert.equal(interpretarRespuesta("nos vemos"), null);
});

test("ninguna respuesta que no sea CANCELAR exacto da «cancelar»", () => {
  const frases = ["no gracias", "no, gracias", "no hay drama", "no sé", "no puedo", "no voy", "cancelo", "cancelar mañana", "noo", "nop", "ahora no", "cancelá", "NO PUEDO CANCELAR"];
  for (const f of frases) assert.notEqual(interpretarRespuesta(f), "cancelar", f);
});

test("respuestas al alumno: pregunta, cancelada y fuera de término", () => {
  assert.equal(
    respuestaAlAlumno({ tipo: "preguntar", cuando: "jueves 23/10 19:00" }),
    "¿Cancelás la clase del jueves 23/10 19:00? Respondé CANCELAR y queda libre. Si venís, no hace falta que contestes.",
  );
  assert.equal(respuestaAlAlumno({ tipo: "cancelada", turnero: "https://x/clases" }), "Listo, cancelada. Elegí otro horario: https://x/clases");
  assert.match(respuestaAlAlumno({ tipo: "fueraDeTermino", profe: "Matías" }), /fuera del plazo.*Le aviso a Matías/);
});

test("botón de respuesta rápida de Meta: plantilla (button) e interactivo (button_reply)", () => {
  const envolver = (m: Record<string, unknown>) => ({ entry: [{ changes: [{ value: { contacts: [{ wa_id: "5491151839732", profile: { name: "Juan" } }], messages: [m] } }] }] });
  const b = botonRespuestaMeta(envolver({ from: "5491151839732", id: "wamid.1", type: "button", button: { payload: "CANCELAR", text: "No puedo" } }));
  assert.deepEqual(b, { from: "5491151839732", text: "No puedo", payload: "CANCELAR", messageId: "wamid.1", contactName: "Juan" });
  assert.equal(interpretarRespuesta(b!.text, b!.payload), "cancelar");
  const i = botonRespuestaMeta(envolver({ from: "5491151839732", id: "wamid.2", type: "interactive", interactive: { button_reply: { id: "VOY", title: "Voy" } } }));
  assert.equal(i?.payload, "VOY");
  assert.equal(botonRespuestaMeta(envolver({ from: "5491151839732", id: "wamid.3", type: "text", text: { body: "hola" } })), null);
  assert.equal(botonRespuestaMeta(null), null);
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

test("O-4: sólo CANCELAR exacto cancela; «¿cancelar?» y cualquier variante preguntan", () => {
  for (const t of ["CANCELAR", "cancelar", "Cancelar", "  CANCELAR  ", "\tcancelar\n"]) assert.equal(interpretarRespuesta(t), "cancelar", JSON.stringify(t));
  for (const t of ["¿cancelar?", "cancelar?", "cancelar??", "cancelar...", "CANCELAR.", "Cancelar!", "¡CANCELAR!", "CANCELAR ❌", "❌ cancelar", "cancelar la de mañana", "CANCELAR CANCELAR", "cancelo"]) {
    assert.equal(interpretarRespuesta(t), "quiereCancelar", JSON.stringify(t));
  }
  // Ni un acento ni letras de más: «cancelár», «cancelarr» no cancelan.
  assert.notEqual(interpretarRespuesta("cancelár"), "cancelar");
  assert.notEqual(interpretarRespuesta("cancelarr"), "cancelar");
  // El botón rápido de la plantilla sigue cancelando (payload exacto).
  assert.equal(interpretarRespuesta("No puedo", "CANCELAR"), "cancelar");
});
