// ============================================================================
// TESTS de los ADAPTADORES EXTERNOS reales (Vercel host + email) — ADR-074 Fase 2.
// Verifica los TRES caminos sin red: no-configurado (salta honesto), configurado-ok (llama al
// servicio) y configurado-fallo (lanza → compensación). El `fetch` se inyecta (mock).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  VercelHostBinder,
  EmailInviter,
  readVercelConfig,
  readEmailConfig,
} from "./external-adapters";

// --- Lectura de config del entorno ---

test("readVercelConfig: null si falta algo; objeto si están las 3 claves", () => {
  assert.equal(readVercelConfig({}), null);
  assert.equal(readVercelConfig({ VERCEL_TOKEN: "t", VERCEL_PROJECT_ID: "p" }), null);
  assert.deepEqual(
    readVercelConfig({ VERCEL_TOKEN: "t", VERCEL_PROJECT_ID: "p", APP_BASE_DOMAIN: "app.com" }),
    { token: "t", projectId: "p", domain: "app.com", teamId: undefined },
  );
});

test("readEmailConfig: null si falta algo; objeto si están apiKey + from", () => {
  assert.equal(readEmailConfig({}), null);
  assert.equal(readEmailConfig({ RESEND_API_KEY: "k" }), null);
  assert.deepEqual(readEmailConfig({ RESEND_API_KEY: "k", INVITE_EMAIL_FROM: "x@y.com" }), {
    apiKey: "k",
    from: "x@y.com",
    appBaseUrl: undefined,
  });
});

// --- Host binder ---

test("VercelHostBinder: sin configurar → salta honesto (bound=false + note), no llama fetch", async () => {
  let called = false;
  const binder = new VercelHostBinder({ config: null, fetchImpl: (async () => { called = true; return new Response(null); }) as typeof fetch });
  const r = await binder.bind("estetica-norte", "t1");
  assert.equal(r.bound, false);
  assert.match(r.note!, /VERCEL_TOKEN/);
  assert.equal(called, false);
});

test("VercelHostBinder: configurado + 200 → bound=true, pega al endpoint correcto con <sub>.<domain>", async () => {
  let seen: { url: string; body: string } | null = null;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen = { url: String(url), body: String(init.body) };
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  const binder = new VercelHostBinder({ config: { token: "t", projectId: "p", domain: "app.com" }, fetchImpl });
  const r = await binder.bind("estetica-norte", "t1");
  assert.equal(r.bound, true);
  assert.match(seen!.url, /\/v10\/projects\/p\/domains/);
  assert.match(seen!.body, /estetica-norte\.app\.com/);
});

test("VercelHostBinder: configurado + error (409) → LANZA (fallo real → compensación)", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: { message: "domain in use" } }), { status: 409 })) as unknown as typeof fetch;
  const binder = new VercelHostBinder({ config: { token: "t", projectId: "p", domain: "app.com" }, fetchImpl });
  await assert.rejects(() => binder.bind("estetica-norte", "t1"), /Vercel host bind falló \(409\)/);
});

// --- Inviter ---

test("EmailInviter: sin configurar → salta honesto (sent=false + note)", async () => {
  const inviter = new EmailInviter({ config: null });
  const r = await inviter.invite("ana@estetica-norte.com", "t1");
  assert.equal(r.sent, false);
  assert.match(r.note!, /RESEND_API_KEY/);
});

test("EmailInviter: configurado + 200 → sent=true, pega a Resend", async () => {
  let url = "";
  const fetchImpl = (async (u: string) => {
    url = String(u);
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  const inviter = new EmailInviter({ config: { apiKey: "k", from: "x@y.com" }, fetchImpl });
  const r = await inviter.invite("ana@estetica-norte.com", "t1");
  assert.equal(r.sent, true);
  assert.match(url, /api\.resend\.com\/emails/);
});

test("EmailInviter: configurado + error → LANZA", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 })) as unknown as typeof fetch;
  const inviter = new EmailInviter({ config: { apiKey: "k", from: "x@y.com" }, fetchImpl });
  await assert.rejects(() => inviter.invite("ana@estetica-norte.com", "t1"), /Envío de invitación falló \(401\)/);
});
