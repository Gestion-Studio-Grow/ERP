// ============================================================================
// CONTABILIDAD OLA 2 (T0 de Control de gestión) CONTRA POSTGRES — base efímera con RLS.
// ============================================================================
//
// Con la migración 20261108150000_contabilidad_ola2_roles aplicada por el arnés:
//   · sembrar deja atributos de gestión, roles del rubro y ConfigContable; dos veces = mismo estado;
//   · A no ve los roles ni la config de B (RLS) y la base no deja que un rol de A apunte a una
//     cuenta de B (FK compuesta), ni como dueño exento de RLS;
//   · asignar un rol valida tipo/imputable y no acepta la cuenta de otro negocio;
//   · CHECKs de la base: plazo, nivel y capacidades fuera de catálogo se rechazan;
//   · fechaOrigen se guarda en la línea no monetaria y un asiento sin ella sigue igual.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

let preparado: Promise<void> | null = null;
async function preparar(base: BaseEfimera) {
  preparado ??= (async () => {
    apuntarLaAppA(base);
    const repo = await import("./repo");
    assert.equal((await repo.sembrarPlanModelo(base.a.id, "servicios")).ok, true);
    assert.equal((await repo.sembrarPlanModelo(base.b.id, "comercio")).ok, true);
  })();
  await preparado;
  return import("./repo");
}

async function enNegocio<T>(tenantId: string, fn: (tx: Parameters<Parameters<typeof import("@/lib/rls").tenantTransaction>[0]>[0]) => Promise<T>) {
  const { tenantTransaction } = await import("@/lib/rls");
  return tenantTransaction(fn, { tenantId });
}

test("sembrar: atributos, roles y config; idempotente", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const repo = await preparar(base);
  const { rolesModelo } = await import("./roles");

  const otra = await repo.sembrarPlanModelo(base.a.id, "servicios");
  assert.ok(otra.ok);
  assert.equal(otra.creadas, 0);
  assert.equal(otra.rolesAsignados, 0);

  const { cuentas, roles, config } = await enNegocio(base.a.id, async (tx) => ({
    cuentas: await tx.cuentaContable.findMany({ select: { id: true, codigo: true, plazo: true, funcion: true, monetaria: true, rubro: true } }),
    roles: await tx.cuentaRol.findMany({ select: { rol: true, cuentaId: true, tenantId: true } }),
    config: await tx.configContable.findMany(),
  }));
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c]));
  assert.equal(porCodigo.get("1.2.1.06")!.plazo, "NO_CORRIENTE");
  assert.equal(porCodigo.get("1.2.1.06")!.monetaria, false);
  assert.equal(porCodigo.get("5.4.01")!.funcion, "COMERCIALIZACION");
  assert.equal(roles.length, rolesModelo("servicios").size);
  assert.ok(roles.every((r) => r.tenantId === base.a.id));
  const caja = roles.find((r) => r.rol === "CAJA")!;
  assert.equal(caja.cuentaId, porCodigo.get("1.1.1.01")!.id);
  assert.equal(config.length, 1);
  assert.equal(config[0].nivel, "PYME");
  assert.equal(config[0].rubroNegocio, "servicios");
});

test("RLS y FK compuesta: A no ve lo de B ni puede apuntar un rol a una cuenta de B", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const repo = await preparar(base);

  const vistoPorA = await enNegocio(base.a.id, async (tx) => ({
    roles: await tx.cuentaRol.findMany({ where: { tenantId: base.b.id } }),
    config: await tx.configContable.findMany({ where: { tenantId: base.b.id } }),
  }));
  assert.equal(vistoPorA.roles.length, 0);
  assert.equal(vistoPorA.config.length, 0);

  const cajaB = await enNegocio(base.b.id, (tx) => tx.cuentaContable.findFirst({ where: { codigo: "1.1.1.01" }, select: { id: true } }));
  const r = await repo.asignarRolCuenta(base.a.id, "CAJA", cajaB!.id);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.error === "NO_ENCONTRADO");

  const duenio = await prismaComoDuenio(base);
  await assert.rejects(
    duenio.cuentaRol.update({ where: { tenantId_rol: { tenantId: base.a.id, rol: "CAJA" } }, data: { cuentaId: cajaB!.id } }),
    "la FK (cuentaId, tenantId) no deja cruzar negocios",
  );
  // La app con el negocio A no puede escribir una fila de B (WITH CHECK de la policy).
  // Fila válida para B (FK y único OK): sólo la policy puede frenarla.
  await assert.rejects(enNegocio(base.a.id, (tx) => tx.cuentaRol.create({ data: { tenantId: base.b.id, rol: "ROL_FORJADO", cuentaId: cajaB!.id } })));
  assert.equal((await duenio.cuentaRol.count({ where: { rol: "ROL_FORJADO" } })), 0);
});

test("asignarRolCuenta: valida tipo e imputable; reasigna dentro del negocio", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const repo = await preparar(base);
  const deA = await enNegocio(base.a.id, (tx) => tx.cuentaContable.findMany({ select: { id: true, codigo: true } }));
  const id = (c: string) => deA.find((x) => x.codigo === c)!.id;

  const tipo = await repo.asignarRolCuenta(base.a.id, "CAJA", id("4.1.01"));
  assert.ok(!tipo.ok && tipo.error === "ROL_INVALIDO");
  const agrupador = await repo.asignarRolCuenta(base.a.id, "CAJA", id("1.1.1"));
  assert.ok(!agrupador.ok && agrupador.error === "ROL_INVALIDO");
  const inventado = await repo.asignarRolCuenta(base.a.id, "CUALQUIERA", id("1.1.1.01"));
  assert.ok(!inventado.ok && inventado.error === "ROL_INVALIDO");

  const ok = await repo.asignarRolCuenta(base.a.id, "BILLETERA_MP", id("1.1.1.02"));
  assert.ok(ok.ok);
  const fila = await enNegocio(base.a.id, (tx) => tx.cuentaRol.findMany({ where: { rol: "BILLETERA_MP" } }));
  assert.equal(fila.length, 1);
  assert.equal(fila[0].cuentaId, id("1.1.1.02"));
});

test("CHECKs de la base sobre las columnas nuevas", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  await preparar(base);
  const duenio = await prismaComoDuenio(base);
  const cuenta = await duenio.cuentaContable.findFirst({ where: { tenantId: base.a.id, codigo: "1.1.1.01" } });
  await assert.rejects(duenio.cuentaContable.update({ where: { id: cuenta!.id }, data: { plazo: "LARGO" } }));
  await assert.rejects(duenio.cuentaContable.update({ where: { id: cuenta!.id }, data: { funcion: "VENTAS" } }));
  await assert.rejects(duenio.cuentaContable.update({ where: { id: cuenta!.id }, data: { monedaCuenta: "usd" } }));
  await assert.rejects(duenio.configContable.update({ where: { tenantId: base.a.id }, data: { nivel: "EMPRESA" } }));
  await assert.rejects(duenio.configContable.update({ where: { tenantId: base.a.id }, data: { capacidades: ["api"] } }));
  await assert.rejects(duenio.cuentaRol.updateMany({ where: { tenantId: base.a.id, rol: "CAJA" }, data: { rol: "caja" } }));
  await duenio.configContable.update({ where: { tenantId: base.a.id }, data: { nivel: "CORPORATIVO", capacidades: { jerarquia: true } } });
});

test("fechaOrigen: se guarda en la línea no monetaria; sin ella el asiento se registra igual", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const repo = await preparar(base);
  assert.equal((await repo.abrirEjercicio(base.a.id, { fechaInicio: dia("2026-01-01"), fechaCierre: dia("2026-12-31") })).ok, true);
  const deA = await enNegocio(base.a.id, (tx) => tx.cuentaContable.findMany({ select: { id: true, codigo: true } }));
  const id = (c: string) => deA.find((x) => x.codigo === c)!.id;

  const con = await repo.registrarAsiento(base.a.id, {
    fecha: dia("2026-03-10"),
    descripcion: "Compra de aparatología",
    lineas: [
      { cuentaId: id("1.2.1.06"), debe: BigInt(1500000), haber: BigInt(0), fechaOrigen: dia("2026-03-01") },
      { cuentaId: id("1.1.1.02"), debe: BigInt(0), haber: BigInt(1500000) },
    ],
  });
  assert.ok(con.ok);
  const lineas = await enNegocio(base.a.id, (tx) => tx.asientoLinea.findMany({ where: { asientoId: con.asientoId }, select: { cuentaId: true, fechaOrigen: true } }));
  assert.equal(lineas.find((l) => l.cuentaId === id("1.2.1.06"))!.fechaOrigen?.toISOString().slice(0, 10), "2026-03-01");
  assert.equal(lineas.find((l) => l.cuentaId === id("1.1.1.02"))!.fechaOrigen, null);

  const futura = await repo.registrarAsiento(base.a.id, {
    fecha: dia("2026-03-10"),
    descripcion: "Origen posterior",
    lineas: [
      { cuentaId: id("1.2.1.06"), debe: BigInt(100), haber: BigInt(0), fechaOrigen: dia("2026-04-01") },
      { cuentaId: id("1.1.1.02"), debe: BigInt(0), haber: BigInt(100) },
    ],
  });
  assert.ok(!futura.ok && futura.error === "ASIENTO_INVALIDO");
});
