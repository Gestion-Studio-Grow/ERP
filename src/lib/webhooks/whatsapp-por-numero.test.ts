// Webhook de WhatsApp (ruta real): el negocio sale del phone_number_id, nunca del host.
// Sin mapeo → 200 sin efecto (no toca la base); rate limit antes de la firma.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

prepararAccionesDeServidor(); // dobles de next/headers y server-only, antes de importar la ruta
// La base de la app apunta a un puerto cerrado de esta máquina: ningún test de este archivo toca
// una base real, y el que necesita «la base no contesta» la tiene así.
process.env.DATABASE_URL = "postgresql://nadie@127.0.0.1:1/nadie";

const SECRETO = "wa-secreto-de-prueba";

function mensaje(phoneNumberId: string, ip = "7.7.7.7"): Request {
  const cuerpo = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ wa_id: "5491100000000", profile: { name: "Ana" } }],
              messages: [{ from: "5491100000000", id: "wamid.PRUEBA", type: "text", text: { body: "hola" }, timestamp: "1790000000" }],
            },
          },
        ],
      },
    ],
  });
  const firma = "sha256=" + createHmac("sha256", SECRETO).update(cuerpo, "utf8").digest("hex");
  return new Request("https://magra.erp.test/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "x-hub-signature-256": firma, "x-forwarded-for": ip, host: "magra.erp.test" },
    body: cuerpo,
  });
}

// Pase N2: con P1, un número fuera del mapa consulta su conexión antes de rendirse; con la base
// cerrada de este archivo eso es «la base no contesta» → 500 (Meta reintenta). Lo que se sigue
// probando: nunca se procesa por el host. El «200 sin efecto» con base viva está en
// resolver-negocio.test.ts («orden combinado») y en whatsapp-ruta-postgres.test.ts.
test("número sin mapeo en WHATSAPP_PHONE_NUMBERS → nunca por el host (sin base: 500, Meta reintenta)", async () => {
  Object.assign(process.env, {
    PADEL_WHATSAPP: "cloud",
    WHATSAPP_APP_SECRET: SECRETO,
    WHATSAPP_PHONE_NUMBERS: JSON.stringify({ "100000000000001": "breakpoint" }),
    APP_BASE_DOMAIN: "erp.test",
  });
  const { POST } = await import("@/app/api/webhooks/whatsapp/route");
  const r = await POST(mensaje("999999999999999"));
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { ok: false, error: "base-no-disponible" });
});

test("WHATSAPP_PHONE_NUMBERS ilegible → 503 (Meta reintenta), sin tocar la base", async () => {
  const { POST } = await import("@/app/api/webhooks/whatsapp/route");
  const antes = process.env.WHATSAPP_PHONE_NUMBERS;
  process.env.WHATSAPP_PHONE_NUMBERS = '{"100000000000001":';
  try {
    const r = await POST(mensaje("100000000000001", "7.7.7.8"));
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { ok: false, error: "whatsapp-phone-numbers-invalid" });
  } finally {
    process.env.WHATSAPP_PHONE_NUMBERS = antes;
  }
});

test("la base no contesta al resolver el negocio → 500 (Meta reintenta), no 200", async () => {
  const { POST } = await import("@/app/api/webhooks/whatsapp/route");
  const r = await POST(mensaje("100000000000001", "7.7.7.9")); // mapeado a breakpoint → consulta la base
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { ok: false, error: "base-no-disponible" });
});

test("rate limit antes de la firma: el 61.º POST de la misma IP → 429", async () => {
  const { POST } = await import("@/app/api/webhooks/whatsapp/route");
  const forjado = () =>
    new Request("https://x/api/webhooks/whatsapp", { method: "POST", headers: { "x-forwarded-for": "6.6.6.6" }, body: "{}" });
  const estados: number[] = [];
  for (let i = 0; i < 61; i++) estados.push((await POST(forjado())).status);
  assert.ok(estados.slice(0, 60).every((s) => s === 401));
  assert.equal(estados[60], 429);
});

// Pase N2 (WhatsApp se configura al final): sin PADEL_WHATSAPP=cloud ni WHATSAPP_PHONE_NUMBERS la
// ruta contesta lo mismo que en main (`skipped: whatsapp-apagado`) antes de leer la firma, el mapa,
// la conexión o la base: firmado o no, de cualquier número.
test("WhatsApp apagado y sin WHATSAPP_PHONE_NUMBERS → 200 whatsapp-apagado, igual que hoy, sin tocar nada", async () => {
  const { POST } = await import("@/app/api/webhooks/whatsapp/route");
  const antes = { modo: process.env.PADEL_WHATSAPP, mapa: process.env.WHATSAPP_PHONE_NUMBERS };
  delete process.env.PADEL_WHATSAPP;
  delete process.env.WHATSAPP_PHONE_NUMBERS;
  try {
    for (const r of [await POST(mensaje("100000000000001", "7.7.8.1")), await POST(mensaje("999999999999999", "7.7.8.2"))]) {
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ok: true, skipped: "whatsapp-apagado" });
    }
  } finally {
    if (antes.modo === undefined) delete process.env.PADEL_WHATSAPP;
    else process.env.PADEL_WHATSAPP = antes.modo;
    if (antes.mapa === undefined) delete process.env.WHATSAPP_PHONE_NUMBERS;
    else process.env.WHATSAPP_PHONE_NUMBERS = antes.mapa;
  }
});
