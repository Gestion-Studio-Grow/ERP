// D13 (opción a) — cada cobro de un proyecto guarda qué cuota pagó y queda fijado al tipo de cambio del momento.
//
// Contra una base migrada (incluye 20261114120000_proyecto_pago_cuota) y con las Server Actions REALES:
//   · las tres columnas existen y son nulas (los cobros viejos no se tocan);
//   · marcarCuota de una cuota en dólares guarda la cuota, los dólares y el cambio del momento;
//   · cambiar el tipo de cambio después no cambia lo ya cobrado;
//   · un cobro a mano en un proyecto en dólares queda fijado al cambio de ese día, sin cuota;
//   · borrar la cuota no borra ni bloquea el cobro (sin clave foránea: el id queda como rastro);
//   · el negocio B no marca la cuota de A ni ve sus cobros.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("D13: el cobro guarda su cuota y el tipo de cambio del momento, aislado por negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const { marcarCuota } = await import("./acciones-ficha");
  const { registrarCobro } = await import("./acciones");

  // Las tres columnas existen y son nulas.
  const columnas = await duenio.$queryRaw<{ column_name: string; is_nullable: string; data_type: string }[]>`
    SELECT column_name, is_nullable, data_type FROM information_schema.columns
    WHERE table_name = 'ProyectoPago' AND column_name IN ('cuotaId', 'montoMoneda', 'tipoCambio') ORDER BY column_name`;
  assert.deepEqual(
    columnas.map((c) => [c.column_name, c.is_nullable, c.data_type]),
    [
      ["cuotaId", "YES", "text"],
      ["montoMoneda", "YES", "double precision"],
      ["tipoCambio", "YES", "double precision"],
    ],
  );

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const enA = { negocio: a, usuario: { id: a.duenia.id } };
  const enB = { negocio: b, usuario: { id: b.duenia.id } };
  const proyecto = (numero: number, moneda: string) =>
    duenio.proyecto.create({ data: { tenantId: a.id, numero, clientId: a.clientes[0], nombre: `Evento ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", moneda }, select: { id: true } });
  const pUsd = await proyecto(1, "USD");
  await duenio.proyectoTipoCambio.create({ data: { tenantId: a.id, moneda: "USD", porUnidad: 1200 } });

  // Un cobro "viejo" (antes de la migración no había columnas): queda con las tres en NULL.
  const viejo = await duenio.proyectoPago.create({ data: { tenantId: a.id, proyectoId: pUsd.id, medio: "EFECTIVO", monto: 1000 } });
  assert.deepEqual([viejo.cuotaId, viejo.montoMoneda, viejo.tipoCambio], [null, null, null]);

  const cuota = await duenio.proyectoCuota.create({
    data: { tenantId: a.id, proyectoId: pUsd.id, tipo: "COBRO", concepto: "Seña 50 %", monto: 500, moneda: "USD", venceEl: new Date("2026-11-20T12:00:00Z") },
    select: { id: true },
  });
  const marcar = async (pedido: typeof enA, id: string) => {
    const r = await ejecutarAccion(pedido, () => marcarCuota(form({ id, medio: "TRANSFERENCIA" })));
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: Awaited<ReturnType<typeof marcarCuota>> }).valor;
  };

  // El negocio B no marca la cuota de A.
  assert.equal((await marcar(enB, cuota.id)).ok, false);
  assert.equal(await duenio.proyectoPago.count({ where: { cuotaId: cuota.id } }), 0, "B no cobró nada de A");

  // A la marca: 500 USD a 1200 = 600.000 pesos a la caja, fijado a 1200.
  assert.equal((await marcar(enA, cuota.id)).ok, true);
  const cobro = await duenio.proyectoPago.findFirstOrThrow({ where: { tenantId: a.id, cuotaId: cuota.id } });
  assert.deepEqual([cobro.monto, cobro.cuotaId, cobro.montoMoneda, cobro.tipoCambio], [600000, cuota.id, 500, 1200]);
  assert.equal(await duenio.cashMovement.count({ where: { proyectoPagoId: cobro.id, amount: 600000 } }), 1, "el asiento sigue en pesos");

  // Sube el dólar: lo ya cobrado no cambia.
  await duenio.proyectoTipoCambio.update({ where: { tenantId_moneda: { tenantId: a.id, moneda: "USD" } }, data: { porUnidad: 1500 } });
  const despues = await duenio.proyectoPago.findUniqueOrThrow({ where: { id: cobro.id } });
  assert.deepEqual([despues.monto, despues.montoMoneda, despues.tipoCambio], [600000, 500, 1200]);

  // Cobro a mano en el proyecto en dólares: 300.000 pesos al cambio de hoy (1500) = 200 USD, sin cuota.
  const r = await ejecutarAccion(enA, () => registrarCobro(form({ proyectoId: pUsd.id, medio: "EFECTIVO", monto: "300000" })));
  assert.notEqual(r.tipo, "error");
  const aMano = await duenio.proyectoPago.findFirstOrThrow({ where: { tenantId: a.id, proyectoId: pUsd.id, monto: 300000 } });
  assert.deepEqual([aMano.cuotaId, aMano.montoMoneda, aMano.tipoCambio], [null, 200, 1500]);

  // Cobro a mano en un proyecto en pesos: cambio 1.
  const pArs = await proyecto(2, "ARS");
  await ejecutarAccion(enA, () => registrarCobro(form({ proyectoId: pArs.id, medio: "EFECTIVO", monto: "45000" })));
  const enPesos = await duenio.proyectoPago.findFirstOrThrow({ where: { tenantId: a.id, proyectoId: pArs.id } });
  assert.deepEqual([enPesos.cuotaId, enPesos.montoMoneda, enPesos.tipoCambio], [null, 45000, 1]);

  // Borrar la cuota no se traba ni se lleva el cobro: el id queda como rastro.
  await duenio.proyectoCuota.delete({ where: { id: cuota.id } });
  const rastro = await duenio.proyectoPago.findUniqueOrThrow({ where: { id: cobro.id } });
  assert.deepEqual([rastro.cuotaId, rastro.montoMoneda, rastro.tipoCambio], [cuota.id, 500, 1200]);

  // B no ve cobros de A ni tiene cobros propios por esto.
  assert.equal(await duenio.proyectoPago.count({ where: { tenantId: b.id } }), 0);
});
