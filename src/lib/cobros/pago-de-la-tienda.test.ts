// Pagar un pedido de la tienda con Mercado Pago desde Gracias (Magra T6a): token, rechazos, reuso
// del link y cuándo se muestra el botón. Puro: sin base ni red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MENSAJE_SIN_PAGO,
  VIGENCIA_PAGO_TIENDA_MS,
  botonDePagoVisible,
  decidirPagoDeLaTienda,
  esNegocioDeComercio,
  pagoDeLaTiendaDisponible,
  leerPedidoYToken,
  linkParaReusar,
  tokenDelPedido,
  tokenDelPedidoValido,
  type PedidoParaPagar,
} from "./pago-de-la-tienda";
import {
  ACCION_LINK_DE_PAGO,
  simuladorDeAvisosEncendido,
  tieneMercadoPago,
  ultimosLinks,
} from "@/app/admin/(dashboard)/pedidos/link-de-pago";

const SECRETO = "secreto-de-prueba";
const AHORA = Date.UTC(2026, 10, 10, 15, 0, 0);

function pedido(p: Partial<PedidoParaPagar> = {}): PedidoParaPagar {
  return {
    id: "ord_1",
    code: 42,
    tenantId: "t_magra",
    channel: "ONLINE",
    status: "PENDING",
    paid: false,
    total: 15800.5,
    createdAt: new Date(AHORA - 60_000),
    ...p,
  };
}

// ── Token ────────────────────────────────────────────────────────────────────

test("token: el del pedido vale", () => {
  const t = tokenDelPedido(SECRETO, "t_magra", "ord_1");
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(tokenDelPedidoValido(SECRETO, "t_magra", "ord_1", t), true);
});

test("token: alterado en un carácter, no vale", () => {
  const t = tokenDelPedido(SECRETO, "t_magra", "ord_1");
  const otro = (t[0] === "A" ? "B" : "A") + t.slice(1);
  assert.equal(tokenDelPedidoValido(SECRETO, "t_magra", "ord_1", otro), false);
});

test("token: el de otro pedido, de otro negocio o con otro secreto no vale", () => {
  const t = tokenDelPedido(SECRETO, "t_magra", "ord_2");
  assert.equal(tokenDelPedidoValido(SECRETO, "t_magra", "ord_1", t), false);
  assert.equal(tokenDelPedidoValido(SECRETO, "t_otro", "ord_2", t), false);
  assert.equal(tokenDelPedidoValido("otro-secreto", "t_magra", "ord_2", t), false);
});

test("token: vacío, corto, largo o no texto no vale y no tira", () => {
  const t = tokenDelPedido(SECRETO, "t_magra", "ord_1");
  for (const malo of [undefined, null, 42, "", "abc", t + "A", t.slice(0, 42), "!".repeat(43)]) {
    assert.equal(tokenDelPedidoValido(SECRETO, "t_magra", "ord_1", malo), false, String(malo));
  }
});

test("leerPedidoYToken: número y token bien formados; si no, null", () => {
  const t = tokenDelPedido(SECRETO, "t_magra", "ord_1");
  assert.deepEqual(leerPedidoYToken("42", t), { code: 42, token: t });
  assert.equal(leerPedidoYToken("42", undefined), null);
  assert.equal(leerPedidoYToken("4a", t), null);
  assert.equal(leerPedidoYToken(undefined, t), null);
  assert.equal(leerPedidoYToken("42", "corto"), null);
});

// ── Rechazos ─────────────────────────────────────────────────────────────────

function decidir(p: Partial<PedidoParaPagar>, extra: { tokenValido?: boolean; tenantId?: string; ahoraMs?: number } = {}) {
  return decidirPagoDeLaTienda({
    pedido: pedido(p),
    tenantId: extra.tenantId ?? "t_magra",
    tokenValido: extra.tokenValido ?? true,
    ahoraMs: extra.ahoraMs ?? AHORA,
  });
}

test("pedido online, impago, reciente y con importe: se paga por el total de la base", () => {
  assert.deepEqual(decidir({}), { ok: true, monto: 15800.5 });
});

test("rechazos: cada motivo de la lista", () => {
  assert.deepEqual(decidir({}, { tokenValido: false }), { ok: false, motivo: "token" });
  assert.deepEqual(decidir({}, { tenantId: "t_otro" }), { ok: false, motivo: "otro-negocio" });
  assert.deepEqual(decidir({ channel: "COUNTER" }), { ok: false, motivo: "no-es-online" });
  assert.deepEqual(decidir({ paid: true }), { ok: false, motivo: "pagado" });
  assert.deepEqual(decidir({ status: "CANCELLED" }), { ok: false, motivo: "anulado" });
  assert.deepEqual(decidir({ createdAt: new Date(AHORA - VIGENCIA_PAGO_TIENDA_MS - 1) }), { ok: false, motivo: "vencido" });
  assert.deepEqual(decidir({ total: 0 }), { ok: false, motivo: "sin-importe" });
  assert.deepEqual(decidir({ total: -10 }), { ok: false, motivo: "sin-importe" });
  assert.deepEqual(decidir({ total: Number.NaN }), { ok: false, motivo: "sin-importe" });
});

test("a las 48 h justas todavía se paga; una fecha ilegible es vencido", () => {
  assert.equal(decidir({ createdAt: new Date(AHORA - VIGENCIA_PAGO_TIENDA_MS) }).ok, true);
  assert.deepEqual(decidir({ createdAt: new Date("no") }), { ok: false, motivo: "vencido" });
});

test("sin token válido no se dice nada del estado del pedido (ni pagado ni anulado)", () => {
  assert.deepEqual(decidir({ paid: true, status: "CANCELLED" }, { tokenValido: false }), { ok: false, motivo: "token" });
});

test("cada motivo tiene su texto para la clienta", () => {
  for (const m of ["token", "otro-negocio", "no-es-online", "pagado", "anulado", "vencido", "sin-importe", "sin-mp", "falla"] as const) {
    assert.ok(MENSAJE_SIN_PAGO[m].length > 10, m);
  }
});

// ── Reuso del link ───────────────────────────────────────────────────────────

test("reuso: el último link auditado por el mismo monto y modo se devuelve, no se crea otro", () => {
  const filas = [
    { entityId: "ord_1", createdAt: new Date(AHORA - 5000), changes: { url: "https://mp/viejo", monto: 15000, modo: "test" } },
    { entityId: "ord_1", createdAt: new Date(AHORA - 1000), changes: { url: "https://mp/nuevo", monto: 15800.5, modo: "test" } },
  ];
  const ultimo = ultimosLinks(filas).get("ord_1");
  assert.deepEqual(linkParaReusar(ultimo, 15800.5, "test"), { url: "https://mp/nuevo", monto: 15800.5, prueba: true });
  assert.equal(ACCION_LINK_DE_PAGO, "link-de-pago");
});

test("reuso: con otro monto (se ajustó al peso), otro modo o sin link, se arma uno nuevo", () => {
  const ultimo = { url: "https://mp/x", monto: 15000, prueba: true };
  assert.equal(linkParaReusar(ultimo, 15800.5, "test"), null);
  assert.equal(linkParaReusar(ultimo, 15000, "real"), null);
  assert.equal(linkParaReusar(undefined, 15000, "test"), null);
  assert.ok(linkParaReusar({ url: "https://mp/r", monto: 15000, prueba: false }, 15000, "real"));
});

// ── Botón ────────────────────────────────────────────────────────────────────

test("botón: un negocio sin Mercado Pago no lo muestra; con módulo y conexión, sí", () => {
  const pedidoYToken = { code: 42, token: tokenDelPedido(SECRETO, "t_magra", "ord_1") };
  const comercio = true;
  assert.equal(botonDePagoVisible({ modo: "real", simulador: false, moduloMercadoPago: false, comercio, pedidoYToken }), false);
  assert.equal(botonDePagoVisible({ modo: "stub", simulador: false, moduloMercadoPago: true, comercio, pedidoYToken }), false);
  assert.equal(botonDePagoVisible({ modo: "test", simulador: false, moduloMercadoPago: true, comercio, pedidoYToken: null }), false);
  assert.equal(botonDePagoVisible({ modo: "test", simulador: false, moduloMercadoPago: true, comercio, pedidoYToken }), true);
  assert.equal(botonDePagoVisible({ modo: "real", simulador: false, moduloMercadoPago: true, comercio, pedidoYToken }), true);
});

test("comercio: rubro de retail conocido o rubro contable «comercio»; servicios, sin blueprint o desconocido, no", () => {
  assert.equal(esNegocioDeComercio({ slug: "magra", blueprintId: "carniceria" }), true);
  assert.equal(esNegocioDeComercio({ slug: "shinevelas", blueprintId: "velas" }), true);
  // A Dos Manos es comercio por slug (contabilidad/config.ts), aunque su blueprint no lo diga.
  assert.equal(esNegocioDeComercio({ slug: "adosmanos", blueprintId: null }), true);
  assert.equal(esNegocioDeComercio({ slug: "beauty-spa", blueprintId: "servicios" }), false);
  assert.equal(esNegocioDeComercio({ slug: "un-negocio", blueprintId: null }), false);
  assert.equal(esNegocioDeComercio({ slug: "un-negocio", blueprintId: undefined }), false);
  assert.equal(esNegocioDeComercio({ slug: "un-negocio", blueprintId: "generico" }), false);
  assert.equal(esNegocioDeComercio({ slug: "un-negocio", blueprintId: "inventado" }), false);
});

// La demo de Magra tal como corre: MP_MODO sin setear (stub) y el simulador de avisos prendido.
const ENV_DEMO: Record<string, string | undefined> = { MP_SIMULAR_AVISOS: "1" };

test("A · demo Magra (carnicería, módulo mercadopago, stub + simulador, pedido y token válidos): el botón se muestra", () => {
  const magra = { slug: "magra", blueprintId: "carniceria", modules: ["tienda", "mercadopago"] };
  const token = tokenDelPedido(SECRETO, "t_magra", "ord_1");
  assert.equal(tokenDelPedidoValido(SECRETO, "t_magra", "ord_1", token), true);
  const visible = botonDePagoVisible({
    modo: "stub",
    simulador: simuladorDeAvisosEncendido(ENV_DEMO),
    moduloMercadoPago: tieneMercadoPago(magra.modules),
    comercio: esNegocioDeComercio(magra),
    pedidoYToken: leerPedidoYToken("42", token),
  });
  assert.equal(visible, true);
});

test("B · un negocio de servicios (beauty-spa) con mercadopago y todo prendido: ni botón ni action", () => {
  const spa = { slug: "beauty-spa", blueprintId: "servicios", modules: ["turnos", "mercadopago"] };
  const pedidoYToken = leerPedidoYToken("42", tokenDelPedido(SECRETO, "t_spa", "ord_9"));
  const base = { moduloMercadoPago: tieneMercadoPago(spa.modules), comercio: esNegocioDeComercio(spa) };
  for (const cond of [
    { modo: "real" as const, simulador: false },
    { modo: "test" as const, simulador: false },
    { modo: "stub" as const, simulador: simuladorDeAvisosEncendido(ENV_DEMO) },
  ]) {
    assert.equal(botonDePagoVisible({ ...base, ...cond, pedidoYToken }), false, `botón en ${cond.modo}`);
    assert.equal(pagoDeLaTiendaDisponible({ ...base, ...cond }), false, `action en ${cond.modo}`);
    // El mismo negocio, si fuera de comercio, sí: lo que lo apaga es el rubro.
    assert.equal(pagoDeLaTiendaDisponible({ ...base, ...cond, comercio: true }), true, `control en ${cond.modo}`);
  }
});

// ── Cableado ─────────────────────────────────────────────────────────────────

test("el alta online manda a Gracias con el token, y la action pública no confía en el monto del cliente", () => {
  const raiz = join(__dirname, "..", "..");
  const alta = readFileSync(join(raiz, "lib/order-actions.ts"), "utf8");
  assert.match(alta, /\/tienda\/gracias\?pedido=\$\{result\.code\}&t=\$\{tokenParaGracias\(tenantId, result\.id\)\}/);
  const action = readFileSync(join(raiz, "lib/cobros/pago-de-la-tienda-actions.ts"), "utf8");
  assert.doesNotMatch(action, /formData\.get\("(monto|total|importe)"\)/);
  assert.match(action, /where: \{ tenantId, code: leido\.code \}/);
});

test("el botón y la action usan la MISMA regla, comercio incluido (no queda un camino abierto sin botón)", () => {
  const raiz = join(__dirname, "..", "..");
  const action = readFileSync(join(raiz, "lib/cobros/pago-de-la-tienda-actions.ts"), "utf8");
  assert.match(action, /pagoDeLaTiendaDisponible\(\{[^}]*comercio: tenant \? esNegocioDeComercio\(tenant\) : false/);
  assert.match(action, /select: \{ name: true, slug: true, modules: true, blueprintId: true \}/);
  assert.doesNotMatch(action, /linkDePagoDisponible/);
  const server = readFileSync(join(raiz, "lib/cobros/pago-de-la-tienda.server.ts"), "utf8");
  assert.match(server, /select: \{ modules: true, slug: true, blueprintId: true \}/);
  assert.match(server, /comercio: tenant \? esNegocioDeComercio\(tenant\) : false/);
});

test("reuso: un link que vence (o ya venció) en Mercado Pago no se devuelve; uno fresco sí", () => {
  const ultimo = { url: "https://mp/x", monto: 15000, prueba: true };
  const vigenciaMs = 48 * 60 * 60 * 1000;
  const ahoraMs = Date.UTC(2026, 10, 10, 12);
  const hace = (h: number) => new Date(ahoraMs - h * 60 * 60 * 1000);
  assert.deepEqual(linkParaReusar(ultimo, 15000, "test", { creadoEl: hace(2), ahoraMs, vigenciaMs }), ultimo);
  assert.equal(linkParaReusar(ultimo, 15000, "test", { creadoEl: hace(47.5), ahoraMs, vigenciaMs }), null);
  assert.equal(linkParaReusar(ultimo, 15000, "test", { creadoEl: hace(72), ahoraMs, vigenciaMs }), null);
  assert.equal(linkParaReusar(ultimo, 15000, "test", { creadoEl: undefined, ahoraMs, vigenciaMs }), null);
});
