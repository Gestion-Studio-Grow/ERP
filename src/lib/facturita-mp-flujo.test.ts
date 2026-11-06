import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDe, decidirVuelta, leerEstado, serializarEstado, urlDeVuelta, type EstadoOAuthMP } from "./facturita-mp-flujo";

const AHORA = 1_800_000_000_000;
const E: EstadoOAuthMP = {
  state: "s".repeat(43),
  verificador: "v".repeat(64),
  tenantId: "negocio_a",
  userId: "user_a",
  redirectUri: "https://a.test/facturita/app/cuenta/mercadopago/vuelta",
  vence: AHORA + 60_000,
};
const COOKIE = serializarEstado(E);
const SESION = { tenantId: "negocio_a", userId: "user_a" };
const q = (o: Partial<{ code: string | null; state: string | null; error: string | null }>) => ({ code: "TG-codigo-123", state: E.state, error: null, ...o });

test("vuelta buena: devuelve el code y el verificador de la cookie", () => {
  const d = decidirVuelta(q({}), COOKIE, SESION, AHORA);
  assert.ok(d.ok);
  if (d.ok) assert.equal(d.estado.verificador, E.verificador);
});

test("state distinto, sin cookie o cookie basura → vencido (no se canjea)", () => {
  assert.deepEqual(decidirVuelta(q({ state: "x".repeat(43) }), COOKIE, SESION, AHORA), { ok: false, aviso: "vencido" });
  assert.deepEqual(decidirVuelta(q({ state: null }), COOKIE, SESION, AHORA), { ok: false, aviso: "vencido" });
  assert.deepEqual(decidirVuelta(q({}), undefined, SESION, AHORA), { ok: false, aviso: "vencido" });
  assert.deepEqual(decidirVuelta(q({}), "no-es-base64-json", SESION, AHORA), { ok: false, aviso: "vencido" });
  assert.deepEqual(decidirVuelta(q({}), COOKIE, SESION, E.vence + 1), { ok: false, aviso: "vencido" });
});

test("aislamiento: el state pedido por el negocio A no conecta nada en el negocio B ni con otra persona", () => {
  assert.deepEqual(decidirVuelta(q({}), COOKIE, { tenantId: "negocio_b", userId: "user_a" }, AHORA), { ok: false, aviso: "otra_sesion" });
  assert.deepEqual(decidirVuelta(q({}), COOKIE, { tenantId: "negocio_a", userId: "user_b" }, AHORA), { ok: false, aviso: "otra_sesion" });
});

test("cancelar en MP o code raro: no se llama a MP", () => {
  assert.deepEqual(decidirVuelta(q({ error: "access_denied", code: null }), COOKIE, SESION, AHORA), { ok: false, aviso: "cancelado" });
  assert.deepEqual(decidirVuelta(q({ code: "a b<script>" }), COOKIE, SESION, AHORA), { ok: false, aviso: "fallo" });
});

test("la cookie se valida campo por campo", () => {
  assert.equal(leerEstado(serializarEstado({ ...E, tenantId: "a|b" })), null);
  assert.equal(leerEstado(serializarEstado({ ...E, verificador: "corto" })), null);
  assert.deepEqual(leerEstado(COOKIE), E);
});

test("URL de vuelta y avisos: la fija gana; un ?mp= desconocido no muestra nada", () => {
  assert.equal(urlDeVuelta(null, "https://cliente.gsgapp.com.ar"), "https://cliente.gsgapp.com.ar/facturita/app/cuenta/mercadopago/vuelta");
  assert.equal(urlDeVuelta("https://fija.test/v", "https://otro.test"), "https://fija.test/v");
  assert.equal(avisoDe("<img>"), null);
  assert.equal(avisoDe("__proto__"), null);
  assert.equal(avisoDe("conectado")?.tono, "ok");
});
