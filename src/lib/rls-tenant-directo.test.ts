// Qué lecturas de `Tenant` salen sin transacción (rls.ts, `esLecturaDirectaDeTenant`): SÓLO las
// que leen columnas propias de Tenant, que no tiene RLS ni `tenantId` y da lo mismo con el
// negocio puesto o sin él. Todo lo que toque otra tabla a través de Tenant (relaciones, conteos,
// filtros por relación) o escriba sigue por la transacción con el negocio puesto: sin él, RLS
// devolvería vacío. Contra Postgres (mismo resultado, un mensaje): pg-begin-con-negocio-postgres.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { esLecturaDirectaDeTenant } from "./rls";

test("columnas propias de Tenant: van directo (un viaje)", () => {
  const directas: [string, unknown][] = [
    ["findUnique", { where: { id: "t1" } }],
    ["findUnique", { where: { id: "t1" }, select: { id: true, slug: true, modules: true } }],
    ["findUniqueOrThrow", { where: { slug: "magra" }, select: { id: true } }],
    ["findFirst", { where: { subdomain: "magra" }, select: { id: true, blueprintId: false } }],
    ["findFirstOrThrow", { where: { id: "t1" }, omit: { bancosDomicilioEmisor: true } }],
    ["findMany", { where: { id: { in: ["t1", "t2"] } }, select: { id: true, name: true, arcaCuit: true } }],
    ["findMany", undefined],
    ["findUnique", { select: { accentPreset: true } }],
  ];
  for (const [op, args] of directas) assert.equal(esLecturaDirectaDeTenant("Tenant", op, args), true, `${op} ${JSON.stringify(args)}`);
});

test("lo que toca otra tabla a través de Tenant sigue con el negocio puesto", () => {
  const conTransaccion: unknown[] = [
    { where: { id: "t1" }, include: { users: true } },
    { where: { id: "t1" }, select: { id: true, users: true } }, // relación con `true`: trae filas de User
    { where: { id: "t1" }, select: { id: true, users: { select: { id: true } } } },
    { where: { id: "t1" }, select: { id: true, _count: true } },
    { where: { id: "t1" }, select: { _count: { select: { orders: true } } } },
    { where: { users: { some: { email: "x@y.z" } } } }, // filtro por relación
    { where: { AND: [{ id: "t1" }] } }, // no se mira adentro: va por el camino seguro
    { where: { OR: [{ id: "t1" }, { slug: "x" }] } },
    { where: { NOT: { id: "t1" } } },
    { where: { id: "t1" }, orderBy: { createdAt: "desc" } },
    { where: { id: "t1" }, take: 1 },
    { where: { id: "t1" }, relationLoadStrategy: "join" },
    { where: { id: "t1" }, select: { id: 1 } }, // valor raro en el select
    { where: "t1" },
    [],
    "t1",
  ];
  for (const args of conTransaccion) {
    assert.equal(esLecturaDirectaDeTenant("Tenant", "findUnique", args), false, JSON.stringify(args));
  }
});

test("escrituras, conteos y agregados de Tenant, y cualquier otro modelo: por la transacción", () => {
  for (const op of ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany", "count", "aggregate", "groupBy"]) {
    assert.equal(esLecturaDirectaDeTenant("Tenant", op, { where: { id: "t1" } }), false, op);
  }
  for (const modelo of ["Order", "User", "CarteraCliente", "TenantFiscalCredential", undefined]) {
    assert.equal(esLecturaDirectaDeTenant(modelo, "findUnique", { where: { id: "x" } }), false, String(modelo));
  }
});
