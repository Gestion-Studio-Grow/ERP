// Roles de cuenta (CuentaRol, T0): cada rol del catálogo cae en una cuenta imputable del tipo
// correcto en el plan modelo de cada rubro donde aplica.

import { test } from "node:test";
import assert from "node:assert/strict";
import { RUBROS_CONTABLES } from "./plan-modelo";
import { ROLES, ROLES_CUENTA, codigoDelRol, esRolCuenta, problemaDeAsignacion, rolesModelo, rolesSinCuentaEnElPlan } from "./roles";

for (const rubro of RUBROS_CONTABLES) {
  test(`roles · ${rubro}: todo rol del rubro tiene cuenta imputable del tipo correcto`, () => {
    assert.deepEqual(rolesSinCuentaEnElPlan(rubro), []);
  });
  test(`roles · ${rubro}: los roles que usa el motor de T1 existen en todo rubro`, () => {
    const m = rolesModelo(rubro);
    for (const rol of ["CAJA", "BANCO", "BILLETERA_MP", "DEUDORES_POR_VENTAS", "IVA_DEBITO_FISCAL", "IVA_CREDITO_FISCAL", "VENTAS", "COSTO_DE_VENTAS", "PROVEEDORES", "ANTICIPOS_DE_CLIENTES", "GASTOS_SIN_CATEGORIA", "COMISIONES_PERSONAL", "COMISIONES_DE_COBRO"] as const) {
      assert.ok(m.has(rol), `${rubro}: ${rol}`);
    }
  });
}

test("roles: cada rol aplica al menos a un rubro; los de agencia sólo a agencia", () => {
  for (const rol of ROLES) assert.ok(RUBROS_CONTABLES.some((r) => codigoDelRol(rol, r) !== null), rol);
  assert.equal(codigoDelRol("FONDOS_PAUTA_CLIENTES", "comercio"), null);
  assert.equal(codigoDelRol("FONDOS_PAUTA_CLIENTES", "agencia"), "2.1.6.02");
  assert.equal(codigoDelRol("INSUMOS", "servicios"), "5.1.03");
  assert.equal(codigoDelRol("COMISIONES_PERSONAL", "servicios"), "5.1.02", "en servicios la comisión es costo del servicio");
});

test("roles: nombres en MAYÚSCULAS (la base lo exige con un CHECK)", () => {
  for (const rol of ROLES) assert.match(rol, /^[A-Z][A-Z_]*$/);
});

test("roles: problemaDeAsignacion rechaza rol inventado, agrupador, inactiva y tipo cruzado", () => {
  const ok = { tipo: "ACTIVO", imputable: true, activa: true };
  assert.equal(problemaDeAsignacion("CAJA", ok), null);
  assert.equal(problemaDeAsignacion("NO_EXISTE", ok)?.codigo, "ROL_INEXISTENTE");
  assert.equal(problemaDeAsignacion("__proto__", ok)?.codigo, "ROL_INEXISTENTE");
  assert.equal(problemaDeAsignacion("CAJA", { ...ok, imputable: false })?.codigo, "CUENTA_NO_IMPUTABLE");
  assert.equal(problemaDeAsignacion("CAJA", { ...ok, activa: false })?.codigo, "CUENTA_INACTIVA");
  assert.equal(problemaDeAsignacion("VENTAS", ok)?.codigo, "TIPO_INCOMPATIBLE");
  assert.equal(esRolCuenta("toString"), false);
  assert.equal(Object.keys(ROLES_CUENTA).length, ROLES.length);
});
