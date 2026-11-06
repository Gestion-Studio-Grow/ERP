// Ficha completa del servicio — lo puro: seña en %, tiempo en la agenda, validaciones del
// formulario, la aclaración del recordatorio y los textos de WhatsApp que la llevan.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FICHA_VACIA,
  MAX_FOTO_SERVICIO,
  TOPE_NOTA,
  esFotoDeServicioValida,
  leerFicha,
  limpiarNota,
  lineaDeAclaracion,
  minutosEnAgenda,
  precioADefinir,
  seniaPorPorcentaje,
  textoDelPrecio,
} from "./ficha";
import { mensajeConfirmacion, mensajePedidoDeSenia } from "@/lib/turnos/mensajes-whatsapp";
import { textoRecordatorio } from "@/lib/turnos/turno-abierto";

const fd = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};
const base = { precio: 20000, depositAmount: null, durationMin: 60 };

// ── Seña en porcentaje ──────────────────────────────────────────────────────

test("seña %: round(precio × % / 100) al centavo", () => {
  assert.equal(seniaPorPorcentaje(20000, 30), 6000);
  assert.equal(seniaPorPorcentaje(12345.67, 15), 1851.85);
  assert.equal(seniaPorPorcentaje(999, 33), 329.67);
  assert.equal(seniaPorPorcentaje(20000, 100), 20000);
});

test("seña %: sin porcentaje, fuera de rango o sin precio → 0", () => {
  for (const p of [null, undefined, 0, -5, 101, Number.NaN]) assert.equal(seniaPorPorcentaje(20000, p), 0);
  assert.equal(seniaPorPorcentaje(0, 30), 0);
  assert.equal(seniaPorPorcentaje(Number.NaN, 30), 0);
});

// ── Tiempo en la agenda ─────────────────────────────────────────────────────

test("agenda: calendarMin manda si es ≥ duración; null o menor → la duración", () => {
  assert.equal(minutosEnAgenda(60, 90), 90);
  assert.equal(minutosEnAgenda(60, 60), 60);
  assert.equal(minutosEnAgenda(60, null), 60);
  assert.equal(minutosEnAgenda(60, undefined), 60);
  assert.equal(minutosEnAgenda(60, 45), 60);
  assert.equal(minutosEnAgenda(60, Number.NaN), 60);
});

// ── Precio a definir ────────────────────────────────────────────────────────

test("a definir: catálogo en 0 y turno sin precio; un cupón del 100 % no lo es", () => {
  assert.equal(precioADefinir(0), true);
  assert.equal(precioADefinir(0, null), true);
  assert.equal(precioADefinir(0, 0), true);
  assert.equal(precioADefinir(0, 15000), false); // ya se fijó en el cobro
  assert.equal(precioADefinir(20000, 0), false); // cupón del 100 %
  const pesos = (n: number) => `$${n}`;
  assert.equal(textoDelPrecio(0, pesos), "A definir");
  assert.equal(textoDelPrecio(20000, pesos), "$20000");
  assert.equal(textoDelPrecio(0, pesos, 15000), "$15000");
});

// ── Lectura del formulario ──────────────────────────────────────────────────

test("formulario: sin campos nuevos, la ficha vacía y el precio de siempre", () => {
  const r = leerFicha(fd({}), base);
  assert.ok(r.ok);
  assert.deepEqual(r.ficha, FICHA_VACIA);
  assert.equal(r.precio, 20000);
  assert.equal(r.depositAmount, null);
});

test("formulario: todo cargado", () => {
  const r = leerFicha(
    fd({ calendarMin: "90", depositKind: "porcentaje", depositPercent: "30", modality: "ONLINE", kind: "CUPOS", reminderNote: "  Vení   bañada  " }),
    base,
  );
  assert.ok(r.ok);
  assert.deepEqual(r.ficha, { priceToDefine: false, calendarMin: 90, depositPercent: 30, modality: "ONLINE", kind: "CUPOS", reminderNote: "Vení bañada" });
  // La seña en % también se guarda calculada en el monto fijo: lo leen agenda, cobro y pedido de seña.
  assert.equal(r.depositAmount, 6000);
});

test("formulario: precio a definir → precio 0, sin seña, aunque vengan cargados", () => {
  const r = leerFicha(fd({ priceToDefine: "on", depositKind: "porcentaje", depositPercent: "30" }), { ...base, precio: Number.NaN, depositAmount: 5000 });
  assert.ok(r.ok);
  assert.equal(r.precio, 0);
  assert.equal(r.depositAmount, null);
  assert.equal(r.ficha.priceToDefine, true);
  assert.equal(r.ficha.depositPercent, null);
});

test("formulario: sin precio y sin «a definir» se rechaza", () => {
  const r = leerFicha(fd({}), { ...base, precio: Number.NaN });
  assert.equal(r.ok, false);
});

test("formulario: el tiempo en la agenda no puede ser menor que la duración ni raro", () => {
  for (const v of ["30", "0", "-10", "12.5", "abc", "5000"]) {
    const r = leerFicha(fd({ calendarMin: v }), base);
    assert.equal(r.ok, false, `calendarMin=${v}`);
  }
  // Igual a la duración: se guarda como null (no cambia nada).
  const igual = leerFicha(fd({ calendarMin: "60" }), base);
  assert.ok(igual.ok);
  assert.equal(igual.ficha.calendarMin, null);
});

test("formulario: porcentaje fuera de 0-100, modalidad o tipo inventados se rechazan", () => {
  assert.equal(leerFicha(fd({ depositKind: "porcentaje", depositPercent: "101" }), base).ok, false);
  assert.equal(leerFicha(fd({ depositKind: "porcentaje", depositPercent: "-1" }), base).ok, false);
  assert.equal(leerFicha(fd({ modality: "MARTE" }), base).ok, false);
  assert.equal(leerFicha(fd({ kind: "OTRO" }), base).ok, false);
});

test("formulario: porcentaje vacío o 0 → sin seña", () => {
  for (const v of ["", "0"]) {
    const r = leerFicha(fd({ depositKind: "porcentaje", depositPercent: v }), { ...base, depositAmount: 5000 });
    assert.ok(r.ok);
    assert.equal(r.depositAmount, null, `pct=${v}`);
  }
});

test("formulario: la aclaración tiene tope de 280", () => {
  assert.equal(leerFicha(fd({ reminderNote: "x".repeat(TOPE_NOTA) }), base).ok, true);
  assert.equal(leerFicha(fd({ reminderNote: "x".repeat(TOPE_NOTA + 1) }), base).ok, false);
});

// ── Aclaración del recordatorio ─────────────────────────────────────────────

test("nota: se limpia y vacía es null", () => {
  assert.equal(limpiarNota("  hola\r\n\n\n  chau  "), "hola\n chau");
  assert.equal(limpiarNota("   "), null);
  assert.equal(limpiarNota(undefined), null);
  assert.equal(lineaDeAclaracion(null), "");
  assert.equal(lineaDeAclaracion("Vení bañada"), "\n\n📝 Vení bañada");
});

const turno = { clienta: "Laura Gómez", servicios: "Facial", inicio: "2026-11-10T16:00:00.000Z", profesional: "Caro" };

test("WhatsApp: la confirmación y el pedido de seña terminan con la aclaración", () => {
  const sin = mensajeConfirmacion({ ...turno, senia: null });
  const con = mensajeConfirmacion({ ...turno, senia: null, aclaracion: "Vení bañada" });
  assert.equal(con, `${sin}\n\n📝 Vení bañada`);
  const pedido = mensajePedidoDeSenia({ ...turno, monto: 5000, aclaracion: "Vení bañada" });
  assert.ok(pedido.endsWith("\n\n📝 Vení bañada"));
  assert.ok(!mensajePedidoDeSenia({ ...turno, monto: 5000 }).includes("📝"));
});

test("recordatorio: la plantilla y, aparte, la aclaración", () => {
  const datos = { clientName: "Laura", serviceName: "Facial", professionalName: "Caro", startsAt: "2026-11-10T16:00:00.000Z" };
  const sin = textoRecordatorio("Hola {{clientName}}, mañana {{serviceName}}", datos);
  assert.equal(sin, "Hola Laura, mañana Facial");
  assert.equal(textoRecordatorio("Hola {{clientName}}, mañana {{serviceName}}", { ...datos, aclaracion: "Vení bañada" }), "Hola Laura, mañana Facial\n\n📝 Vení bañada");
});

// ── Fotos ───────────────────────────────────────────────────────────────────

test("foto: sólo JPEG/WebP en data URL y bajo el tope", () => {
  assert.equal(esFotoDeServicioValida("data:image/jpeg;base64,/9j/4AAQ"), true);
  assert.equal(esFotoDeServicioValida("data:image/webp;base64,UklGR"), true);
  assert.equal(esFotoDeServicioValida("data:image/png;base64,iVBOR"), false);
  assert.equal(esFotoDeServicioValida("data:image/svg+xml;base64,PHN2Zz4="), false);
  assert.equal(esFotoDeServicioValida("https://x.com/a.jpg"), false);
  assert.equal(esFotoDeServicioValida("data:image/jpeg;base64,<script>"), false);
  assert.equal(esFotoDeServicioValida(`data:image/jpeg;base64,${"A".repeat(MAX_FOTO_SERVICIO)}`), false);
  assert.equal(esFotoDeServicioValida(42), false);
});
