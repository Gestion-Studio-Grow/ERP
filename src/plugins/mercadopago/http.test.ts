// Tests de las funciones puras de armado/normalización/parseo del adapter REST
// de Mercado Pago. Harness node:test + tsx (ADR-026). SIN red: se mockea el
// `HttpTransport`; el access token real (OAuth) NO se ejercita acá.

import { test } from "node:test";
import assert from "node:assert/strict";

import { CredencialesPort, CriterioBusqueda, MercadoPagoConfig } from "./port";
import {
  FetchHttpTransport,
  HttpMercadoPagoClient,
  HttpTransport,
  MP_API_BASE,
  MercadoPagoApiError,
  RespuestaHttp,
  construirUrlBusqueda,
  construirUrlPago,
  fechaArca,
  lanzarSiErrorHttp,
  mapearEstado,
  mapearOperacion,
  nombreContraparte,
  normalizarPago,
  parsearPagina,
  parsearPago,
  sumarComisiones,
  tokenDesdeCredenciales,
  tokenFijo,
  tokenNoConfigurado,
} from "./http";

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Pago aprobado (cobro a cliente) tal como lo devuelve `/v1/payments/{id}`. */
const PAGO_APROBADO = JSON.stringify({
  id: 123456789,
  status: "approved",
  status_detail: "accredited",
  operation_type: "regular_payment",
  transaction_amount: 1500,
  currency_id: "ARS",
  description: "Corte y color",
  external_reference: "appt-42",
  date_created: "2026-07-01T09:59:00.000-03:00",
  date_approved: "2026-07-01T10:00:05.000-03:00",
  fee_details: [
    { type: "mercadopago_fee", amount: 75.5, fee_payer: "collector" },
    { type: "financing_fee", amount: 4.5, fee_payer: "collector" },
  ],
  payer: { id: 987654321, email: "juan@example.com", first_name: "Juan", last_name: "Pérez" },
  collector_id: 111111,
});

/** Transferencia entre cuentas propias (no es venta). */
const PAGO_TRANSFERENCIA = JSON.stringify({
  id: "tr-1",
  status: "approved",
  operation_type: "money_transfer",
  transaction_amount: 40000,
  date_approved: "2026-07-02T12:00:00.000-03:00",
  payer: { id: 111111 },
});

/** Página de búsqueda con 2 resultados y paginación. */
const BUSQUEDA_PAGINA = JSON.stringify({
  paging: { total: 130, limit: 2, offset: 0 },
  results: [
    { id: 1, status: "approved", operation_type: "regular_payment", transaction_amount: 500, date_approved: "2026-07-01T10:00:00.000-03:00" },
    { id: 2, status: "pending", operation_type: "regular_payment", transaction_amount: 800, date_created: "2026-07-01T11:00:00.000-03:00" },
  ],
});

/** Última página (offset + limit alcanza el total). */
const BUSQUEDA_ULTIMA = JSON.stringify({
  paging: { total: 2, limit: 50, offset: 0 },
  results: [{ id: 9, status: "approved", operation_type: "regular_payment", transaction_amount: 100 }],
});

/** Error de MP (pago no encontrado). */
const ERROR_404 = JSON.stringify({
  message: "Payment not found",
  error: "not_found",
  status: 404,
  cause: [{ code: 2000, description: "no encontrado" }],
});

// ── Mapeos puros ──────────────────────────────────────────────────────────────

test("mapearEstado cubre los estados de MP y cae en pending lo desconocido", () => {
  assert.equal(mapearEstado("approved"), "approved");
  assert.equal(mapearEstado("pending"), "pending");
  assert.equal(mapearEstado("in_process"), "in_process");
  assert.equal(mapearEstado("authorized"), "in_process");
  assert.equal(mapearEstado("in_mediation"), "in_process");
  assert.equal(mapearEstado("rejected"), "rejected");
  assert.equal(mapearEstado("cancelled"), "cancelled");
  assert.equal(mapearEstado("refunded"), "refunded");
  assert.equal(mapearEstado("charged_back"), "refunded");
  assert.equal(mapearEstado("algo_raro"), "pending");
  assert.equal(mapearEstado(undefined), "pending");
});

test("mapearOperacion: cobros → pago, transferencias → transferencia, resto → otro", () => {
  assert.equal(mapearOperacion("regular_payment"), "pago");
  assert.equal(mapearOperacion("pos_payment"), "pago");
  assert.equal(mapearOperacion("recurring_payment"), "pago");
  assert.equal(mapearOperacion("money_transfer"), "transferencia");
  assert.equal(mapearOperacion("account_fund"), "transferencia");
  assert.equal(mapearOperacion("cellphone_recharge"), "otro");
  assert.equal(mapearOperacion(undefined), "otro");
});

test("fechaArca convierte ISO a AAAAMMDD y tolera vacío/roto", () => {
  assert.equal(fechaArca("2026-07-01T10:00:05.000-03:00"), "20260701");
  assert.equal(fechaArca(undefined), undefined);
  assert.equal(fechaArca(null), undefined);
  assert.equal(fechaArca("no-es-fecha"), undefined);
});

test("sumarComisiones suma fee_details y redondea; undefined si no hay", () => {
  assert.equal(sumarComisiones([{ amount: 75.5 }, { amount: 4.5 }]), 80);
  assert.equal(sumarComisiones([]), undefined);
  assert.equal(sumarComisiones(undefined), undefined);
  assert.equal(sumarComisiones(null), undefined);
});

test("nombreContraparte prioriza nombre completo, luego email", () => {
  assert.equal(nombreContraparte({ first_name: "Ana", last_name: "López" }), "Ana López");
  assert.equal(nombreContraparte({ email: "ana@x.com" }), "ana@x.com");
  assert.equal(nombreContraparte(null), undefined);
  assert.equal(nombreContraparte({}), undefined);
});

test("normalizarPago mapea todos los campos que importan", () => {
  const p = normalizarPago(JSON.parse(PAGO_APROBADO));
  assert.equal(p.id, "123456789");
  assert.equal(p.estado, "approved");
  assert.equal(p.monto, 1500);
  assert.equal(p.externalReference, "appt-42");
  assert.equal(p.fechaAcreditacion, "20260701");
  assert.equal(p.comision, 80);
  assert.equal(p.descripcion, "Corte y color");
  assert.equal(p.operacion, "pago");
  assert.equal(p.contraparteId, "987654321");
  assert.equal(p.contraparteNombre, "Juan Pérez");
});

test("normalizarPago: transferencia entre cuentas propias → operacion transferencia", () => {
  const p = normalizarPago(JSON.parse(PAGO_TRANSFERENCIA));
  assert.equal(p.id, "tr-1");
  assert.equal(p.operacion, "transferencia");
  assert.equal(p.contraparteId, "111111");
  assert.equal(p.externalReference, ""); // sin external_reference → vacío
});

test("normalizarPago exige id", () => {
  assert.throws(() => normalizarPago({ status: "approved" }), /sin id/);
});

// ── Armado de URLs ────────────────────────────────────────────────────────────

test("construirUrlPago arma la ruta del pago y escapa el id", () => {
  assert.equal(construirUrlPago(MP_API_BASE, "123"), `${MP_API_BASE}/v1/payments/123`);
  assert.equal(construirUrlPago(MP_API_BASE, "a/b"), `${MP_API_BASE}/v1/payments/a%2Fb`);
});

test("construirUrlBusqueda: sin fechas manda offset/limit; el cursor ES el offset", () => {
  const url = construirUrlBusqueda(MP_API_BASE, { limit: 25, cursor: "50" });
  assert.match(url, /\/v1\/payments\/search\?/);
  assert.match(url, /limit=25/);
  assert.match(url, /offset=50/);
  assert.doesNotMatch(url, /begin_date/);
});

test("construirUrlBusqueda: con desde/hasta arma range + begin_date/end_date del día", () => {
  const url = construirUrlBusqueda(MP_API_BASE, { desde: "20260701", hasta: "20260731" });
  assert.match(url, /range=date_created/);
  assert.match(url, /begin_date=2026-07-01T00%3A00%3A00.000Z/);
  assert.match(url, /end_date=2026-07-31T23%3A59%3A59.999Z/);
});

test("construirUrlBusqueda: un solo extremo usa el relativo de MP para el otro", () => {
  const url = construirUrlBusqueda(MP_API_BASE, { desde: "20260701" });
  assert.match(url, /begin_date=2026-07-01T00%3A00%3A00.000Z/);
  assert.match(url, /end_date=NOW/);
});

// ── Parseo de respuestas ──────────────────────────────────────────────────────

test("parsearPago normaliza el cuerpo de /v1/payments/{id}", () => {
  const p = parsearPago(PAGO_APROBADO);
  assert.equal(p.id, "123456789");
  assert.equal(p.monto, 1500);
});

test("parsearPagina calcula nextCursor mientras haya más (offset+limit<total)", () => {
  const criterio: CriterioBusqueda = { limit: 2 };
  const pagina = parsearPagina(BUSQUEDA_PAGINA, criterio);
  assert.equal(pagina.pagos.length, 2);
  assert.equal(pagina.pagos[0].id, "1");
  assert.equal(pagina.pagos[1].estado, "pending");
  assert.equal(pagina.nextCursor, "2"); // offset 0 + limit 2 < total 130
});

test("parsearPagina sin más resultados → nextCursor undefined", () => {
  const pagina = parsearPagina(BUSQUEDA_ULTIMA, {});
  assert.equal(pagina.pagos.length, 1);
  assert.equal(pagina.nextCursor, undefined); // offset 0 + limit 50 >= total 2
});

test("lanzarSiErrorHttp: 2xx no lanza; no-2xx lanza MercadoPagoApiError tipado", () => {
  const ok: RespuestaHttp = { status: 200, body: "{}" };
  assert.doesNotThrow(() => lanzarSiErrorHttp(ok));

  assert.throws(
    () => lanzarSiErrorHttp({ status: 404, body: ERROR_404 }),
    (e: unknown) =>
      e instanceof MercadoPagoApiError &&
      e.status === 404 &&
      e.codigo === "not_found" &&
      /Payment not found/.test(e.message),
  );
});

test("lanzarSiErrorHttp tolera cuerpo no-JSON", () => {
  assert.throws(
    () => lanzarSiErrorHttp({ status: 500, body: "<html>Bad Gateway</html>" }),
    (e: unknown) => e instanceof MercadoPagoApiError && e.status === 500,
  );
});

// ── Seam del access token ─────────────────────────────────────────────────────

test("tokenNoConfigurado exige credencial (acción humana)", async () => {
  await assert.rejects(() => tokenNoConfigurado(), /credencial requerida/);
});

test("tokenFijo devuelve el token de la config y falla si está vacío", async () => {
  const config: MercadoPagoConfig = { accessToken: "APP_USR-abc" };
  assert.equal(await tokenFijo(config)(), "APP_USR-abc");
  await assert.rejects(() => tokenFijo({ accessToken: "" })(), /sin accessToken/);
});

test("tokenDesdeCredenciales pide el token vigente al CredencialesPort del tenant", async () => {
  const cred: CredencialesPort = {
    credencialesDe: async (tid) => ({ accessToken: `tok-${tid}` }),
  };
  assert.equal(await tokenDesdeCredenciales(cred, "t-1")(), "tok-t-1");
});

// ── Cliente (con transporte mockeado, SIN red) ───────────────────────────────

/** Transporte fake que responde según la URL pedida y registra las llamadas. */
class FakeTransport implements HttpTransport {
  llamadas: Array<{ url: string; headers: Record<string, string> }> = [];
  constructor(private readonly responder: (url: string) => RespuestaHttp) {}
  async get(url: string, headers: Record<string, string>): Promise<RespuestaHttp> {
    this.llamadas.push({ url, headers });
    return this.responder(url);
  }
}

test("HttpMercadoPagoClient.getPayment normaliza y manda el Bearer", async () => {
  const transport = new FakeTransport(() => ({ status: 200, body: PAGO_APROBADO }));
  const client = new HttpMercadoPagoClient(async () => "TOKEN-XYZ", { transport });
  const pago = await client.getPayment("123456789");
  assert.equal(pago.id, "123456789");
  assert.equal(pago.estado, "approved");
  assert.equal(transport.llamadas.length, 1);
  assert.equal(transport.llamadas[0].url, `${MP_API_BASE}/v1/payments/123456789`);
  assert.equal(transport.llamadas[0].headers.Authorization, "Bearer TOKEN-XYZ");
});

test("HttpMercadoPagoClient.getPayment traduce un 404 a MercadoPagoApiError", async () => {
  const transport = new FakeTransport(() => ({ status: 404, body: ERROR_404 }));
  const client = new HttpMercadoPagoClient(tokenFijo({ accessToken: "t" }), { transport });
  await assert.rejects(
    () => client.getPayment("nope"),
    (e: unknown) => e instanceof MercadoPagoApiError && e.status === 404,
  );
});

test("HttpMercadoPagoClient.listPayments pagina: pasa el offset del cursor", async () => {
  const transport = new FakeTransport(() => ({ status: 200, body: BUSQUEDA_PAGINA }));
  const client = new HttpMercadoPagoClient(async () => "t", { transport, baseUrl: MP_API_BASE });
  const pagina = await client.listPayments({ limit: 2, cursor: "0" });
  assert.equal(pagina.pagos.length, 2);
  assert.equal(pagina.nextCursor, "2");
  assert.match(transport.llamadas[0].url, /offset=0/);
  assert.match(transport.llamadas[0].url, /limit=2/);
});

test("HttpMercadoPagoClient con token por defecto exige credencial", async () => {
  const transport = new FakeTransport(() => ({ status: 200, body: PAGO_APROBADO }));
  const client = new HttpMercadoPagoClient(undefined, { transport });
  await assert.rejects(() => client.getPayment("1"), /credencial requerida/);
  assert.equal(transport.llamadas.length, 0); // ni siquiera llega al transporte
});

// Sanity: el transporte real existe y es un HttpTransport (no se ejercita la red).
test("FetchHttpTransport es un HttpTransport", () => {
  const t: HttpTransport = new FetchHttpTransport();
  assert.equal(typeof t.get, "function");
});
