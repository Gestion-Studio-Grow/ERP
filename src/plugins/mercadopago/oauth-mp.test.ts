import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OAuthMPError,
  canjearCodigoMP,
  configOAuthMP,
  desafioPkce,
  hayQueRenovar,
  parsearTokensMP,
  refrescarTokenMP,
  urlAutorizacionMP,
  type PedirMP,
} from "./oauth-mp";

const ENV = { MP_OAUTH_CLIENT_ID: "1234567890", MP_OAUTH_CLIENT_SECRET: "secreto-app", MP_OAUTH_WEBHOOK_SECRET: "whsec-app" };
const AHORA = new Date("2026-11-05T12:00:00Z");

test("sin alguna credencial de la app de MP → null («todavía no disponible»), sin lanzar", () => {
  assert.equal(configOAuthMP({}), null);
  assert.equal(configOAuthMP({ ...ENV, MP_OAUTH_CLIENT_SECRET: " " }), null);
  assert.equal(configOAuthMP({ ...ENV, MP_OAUTH_WEBHOOK_SECRET: undefined }), null);
  assert.equal(configOAuthMP({ ...ENV, MP_OAUTH_CLIENT_ID: "no-numerico" }), null);
  assert.equal(configOAuthMP({ ...ENV, MP_OAUTH_REDIRECT_URI: "http://evil.example/vuelta" }), null);
  assert.deepEqual(configOAuthMP(ENV), { clientId: "1234567890", clientSecret: "secreto-app", webhookSecret: "whsec-app", redirectUri: null });
});

test("PKCE S256: el vector de la RFC 7636 (apéndice B)", () => {
  assert.equal(desafioPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("URL de autorización: state y challenge, nunca el verificador ni el secreto", () => {
  const verificador = "v".repeat(64);
  const u = new URL(urlAutorizacionMP({ clientId: "1234567890", redirectUri: "https://factoque.gsgapp.com.ar/facturita/app/cuenta/mercadopago/vuelta", state: "s".repeat(43), verificador }));
  assert.equal(u.origin + u.pathname, "https://auth.mercadopago.com/authorization");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("code_challenge"), desafioPkce(verificador));
  assert.ok(!u.toString().includes(verificador));
  assert.ok(!u.toString().includes("secreto-app"));
});

function pedirFalso(respuesta: { ok: boolean; status: number; cuerpo: unknown }, vistos: Array<{ url: string; body: URLSearchParams }>): PedirMP {
  return async (url, init) => {
    vistos.push({ url, body: new URLSearchParams(init.body) });
    return { ok: respuesta.ok, status: respuesta.status, json: async () => respuesta.cuerpo };
  };
}

const RESPUESTA_OK = { access_token: "APP_USR-123-abc", refresh_token: "TG-456-def", expires_in: 15552000, user_id: 987654321, token_type: "bearer" };

test("canje del código: manda code + verificador + redirect, y devuelve la cuenta y el vencimiento", async () => {
  const vistos: Array<{ url: string; body: URLSearchParams }> = [];
  const cfg = configOAuthMP(ENV)!;
  const t = await canjearCodigoMP(cfg, { code: "TG-codigo-1", redirectUri: "https://x.test/v", verificador: "ver-1" }, pedirFalso({ ok: true, status: 200, cuerpo: RESPUESTA_OK }, vistos), AHORA);
  assert.equal(vistos[0].url, "https://api.mercadopago.com/oauth/token");
  assert.equal(vistos[0].body.get("grant_type"), "authorization_code");
  assert.equal(vistos[0].body.get("code_verifier"), "ver-1");
  assert.equal(vistos[0].body.get("redirect_uri"), "https://x.test/v");
  assert.equal(t.cuentaMp, "987654321");
  assert.equal(t.expiraEn.getTime(), AHORA.getTime() + 15552000 * 1000);
});

test("refresh: grant refresh_token; MP rechaza → OAuthMPError sin el cuerpo de MP", async () => {
  const vistos: Array<{ url: string; body: URLSearchParams }> = [];
  const cfg = configOAuthMP(ENV)!;
  await assert.rejects(
    refrescarTokenMP(cfg, "TG-viejo", pedirFalso({ ok: false, status: 400, cuerpo: { message: "invalid_grant", refresh_token: "TG-filtrado" } }, vistos), AHORA),
    (e: unknown) => e instanceof OAuthMPError && e.motivo === "rechazado" && !e.message.includes("TG-"),
  );
  assert.equal(vistos[0].body.get("grant_type"), "refresh_token");
  assert.equal(vistos[0].body.get("refresh_token"), "TG-viejo");
});

test("la respuesta se valida: sin user_id, token con espacios o expires_in absurdo", () => {
  assert.throws(() => parsearTokensMP({ ...RESPUESTA_OK, user_id: undefined }, AHORA), OAuthMPError);
  assert.throws(() => parsearTokensMP({ ...RESPUESTA_OK, access_token: "con espacio largo" }, AHORA), OAuthMPError);
  assert.throws(() => parsearTokensMP(null, AHORA), OAuthMPError);
  const corto = parsearTokensMP({ ...RESPUESTA_OK, expires_in: "mucho" }, AHORA);
  assert.equal(corto.expiraEn.getTime(), AHORA.getTime() + 24 * 3600 * 1000);
});

test("se renueva cuando faltan menos de 15 días", () => {
  assert.equal(hayQueRenovar(null, AHORA), false);
  assert.equal(hayQueRenovar(new Date(AHORA.getTime() + 30 * 86400_000), AHORA), false);
  assert.equal(hayQueRenovar(new Date(AHORA.getTime() + 10 * 86400_000), AHORA), true);
});
