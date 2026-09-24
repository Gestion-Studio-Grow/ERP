// ============================================================================
// CUPONES PÚBLICOS — respuesta única y freno para todo intento fallido, EJECUTADOS.
// ============================================================================
//
// Lo que pasaba: la tienda contestaba "El cupón X venció el…" a un código que existe (y eso no
// sumaba al freno), y la reserva de CH no tenía freno. Acá se ejecuta la decisión real
// (`probarCuponPublico`, `rechazoPublicoDelCupon`) con una lectura falsa que cuenta cuántas
// veces se fue a la base.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crearFrenoDeCupones,
  cuponUsable,
  probarCuponPublico,
  rechazoPublicoDelCupon,
  CUPON_FRENADO,
  REGLA_CUPONES_FALLIDOS,
} from "./prueba-publica";
import { CuponRechazado, tomarPedidoOnlineGuarded } from "@/lib/order-core";
import { CUPON_NO_VALE } from "@/lib/venta-reglas";

const AHORA = new Date("2026-09-24T15:00:00.000Z");

const base = { code: "VERANO10", type: "PERCENT", value: 10, active: true, expiresAt: null as Date | null, maxUses: null as number | null, usedCount: 0 };
const CUPONES: Record<string, typeof base> = {
  VERANO10: base,
  VENCIDO: { ...base, code: "VENCIDO", expiresAt: new Date("2026-09-01T00:00:00.000Z") },
  APAGADO: { ...base, code: "APAGADO", active: false },
  AGOTADO: { ...base, code: "AGOTADO", maxUses: 1, usedCount: 1 },
  ENCERO: { ...base, code: "ENCERO", value: 0 },
};

function probar(
  freno: ReturnType<typeof crearFrenoDeCupones>,
  codigo: string,
  ip = "181.1.1.1",
  tenantId = "t_magra",
  exigeDescuento = true,
) {
  const lecturas = { n: 0 };
  const p = probarCuponPublico({
    freno,
    tenantId,
    ip,
    ahora: AHORA,
    exigeDescuento,
    leer: async () => {
      lecturas.n++;
      return CUPONES[codigo] ?? null;
    },
  });
  return p.then((r) => ({ r, lecturas: lecturas.n }));
}

test("inexistente, apagado, vencido y agotado contestan LO MISMO hacia afuera", async () => {
  const freno = crearFrenoDeCupones(() => 0);
  const respuestas = await Promise.all(["NOEXISTE", "APAGADO", "VENCIDO", "AGOTADO"].map((c) => probar(freno, c)));
  for (const { r } of respuestas) assert.deepEqual(r, { ok: false, motivo: "no-vale" });
  const bueno = await probar(freno, "VERANO10");
  assert.equal(bueno.r.ok, true);
});

test("TODO intento fallido suma al freno (no sólo los inexistentes), y frenado no se lee la base", async () => {
  let reloj = 0;
  const freno = crearFrenoDeCupones(() => reloj);
  // Antes, los que existen (vencido, agotado) no sumaban: se podían probar sin límite.
  for (let i = 0; i < 9; i++) await probar(freno, ["VENCIDO", "AGOTADO", "APAGADO"][i % 3]);
  assert.equal(freno.frenado("t_magra", "181.1.1.1"), false, "9 fallidos todavía contesta");
  await probar(freno, "NOEXISTE");
  assert.equal(freno.frenado("t_magra", "181.1.1.1"), true);

  // Frenado: ni el código bueno contesta, y no se va a la base.
  const frenado = await probar(freno, "VERANO10");
  assert.deepEqual(frenado.r, { ok: false, motivo: "frenado" });
  assert.equal(frenado.lecturas, 0);

  // Otra IP y otro negocio siguen libres.
  assert.equal((await probar(freno, "VERANO10", "181.2.2.2")).r.ok, true);
  assert.equal((await probar(freno, "VERANO10", "181.1.1.1", "t_shine")).r.ok, true);

  // Un acierto no suma.
  const otro = crearFrenoDeCupones(() => 0);
  for (let i = 0; i < 20; i++) await probar(otro, "VERANO10");
  assert.equal(otro.frenado("t_magra", "181.1.1.1"), false);

  reloj += REGLA_CUPONES_FALLIDOS.windowMs;
  assert.equal(freno.frenado("t_magra", "181.1.1.1"), false, "pasada la ventana, se libera");
  assert.match(CUPON_FRENADO, /Esperá unos minutos/);
});

test("sin IP (un proxy que no la manda) se agrupa bajo una misma clave: también se frena", async () => {
  const freno = crearFrenoDeCupones(() => 0);
  for (let i = 0; i < REGLA_CUPONES_FALLIDOS.max; i++) freno.fallido("t_magra", undefined);
  assert.equal(freno.frenado("t_magra", null), true);
});

test("cuponUsable: la misma lista de rechazos que el alta", () => {
  for (const exigeDescuento of [true, false]) {
    const o = { exigeDescuento };
    assert.equal(cuponUsable(null, AHORA, o), false);
    assert.equal(cuponUsable(CUPONES.VERANO10, AHORA, o), true);
    assert.equal(cuponUsable(CUPONES.APAGADO, AHORA, o), false);
    assert.equal(cuponUsable(CUPONES.VENCIDO, AHORA, o), false);
    assert.equal(cuponUsable(CUPONES.AGOTADO, AHORA, o), false);
    // Vence HOY más tarde: todavía sirve.
    assert.equal(cuponUsable({ ...base, expiresAt: new Date("2026-09-24T23:00:00.000Z") }, AHORA, o), true);
  }
  // El "descuento cargado" es regla de los pedidos (aplicarCupon), no de la reserva.
  assert.equal(cuponUsable(CUPONES.ENCERO, AHORA, { exigeDescuento: true }), false);
  assert.equal(cuponUsable(CUPONES.ENCERO, AHORA, { exigeDescuento: false }), true);
});

test("la reserva de CH (exigeDescuento: false) sigue aceptando un cupón en 0, como antes; la tienda no", async () => {
  const freno = crearFrenoDeCupones(() => 0);
  const reserva = await probar(freno, "ENCERO", "181.1.1.1", "t_ch", false);
  assert.equal(reserva.r.ok, true, "antes de la tanda 2a checkCoupon lo aceptaba y bookAppointment lo aplica");
  const tienda = await probar(freno, "ENCERO", "181.1.1.1", "t_magra", true);
  assert.deepEqual(tienda.r, { ok: false, motivo: "no-vale" });
  // Y en la reserva lo demás sigue igual: vencido y agotado no valen.
  for (const c of ["VENCIDO", "AGOTADO", "APAGADO", "NOEXISTE"]) {
    assert.deepEqual((await probar(freno, c, "181.1.1.1", "t_ch", false)).r, { ok: false, motivo: "no-vale" }, c);
  }
});

test("el freno cuenta por (negocio, IP): el wifi del salón frena al salón en ESE negocio, no a otro negocio ni a otra IP", async () => {
  const freno = crearFrenoDeCupones(() => 0);
  const SALON = "190.10.10.10";
  for (let i = 0; i < REGLA_CUPONES_FALLIDOS.max; i++) await probar(freno, "NOEXISTE", SALON, "t_ch", false);
  // El límite aceptado: dentro de CH, todas las clientas del wifi del salón quedan frenadas.
  assert.deepEqual((await probar(freno, "VERANO10", SALON, "t_ch", false)).r, { ok: false, motivo: "frenado" });
  // Pero la clave es (negocio, IP): la misma IP contra otro negocio sigue libre, y otra IP en CH también.
  assert.equal((await probar(freno, "VERANO10", SALON, "t_magra")).r.ok, true);
  assert.equal((await probar(freno, "VERANO10", "181.9.9.9", "t_ch", false)).r.ok, true);
  assert.equal(freno.frenado("t_ch", SALON), true);
  assert.equal(freno.frenado("t_magra", SALON), false);
});

test("el alta de la tienda: el rechazo del cupón sale con el texto único y suma; el reintentable, tal cual", async () => {
  const freno = crearFrenoDeCupones(() => 0);
  // El camino real del alta: el `CuponRechazado` que tira la transacción, por `tomarPedidoOnlineGuarded`.
  const tomar = (err: CuponRechazado) =>
    tomarPedidoOnlineGuarded({
      idempotencyKey: null,
      buscarPorClave: async () => null,
      revisarBolsa: async () => ({}),
      insertar: async () => {
        throw err;
      },
    });
  const vencido = await tomar(new CuponRechazado("El cupón VENCIDO venció el 01/09/2026."));
  assert.equal(vencido.tipo, "cupon");
  if (vencido.tipo !== "cupon") return;
  assert.equal(rechazoPublicoDelCupon(vencido, freno, "t_magra", "1.1.1.1", CUPON_NO_VALE), CUPON_NO_VALE);

  const carrera = await tomar(new CuponRechazado("Ese cupón se está usando en otra compra en este mismo momento: probá de nuevo.", { reintentable: true }));
  if (carrera.tipo !== "cupon") return assert.fail("tenía que ser un rechazo de cupón");
  assert.match(rechazoPublicoDelCupon(carrera, freno, "t_magra", "1.1.1.1", CUPON_NO_VALE), /probá de nuevo/);

  // Sólo el primero sumó: 9 más y se frena.
  for (let i = 0; i < 8; i++) rechazoPublicoDelCupon(vencido, freno, "t_magra", "1.1.1.1", CUPON_NO_VALE);
  assert.equal(freno.frenado("t_magra", "1.1.1.1"), false);
  rechazoPublicoDelCupon(vencido, freno, "t_magra", "1.1.1.1", CUPON_NO_VALE);
  assert.equal(freno.frenado("t_magra", "1.1.1.1"), true);
});
