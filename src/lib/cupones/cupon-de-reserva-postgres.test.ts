/**
 * El cupón de un turno, EJECUTADO contra Postgres con RLS (ENG-109, revisión vuelta 2):
 *
 *   · la vista previa de la web de turnos (`checkCoupon`, la Server Action real con el host del
 *     negocio) y la reserva (`cuponDeLaReserva`, lo que corre dentro de la transacción de
 *     `bookAppointment`) dan el mismo descuento;
 *   · un cupón válido que no llega a descontar nada NO se gasta: antes la reserva lo aplicaba en
 *     $0 y sumaba el uso, así un cupón de un solo uso quedaba gastado sin haber descontado nada;
 *   · el negocio A no puede usar ni gastar un cupón de B aunque sepa el código.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("contra Postgres (app_rls + RLS): la reserva de turno y su vista previa descuentan lo mismo, y un cupón que no descuenta nada no se gasta", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { tenantTransaction } = await import("@/lib/rls");
  const { cuponDeLaReserva } = await import("@/lib/cupones/cupon-de-reserva");
  const { checkCoupon } = await import("@/lib/coupon-actions");

  const a = laBase.a.id;
  const b = laBase.b.id;
  await operatorPrisma.coupon.createMany({
    data: [
      { tenantId: a, code: "CINCO", type: "PERCENT", value: 5, maxUses: 1 },
      { tenantId: a, code: "VEINTINUEVE", type: "PERCENT", value: 29 },
      { tenantId: a, code: "DIEZ", type: "PERCENT", value: 10 },
      { tenantId: a, code: "TODO", type: "PERCENT", value: 100 },
      { tenantId: a, code: "ENCERO", type: "PERCENT", value: 0 },
      { tenantId: b, code: "SOLOB", type: "PERCENT", value: 50 },
    ],
  });
  const usos = async (tenantId: string, code: string) =>
    (await operatorPrisma.coupon.findUniqueOrThrow({ where: { tenantId_code: { tenantId, code } } })).usedCount;
  const vistaPrevia = async (codigo: string, precio: number) => {
    const r = await ejecutarAccion({ negocio: laBase.a }, () => checkCoupon(codigo, precio));
    assert.equal(r.tipo, "respuesta");
    return r.tipo === "respuesta" ? r.valor : null;
  };
  const reserva = (codigo: string, precio: number) =>
    tenantTransaction((tx) => cuponDeLaReserva(tx, { tenantId: a, codigo, base: precio, ahora: new Date() }), { tenantId: a });

  // El mismo descuento en la vista previa y en la reserva, con el medio peso que ahora sube.
  for (const [codigo, precio, descuento] of [
    ["veintinueve", 750, 218],
    ["DIEZ", 12_345, 1235],
    ["DIEZ", 12_344, 1234],
    ["TODO", 4_500.4, 4_500.4],
  ] as const) {
    const vp = await vistaPrevia(codigo, precio);
    assert.ok(vp && vp.ok, `${codigo} sobre $${precio}: la vista previa lo rechazó`);
    assert.equal(vp.ok && vp.discount, descuento, `${codigo} sobre $${precio} (vista previa)`);
    assert.deepEqual(await reserva(` ${codigo} `, precio), { codigo: codigo.toUpperCase(), descuento }, `${codigo} sobre $${precio} (reserva)`);
  }
  assert.equal(await usos(a, "VEINTINUEVE"), 1);
  assert.equal(await usos(a, "DIEZ"), 2);

  // 5 % de $9 es $0,45: al peso, $0. La vista previa lo dice y la reserva no lo aplica NI lo gasta.
  assert.deepEqual(await vistaPrevia("CINCO", 9), { ok: false, reason: "El cupón CINCO no llega a descontar nada sobre $9,00." });
  assert.equal(await reserva("CINCO", 9), null);
  assert.equal(await usos(a, "CINCO"), 0, "un cupón que no descontó nada no puede quedar gastado");
  // Sobre un precio donde sí descuenta, el único uso se aplica y se gasta; el segundo ya no.
  assert.deepEqual(await reserva("CINCO", 100), { codigo: "CINCO", descuento: 5 });
  assert.equal(await usos(a, "CINCO"), 1);
  assert.equal(await reserva("CINCO", 100), null);
  assert.equal(await usos(a, "CINCO"), 1);

  // Un cupón cargado en 0: antes la vista previa lo daba por bueno con $0 y la reserva lo gastaba.
  assert.deepEqual(await vistaPrevia("ENCERO", 1000), { ok: false, reason: "El cupón ENCERO no tiene un descuento cargado." });
  assert.equal(await reserva("ENCERO", 1000), null);
  assert.equal(await usos(a, "ENCERO"), 0);

  // Aislamiento: A no ve, no aplica y no gasta el cupón de B, ni en la vista previa ni en la reserva.
  assert.deepEqual(await vistaPrevia("SOLOB", 1000), { ok: false, reason: "Cupón inválido." });
  assert.equal(await reserva("SOLOB", 1000), null);
  assert.equal(await usos(b, "SOLOB"), 0);
});
