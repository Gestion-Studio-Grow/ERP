// FC-01 sin base: rubro del plan, roles faltantes, el plan «servicios por proyecto» y la tolerancia a
// la migración ausente (MIGRACION_PENDIENTE en vez de un 500) en las funciones de las pantallas.
// Incluye la reproducción P2 de la certificación T1 (rubro inferido de una cuenta), ahora cerrada.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://nadie@127.0.0.1:1/nada";

test("plan «servicios por proyecto»: cuentas de §1.3 y todos sus roles con cuenta en el plan", async () => {
  const { planModelo, rubroParaLaBase, CUENTA_MARCA_PROYECTOS } = await import("./plan-modelo");
  const { rolesModelo, rolesSinCuentaEnElPlan } = await import("./roles");
  const plan = planModelo("proyectos");
  const de = new Map(plan.map((c) => [c.codigo, c]));
  assert.ok(de.get(CUENTA_MARCA_PROYECTOS)?.imputable);
  assert.equal(de.has("1.2.1.06"), false, "sin aparatología");
  assert.equal(de.get("5.3.08")!.funcion, "FINANCIACION", "diferencia de cambio: resultado financiero");
  assert.equal(de.get("1.1.1.04")!.monetaria, false, "moneda extranjera no monetaria (provisional)");
  assert.deepEqual(rolesSinCuentaEnElPlan("proyectos"), []);
  for (const rol of ["RETENCIONES_IVA_A_DEPOSITAR", "RETENCIONES_GANANCIAS_A_DEPOSITAR", "RETENCIONES_IIBB_A_DEPOSITAR", "CHEQUES_DIFERIDOS_A_PAGAR",
    "DIFERENCIA_DE_CAMBIO", "PERCEPCIONES_IVA", "SALDO_TECNICO_IVA", "SALDO_LIBRE_DISPONIBILIDAD_IVA", "VALORES_A_DEPOSITAR",
    "ANTICIPOS_GANANCIAS", "GANANCIAS_A_PAGAR", "RECAUDACION_BANCARIA_IIBB", "BANCO_USD"] as const) {
    assert.ok(rolesModelo("proyectos").has(rol), rol);
  }
  assert.equal(rubroParaLaBase("proyectos"), "servicios", "el CHECK de la ola 2 no admite otro valor");
  assert.equal(rubroParaLaBase("club"), "club");
});

test("rubroDelPlan: «proyectos» sólo con la marca de la carga; lo desconocido da null", async () => {
  const { rubroDelPlan } = await import("./repo-plan");
  assert.equal(rubroDelPlan("servicios", true), "proyectos");
  assert.equal(rubroDelPlan("servicios", false), "servicios");
  assert.equal(rubroDelPlan("comercio", true), "comercio", "la marca sólo cuenta sobre «servicios»");
  assert.equal(rubroDelPlan(null, true), null);
  assert.equal(rubroDelPlan("inventado", false), null);
});

// Certificación T1, P2: antes el rubro salía de la cuenta 1.1.1.05 «Valores a depositar», que un
// negocio «servicios» fabrica con dos altas de hoja. Ahora las cuentas no entran en la decisión.
test("P2 · un negocio «servicios» que crea 1.1.1.04 y 1.1.1.05 «Valores a depositar» sigue siendo «servicios»", async () => {
  const { rubroDelPlan, rolesFaltantes } = await import("./repo-plan");
  const { planModelo } = await import("./plan-modelo");
  const { rolesModelo } = await import("./roles");
  const plan = planModelo("servicios").map((c) => ({ codigo: c.codigo, nombre: c.nombre }));
  assert.equal(plan.filter((c) => c.codigo.startsWith("1.1.1.")).length, 3, "servicios trae 1.1.1.01 a .03");
  // `rubroDelPlan` ya no recibe las cuentas: sin la marca de la carga no hay forma de pasar a «proyectos».
  const rubro = rubroDelPlan("servicios", false);
  assert.equal(rubro, "servicios");
  assert.deepEqual(rolesFaltantes([...rolesModelo("servicios").keys()], rubro).delRubro, [], "sin falsos faltantes");
});

test("rolesFaltantes: separa los del rubro de los opcionales", async () => {
  const { rolesFaltantes } = await import("./repo-plan");
  const { rolesModelo, ROLES } = await import("./roles");
  const todosDelRubro = [...rolesModelo("comercio").keys()];
  assert.deepEqual(rolesFaltantes(todosDelRubro, "comercio").delRubro, []);
  const sinCaja = rolesFaltantes(todosDelRubro.filter((r) => r !== "CAJA"), "comercio");
  assert.deepEqual(sinCaja.delRubro, ["CAJA"]);
  assert.ok(sinCaja.otros.includes("FONDOS_PAUTA_CLIENTES"), "lo de agencia es opcional en comercio");
  assert.equal(rolesFaltantes([], null).otros.length, ROLES.length, "sin plan, todos opcionales");
});

for (const code of ["P2021", "P2022"]) {
  test(`${code} → las funciones de FC-01 devuelven MIGRACION_PENDIENTE`, async () => {
    const { basePrisma } = await import("@/lib/prisma-base");
    Object.defineProperty(basePrisma, "$transaction", {
      configurable: true,
      writable: true,
      value: async () => {
        throw Object.assign(new Error("The table `public.CuentaContable` does not exist in the current database."), { code });
      },
    });
    try {
      const { MENSAJE_MIGRACION_PENDIENTE } = await import("./repo");
      const plan = await import("./repo-plan");
      for (const r of [
        await plan.leerPlanDeCuentas("negocio-x"),
        await plan.agregarHoja("negocio-x", { padreId: "p", nombre: "Banco Provincia" }),
        await plan.cambiarActivaCuenta("negocio-x", "c", false),
        await plan.completarRolesFaltantes("negocio-x"),
        await plan.listarEjercicios("negocio-x"),
      ]) {
        assert.equal(r.ok, false);
        assert.equal(r.ok ? "" : r.error, "MIGRACION_PENDIENTE");
        assert.equal(r.ok ? "" : r.mensaje, MENSAJE_MIGRACION_PENDIENTE);
      }
    } finally {
      delete (basePrisma as unknown as Record<string, unknown>).$transaction;
    }
  });
}
