// Pase N2 (merge S1 + P1): ruta REAL de WhatsApp con base viva — orden combinado, negocio correcto,
// nunca un negocio suspendido. Escrito por el certificador del pase. Corre con el arnés de base efímera
// (ERP_TEST_PG_URL o PGlite: `node scripts/qa/p1-pglite.mjs src/lib/webhooks/whatsapp-ruta-postgres.test.ts`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const SECRETO = "wa-secreto-cert";
let n = 0;
function mensaje(phoneNumberId: string): { req: Request; id: string } {
  const id = `wamid.CERT${++n}`;
  const cuerpo = JSON.stringify({ entry: [{ changes: [{ value: {
    metadata: { phone_number_id: phoneNumberId },
    contacts: [{ wa_id: "5491100000000", profile: { name: "Ana" } }],
    messages: [{ from: "5491100000000", id, type: "text", text: { body: "hola" }, timestamp: "1790000000" }],
  } }] }] });
  const firma = "sha256=" + createHmac("sha256", SECRETO).update(cuerpo, "utf8").digest("hex");
  return { id, req: new Request("https://magra.erp.test/api/webhooks/whatsapp", {
    method: "POST", headers: { "x-hub-signature-256": firma, "x-forwarded-for": `9.9.9.${n}`, host: "magra.erp.test" }, body: cuerpo }) };
}

test("orden combinado S1+P1 en la ruta real con base viva", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env, { PADEL_WHATSAPP: "cloud", WHATSAPP_APP_SECRET: SECRETO, DB_CONNECTION_LIMIT: "4" });
  const duenio = await prismaComoDuenio(base);
  const { POST } = await import("@/app/api/webhooks/whatsapp/route");
  const avisos = async (id: string) => ({
    a: await duenio.padelAviso.count({ where: { tenantId: base.a.id, idExterno: id } }),
    b: await duenio.padelAviso.count({ where: { tenantId: base.b.id, idExterno: id } }),
  });
  const X = "100000000000001";
  const mapaXaB = JSON.stringify({ [X]: base.b.slug });
  const enviar = async (pnid: string) => { const m = mensaje(pnid); const r = await POST(m.req); return { status: r.status, body: await r.json(), av: await avisos(m.id) }; };

  // 1) número fuera del mapa, sin conexión, base viva → 200 numero-sin-negocio (lo que el test de ruta dejó de cubrir)
  process.env.WHATSAPP_PHONE_NUMBERS = mapaXaB;
  let r = await enviar("999999999999999");
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true, ignorado: "numero-sin-negocio" }); assert.deepEqual(r.av, { a: 0, b: 0 });

  // 1b) mapa a B, sin conexión → procesa en B
  r = await enviar(X);
  assert.equal(r.status, 200); assert.deepEqual(r.av, { a: 0, b: 1 });

  // 2) conexión de A para X manda sobre el mapa X→B → procesa en A, no en B
  await duenio.tenant.update({ where: { id: base.a.id }, data: { modules: { push: "whatsapp" } } });
  await duenio.integracionConexion.create({ data: { tenantId: base.a.id, conector: "whatsapp", cuentaExterna: X, estado: "conectada" } });
  r = await enviar(X);
  assert.equal(r.status, 200); assert.deepEqual(r.av, { a: 1, b: 0 });

  // 3) A suspendido (por conexión) con mapa X→B activo → 200 negocio-suspendido, no cae a B
  await duenio.tenant.update({ where: { id: base.a.id }, data: { status: "SUSPENDED" } });
  r = await enviar(X);
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true, ignorado: "negocio-suspendido" }); assert.deepEqual(r.av, { a: 0, b: 0 });

  // 4) variable ilegible con conexión presente → 503 sin procesar
  process.env.WHATSAPP_PHONE_NUMBERS = "{roto";
  r = await enviar(X);
  assert.equal(r.status, 503); assert.deepEqual(r.av, { a: 0, b: 0 });

  // 5) sin conexión, mapa X→B con B suspendido → negocio-suspendido
  await duenio.integracionConexion.deleteMany({ where: { cuentaExterna: X } });
  await duenio.tenant.update({ where: { id: base.a.id }, data: { status: "ACTIVE" } });
  await duenio.tenant.update({ where: { id: base.b.id }, data: { status: "SUSPENDED" } });
  process.env.WHATSAPP_PHONE_NUMBERS = mapaXaB;
  r = await enviar(X);
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true, ignorado: "negocio-suspendido" }); assert.deepEqual(r.av, { a: 0, b: 0 });
});
