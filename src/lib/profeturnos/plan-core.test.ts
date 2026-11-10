// PROFETURNOS T2 · Núcleo puro del plan: prueba, activo, vencido, libre; vigencia tras un pago;
// referencia del cobro; validación del pago re-leído. Y el cobro (preferencia) con transporte falso.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dentroDelArrepentimiento,
  estadoDelPlan,
  sumarUnMes,
  referenciaDelCobro,
  tenantDeLaReferencia,
  validarPago,
  vigenciaTrasUnPago,
  ultimoDiaDePrueba,
} from "./plan-core";
import { DIAS_PRUEBA, PRECIO_MENSUAL } from "./planes";
import { crearCobroMensual, origenDelHost, pagosDisponibles, parsearPagoLeido } from "./cobro-mp";
import { gateAplicaA } from "@/lib/site-gate";

const ALTA = "2026-11-01";

test("sin fila de alta es «libre», haya lo que haya (regla de oro)", () => {
  for (const plan of [null, "vencido", "baja", "mensual"] as const) {
    const e = estadoDelPlan({ altaEn: null, vigenciaHasta: "2020-01-01", plan, hoy: "2030-01-01" });
    assert.equal(e.estado, "libre");
    assert.equal(e.diasRestantes, null);
  }
});

test("prueba: DIAS_PRUEBA días contando el del alta; después, vencido", () => {
  assert.equal(ultimoDiaDePrueba(ALTA), "2026-11-14");
  assert.deepEqual(estadoDelPlan({ altaEn: ALTA, vigenciaHasta: null, hoy: ALTA }), { estado: "prueba", diasRestantes: DIAS_PRUEBA, hasta: "2026-11-14", baja: false });
  assert.equal(estadoDelPlan({ altaEn: ALTA, vigenciaHasta: null, hoy: "2026-11-14" }).diasRestantes, 1);
  assert.equal(estadoDelPlan({ altaEn: ALTA, vigenciaHasta: null, hoy: "2026-11-15" }).estado, "vencido");
});

test("activo hasta vigenciaHasta inclusive; vencido al día siguiente", () => {
  const e = estadoDelPlan({ altaEn: ALTA, vigenciaHasta: "2026-12-20", plan: "mensual", hoy: "2026-12-20" });
  assert.equal(e.estado, "activo");
  assert.equal(e.diasRestantes, 1);
  assert.equal(estadoDelPlan({ altaEn: ALTA, vigenciaHasta: "2026-12-20", plan: "mensual", hoy: "2026-12-21" }).estado, "vencido");
});

test("arrepentimiento (plan «vencido») corta aunque quede prueba o vigencia", () => {
  assert.equal(estadoDelPlan({ altaEn: ALTA, vigenciaHasta: null, plan: "vencido", hoy: ALTA }).estado, "vencido");
  assert.equal(estadoDelPlan({ altaEn: ALTA, vigenciaHasta: "2027-01-01", plan: "vencido", hoy: "2026-11-20" }).estado, "vencido");
});

test("baja conserva lo pagado y lo marca", () => {
  const e = estadoDelPlan({ altaEn: ALTA, vigenciaHasta: "2026-12-20", plan: "baja", hoy: "2026-12-01" });
  assert.equal(e.estado, "activo");
  assert.equal(e.baja, true);
});

test("vigencia tras un pago: +1 mes desde lo más tarde entre hoy y lo habilitado", () => {
  // En prueba: no se pierden los días que quedan.
  assert.equal(vigenciaTrasUnPago({ altaEn: ALTA, vigenciaHasta: null, hoy: "2026-11-05" }), "2026-12-14");
  // Vencido: desde hoy.
  assert.equal(vigenciaTrasUnPago({ altaEn: ALTA, vigenciaHasta: null, hoy: "2026-12-01" }), "2027-01-01");
  // Activo: se suma al final.
  assert.equal(vigenciaTrasUnPago({ altaEn: ALTA, vigenciaHasta: "2027-01-10", plan: "mensual", hoy: "2026-12-01" }), "2027-02-10");
  // Tras arrepentimiento: desde hoy.
  assert.equal(vigenciaTrasUnPago({ altaEn: ALTA, vigenciaHasta: "2027-01-10", plan: "vencido", hoy: "2026-12-01" }), "2027-01-01");
  // Libre (sin alta): desde hoy.
  assert.equal(vigenciaTrasUnPago({ altaEn: null, vigenciaHasta: null, hoy: "2026-12-01" }), "2027-01-01");
});

test("sumarUnMes: fin de mes y año", () => {
  assert.equal(sumarUnMes("2026-01-31"), "2026-02-28");
  assert.equal(sumarUnMes("2028-01-31"), "2028-02-29");
  assert.equal(sumarUnMes("2026-12-15"), "2027-01-15");
});

test("plazo de arrepentimiento: 10 días corridos", () => {
  assert.equal(dentroDelArrepentimiento("2026-11-01", "2026-11-11"), true);
  assert.equal(dentroDelArrepentimiento("2026-11-01", "2026-11-12"), false);
  assert.equal(dentroDelArrepentimiento("2026-11-05", "2026-11-01"), false);
});

test("referencia: forma exacta pt:<tenantId>:mensual:<nonce>", () => {
  const r = referenciaDelCobro("cmabc123", "n0nce_x");
  assert.equal(r, "pt:cmabc123:mensual:n0nce_x");
  assert.equal(tenantDeLaReferencia(r), "cmabc123");
  for (const trucha of [null, 1, "", "pt:abc:anual:x", "gsg:abc:mensual:x", "pt:abc:mensual", "pt:abc:mensual:x:y", "pt:a b:mensual:x", "pt::mensual:x"]) {
    assert.equal(tenantDeLaReferencia(trucha), null, String(trucha));
  }
  assert.throws(() => referenciaDelCobro("a:b", "x"));
});

test("validarPago: aprobado, ARS, precio exacto y referencia nuestra", () => {
  const ok = { id: "1", status: "approved", currency: "ARS", monto: PRECIO_MENSUAL, referencia: "pt:t1:mensual:n" };
  assert.deepEqual(validarPago(ok, PRECIO_MENSUAL), { ok: true, tenantId: "t1" });
  assert.deepEqual(validarPago({ ...ok, status: "pending" }, PRECIO_MENSUAL), { ok: false, motivo: "no-aprobado" });
  assert.deepEqual(validarPago({ ...ok, currency: "USD" }, PRECIO_MENSUAL), { ok: false, motivo: "moneda" });
  assert.deepEqual(validarPago({ ...ok, monto: PRECIO_MENSUAL - 1 }, PRECIO_MENSUAL), { ok: false, motivo: "monto" });
  assert.deepEqual(validarPago({ ...ok, monto: null }, PRECIO_MENSUAL), { ok: false, motivo: "monto" });
  assert.deepEqual(validarPago({ ...ok, referencia: "pt:t1:anual:n" }, PRECIO_MENSUAL), { ok: false, motivo: "referencia" });
});

test("cobro: sin token no hay botón ni llamada (fail-closed)", async () => {
  assert.equal(pagosDisponibles({}), false);
  assert.equal(pagosDisponibles({ MP_ACCES_TOKEN: "  " }), false);
  let llamadas = 0;
  const r = await crearCobroMensual({ tenantId: "t1", origen: null, env: {}, transport: { post: async () => (llamadas++, { status: 200, body: "{}" }) } });
  assert.deepEqual(r, { ok: false, motivo: "sin-token" });
  assert.equal(llamadas, 0);
});

test("cobro: la preferencia lleva precio, ARS, referencia, webhook y vuelta; el token sólo en el header", async () => {
  let visto: { url: string; headers: Record<string, string>; body: string } | null = null;
  const r = await crearCobroMensual({
    tenantId: "t1",
    origen: origenDelHost("profe.gsgapp.com.ar"),
    env: { MP_ACCES_TOKEN: "TOKEN-FALSO" },
    nonce: "abc",
    transport: {
      post: async (url, headers, body) => {
        visto = { url, headers, body };
        return { status: 201, body: JSON.stringify({ id: "pref-1", init_point: "https://mp.example/checkout/pref-1" }) };
      },
    },
  });
  assert.deepEqual(r, { ok: true, url: "https://mp.example/checkout/pref-1", referencia: "pt:t1:mensual:abc" });
  assert.ok(visto);
  const v = visto as { url: string; headers: Record<string, string>; body: string };
  assert.match(v.url, /\/checkout\/preferences$/);
  assert.equal(v.headers.Authorization, "Bearer TOKEN-FALSO");
  const body = JSON.parse(v.body);
  assert.equal(body.items[0].unit_price, PRECIO_MENSUAL);
  assert.equal(body.items[0].currency_id, "ARS");
  assert.equal(body.external_reference, "pt:t1:mensual:abc");
  assert.equal(body.notification_url, "https://profe.gsgapp.com.ar/api/webhooks/profeturnos-mp");
  assert.equal(body.back_urls.success, "https://profe.gsgapp.com.ar/admin/clases/plan?volviste=1");
  assert.ok(!v.body.includes("TOKEN-FALSO"));
});

test("cobro: MP en error → motivo genérico, sin el detalle", async () => {
  const r = await crearCobroMensual({ tenantId: "t1", origen: null, env: { MP_ACCES_TOKEN: "x" }, transport: { post: async () => ({ status: 500, body: "{\"message\":\"boom\"}" }) } });
  assert.deepEqual(r, { ok: false, motivo: "error" });
});

test("origenDelHost: sólo hosts válidos; http sólo en localhost", () => {
  assert.equal(origenDelHost("localhost:3000"), "http://localhost:3000");
  assert.equal(origenDelHost("a.b.com"), "https://a.b.com");
  assert.equal(origenDelHost("evil.com/x"), null);
  assert.equal(origenDelHost(null), null);
});

test("parsearPagoLeido: toma moneda, monto, estado y referencia", () => {
  const p = parsearPagoLeido(JSON.stringify({ id: 123, status: "approved", currency_id: "ARS", transaction_amount: 12900, external_reference: "pt:t:mensual:n" }));
  assert.deepEqual(p, { id: "123", status: "approved", currency: "ARS", monto: 12900, referencia: "pt:t:mensual:n" });
});

test("el portón del sitio no tapa el webhook", () => {
  assert.equal(gateAplicaA("/api/webhooks/profeturnos-mp"), false);
});
