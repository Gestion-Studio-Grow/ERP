// «Cerrar el día» en tres pasos (CH-038) y la tarjeta con y sin la migración M1 (CH-031/032).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cashMethodFromPaymentMethod } from "@/lib/caja/cierre-diario";
import {
  TEXTO_TARJETA_COMO_MP,
  enumTieneTarjeta,
  estadoDelDia,
  hrefDelPaso,
  leerPaso,
  mediosAContar,
  mensajeDelCierre,
  modoTarjeta,
  pasoDelCierre,
  waDelCierre,
} from "./cerrar-el-dia-core";

test("el paso: abierto arranca por lo pendiente; cerrado siempre en «Listo»; futuro/absorbido sin pasos", () => {
  assert.equal(pasoDelCierre({ pedido: null, estado: "abierto", pendientes: 2 }), 1);
  assert.equal(pasoDelCierre({ pedido: null, estado: "abierto", pendientes: 0 }), 2);
  assert.equal(pasoDelCierre({ pedido: 2, estado: "abierto", pendientes: 2 }), 2, "se puede contar con turnos sin cerrar");
  assert.equal(pasoDelCierre({ pedido: 1, estado: "abierto", pendientes: 0 }), 1);
  assert.equal(pasoDelCierre({ pedido: 3, estado: "abierto", pendientes: 0 }), 2, "a «Listo» no se llega sin cerrar");
  assert.equal(pasoDelCierre({ pedido: 1, estado: "cerrado", pendientes: 3 }), 3, "un día cerrado no se vuelve a contar");
  assert.equal(pasoDelCierre({ pedido: 2, estado: "futuro", pendientes: 0 }), null);
  assert.equal(pasoDelCierre({ pedido: null, estado: "absorbido", pendientes: 0 }), null);
  assert.equal(leerPaso("2"), 2);
  assert.equal(leerPaso(["3"]), 3);
  assert.equal(leerPaso("4"), null);
  assert.equal(estadoDelDia({ yaCerrado: true, enElFuturo: false, tieneRegistro: true }), "cerrado");
  assert.equal(estadoDelDia({ yaCerrado: true, enElFuturo: false, tieneRegistro: false }), "absorbido");
  assert.equal(estadoDelDia({ yaCerrado: false, enElFuturo: true, tieneRegistro: false }), "futuro");
  assert.equal(estadoDelDia({ yaCerrado: false, enElFuturo: false, tieneRegistro: false }), "abierto");
  assert.equal(hrefDelPaso("2026-10-24", "2026-10-24", 2), "/admin/caja/cierre?paso=2");
  assert.equal(hrefDelPaso("2026-10-23", "2026-10-24", 1), "/admin/caja/cierre?dia=2026-10-23&paso=1");
});

test("CH-032 · sin M1 (o con M1 sin el código de 3-A): la tarjeta va como Mercado Pago, y se dice", () => {
  // El código de hoy: DEBITO/CREDITO no tienen columna (null).
  assert.equal(modoTarjeta({ mapea: cashMethodFromPaymentMethod, enumTieneTarjeta: true }), "como-mp");
  assert.equal(modoTarjeta({ mapea: cashMethodFromPaymentMethod, enumTieneTarjeta: false }), "como-mp");
  assert.match(TEXTO_TARJETA_COMO_MP, /hoy la tarjeta se registra como Mercado Pago/i);
});

test("CH-031 · con M1 aplicada y el código de 3-A: la tarjeta va en su columna", () => {
  const conM1 = (m: string) => (m === "DEBITO" || m === "CREDITO" ? "TARJETA" : cashMethodFromPaymentMethod(m));
  assert.equal(modoTarjeta({ mapea: conM1, enumTieneTarjeta: true }), "separada");
  assert.equal(modoTarjeta({ mapea: conM1, enumTieneTarjeta: false }), "como-mp", "el código listo pero la base sin migrar: sigue D6");
  assert.equal(enumTieneTarjeta(["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA", "DEBITO", "CREDITO"]), true);
  assert.equal(enumTieneTarjeta(["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA", "DEBITO"]), false);
});

test("los medios a contar dicen dónde está la tarjeta según el modo", () => {
  const cero = { opening: 0, ingresos: 0, egresos: 0, expected: 0 };
  const porMedio = { EFECTIVO: { ...cero, ingresos: 120000, expected: 120000 }, MP: { ...cero, ingresos: 64000, expected: 64000 }, TARJETA: cero };
  const comoMp = mediosAContar(porMedio, "como-mp");
  assert.deepEqual(comoMp.map((m) => m.medio), ["EFECTIVO", "MP", "TARJETA"]);
  assert.equal(comoMp[1].etiqueta, "Mercado Pago, transferencias y tarjeta");
  assert.equal(comoMp[2].seMovio, false);
  const separada = mediosAContar(porMedio, "separada");
  assert.equal(separada[1].etiqueta, "Mercado Pago y transferencias");
  assert.match(separada[2].ayuda, /posnet/);
  assert.equal(separada[0].esperado, 120000);
});

test("CH-038 · el WhatsApp del cierre: Efectivo con la diferencia, MP, Tarjeta y los turnos; sin «undefined»", () => {
  const medios = [
    { medio: "EFECTIVO" as const, esperado: 120000, declarado: 118000, diferencia: -2000 },
    { medio: "MP" as const, esperado: 64000, declarado: 64000, diferencia: 0 },
    { medio: "TARJETA" as const, esperado: 30000, declarado: null, diferencia: null },
  ];
  const m = mensajeDelCierre({ day: "2026-10-22", medios, turnos: 12, nota: "faltó cambio", quien: "Lu" });
  assert.equal(m, "Cierre jue 22: Efectivo $118.000 (−$2.000), MP/Transf. $64.000, Tarjeta $30.000 · 12 turnos. Qué pasó: faltó cambio. Cerró Lu.");
  assert.doesNotMatch(m, /undefined|null|NaN/);
  const wa = waDelCierre(m);
  assert.ok(wa?.startsWith("https://wa.me/?text="));
  assert.equal(decodeURIComponent(wa!.split("text=")[1]), m, "las tildes viajan bien");
  // Sin comprobante por medio no hay mensaje (no se inventa un número).
  assert.equal(mensajeDelCierre({ day: "2026-10-22", medios: null, turnos: 3, nota: null, quien: null }), "");
  assert.equal(waDelCierre(""), null);
  // Sin tarjeta y sin turnos: no se nombran.
  const corto = mensajeDelCierre({ day: "2026-10-22", medios: [medios[0], { medio: "TARJETA", esperado: 0, declarado: null, diferencia: null }], turnos: 0, nota: null, quien: null });
  assert.equal(corto, "Cierre jue 22: Efectivo $118.000 (−$2.000).");
});
