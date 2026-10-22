// Combos (reingeniería CH, Tanda 3 · 3-B): la matemática pura del turno con varias zonas y del combo
// del catálogo. Sin base. La parte con Postgres está en combos-postgres.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ZONAS,
  cobroPorServicio,
  duracionDelCombo,
  duracionPropiaDelTurno,
  esReservaDeVecina,
  etiquetaDelCombo,
  itemsDelTurno,
  leerServiciosDelCombo,
  nombresDelCombo,
  precioDeListaDelCombo,
  quienesHacenTodo,
  repartirAlCentavo,
  seniaDelCombo,
  validarComboDelCatalogo,
  type ServicioDelCombo,
} from "./combos";
import { agruparIngresos } from "@/lib/report-ingresos";
import { medioRechazado } from "./cobros";
import { validarCobroDividido } from "./cobro-dividido";
import { medioDeCobroRequerido, MENSAJE_TARJETA_SIN_ACTIVAR } from "@/lib/caja/medio-cobro";
import { validarPagosContraElTotal } from "@/lib/supermercado/pago-mixto-tx";

const z = (id: string, name: string, durationMin: number, price: number, extra: Partial<ServicioDelCombo> = {}): ServicioDelCombo => ({
  id,
  name,
  durationMin,
  price,
  residentPrice: null,
  depositAmount: null,
  ...extra,
});
// CH-033: bozo + axilas + piernas completas + cavado = 70′ y $32.000.
const CUATRO = [z("bozo", "Bozo", 10, 4000), z("axilas", "Axilas", 15, 6000), z("piernas", "Piernas completas", 30, 14000, { depositAmount: 5000 }), z("cavado", "Cavado c/tira", 15, 8000)];

test("CH-033 · el combo dura la suma de sus zonas, sin márgenes entre ellas (70′)", () => {
  assert.equal(duracionDelCombo(CUATRO), 70);
});

test("CH-033 · precio sumado, con la regla de la zona por servicio (ADR-013)", () => {
  assert.equal(precioDeListaDelCombo(CUATRO, false), 32000);
  const conVecina = [z("a", "A", 10, 4000, { residentPrice: 3000 }), z("b", "B", 10, 6000)];
  assert.equal(precioDeListaDelCombo(conVecina, true), 9000);
  assert.equal(precioDeListaDelCombo(conVecina, false), 10000);
  assert.equal(esReservaDeVecina(conVecina, true), true);
  assert.equal(esReservaDeVecina(conVecina, false), false);
});

test("CH-033 · UNA seña por turno: la mayor de las zonas, nunca la suma", () => {
  const dos = [z("a", "A", 10, 4000, { depositAmount: 2000 }), z("b", "B", 10, 6000, { depositAmount: 5000 })];
  assert.equal(seniaDelCombo(dos, 10000), 5000);
  assert.equal(seniaDelCombo(CUATRO, 32000), 5000);
  assert.equal(seniaDelCombo([z("a", "A", 10, 1000)], 1000), 0);
});

test("CH-033 · el renglón dice «4 zonas» y el WhatsApp las nombra", () => {
  assert.equal(etiquetaDelCombo(CUATRO.map((x) => x.name)), "4 zonas");
  assert.equal(etiquetaDelCombo(["Bozo"]), "Bozo");
  assert.equal(nombresDelCombo(CUATRO.map((x) => x.name)), "Bozo, axilas, piernas completas y cavado c/tira");
  assert.equal(nombresDelCombo(["Bozo", "IPL"]), "Bozo y IPL");
});

test("los ítems del turno suman EXACTO el precio del turno (también con cupón)", () => {
  const items = itemsDelTurno(CUATRO, false, 32000);
  assert.deepEqual(items.map((i) => [i.serviceId, i.order, i.durationMin, i.priceAtBooking]), [
    ["bozo", 0, 10, 4000],
    ["axilas", 1, 15, 6000],
    ["piernas", 2, 30, 14000],
    ["cavado", 3, 15, 8000],
  ]);
  // Con un cupón de $1.000: se reparte al centavo y la suma sigue siendo el precio del turno.
  const conCupon = itemsDelTurno(CUATRO, false, 31000);
  assert.equal(Math.round(conCupon.reduce((s, i) => s + i.priceAtBooking * 100, 0)), 3100000);
  // Un reparto con resto: 100 en tres partes iguales.
  assert.deepEqual(repartirAlCentavo(100, [1, 1, 1]), [33.34, 33.33, 33.33]);
  assert.deepEqual(repartirAlCentavo(10, [0, 0]), [5, 5]);
  assert.deepEqual(repartirAlCentavo(-10, [1, 1]), [-5, -5]);
});

test("reporte por servicio: un cobro de un combo se reparte entre sus zonas y suma igual", () => {
  const items = itemsDelTurno(CUATRO, false, 32000).map((i, k) => ({ servicio: CUATRO[k].name, priceAtBooking: i.priceAtBooking }));
  const partes = cobroPorServicio(32000, "Bozo", items);
  assert.deepEqual(partes, [
    { servicio: "Bozo", monto: 4000 },
    { servicio: "Axilas", monto: 6000 },
    { servicio: "Piernas completas", monto: 14000 },
    { servicio: "Cavado c/tira", monto: 8000 },
  ]);
  // Una seña de $5.000: proporcional, al centavo, suma $5.000.
  const senia = cobroPorServicio(5000, "Bozo", items);
  assert.equal(Math.round(senia.reduce((s, p) => s + p.monto * 100, 0)), 500000);
  // Sin ítems: todo al servicio del turno, como siempre.
  assert.deepEqual(cobroPorServicio(14000, "Piernas", null), [{ servicio: "Piernas", monto: 14000 }]);
  // Y en la agrupación del reporte: el total no cambia; «Por servicio» suma cada zona.
  const r = agruparIngresos(
    [
      { amount: 5000, cobradoEn: new Date("2026-10-24T13:00:00Z"), profesional: "Caro", servicio: "Bozo", porServicio: senia },
      { amount: 27000, cobradoEn: new Date("2026-10-24T14:00:00Z"), profesional: "Caro", servicio: "Bozo", porServicio: cobroPorServicio(27000, "Bozo", items) },
    ],
    (d) => d.toISOString().slice(0, 10),
  );
  assert.equal(r.totalIngresos, 32000);
  assert.equal(r.cantidadPagos, 2);
  const porServicio = Object.fromEntries(r.porServicio.map((f) => [f.label, Math.round(f.total)]));
  assert.deepEqual(porServicio, { Bozo: 4000, Axilas: 6000, "Piernas completas": 14000, "Cavado c/tira": 8000 });
  assert.equal(Math.round(r.porServicio.reduce((s, f) => s + f.total, 0)), 32000);
});

test("leer las zonas del formulario: sin repetidas, sin vacíos, con tope", () => {
  assert.deepEqual(leerServiciosDelCombo(["a", " b ", "a", "", 3, null]), { ok: true, ids: ["a", "b"] });
  const muchas = Array.from({ length: MAX_ZONAS + 1 }, (_, i) => `s${i}`);
  assert.equal(leerServiciosDelCombo(muchas).ok, false);
});

test("sólo las que hacen TODAS las zonas (ADR-055)", () => {
  assert.deepEqual(quienesHacenTodo([{ profesionales: ["caro", "lu"] }, { profesionales: ["caro"] }]), ["caro"]);
  assert.deepEqual(quienesHacenTodo([{ profesionales: ["lu"] }, { profesionales: ["caro"] }]), []);
});

test("mover un combo conserva su duración (no se achica a la del servicio principal)", () => {
  assert.equal(duracionPropiaDelTurno({ startsAt: new Date("2026-10-24T13:00:00Z"), endsAt: new Date("2026-10-24T14:10:00Z") }, 10), 70);
  assert.equal(duracionPropiaDelTurno({ startsAt: new Date("2026-10-24T13:00:00Z"), endsAt: new Date("2026-10-24T13:00:00Z") }, 30), 30);
});

test("CH-034 · validar el combo del catálogo: nombre, precio, quién hace todo; no toca componentes", () => {
  const componentes = [
    { id: "piernas", name: "Piernas completas", durationMin: 30, profesionales: ["caro", "lu"] },
    { id: "axilas", name: "Axilas", durationMin: 15, profesionales: ["caro", "lu"] },
    { id: "cavado", name: "Cavado c/tira", durationMin: 15, profesionales: ["caro"] },
  ];
  const base = { nombre: "Piernas + axilas + cavado", ids: ["piernas", "axilas", "cavado"], precio: 26000, duracion: NaN, senia: NaN, profesionales: ["caro"] };
  const ok = validarComboDelCatalogo(base, componentes, ["Piernas completas", "Axilas"]);
  assert.deepEqual(ok, {
    ok: true,
    combo: { nombre: "Piernas + axilas + cavado", precio: 26000, durationMin: 60, depositAmount: null, profesionales: ["caro"], descripcion: "Combo: Piernas completas + Axilas + Cavado c/tira" },
  });
  assert.match((validarComboDelCatalogo({ ...base, profesionales: ["lu"] }, componentes, []) as { error: string }).error, /no hace todas/);
  assert.match((validarComboDelCatalogo({ ...base, ids: ["piernas"] }, componentes, []) as { error: string }).error, /al menos dos/);
  assert.match((validarComboDelCatalogo({ ...base, precio: 0 }, componentes, []) as { error: string }).error, /precio/);
  assert.match((validarComboDelCatalogo({ ...base, senia: 30000 }, componentes, []) as { error: string }).error, /seña/);
  assert.match((validarComboDelCatalogo(base, componentes, ["piernas + AXILAS + cavado"]) as { error: string }).error, /Ya hay/);
  assert.match((validarComboDelCatalogo({ ...base, ids: ["piernas", "otro"] }, componentes, []) as { error: string }).error, /ya no está/);
  assert.equal((validarComboDelCatalogo({ ...base, duracion: 50 }, componentes, []) as { ok: true; combo: { durationMin: number } }).combo.durationMin, 50);
});

// ── Débito/Crédito forjados sin la migración M1 (CH-032): rechazo claro, en cada puerta ──────

const SIN_M1 = ["MERCADOPAGO", "EFECTIVO", "TRANSFERENCIA"];
const CON_M1 = [...SIN_M1, "DEBITO", "CREDITO"];

test("CH-032 · sin M1, un DEBITO forjado se rechaza diciendo qué hacer; con M1 pasa", () => {
  assert.match(medioRechazado("DEBITO", SIN_M1) ?? "", /Débito y Crédito todavía no están activados/);
  assert.match(medioRechazado("CREDITO", SIN_M1) ?? "", /Mercado Pago/);
  assert.equal(medioRechazado("DEBITO", CON_M1), null);
  assert.equal(medioRechazado("EFECTIVO", SIN_M1), null);
  assert.equal(medioRechazado("CHEQUE", CON_M1), "Elegí el medio de pago: efectivo, Mercado Pago, transferencia, débito o crédito.");
  assert.equal(medioRechazado("", SIN_M1, "Elegí por dónde llegó la seña"), "Elegí por dónde llegó la seña: efectivo, Mercado Pago o transferencia.");
});

test("CH-032 · el pago dividido rechaza DEBITO sin M1 y lo acepta con M1", () => {
  const lineas = [
    { metodo: "EFECTIVO", monto: 10000 },
    { metodo: "DEBITO", monto: 4000 },
  ];
  const sin = validarCobroDividido(lineas, 14000);
  assert.equal(sin.ok, false);
  assert.match((sin as { error: string }).error, /Débito y Crédito todavía no están activados/);
  assert.equal(validarCobroDividido(lineas, 14000, SIN_M1).ok, false);
  assert.deepEqual(validarCobroDividido(lineas, 14000, CON_M1), { ok: true, lineas, total: 14000 });
});

test("hueco de 3-A cerrado · el mostrador (venta y pago mixto) no graba una tarjeta forjada", () => {
  assert.deepEqual(medioDeCobroRequerido({ paid: true, paymentMethod: "DEBITO" }), { ok: false, error: MENSAJE_TARJETA_SIN_ACTIVAR });
  assert.deepEqual(medioDeCobroRequerido({ paid: true, paymentMethod: "CREDITO", contexto: "cobro" }), { ok: false, error: MENSAJE_TARJETA_SIN_ACTIVAR });
  assert.deepEqual(medioDeCobroRequerido({ paid: true, paymentMethod: "EFECTIVO" }), { ok: true, paymentMethod: "EFECTIVO" });
  // `cashMethodFromPaymentMethod` ya tiene columna para DEBITO (TARJETA): sin la guarda nueva pasaba.
  const forjado = [
    { medio: "EFECTIVO", monto: 1000 },
    { medio: "DEBITO", monto: 500 },
  ] as unknown as Parameters<typeof validarPagosContraElTotal>[0];
  assert.equal(validarPagosContraElTotal(forjado, 1500), MENSAJE_TARJETA_SIN_ACTIVAR);
  const sano = [
    { medio: "EFECTIVO", monto: 1000 },
    { medio: "MERCADOPAGO", monto: 500 },
  ] as Parameters<typeof validarPagosContraElTotal>[0];
  assert.equal(validarPagosContraElTotal(sano, 1500), null);
});
