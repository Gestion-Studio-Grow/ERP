// El aviso de Mercado Pago entero (`atenderAvisoMP`), con dependencias falsas: orden de las
// guardas, secretos por negocio, ventana de `ts`, rechazos con 200 + auditoría, y que el cobro
// no depende del flag de facturación. La versión contra Postgres con dos negocios:
// webhooks-por-negocio-postgres.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildManifest } from "@/plugins/mercadopago/signature";
import { MercadoPagoApiError, type PagoMP } from "@/plugins/mercadopago";
import type { DepsAvisoMP, EntradaAuditoriaWebhook, OpcionesNotificacion } from "@/lib/mercadopago-dispatch";
import type { NegocioDelWebhook } from "./resolver-negocio";

const AHORA = 1_790_000_000_000;
const TS = String(AHORA / 1000);
const magra: NegocioDelWebhook = { id: "t-magra", slug: "magra", subdomain: "magra", status: "ACTIVE", modules: ["mercadopago"] };
const breakpoint: NegocioDelWebhook = { id: "t-bp", slug: "breakpoint", subdomain: "breakpoint", status: "ACTIVE", modules: ["mercadopago"] };

function aviso(opts: { id?: string; secreto?: string; ts?: string; host?: string; cuerpo?: unknown; query?: boolean } = {}) {
  const id = opts.id ?? "1234";
  const ts = opts.ts ?? TS;
  const v1 = createHmac("sha256", opts.secreto ?? "sec-magra").update(buildManifest(id, "req-1", ts)).digest("hex");
  const q = opts.query === false ? "" : `?data.id=${id}&type=payment`;
  return new Request(`https://${opts.host ?? "erp-ch.vercel.app"}/api/webhooks/mercadopago${q}`, {
    method: "POST",
    headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "req-1", host: opts.host ?? "erp-ch.vercel.app" },
    body: JSON.stringify(opts.cuerpo ?? { type: "payment", data: { id } }),
  });
}

function armar(over: Partial<DepsAvisoMP> = {}, pago: Partial<PagoMP> = {}) {
  const auditado: { tenantId: string; e: EntradaAuditoriaWebhook }[] = [];
  const manejados: { tenantId: string; opts: OpcionesNotificacion }[] = [];
  const leidos: string[] = [];
  const negocios = [magra, breakpoint];
  const deps: DepsAvisoMP = {
    env: { MP_WEBHOOK_SECRETS: JSON.stringify({ magra: "sec-magra", breakpoint: "sec-bp" }) },
    ahoraMs: () => AHORA,
    leerPago: async (id) => {
      leidos.push(id);
      return { id, estado: "approved", monto: 5000, externalReference: "gsg:magra:pedido:ped_1", ...pago } as PagoMP;
    },
    resolver: {
      porSlug: async (s) => negocios.find((n) => n.slug === s) ?? null,
      porSubdominio: async (s) => negocios.find((n) => n.subdomain === s) ?? null,
      primerosDos: async () => negocios,
    },
    manejar: async (n, opts) => {
      manejados.push({ tenantId: n.tenantId, opts });
      return { procesado: true, facturado: false, invoiceId: null };
    },
    auditar: async (tenantId, e) => {
      auditado.push({ tenantId, e });
    },
    limitar: () => null,
    ...over,
  };
  return { deps, auditado, manejados, leidos };
}

const atender = async (req: Request, deps: DepsAvisoMP) => {
  const { atenderAvisoMP } = await import("@/lib/mercadopago-dispatch");
  const r = await atenderAvisoMP(req, deps);
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};

test("aviso de magra firmado con su secreto → se maneja en magra, con la referencia del handler", async () => {
  const p = armar();
  const r = await atender(aviso(), p.deps);
  assert.equal(r.status, 200);
  assert.deepEqual(p.leidos, ["1234"]);
  assert.equal(p.manejados.length, 1);
  assert.equal(p.manejados[0].tenantId, magra.id);
  assert.equal(p.manejados[0].opts.pago?.externalReference, "pedido:ped_1");
  assert.equal(p.auditado.length, 0);
});

test("rate limit primero: 429 sin leer secretos ni el pago", async () => {
  const p = armar({ limitar: () => 30, env: {} });
  const r = await atender(aviso(), p.deps);
  assert.equal(r.status, 429);
  assert.equal(p.leidos.length, 0);
});

test("sin ningún secreto → 503; JSON roto → 503", async () => {
  assert.equal((await atender(aviso(), armar({ env: {} }).deps)).status, 503);
  assert.equal((await atender(aviso(), armar({ env: { MP_WEBHOOK_SECRETS: "{roto" } }).deps)).status, 503);
});

test("ts fuera de ±5 min → 401 y no se lee el pago", async () => {
  const p = armar();
  const r = await atender(aviso({ ts: String(AHORA / 1000 - 400) }), p.deps);
  assert.equal(r.status, 401);
  assert.equal(r.body.error, "ts-fuera-de-ventana");
  assert.equal(p.leidos.length, 0);
});

test("firma mala → 401; un cuerpo con OTRO id que el firmado → 401", async () => {
  assert.equal((await atender(aviso({ secreto: "otro" }), armar().deps)).status, 401);
  const p = armar();
  const r = await atender(aviso({ cuerpo: { type: "payment", data: { id: "9999" } } }), p.deps);
  assert.equal(r.status, 401);
  assert.equal(p.leidos.length, 0);
});

test("sin data.id en la query: el del cuerpo sólo vale si está firmado", async () => {
  const p = armar();
  const r = await atender(aviso({ query: false }), p.deps);
  assert.equal(r.status, 200);
  assert.deepEqual(p.leidos, ["1234"]);
});

test("firmado con el secreto de breakpoint pero el pago es de magra → 401 + auditado en magra", async () => {
  const p = armar();
  const r = await atender(aviso({ secreto: "sec-bp" }), p.deps);
  assert.equal(r.status, 401);
  assert.equal(p.manejados.length, 0);
  assert.equal(p.auditado[0].tenantId, magra.id);
  assert.equal(p.auditado[0].e.action, "rechazado");
});

test("sólo el secreto global: se usa (con aviso al monitor)", async () => {
  const p = armar({ env: { MP_WEBHOOK_SECRET: "sec-global" } });
  const r = await atender(aviso({ secreto: "sec-global" }), p.deps);
  assert.equal(r.status, 200);
  assert.equal(p.manejados[0].tenantId, magra.id);
});

test("referencia ausente / ilegible / de otro negocio por el host → 200 sin efecto + auditoría", async () => {
  for (const ref of ["", "pedido:ped_1"]) {
    const p = armar({}, { externalReference: ref });
    const r = await atender(aviso({ host: "magra.erp.test" }), { ...p.deps, env: { ...p.deps.env, APP_BASE_DOMAIN: "erp.test" } });
    assert.equal(r.status, 200);
    assert.ok(r.body.rechazado);
    assert.equal(p.manejados.length, 0);
  }
  // breakpoint por la URL de magra: rechazado y auditado en breakpoint (el host lo lee la app por env).
  const prev = process.env.APP_BASE_DOMAIN;
  process.env.APP_BASE_DOMAIN = "erp.test";
  try {
    const p = armar({}, { externalReference: "gsg:breakpoint:pedido:ped_9" });
    const r = await atender(aviso({ host: "magra.erp.test", secreto: "sec-bp" }), p.deps);
    assert.equal(r.status, 200);
    assert.equal(r.body.rechazado, "host-de-otro-negocio");
    assert.equal(p.manejados.length, 0);
    assert.equal(p.auditado.length, 1);
    assert.equal(p.auditado[0].tenantId, breakpoint.id);
    assert.equal(p.auditado[0].e.entityId, "1234");
  } finally {
    if (prev === undefined) delete process.env.APP_BASE_DOMAIN;
    else process.env.APP_BASE_DOMAIN = prev;
  }
});

test("pago que la cuenta no tiene (404 de MP) → 200 sin efecto; MP caído → 500", async () => {
  const no = armar({ leerPago: async () => { throw new MercadoPagoApiError("no", 404); } });
  assert.equal((await atender(aviso(), no.deps)).status, 200);
  const caido = armar({ leerPago: async () => { throw new Error("ECONNRESET"); } });
  assert.equal((await atender(aviso(), caido.deps)).status, 500);
});

// F1 (certificación S1): 401/403/429 de MP no se acusan con 200 — MP no reintentaría y el pago se pierde.
for (const [status, esperado] of [[400, 200], [401, 503], [403, 503], [429, 500], [502, 500]] as const) {
  test(`MP contesta ${status} al leer el pago → ${esperado}${esperado === 200 ? " sin efecto" : " (MP reintenta)"}`, async () => {
    const p = armar({ leerPago: async () => { throw new MercadoPagoApiError(`MP HTTP ${status}`, status); } });
    const r = await atender(aviso(), p.deps);
    assert.equal(r.status, esperado);
    assert.equal(p.manejados.length, 0);
  });
}

test("tipo distinto de payment → 200 ignorado, sin leer el pago", async () => {
  const p = armar();
  const id = "55";
  const v1 = createHmac("sha256", "sec-magra").update(buildManifest(id, "req-1", TS)).digest("hex");
  const req = new Request(`https://x/api/webhooks/mercadopago?data.id=${id}&type=merchant_order`, {
    method: "POST",
    headers: { "x-signature": `ts=${TS},v1=${v1}`, "x-request-id": "req-1" },
    body: "{}",
  });
  const r = await atender(req, p.deps);
  assert.equal(r.status, 200);
  assert.equal(p.leidos.length, 0);
});

test("el cobro del pedido NO depende de isInvoicingEnabled(): con la facturación apagada se cobra igual", async () => {
  const prev = process.env.ARCA_INVOICING_ENABLED;
  delete process.env.ARCA_INVOICING_ENABLED;
  try {
    const { manejarNotificacionMP } = await import("@/lib/mercadopago-dispatch");
    const cobros: string[] = [];
    let facturas = 0;
    const r = await manejarNotificacionMP(
      { type: "payment", paymentId: "1234", tenantId: magra.id },
      {
        pago: { id: "1234", estado: "approved", monto: 5000, externalReference: "pedido:ped_1" } as PagoMP,
        cobrarPedido: async (a) => {
          cobros.push(a.orderId);
          return { cobrado: true, code: 1, total: 5000 };
        },
      },
    );
    assert.deepEqual(cobros, ["ped_1"]);
    assert.equal(r.pedido?.cobrado, true);
    // Y un turno con la facturación apagada no factura (facturar es otra decisión).
    const t = await manejarNotificacionMP(
      { type: "payment", paymentId: "77", tenantId: magra.id },
      { pago: { id: "77", estado: "approved", monto: 1, externalReference: "apt_1" } as PagoMP, cobrarPedido: async () => { facturas++; return { cobrado: false, motivo: "x", detalle: "" }; } },
    );
    assert.equal(t.facturado, false);
    assert.equal(facturas, 0);
  } finally {
    if (prev !== undefined) process.env.ARCA_INVOICING_ENABLED = prev;
  }
});
