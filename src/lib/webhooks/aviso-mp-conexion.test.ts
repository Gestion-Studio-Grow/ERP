// Tanda P1 (P1-C5): el webhook viejo de Mercado Pago delega a la CONEXIÓN que valida la firma.
// Dependencias falsas: orden de guardas, rechazo sin adivinar por host, sin legado sin el flag,
// tope/ambigüedad, y el handler del evento de una conexión (`manejadorAvisoMP`). Contra Postgres
// con dos negocios: webhooks-por-conexion-postgres.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildManifest } from "@/plugins/mercadopago/signature";
import { MercadoPagoApiError, type PagoMP } from "@/plugins/mercadopago";
import type { EntradaCruda } from "@/integraciones/contrato";
import type { ConexionResuelta, ResultadoPorFirma } from "@/integraciones/conexiones.server";
import type { ContextoHandler } from "@/integraciones/entrada.server";
import type { DepsAvisoMP, DepsManejadorMP, EntradaAuditoriaWebhook, OpcionesNotificacion } from "@/lib/mercadopago-dispatch";
import { negocioDelMensajeWA, referenciaDeLaConexion, type NegocioDelWebhook } from "./resolver-negocio";

const AHORA = 1_790_000_000_000;
const TS = String(AHORA / 1000);
const magra: NegocioDelWebhook = { id: "t-magra", slug: "magra", subdomain: "magra", status: "ACTIVE", modules: ["mercadopago"] };
const conexionMagra: ConexionResuelta = { tenantId: "t-magra", conexionId: "con-magra", conector: "mercadopago", cuentaExterna: null };

function aviso(opts: { id?: string; tipo?: string; query?: boolean; cuerpo?: unknown; host?: string } = {}) {
  const id = opts.id ?? "1234";
  const v1 = createHmac("sha256", "whsec-magra").update(buildManifest(id, "req-1", TS)).digest("hex");
  const q = opts.query === false ? "" : `?data.id=${id}&type=${opts.tipo ?? "payment"}`;
  return new Request(`https://${opts.host ?? "breakpoint.erp.test"}/api/webhooks/mercadopago${q}`, {
    method: "POST",
    headers: { "x-signature": `ts=${TS},v1=${v1}`, "x-request-id": "req-1", host: opts.host ?? "breakpoint.erp.test" },
    body: JSON.stringify(opts.cuerpo ?? { type: "payment", data: { id } }),
  });
}

function armar(resultado: ResultadoPorFirma, over: Partial<DepsAvisoMP> = {}) {
  const firmas: EntradaCruda[] = [];
  const despachados: { conexion: ConexionResuelta; req: EntradaCruda }[] = [];
  const legado: string[] = [];
  const deps: DepsAvisoMP = {
    env: {},
    ahoraMs: () => AHORA,
    porFirma: async (req) => {
      firmas.push(req);
      return resultado;
    },
    despachar: async (conexion, req) => {
      despachados.push({ conexion, req });
      return { status: 200, cuerpo: { ok: true, resultado: { procesados: 1 } } };
    },
    leerPago: async (id) => {
      legado.push(`leer:${id}`);
      throw new Error("el legado no tiene que correr");
    },
    resolver: {
      porSlug: async () => {
        legado.push("porSlug");
        return null;
      },
      porSubdominio: async () => {
        legado.push("porSubdominio");
        return null;
      },
      primerosDos: async () => {
        legado.push("primerosDos");
        return [];
      },
    },
    manejar: async () => {
      legado.push("manejar");
      return { procesado: true, facturado: false, invoiceId: null };
    },
    auditar: async () => {
      legado.push("auditar");
    },
    limitar: () => null,
    ...over,
  };
  return { deps, firmas, despachados, legado };
}

const atender = async (req: Request, deps: DepsAvisoMP) => {
  const { atenderAvisoMP } = await import("@/lib/mercadopago-dispatch");
  const r = await atenderAvisoMP(req, deps);
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};

test("P1-C5: la conexión que firmó recibe el aviso por el servicio nuevo; el host y el legado no intervienen", async () => {
  const p = armar({ ok: true, conexion: conexionMagra }, { env: { MP_MODO_LEGADO: "1" } });
  const r = await atender(aviso(), p.deps);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(p.despachados.length, 1);
  assert.deepEqual(p.despachados[0].conexion, conexionMagra);
  assert.equal(p.despachados[0].req.consulta["data.id"], "1234");
  assert.equal(p.despachados[0].req.encabezados["x-request-id"], "req-1");
  assert.deepEqual(p.legado, [], "ni secretos de env, ni host, ni lectura con la cuenta del despliegue");
});

test("P1-C5: rate limit antes de resolver la conexión", async () => {
  const p = armar({ ok: true, conexion: conexionMagra }, { limitar: () => 30 });
  const r = await atender(aviso(), p.deps);
  assert.equal(r.status, 429);
  assert.equal(p.firmas.length, 0);
});

test("P1-C5: ninguna firma valida y sin el flag → rechazo, sin adivinar el negocio por el host", async () => {
  for (const motivo of ["firma_invalida", "sin_firma", "fuera_de_ventana"] as const) {
    const p = armar({ ok: false, motivo });
    const r = await atender(aviso({ host: "magra.erp.test" }), p.deps);
    assert.equal(r.status, 401, motivo);
    assert.equal(r.body.error, motivo);
    assert.equal(p.despachados.length, 0);
    assert.deepEqual(p.legado, []);
  }
  const sinConexion = armar({ ok: false, motivo: "sin_secreto" });
  const r = await atender(aviso({ host: "magra.erp.test" }), sinConexion.deps);
  assert.equal(r.status, 503);
  assert.equal(r.body.error, "sin-conexion");
  assert.deepEqual(sinConexion.legado, []);
});

test("P1-C5: más conexiones que el tope → 503; dos conexiones que firman → 401; el flag legado no lo salva", async () => {
  const demasiadas = armar({ ok: false, motivo: "demasiadas" }, { env: { MP_MODO_LEGADO: "1", MP_WEBHOOK_SECRET: "x" } });
  assert.equal((await atender(aviso(), demasiadas.deps)).status, 503);
  assert.deepEqual(demasiadas.legado, []);
  const ambigua = armar({ ok: false, motivo: "ambigua" }, { env: { MP_MODO_LEGADO: "1", MP_WEBHOOK_SECRET: "x" } });
  const r = await atender(aviso(), ambigua.deps);
  assert.equal(r.status, 401);
  assert.equal(r.body.error, "firma-ambigua");
  assert.deepEqual(ambigua.legado, []);
});

test("P1-C5: sin data.id en la query, el del cuerpo va al manifest; un cuerpo con OTRO id → 401", async () => {
  const p = armar({ ok: true, conexion: conexionMagra });
  const r = await atender(aviso({ query: false }), p.deps);
  assert.equal(r.status, 200);
  assert.equal(p.firmas[0].consulta["data.id"], "1234");

  const q = armar({ ok: true, conexion: conexionMagra });
  const r2 = await atender(aviso({ cuerpo: { type: "payment", data: { id: "9999" } } }), q.deps);
  assert.equal(r2.status, 401);
  assert.equal(r2.body.error, "id-no-firmado");
  assert.equal(q.despachados.length, 0);
});

test("P1-C5: tipo distinto de payment → 200 ignorado sin despachar", async () => {
  const p = armar({ ok: true, conexion: conexionMagra });
  const r = await atender(aviso({ tipo: "merchant_order" }), p.deps);
  assert.equal(r.status, 200);
  assert.equal(p.despachados.length, 0);
});

test("P1-C5: el despacho que falla → 500 (MP reintenta)", async () => {
  const p = armar({ ok: true, conexion: conexionMagra }, {
    despachar: async () => {
      throw new Error("base caída");
    },
  });
  assert.equal((await atender(aviso(), p.deps)).status, 500);
});

// ── El handler del evento de una conexión ────────────────────────────────────

function armarManejador(pago: Partial<PagoMP> | Error, negocio: NegocioDelWebhook | null = magra) {
  const manejados: { tenantId: string; paymentId: string; opts: OpcionesNotificacion }[] = [];
  const auditado: { tenantId: string; e: EntradaAuditoriaWebhook }[] = [];
  const leidos: string[] = [];
  const deps: DepsManejadorMP = {
    leerPago: async (c, id) => {
      leidos.push(`${c.tenantId}/${c.conexionId}/${id}`);
      if (pago instanceof Error) throw pago;
      return { id, estado: "approved", monto: 5000, externalReference: "", ...pago } as PagoMP;
    },
    negocio: async () => negocio,
    manejar: async (n, opts) => {
      manejados.push({ tenantId: n.tenantId, paymentId: n.paymentId, opts });
      return { procesado: true, facturado: false, invoiceId: null, pedido: { cobrado: true, code: 1, total: 5000 } };
    },
    auditar: async (tenantId, e) => {
      auditado.push({ tenantId, e });
    },
  };
  return { deps, manejados, auditado, leidos };
}

const ctx = (pagoExterno = "1234"): ContextoHandler => ({
  tenantId: "t-magra",
  conexionId: "con-magra",
  conector: "mercadopago",
  evento: { tipo: "pago.acreditado", idExterno: `pago:${pagoExterno}:req-1`, cuentaExterna: null, ocurridoEn: null, datos: { pagoExterno, detalle: {} } },
});

test("manejador: lee el pago con ESA conexión y cobra en su negocio (gsg: propia y referencia vieja)", async () => {
  const { manejadorAvisoMP } = await import("@/lib/mercadopago-dispatch");
  for (const [ref, esperada] of [
    ["gsg:magra:pedido:ped_1", "pedido:ped_1"],
    ["pedido:ped_2", "pedido:ped_2"],
    ["apt_9", "apt_9"],
    ["", ""],
  ] as const) {
    const m = armarManejador({ externalReference: ref });
    const r = await manejadorAvisoMP(m.deps)(ctx());
    assert.equal(r.estado, "procesado", ref);
    assert.deepEqual(m.leidos, ["t-magra/con-magra/1234"]);
    assert.equal(m.manejados.length, 1);
    assert.equal(m.manejados[0].tenantId, "t-magra");
    assert.equal(m.manejados[0].opts.pago?.externalReference, esperada);
    assert.equal(m.auditado.length, 0);
  }
});

test("manejador: referencia de OTRO negocio o gsg ilegible → ignorado, sin cobro, auditado en el negocio de la conexión", async () => {
  const { manejadorAvisoMP } = await import("@/lib/mercadopago-dispatch");
  for (const [ref, motivo] of [
    ["gsg:breakpoint:pedido:ped_9", "referencia-de-otro-negocio"],
    ["gsg:roto", "referencia-ilegible"],
  ] as const) {
    const m = armarManejador({ externalReference: ref });
    const r = await manejadorAvisoMP(m.deps)(ctx());
    assert.equal(r.estado, "ignorado");
    assert.equal(r.resumen, motivo);
    assert.equal(m.manejados.length, 0);
    assert.equal(m.auditado.length, 1);
    assert.equal(m.auditado[0].tenantId, "t-magra");
    assert.equal(m.auditado[0].e.action, "rechazado");
  }
  const sinMp = armarManejador({ externalReference: "pedido:ped_1" }, { ...magra, modules: [] });
  assert.equal((await manejadorAvisoMP(sinMp.deps)(ctx())).estado, "ignorado");
  assert.equal(sinMp.manejados.length, 0);
});

test("manejador: 404/400 de MP → ignorado; 401/403 o caído → lanza (evento fallido, MP reintenta)", async () => {
  const { manejadorAvisoMP } = await import("@/lib/mercadopago-dispatch");
  for (const s of [404, 400]) {
    const m = armarManejador(new MercadoPagoApiError("no", s));
    assert.equal((await manejadorAvisoMP(m.deps)(ctx())).estado, "ignorado");
  }
  for (const e of [new MercadoPagoApiError("no", 401), new MercadoPagoApiError("no", 403), new Error("ECONNRESET")]) {
    const m = armarManejador(e);
    await assert.rejects(() => manejadorAvisoMP(m.deps)(ctx()));
    assert.equal(m.manejados.length, 0);
  }
});

test("referenciaDeLaConexion: sólo la del propio negocio o la vieja", () => {
  assert.deepEqual(referenciaDeLaConexion("gsg:magra:turno:apt_1", "magra"), { ok: true, referencia: "apt_1" });
  assert.deepEqual(referenciaDeLaConexion(" pedido:x ", "magra"), { ok: true, referencia: "pedido:x" });
  assert.deepEqual(referenciaDeLaConexion(null, "magra"), { ok: true, referencia: null });
  assert.deepEqual(referenciaDeLaConexion("gsg:otro:pedido:x", "magra"), { ok: false, motivo: "referencia-de-otro-negocio" });
  assert.deepEqual(referenciaDeLaConexion("gsg:magra:otra:x", "magra"), { ok: false, motivo: "referencia-ilegible" });
});

test("WhatsApp (P1-C5): la conexión del número manda; sin conexión, el mapa de S1; demasiadas → sin negocio", async () => {
  const payload = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "100000000000001" } } }] }] };
  const bp = { id: "t-bp", slug: "breakpoint", status: "TRIAL" }; // S1 (pase N2): el negocio trae su status
  const magra = { id: "t-magra", slug: "magra", status: "ACTIVE" };
  const base = { porSlug: async () => magra, primerosDos: async () => [magra] };
  const env = { WHATSAPP_PHONE_NUMBERS: '{"100000000000001":"magra"}' };
  assert.deepEqual(await negocioDelMensajeWA(payload, env, { ...base, porConexion: async () => bp }), { ok: true, negocio: bp, via: "conexion" });
  assert.deepEqual(await negocioDelMensajeWA(payload, env, { ...base, porConexion: async () => null }), {
    ok: true,
    negocio: magra,
    via: "mapa",
  });
  assert.deepEqual(await negocioDelMensajeWA(payload, env, { ...base, porConexion: async () => "demasiadas" }), {
    ok: false,
    slug: null,
    motivo: "demasiadas-conexiones",
  });
});
