// Tests de COBROS (links de pago MP): validación, armado de body, parseo, estados,
// errores y stub. node:test + tsx. Sin red ni credenciales.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarSolicitud,
  SolicitudCobroInvalidaError,
  armarBodyPreferencia,
  parsearPreferencia,
  construirUrlPreferencia,
  HttpPasarelaCobros,
  type TransportePost,
  StubPasarelaCobros,
  STUB_COBROS_BASE,
  MONEDA_ARS,
} from "./index";
import type { RespuestaHttp } from "../http";

// ── Validación ───────────────────────────────────────────────────────────────

test("validarSolicitud: solicitud OK no tiene errores", () => {
  assert.deepEqual(validarSolicitud({ concepto: "Seña turno", monto: 5000 }), []);
});

test("validarSolicitud: concepto vacío y monto <= 0", () => {
  const errs = validarSolicitud({ concepto: "  ", monto: 0 });
  assert.equal(errs.length, 2);
  assert.ok(errs.some((e) => e.campo === "concepto"));
  assert.ok(errs.some((e) => e.campo === "monto"));
});

test("validarSolicitud: cantidad no entera y email inválido", () => {
  const errs = validarSolicitud({ concepto: "x", monto: 10, cantidad: 1.5, emailPagador: "no-mail" });
  assert.ok(errs.some((e) => e.campo === "cantidad"));
  assert.ok(errs.some((e) => e.campo === "emailPagador"));
});

// ── Armado de body ───────────────────────────────────────────────────────────

test("armarBodyPreferencia: 1 ítem en ARS, redondeo a centavos", () => {
  const body = armarBodyPreferencia({ concepto: " Corte ", monto: 1999.999, referenciaExterna: "appt-1" });
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].title, "Corte"); // trim
  assert.equal(body.items[0].quantity, 1);
  assert.equal(body.items[0].unit_price, 2000); // redondeo
  assert.equal(body.items[0].currency_id, MONEDA_ARS);
  assert.equal(body.external_reference, "appt-1");
  assert.equal(body.payer, undefined);
});

test("armarBodyPreferencia: cantidad y email cuando vienen", () => {
  const body = armarBodyPreferencia({ concepto: "Combo", monto: 100, cantidad: 3, emailPagador: "a@b.com" });
  assert.equal(body.items[0].quantity, 3);
  assert.deepEqual(body.payer, { email: "a@b.com" });
});

// ── Parseo de respuesta ──────────────────────────────────────────────────────

test("parsearPreferencia: respuesta válida → LinkDePago", () => {
  const body = JSON.stringify({
    id: "pref-123",
    init_point: "https://mp/checkout/pref-123",
    sandbox_init_point: "https://mp/sandbox/pref-123",
  });
  const link = parsearPreferencia(body, { concepto: "x", monto: 10, referenciaExterna: "r1" });
  assert.equal(link.preferenceId, "pref-123");
  assert.equal(link.initPoint, "https://mp/checkout/pref-123");
  assert.equal(link.sandboxInitPoint, "https://mp/sandbox/pref-123");
  assert.equal(link.estado, "activa");
  assert.equal(link.referenciaExterna, "r1");
});

test("parsearPreferencia: sin id o init_point lanza", () => {
  assert.throws(() => parsearPreferencia(JSON.stringify({ id: "x" }), { concepto: "c", monto: 1 }));
  assert.throws(() => parsearPreferencia(JSON.stringify({ init_point: "u" }), { concepto: "c", monto: 1 }));
});

test("construirUrlPreferencia", () => {
  assert.equal(construirUrlPreferencia("https://api.mercadopago.com"), "https://api.mercadopago.com/checkout/preferences");
});

// ── Adapter HTTP con transporte mock ─────────────────────────────────────────

function transporteQueDevuelve(status: number, body: string): TransportePost {
  return { post: async () => ({ status, body } satisfies RespuestaHttp) };
}

test("HttpPasarelaCobros: happy path con token y transporte mock", async () => {
  const transport = transporteQueDevuelve(
    201,
    JSON.stringify({ id: "pref-9", init_point: "https://mp/pref-9" }),
  );
  const pasarela = new HttpPasarelaCobros(async () => "TEST-TOKEN", { transport });
  const link = await pasarela.crearLinkDePago({ concepto: "Seña", monto: 3000, referenciaExterna: "appt-9" });
  assert.equal(link.preferenceId, "pref-9");
  assert.equal(link.initPoint, "https://mp/pref-9");
});

test("HttpPasarelaCobros: valida ANTES de pegarle a MP (no llama al transporte)", async () => {
  let llamado = false;
  const transport: TransportePost = { post: async () => { llamado = true; return { status: 200, body: "{}" }; } };
  const pasarela = new HttpPasarelaCobros(async () => "T", { transport });
  await assert.rejects(
    () => pasarela.crearLinkDePago({ concepto: "", monto: -1 }),
    SolicitudCobroInvalidaError,
  );
  assert.equal(llamado, false);
});

test("HttpPasarelaCobros: error HTTP de MP se propaga como MercadoPagoApiError", async () => {
  const transport = transporteQueDevuelve(401, JSON.stringify({ message: "invalid token", error: "unauthorized" }));
  const pasarela = new HttpPasarelaCobros(async () => "BAD", { transport });
  await assert.rejects(
    () => pasarela.crearLinkDePago({ concepto: "x", monto: 10 }),
    /Mercado Pago HTTP 401/,
  );
});

// ── Stub (sandbox por defecto) ───────────────────────────────────────────────

test("StubPasarelaCobros: link determinístico y de sandbox", async () => {
  const stub = new StubPasarelaCobros();
  const a = await stub.crearLinkDePago({ concepto: "Seña", monto: 3000, referenciaExterna: "appt-1" });
  const b = await stub.crearLinkDePago({ concepto: "Seña", monto: 3000, referenciaExterna: "appt-1" });
  assert.equal(a.preferenceId, b.preferenceId); // determinístico
  assert.ok(a.initPoint.startsWith(STUB_COBROS_BASE));
  assert.equal(a.estado, "activa");
});

test("StubPasarelaCobros: distinta solicitud → distinto link", async () => {
  const stub = new StubPasarelaCobros();
  const a = await stub.crearLinkDePago({ concepto: "Seña", monto: 3000 });
  const b = await stub.crearLinkDePago({ concepto: "Seña", monto: 5000 });
  assert.notEqual(a.preferenceId, b.preferenceId);
});

test("StubPasarelaCobros: también valida", async () => {
  const stub = new StubPasarelaCobros();
  await assert.rejects(() => stub.crearLinkDePago({ concepto: "", monto: 0 }), SolicitudCobroInvalidaError);
});
