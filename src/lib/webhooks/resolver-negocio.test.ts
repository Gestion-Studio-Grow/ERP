import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  CLAVE_GLOBAL,
  candidatosDeFirma,
  firmaDelNegocio,
  leerReferenciaDeNegocio,
  leerSecretosMP,
  leerTelefonosWA,
  limitarWebhook,
  phoneNumberIdDe,
  referenciaDeNegocio,
  referenciaParaElHandler,
  resolverNegocioDelPago,
  slugDelMensajeWA,
  negocioDelMensajeWA,
  type DepsResolverNegocio,
  type NegocioDelWebhook,
} from "./resolver-negocio";

const magra: NegocioDelWebhook = { id: "t-magra", slug: "magra", subdomain: "magra", status: "ACTIVE", modules: ["mercadopago"] };
const breakpoint: NegocioDelWebhook = { id: "t-bp", slug: "breakpoint", subdomain: "breakpoint", status: "TRIAL", modules: ["mercadopago"] };
const sinMP: NegocioDelWebhook = { id: "t-x", slug: "sinmp", subdomain: "sinmp", status: "ACTIVE", modules: [] };

function deps(negocios: NegocioDelWebhook[]): DepsResolverNegocio {
  return {
    porSlug: async (s) => negocios.find((n) => n.slug === s) ?? null,
    porSubdominio: async (s) => negocios.find((n) => n.subdomain === s) ?? null,
    primerosDos: async () => negocios.slice(0, 2),
  };
}

test("referencia gsg: ida y vuelta, y formato del handler", () => {
  const ref = referenciaDeNegocio("magra", "pedido", "ped_1");
  assert.equal(ref, "gsg:magra:pedido:ped_1");
  const r = leerReferenciaDeNegocio(ref)!;
  assert.deepEqual(r, { slug: "magra", tipo: "pedido", id: "ped_1" });
  assert.equal(referenciaParaElHandler(r), "pedido:ped_1");
  assert.equal(referenciaParaElHandler({ slug: "magra", tipo: "turno", id: "apt_9" }), "apt_9");
  for (const malo of ["", "pedido:ped_1", "gsg:magra:otro:1", "gsg:Magra:pedido:1", "gsg::pedido:1", "gsg:magra:pedido:", "gsg:magra:pedido:a;b"]) {
    assert.equal(leerReferenciaDeNegocio(malo), null, malo);
  }
});

test("secretos: ninguno, ilegible, por negocio + global", () => {
  assert.deepEqual(leerSecretosMP({}), { tipo: "ninguno" });
  assert.deepEqual(leerSecretosMP({ MP_WEBHOOK_SECRETS: "{roto" }), { tipo: "ilegible" });
  assert.deepEqual(leerSecretosMP({ MP_WEBHOOK_SECRETS: "[1]" }), { tipo: "ilegible" });
  assert.deepEqual(leerSecretosMP({ MP_WEBHOOK_SECRETS: '{"magra":""}' }), { tipo: "ilegible" });
  const s = leerSecretosMP({ MP_WEBHOOK_SECRETS: '{"magra":"sm"}', MP_WEBHOOK_SECRET: "sg" });
  assert.equal(s.tipo, "ok");
  if (s.tipo !== "ok") return;
  assert.deepEqual(candidatosDeFirma(s), [
    { clave: "magra", secreto: "sm" },
    { clave: CLAVE_GLOBAL, secreto: "sg" },
  ]);
  // magra tiene secreto propio: el global no le sirve.
  assert.equal(firmaDelNegocio(["magra"], "magra", s), "propio");
  assert.equal(firmaDelNegocio([CLAVE_GLOBAL], "magra", s), "firma-de-otro-negocio");
  // breakpoint no tiene: vale el global con aviso.
  assert.equal(firmaDelNegocio([CLAVE_GLOBAL], "breakpoint", s), "global-con-aviso");
  assert.equal(firmaDelNegocio(["magra"], "breakpoint", s), "firma-de-otro-negocio");
});

test("resolver: gsg: válido → su negocio; nunca el del host", async () => {
  const r = await resolverNegocioDelPago({ externalReference: "gsg:magra:pedido:p1", subdominioDelHost: null }, deps([magra, breakpoint]));
  assert.deepEqual(r, { ok: true, negocio: magra, referencia: "pedido:p1" });
});

test("resolver con dos negocios: ausente/ilegible/inexistente/sin MP/host ajeno → rechazo", async () => {
  const d = deps([magra, breakpoint, sinMP]);
  const caso = (ref: string | null, host: string | null = null) => resolverNegocioDelPago({ externalReference: ref, subdominioDelHost: host }, d);
  assert.deepEqual(await caso(null), { ok: false, motivo: "referencia-ausente", auditarEn: null });
  assert.deepEqual(await caso("pedido:p1", "magra"), { ok: false, motivo: "referencia-ilegible", auditarEn: magra });
  assert.deepEqual(await caso("gsg:nadie:pedido:p1"), { ok: false, motivo: "negocio-inexistente", auditarEn: null });
  assert.deepEqual(await caso("gsg:sinmp:pedido:p1"), { ok: false, motivo: "negocio-sin-mercadopago", auditarEn: sinMP });
  assert.deepEqual(await caso("gsg:breakpoint:pedido:p1", "magra"), { ok: false, motivo: "host-de-otro-negocio", auditarEn: breakpoint });
  const suspendido = { ...magra, status: "SUSPENDED" };
  const r = await resolverNegocioDelPago({ externalReference: "gsg:magra:turno:a1", subdominioDelHost: null }, deps([suspendido, breakpoint]));
  assert.equal(r.ok, false);
});

test("resolver con UN negocio: la referencia vieja sigue yendo a ese negocio", async () => {
  const d = deps([magra]);
  assert.deepEqual(await resolverNegocioDelPago({ externalReference: "pedido:p1", subdominioDelHost: null }, d), {
    ok: true,
    negocio: magra,
    referencia: "pedido:p1",
  });
  assert.deepEqual(await resolverNegocioDelPago({ externalReference: "", subdominioDelHost: null }, d), {
    ok: true,
    negocio: magra,
    referencia: null,
  });
  // un gsg: roto no se adivina ni con un solo negocio
  const roto = await resolverNegocioDelPago({ externalReference: "gsg:magra:x", subdominioDelHost: null }, d);
  assert.equal(roto.ok, false);
});

test("WhatsApp: phone_number_id → slug; sin mapeo o JSON roto → null", () => {
  const payload = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "100000000000001" } } }] }] };
  assert.equal(phoneNumberIdDe(payload), "100000000000001");
  assert.equal(phoneNumberIdDe({}), null);
  const env = { WHATSAPP_PHONE_NUMBERS: '{"100000000000001":"breakpoint"}' };
  assert.equal(slugDelMensajeWA(payload, env), "breakpoint");
  assert.equal(slugDelMensajeWA(payload, {}), null);
  assert.equal(slugDelMensajeWA(payload, { WHATSAPP_PHONE_NUMBERS: "{roto" }), null);
  assert.equal(leerTelefonosWA('{"1":5}').size, 0);
});

// F2 (certificación S1): sin WHATSAPP_PHONE_NUMBERS, un despliegue de UN negocio no pierde los mensajes.
test("WhatsApp: sin la variable y con un solo negocio → ese negocio; con dos o con mapa cargado → sin negocio", async () => {
  const payload = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "100000000000001" } } }] }] };
  const uno = await negocioDelMensajeWA(payload, {}, deps([magra]));
  assert.ok(uno.ok);
  assert.equal(uno.negocio.id, "t-magra");
  assert.equal(uno.via, "negocio-unico");
  assert.deepEqual(await negocioDelMensajeWA(payload, {}, deps([magra, breakpoint])), { ok: false, slug: null });
  assert.deepEqual(await negocioDelMensajeWA(payload, { WHATSAPP_PHONE_NUMBERS: '{"999":"magra"}' }, deps([magra])), { ok: false, slug: null });
  const mapa = await negocioDelMensajeWA(payload, { WHATSAPP_PHONE_NUMBERS: '{"100000000000001":"breakpoint"}' }, deps([magra, breakpoint]));
  assert.ok(mapa.ok);
  assert.equal(mapa.negocio.id, "t-bp");
  assert.equal(mapa.via, "mapa");
  assert.deepEqual(await negocioDelMensajeWA(payload, { WHATSAPP_PHONE_NUMBERS: '{"100000000000001":"nadie"}' }, deps([magra])), { ok: false, slug: "nadie" });
});

test("rate limit: 60 por minuto por IP, el 61 → espera", () => {
  let t = 0;
  const l = createRateLimiter({ max: 60, windowMs: 60_000 }, () => t);
  const req = new Request("http://x/api/webhooks/mercadopago", { method: "POST", headers: { "x-forwarded-for": "9.9.9.9" } });
  for (let i = 0; i < 60; i++) assert.equal(limitarWebhook("mercadopago", req, l), null);
  assert.ok((limitarWebhook("mercadopago", req, l) ?? 0) > 0);
  const otraIp = new Request("http://x/", { method: "POST", headers: { "x-forwarded-for": "8.8.8.8" } });
  assert.equal(limitarWebhook("mercadopago", otraIp, l), null);
  t = 61_000;
  assert.equal(limitarWebhook("mercadopago", req, l), null);
});
