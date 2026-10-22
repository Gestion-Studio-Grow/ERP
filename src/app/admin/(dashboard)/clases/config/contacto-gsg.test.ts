// M-047: el modo manual de WhatsApp no muestra rutas de archivo y ofrece el contacto con GSG.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contactoParaWhatsAppBusiness } from "./contacto-gsg";

test("sin número de soporte cargado, el botón abre un mail con el pedido escrito", () => {
  const c = contactoParaWhatsAppBusiness("https://agendaprofe.gsgapp.com.ar/clases", {});
  assert.match(c.href, /^mailto:/);
  assert.match(decodeURIComponent(c.href), /agendaprofe\.gsgapp\.com\.ar\/clases/);
});

test("con número de soporte, el botón abre WhatsApp", () => {
  const c = contactoParaWhatsAppBusiness("https://x/clases", { GSG_WHATSAPP_SOPORTE: "11 5555 1234" });
  assert.match(c.href, /^https:\/\/wa\.me\//);
});

test("la pantalla de Ajustes no le muestra al profe ninguna ruta de archivo (B6)", () => {
  const fuente = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");
  // Sólo el JSX visible: lo que está entre > y < (los comentarios del código no cuentan).
  const visibles = fuente.match(/>[^<>{}]*</g)?.join(" ") ?? "";
  assert.doesNotMatch(visibles, /docs\/|\.md\b|src\//);
});
