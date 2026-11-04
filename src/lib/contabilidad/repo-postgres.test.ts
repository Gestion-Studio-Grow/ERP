// ============================================================================
// CONTABILIDAD OLA 1 CONTRA POSTGRES — base efímera con RLS (src/test/base-efimera.ts).
// ============================================================================
//
// Dos negocios, A y B, con la conexión de la app (`app_rls`, sin BYPASSRLS):
//   · cada uno siembra su plan; A no ve las cuentas de B ni puede imputarlas (ni por la app, ni
//     por la base: la FK es compuesta con `tenantId`);
//   · la base rechaza un asiento confirmado descuadrado, una línea con debe y haber, y la edición
//     de un asiento confirmado, aunque el código no los hubiera frenado (se prueba como dueño,
//     exento de RLS, para que sólo quede la regla de la base);
//   · confirmaciones simultáneas: números 1..n, sin repetidos ni saltos;
//   · contra-asiento y calendario fiscal idempotente.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import type { LineaAsiento } from "./asiento";

const laBase = baseEfimeraDelArchivo();
const L = (cuentaId: string, debe: number, haber: number): LineaAsiento => ({ cuentaId, debe: BigInt(debe), haber: BigInt(haber) });
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

let preparado: Promise<void> | null = null;
/** Una vez por archivo: planes sembrados y ejercicio 2026 abierto en A y B. */
async function preparar(base: BaseEfimera) {
  preparado ??= (async () => {
    apuntarLaAppA(base);
    const repo = await import("./repo");
    assert.equal((await repo.sembrarPlanModelo(base.a.id, "comercio")).ok, true);
    assert.equal((await repo.sembrarPlanModelo(base.b.id, "servicios")).ok, true);
    for (const t of [base.a.id, base.b.id]) {
      assert.equal((await repo.abrirEjercicio(t, { fechaInicio: dia("2026-01-01"), fechaCierre: dia("2026-12-31") })).ok, true);
    }
  })();
  await preparado;
  return import("./repo");
}

async function cuentasDe(base: BaseEfimera, tenantId: string) {
  const { tenantTransaction } = await import("@/lib/rls");
  return tenantTransaction((tx) => tx.cuentaContable.findMany({ select: { id: true, codigo: true, nombre: true, tenantId: true } }), { tenantId });
}

const porNombre = (cuentas: { id: string; nombre: string }[], nombre: string) => cuentas.find((c) => c.nombre === nombre)!.id;

test("plan por negocio: idempotente, A no ve las cuentas de B ni puede imputarlas", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const repo = await preparar(base);

  const otraVez = await repo.sembrarPlanModelo(base.a.id, "comercio");
  assert.ok(otraVez.ok);
  assert.equal(otraVez.creadas, 0);

  const deA = await cuentasDe(base, base.a.id);
  const deB = await cuentasDe(base, base.b.id);
  assert.ok(deA.length > 0 && deB.length > 0);
  assert.ok(deA.every((c) => c.tenantId === base.a.id), "A sólo ve lo suyo");
  assert.ok(deB.every((c) => c.tenantId === base.b.id), "B sólo ve lo suyo");

  // La app: la cuenta de B no existe para A.
  const r = await repo.registrarAsiento(base.a.id, {
    fecha: dia("2026-03-10"),
    descripcion: "Intento con cuenta ajena",
    lineas: [L(porNombre(deA, "Caja"), 1000, 0), L(porNombre(deB, "Ventas de servicios"), 0, 1000)],
  });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errores?.some((e) => e.codigo === "CUENTA_INEXISTENTE"));

  // La base: ni el dueño (sin RLS) puede colgar de un asiento de A una cuenta de B.
  const borrador = await repo.registrarAsiento(base.a.id, {
    fecha: dia("2026-03-10"),
    descripcion: "Borrador",
    lineas: [L(porNombre(deA, "Caja"), 1000, 0), L(porNombre(deA, "Ventas"), 0, 1000)],
  });
  assert.ok(borrador.ok);
  const duenio = await prismaComoDuenio(base);
  await assert.rejects(
    duenio.asientoLinea.create({
      data: { tenantId: base.a.id, asientoId: borrador.asientoId, cuentaId: porNombre(deB, "Caja"), debe: BigInt(5), haber: BigInt(0) },
    }),
  );
});

test("la base rechaza lo que el motor rechaza: línea con debe y haber, confirmado descuadrado, editar un confirmado", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const repo = await preparar(base);
  const deA = await cuentasDe(base, base.a.id);
  const caja = porNombre(deA, "Caja");
  const ventas = porNombre(deA, "Ventas");
  const duenio = await prismaComoDuenio(base);
  const ej = await duenio.ejercicio.findFirstOrThrow({ where: { tenantId: base.a.id } });

  // CHECK de línea.
  const b = await duenio.asiento.create({ data: { tenantId: base.a.id, ejercicioId: ej.id, fecha: dia("2026-04-01"), descripcion: "x" } });
  await assert.rejects(duenio.asientoLinea.create({ data: { tenantId: base.a.id, asientoId: b.id, cuentaId: caja, debe: BigInt(10), haber: BigInt(10) } }));
  await assert.rejects(duenio.asientoLinea.create({ data: { tenantId: base.a.id, asientoId: b.id, cuentaId: caja, debe: BigInt(0), haber: BigInt(0) } }));
  await assert.rejects(duenio.asientoLinea.create({ data: { tenantId: base.a.id, asientoId: b.id, cuentaId: caja, debe: BigInt(-5), haber: BigInt(0) } }));

  // Confirmado descuadrado: lo frena el trigger diferido al commit.
  await assert.rejects(
    duenio.$transaction(async (tx) => {
      const a = await tx.asiento.create({ data: { tenantId: base.a.id, ejercicioId: ej.id, fecha: dia("2026-04-01"), descripcion: "descuadrado" } });
      await tx.asientoLinea.createMany({
        data: [
          { tenantId: base.a.id, asientoId: a.id, cuentaId: caja, debe: BigInt(100), haber: BigInt(0) },
          { tenantId: base.a.id, asientoId: a.id, cuentaId: ventas, debe: BigInt(0), haber: BigInt(90) },
        ],
      });
      await tx.asiento.update({ where: { id: a.id }, data: { estado: "CONFIRMADO", numero: 9999 } });
    }),
    /descuadrado/,
  );
  assert.equal(await duenio.asiento.count({ where: { descripcion: "descuadrado" } }), 0);

  // El motor también lo frena, antes de tocar la base.
  const r = await repo.registrarAsiento(base.a.id, { fecha: dia("2026-04-01"), descripcion: "d", lineas: [L(caja, 100, 0), L(ventas, 0, 90)], confirmar: true });
  assert.ok(!r.ok && r.error === "ASIENTO_INVALIDO" && r.errores?.[0].codigo === "DESCUADRADO");

  // Fuera de ejercicio abierto.
  const fuera = await repo.registrarAsiento(base.a.id, { fecha: dia("2027-02-01"), descripcion: "f", lineas: [L(caja, 100, 0), L(ventas, 0, 100)] });
  assert.ok(!fuera.ok && fuera.errores?.[0].codigo === "SIN_EJERCICIO");

  // Confirmado: inmutable (cabecera, líneas y borrado).
  const ok = await repo.registrarAsiento(base.a.id, { fecha: dia("2026-04-02"), descripcion: "Venta contado", lineas: [L(caja, 12100, 0), L(ventas, 0, 12100)], confirmar: true });
  assert.ok(ok.ok && ok.numero !== null);
  await assert.rejects(duenio.asiento.update({ where: { id: ok.asientoId }, data: { descripcion: "cambiada" } }), /contra-asienta/);
  await assert.rejects(duenio.asiento.delete({ where: { id: ok.asientoId } }));
  await assert.rejects(duenio.asientoLinea.updateMany({ where: { asientoId: ok.asientoId }, data: { detalle: "x" } }));

  // Se corrige con contra-asiento, una sola vez.
  const contra = await repo.anularAsiento(base.a.id, ok.asientoId);
  assert.ok(contra.ok && contra.estado === "CONFIRMADO" && contra.numero === ok.numero + 1);
  const guardado = await duenio.asiento.findUniqueOrThrow({ where: { id: contra.asientoId }, include: { lineas: true } });
  assert.equal(guardado.anulaAsientoId, ok.asientoId);
  assert.deepEqual(
    guardado.lineas.map((l) => [l.cuentaId, l.debe, l.haber]).sort(),
    [[caja, BigInt(0), BigInt(12100)], [ventas, BigInt(12100), BigInt(0)]].sort(),
  );
  const otra = await repo.anularAsiento(base.a.id, ok.asientoId);
  assert.ok(!otra.ok && otra.error === "YA_ANULADO");
});

test("confirmaciones simultáneas: números correlativos sin repetidos ni saltos; el borrador no toma número", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const repo = await preparar(base);
  const deB = await cuentasDe(base, base.b.id);
  const caja = porNombre(deB, "Caja");
  const ventas = porNombre(deB, "Ventas de servicios");

  const borrador = await repo.registrarAsiento(base.b.id, { fecha: dia("2026-05-01"), descripcion: "borrador", lineas: [L(caja, 1, 0), L(ventas, 0, 1)] });
  assert.ok(borrador.ok && borrador.numero === null);

  const N = 8;
  const resultados = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      repo.registrarAsiento(base.b.id, {
        fecha: dia("2026-05-02"),
        descripcion: `Cobro ${i}`,
        lineas: [L(caja, 100 + i, 0), L(ventas, 0, 100 + i)],
        confirmar: true,
      }),
    ),
  );
  const numeros = resultados.map((r) => (r.ok ? r.numero : -1)).sort((x, y) => (x ?? 0) - (y ?? 0));
  assert.deepEqual(numeros, Array.from({ length: N }, (_, i) => i + 1));

  const conf = await repo.confirmarAsiento(base.b.id, borrador.asientoId);
  assert.ok(conf.ok && conf.numero === N + 1);
  const dos = await repo.confirmarAsiento(base.b.id, borrador.asientoId);
  assert.ok(!dos.ok && dos.error === "YA_CONFIRMADO");

  // A no ve el borrador de B.
  const ajeno = await repo.confirmarAsiento(base.a.id, borrador.asientoId);
  assert.ok(!ajeno.ok && ajeno.error === "NO_ENCONTRADO");
});

test("calendario fiscal: CUIT del negocio, idempotente, estado y aislamiento", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const repo = await preparar(base);
  const duenio = await prismaComoDuenio(base);

  const sinCuit = await repo.generarCalendario(base.b.id, null, "2026-03");
  assert.ok(!sinCuit.ok && sinCuit.error === "SIN_CUIT");

  await duenio.tenant.update({ where: { id: base.a.id }, data: { arcaCuit: "20123456786" } });
  const r1 = await repo.generarCalendario(base.a.id, null, "2026-03");
  assert.ok(r1.ok && r1.creados >= 5, JSON.stringify(r1));
  const r2 = await repo.generarCalendario(base.a.id, null, "2026-03");
  assert.ok(r2.ok && r2.creados === 0 && r2.existentes === r1.creados);
  const anticipos = await repo.generarCalendario(base.a.id, "20-12345678-6", "2026");
  assert.ok(anticipos.ok && anticipos.creados === 5);

  const malo = await repo.generarCalendario(base.a.id, "20123456789", "2026-03");
  assert.ok(!malo.ok && malo.error === "CUIT_INVALIDO");

  const v = await duenio.vencimientoFiscal.findFirstOrThrow({ where: { tenantId: base.a.id, periodo: "2026-03" } });
  const cambio = await repo.cambiarEstadoVencimiento(base.a.id, v.id, "PAGADO");
  assert.ok(cambio.ok);
  const despues = await duenio.vencimientoFiscal.findUniqueOrThrow({ where: { id: v.id } });
  assert.equal(despues.estado, "PAGADO");
  assert.ok(despues.fechaPago);

  const deB = await repo.cambiarEstadoVencimiento(base.b.id, v.id, "SIN_SALDO");
  assert.ok(!deB.ok && deB.error === "NO_ENCONTRADO");
  assert.equal(await duenio.vencimientoFiscal.count({ where: { tenantId: base.b.id } }), 0);
});
