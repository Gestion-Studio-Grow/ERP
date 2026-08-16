// Tests del portón del sitio público (`./site-gate.ts`).
//
// Esto decide QUIÉN VE EL SITIO, así que las vallas son las tres que pueden doler:
//   1. apagado por defecto (una variable ausente no puede cerrarle el sitio a nadie);
//   2. las superficies con su propio login y las APIs NUNCA quedan tapadas — si el
//      portón se comiera /api, los webhooks de Mercado Pago y el cron de
//      recordatorios fallarían en silencio;
//   3. la cookie no se puede falsificar, y rotar la clave invalida las viejas.

import test from "node:test";
import assert from "node:assert/strict";
import {
  createGateToken,
  extraPublicPaths,
  gateAplicaA,
  gatePassword,
  gatePasswordMatches,
  readGateToken,
  siteGateEnabled,
} from "./site-gate";

test("apagado por defecto: sin SITE_GATE_PASSWORD el sitio queda abierto", () => {
  assert.equal(siteGateEnabled({}), false);
  assert.equal(gatePassword({}), null);
  assert.equal(siteGateEnabled({ SITE_GATE_PASSWORD: "" }), false);
  // Una variable con espacios no cierra el sitio con una clave intipeable.
  assert.equal(siteGateEnabled({ SITE_GATE_PASSWORD: "   " }), false);
});

test("encendido con una clave real", () => {
  assert.equal(siteGateEnabled({ SITE_GATE_PASSWORD: "chestetica2026" }), true);
  assert.equal(gatePassword({ SITE_GATE_PASSWORD: "  chestetica2026  " }), "chestetica2026");
});

test("el portón NO tapa las superficies con su propio login ni las APIs", () => {
  for (const ruta of [
    "/acceso",
    "/admin",
    "/admin/login",
    "/admin/turnos",
    "/operador",
    "/operador/login",
    "/contador",
    "/facturita",
    "/facturita/app/facturas",
    "/api/webhooks/mercadopago",
    "/api/cron/reminders",
    "/api/public/v1/orders",
  ]) {
    assert.equal(gateAplicaA(ruta), false, `${ruta} NO debería pedir la clave del sitio`);
  }
});

test("el portón SÍ cubre la vidriera", () => {
  for (const ruta of ["/", "/servicios", "/reserva", "/reserva/turno/abc123", "/tienda", "/obsequio"]) {
    assert.equal(gateAplicaA(ruta), true, `${ruta} debería pedir la clave`);
  }
});

test("SITE_GATE_PUBLIC_PATHS abre excepciones sin abrir el sitio entero", () => {
  const extras = extraPublicPaths({ SITE_GATE_PUBLIC_PATHS: "/obsequio, /campania" });
  assert.deepEqual(extras, ["/obsequio", "/campania"]);
  assert.equal(gateAplicaA("/obsequio", extras), false);
  assert.equal(gateAplicaA("/obsequio/gracias", extras), false);
  // …y lo demás sigue cerrado.
  assert.equal(gateAplicaA("/", extras), true);
  assert.equal(gateAplicaA("/servicios", extras), true);
});

test("SITE_GATE_PUBLIC_PATHS ignora basura (sin barra inicial)", () => {
  assert.deepEqual(extraPublicPaths({ SITE_GATE_PUBLIC_PATHS: "obsequio, , https://evil.com" }), []);
});

test("prefijo no es lo mismo que segmento: /adminX no se cuela por /admin", () => {
  assert.equal(gateAplicaA("/adminstrador-de-fincas"), true);
  assert.equal(gateAplicaA("/accesorios"), true);
});

test("la cookie firmada se acepta y una falsificada no", async () => {
  const clave = "una-clave-larga-de-prueba";
  const token = await createGateToken(clave);
  assert.equal(await readGateToken(token, clave), true);

  assert.equal(await readGateToken("ok.deadbeef", clave), false);
  assert.equal(await readGateToken("ok", clave), false);
  assert.equal(await readGateToken(undefined, clave), false);
  assert.equal(await readGateToken("", clave), false);
  // Payload distinto con firma válida de OTRO payload: tampoco.
  assert.equal(await readGateToken(`hackeado.${token.split(".")[1]}`, clave), false);
});

test("rotar la clave invalida las cookies ya emitidas", async () => {
  const token = await createGateToken("clave-vieja");
  assert.equal(await readGateToken(token, "clave-vieja"), true);
  assert.equal(await readGateToken(token, "clave-nueva"), false);
});

test("la comparación de la clave distingue mayúsculas y no acepta prefijos", () => {
  assert.equal(gatePasswordMatches("Secreta2026", "Secreta2026"), true);
  assert.equal(gatePasswordMatches("secreta2026", "Secreta2026"), false);
  assert.equal(gatePasswordMatches("Secreta", "Secreta2026"), false);
  assert.equal(gatePasswordMatches("Secreta2026extra", "Secreta2026"), false);
  assert.equal(gatePasswordMatches("", "Secreta2026"), false);
});
