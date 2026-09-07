import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  scopeArgs,
  MODELOS_SIN_TENANT,
  OPERACIONES_FILTRABLES,
} from "./tenant-scope";

const T = "tenant-A";

// --- Lo que arregla: las consultas que hoy se fugan ---------------------------

test("findUnique por id suelto queda atado al tenant", () => {
  const r = scopeArgs("Client", "findUnique", { where: { id: "B_cli" } }, T) as {
    where: Record<string, unknown>;
  };
  assert.deepEqual(r.where, { id: "B_cli", tenantId: T });
});

test("findMany sin where alguno pasa a tener where con tenant", () => {
  const r = scopeArgs("Client", "findMany", { orderBy: { name: "asc" } }, T) as {
    where: Record<string, unknown>;
    orderBy: unknown;
  };
  assert.deepEqual(r.where, { tenantId: T });
  assert.deepEqual(r.orderBy, { name: "asc" });
});

test("args undefined (findMany() pelado) también queda atado", () => {
  const r = scopeArgs("Client", "findMany", undefined, T) as {
    where: Record<string, unknown>;
  };
  assert.deepEqual(r.where, { tenantId: T });
});

test("update por id ajeno queda con el tenant propio (la fila no matchea → P2025)", () => {
  const r = scopeArgs(
    "Appointment",
    "update",
    { where: { id: "B_turno" }, data: { status: "CANCELADO" } },
    T,
  ) as { where: Record<string, unknown>; data: unknown };
  assert.deepEqual(r.where, { id: "B_turno", tenantId: T });
  assert.deepEqual(r.data, { status: "CANCELADO" });
});

test("deleteMany sin where no borra la base entera de todos los tenants", () => {
  const r = scopeArgs("CashMovement", "deleteMany", {}, T) as {
    where: Record<string, unknown>;
  };
  assert.deepEqual(r.where, { tenantId: T });
});

// --- Lo que NO debe romper ----------------------------------------------------

test("respeta un tenantId ya puesto por el código (workers por tenant)", () => {
  const args = { where: { id: "x", tenantId: "otro-tenant" } };
  assert.equal(scopeArgs("Invoice", "findUnique", args, T), args);
});

test("tenantId: undefined cuenta como ausente y se completa", () => {
  const r = scopeArgs(
    "Invoice",
    "findMany",
    { where: { tenantId: undefined, status: "PAGADA" } },
    T,
  ) as { where: Record<string, unknown> };
  assert.equal(r.where.tenantId, T);
  assert.equal(r.where.status, "PAGADA");
});

test("Tenant no se filtra: no tiene la columna", () => {
  const args = { where: { slug: "beauty-spa" } };
  assert.equal(scopeArgs("Tenant", "findUnique", args, T), args);
});

test("create no se toca: no hay where y el tenantId lo pone el llamador", () => {
  const args = { data: { name: "Ana", tenantId: T } };
  assert.equal(scopeArgs("Client", "create", args, T), args);
});

test("op cruda sin modelo pasa derecho", () => {
  const args = { foo: 1 };
  assert.equal(scopeArgs(undefined, "findMany", args, T), args);
});

test("no muta los args originales", () => {
  const args = { where: { id: "x" } };
  scopeArgs("Client", "findUnique", args, T);
  assert.deepEqual(args, { where: { id: "x" } });
});

test("conserva el resto del where (OR, includes, filtros)", () => {
  const r = scopeArgs(
    "Appointment",
    "findMany",
    { where: { OR: [{ status: "RESERVADO" }, { status: "CONFIRMADO" }] } },
    T,
  ) as { where: Record<string, unknown> };
  assert.equal(r.where.tenantId, T);
  assert.ok(Array.isArray(r.where.OR));
});

test("todas las operaciones filtrables aceptan el candado", () => {
  for (const op of OPERACIONES_FILTRABLES) {
    const r = scopeArgs("Client", op, { where: { id: "x" } }, T) as {
      where: Record<string, unknown>;
    };
    assert.equal(r.where.tenantId, T, `faltó el candado en ${op}`);
  }
});

// --- El candado no sirve si la lista de modelos se desactualiza ---------------

test("MODELOS_SIN_TENANT coincide con el esquema de Prisma", () => {
  const esquema = readFileSync(
    new URL("../../prisma/schema.prisma", import.meta.url),
    "utf8",
  );
  const sinTenant = new Set<string>();
  const conTenant = new Set<string>();
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(esquema)) !== null) {
    (/^\s*tenantId\s+\S/m.test(m[2]) ? conTenant : sinTenant).add(m[1]);
  }

  assert.ok(conTenant.size > 40, "el parser no encontró los modelos del esquema");
  assert.deepEqual(
    [...sinTenant].sort(),
    [...MODELOS_SIN_TENANT].sort(),
    "hay modelos sin tenantId que la extensión no conoce (o al revés): actualizá MODELOS_SIN_TENANT",
  );
  for (const modelo of conTenant) {
    assert.ok(
      !MODELOS_SIN_TENANT.has(modelo),
      `${modelo} tiene tenantId y quedó excluido del candado`,
    );
  }
});
