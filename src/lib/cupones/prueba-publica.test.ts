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
};

function probar(freno: ReturnType<typeof crearFrenoDeCupones>, codigo: string, ip = "181.1.1.1", tenantId = "t_magra") {
  const lecturas = { n: 0 };
  const p = probarCuponPublico({
    freno,
    tenantId,
    ip,
    ahora: AHORA,
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
  assert.equal(cuponUsable(null, AHORA), false);
  assert.equal(cuponUsable(CUPONES.VERANO10, AHORA), true);
  assert.equal(cuponUsable(CUPONES.APAGADO, AHORA), false);
  assert.equal(cuponUsable(CUPONES.VENCIDO, AHORA), false);
  assert.equal(cuponUsable(CUPONES.AGOTADO, AHORA), false);
  assert.equal(cuponUsable({ ...base, value: 0 }, AHORA), false);
  // Vence HOY más tarde: todavía sirve.
  assert.equal(cuponUsable({ ...base, expiresAt: new Date("2026-09-24T23:00:00.000Z") }, AHORA), true);
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
