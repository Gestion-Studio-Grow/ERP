// ============================================================================
// FC-01 · PLAN DE CUENTAS CONTRA POSTGRES — base efímera con RLS (migraciones de las olas 1 y 2).
// ============================================================================
//
//   · sembrar «servicios por proyecto» en un negocio vacío deja todos los roles del rubro con cuenta,
//     y si falta uno la pantalla lo lista;
//   · un negocio no ve ni toca el plan de otro (lectura, alta de hoja, baja, ejercicios);
//   · no se puede imputar a una cuenta que agrupa, ni colgar una hoja de una hoja;
//   · alta de hoja con código del sistema y atributos heredados; baja protegida si cumple un rol.
// Datos sintéticos.

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
    assert.equal((await repo.sembrarPlanModelo(base.a.id, "proyectos")).ok, true);
    assert.equal((await repo.sembrarPlanModelo(base.b.id, "comercio")).ok, true);
    assert.equal((await repo.abrirEjercicio(base.a.id, { fechaInicio: dia("2026-01-01"), fechaCierre: dia("2026-12-31") })).ok, true);
  })();
  await preparado;
  return { repo: await import("./repo"), plan: await import("./repo-plan") };
}

async function cuentasDe(tenantId: string) {
  const { plan } = { plan: await import("./repo-plan") };
  const r = await plan.leerPlanDeCuentas(tenantId);
  assert.ok(r.ok);
  return { ...r, id: (codigo: string) => r.cuentas.find((c) => c.codigo === codigo)!.id };
}

test("sembrar «servicios por proyecto» en un negocio vacío: todos los roles del rubro con cuenta", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { plan } = await preparar(base);
  const { rolesModelo } = await import("./roles");
  const a = await cuentasDe(base.a.id);
  assert.equal(a.rubro, "proyectos", "se reconoce aunque la base guarde «servicios»");
  assert.deepEqual(plan.rolesFaltantes(Object.keys(a.roles), a.rubro).delRubro, []);
  assert.equal(Object.keys(a.roles).length, rolesModelo("proyectos").size);
  assert.equal(a.roles.RETENCIONES_IVA_A_DEPOSITAR, a.id("2.1.2.06"));
  assert.equal(a.roles.DIFERENCIA_DE_CAMBIO, a.id("5.3.08"));
});

test("si falta un rol, la lectura lo lista para asignarlo", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, plan } = await preparar(base);
  const duenio = await prismaComoDuenio(base);
  await duenio.cuentaRol.delete({ where: { tenantId_rol: { tenantId: base.b.id, rol: "CAJA" } } });
  const b = await cuentasDe(base.b.id);
  assert.equal(b.rubro, "comercio");
  assert.deepEqual(plan.rolesFaltantes(Object.keys(b.roles), b.rubro).delRubro, ["CAJA"]);
  assert.ok((await repo.asignarRolCuenta(base.b.id, "CAJA", b.id("1.1.1.01"))).ok);
  assert.deepEqual(plan.rolesFaltantes(Object.keys((await cuentasDe(base.b.id)).roles), "comercio").delRubro, []);
});

test("aislamiento: un negocio no ve ni toca el plan ni los ejercicios de otro", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { plan } = await preparar(base);
  const a = await cuentasDe(base.a.id);
  const b = await cuentasDe(base.b.id);
  const idsDeA = new Set(a.cuentas.map((c) => c.id));
  assert.ok(b.cuentas.every((c) => !idsDeA.has(c.id)), "B no recibe ninguna cuenta de A");
  assert.ok(Object.values(b.roles).every((id) => !idsDeA.has(id)));

  const { tenantTransaction } = await import("@/lib/rls");
  const visto = await tenantTransaction((tx) => tx.cuentaContable.count({ where: { tenantId: base.a.id } }), { tenantId: base.b.id });
  assert.equal(visto, 0, "RLS: B no ve filas de A ni pidiéndolas por tenantId");

  const hoja = await plan.agregarHoja(base.b.id, { padreId: a.id("1.1.1"), nombre: "Banco ajeno" });
  assert.ok(!hoja.ok && hoja.error === "NO_ENCONTRADO");
  const baja = await plan.cambiarActivaCuenta(base.b.id, a.id("1.1.1.05"), false);
  assert.ok(!baja.ok && baja.error === "NO_ENCONTRADO");
  const ej = await plan.listarEjercicios(base.b.id);
  assert.ok(ej.ok && ej.ejercicios.length === 0, "B no ve el ejercicio de A");
  const ejA = await plan.listarEjercicios(base.a.id);
  assert.ok(ejA.ok && ejA.ejercicios.length === 1);
});

test("no se puede imputar a una cuenta que agrupa ni colgar una hoja de una hoja", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, plan } = await preparar(base);
  const a = await cuentasDe(base.a.id);
  const asiento = await repo.registrarAsiento(base.a.id, {
    fecha: dia("2026-03-10"),
    descripcion: "Cobro de un proyecto",
    lineas: [
      { cuentaId: a.id("1.1.1"), debe: BigInt(250000), haber: BigInt(0) },
      { cuentaId: a.id("4.1.01"), debe: BigInt(0), haber: BigInt(250000) },
    ],
  });
  assert.ok(!asiento.ok && asiento.error === "ASIENTO_INVALIDO", JSON.stringify(asiento));

  for (const padre of ["1.1.1.01", "1.1", "1"]) {
    const r = await plan.agregarHoja(base.a.id, { padreId: a.id(padre), nombre: "Cuenta de prueba" });
    assert.ok(!r.ok && r.error === "PADRE_INVALIDO", padre);
  }
  const corto = await plan.agregarHoja(base.a.id, { padreId: a.id("1.1.1"), nombre: " x " });
  assert.ok(!corto.ok && corto.error === "DATOS_INVALIDOS");
  const repetido = await plan.agregarHoja(base.a.id, { padreId: a.id("1.1.1"), nombre: "caja" });
  assert.ok(!repetido.ok && repetido.error === "DATOS_INVALIDOS");
});

test("alta de hoja: código del sistema, atributos heredados e imputable; baja y reactivación", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, plan } = await preparar(base);
  const a = await cuentasDe(base.a.id);
  const nueva = await plan.agregarHoja(base.a.id, { padreId: a.id("1.1.1"), nombre: "Banco Galicia cuenta sueldos" });
  assert.ok(nueva.ok, JSON.stringify(nueva));
  assert.equal(nueva.codigo, "1.1.1.06");
  const duenio = await prismaComoDuenio(base);
  const fila = await duenio.cuentaContable.findUniqueOrThrow({ where: { id: nueva.cuentaId } });
  assert.equal(fila.tenantId, base.a.id);
  assert.equal(fila.tipo, "ACTIVO");
  assert.equal(fila.naturaleza, "DEUDORA");
  assert.equal(fila.rubro, "CAJA_Y_BANCOS");
  assert.equal(fila.plazo, "CORRIENTE");
  assert.equal(fila.ritmo, null);

  const gasto = await plan.agregarHoja(base.a.id, { padreId: a.id("5.1"), nombre: "Alquiler de equipos de sonido" });
  assert.ok(gasto.ok && gasto.codigo === "5.1.04");
  const filaGasto = await duenio.cuentaContable.findUniqueOrThrow({ where: { id: gasto.cuentaId } });
  assert.equal(filaGasto.funcion, "COSTO");
  assert.equal(filaGasto.ritmo, "VARIABLE");
  assert.equal(filaGasto.nombreDueno, "Alquiler de equipos de sonido");

  const lineas = (cuenta: string) => [
    { cuentaId: cuenta, debe: BigInt(100000), haber: BigInt(0) },
    { cuentaId: a.id("4.1.01"), debe: BigInt(0), haber: BigInt(100000) },
  ];
  assert.ok((await repo.registrarAsiento(base.a.id, { fecha: dia("2026-04-02"), descripcion: "Cobro", lineas: lineas(nueva.cuentaId) })).ok);

  const conRol = await plan.cambiarActivaCuenta(base.a.id, a.id("1.1.1.01"), false);
  assert.ok(!conRol.ok && conRol.error === "CUENTA_EN_USO");
  const agrupador = await plan.cambiarActivaCuenta(base.a.id, a.id("1.1.1"), false);
  assert.ok(!agrupador.ok && agrupador.error === "DATOS_INVALIDOS");

  assert.ok((await plan.cambiarActivaCuenta(base.a.id, nueva.cuentaId, false)).ok);
  const aInactiva = await repo.registrarAsiento(base.a.id, { fecha: dia("2026-04-03"), descripcion: "Cobro", lineas: lineas(nueva.cuentaId) });
  assert.ok(!aInactiva.ok && aInactiva.error === "ASIENTO_INVALIDO", "una cuenta dada de baja no recibe asientos");
  assert.ok((await plan.cambiarActivaCuenta(base.a.id, nueva.cuentaId, true)).ok);
  assert.equal((await cuentasDe(base.a.id)).cuentas.find((c) => c.id === nueva.cuentaId)!.activa, true);
});
