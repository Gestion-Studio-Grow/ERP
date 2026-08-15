// Aislamiento multi-tenant del override de comisión por (profesional, servicio).
//
// Qué prueba: que una escritura hecha con un `tenantId` AJENO no toca la fila de
// otro tenant — ni la borra, ni le pisa el porcentaje. Sin DB: el store falso de
// abajo modela las dos reglas de Postgres/Prisma que importan acá:
//   1. los predicados del `where` se combinan con AND (si el tenantId no matchea,
//      la fila no entra en el update/delete);
//   2. `@@unique([professionalId, serviceId])` es GLOBAL — un insert del par que
//      ya existe en OTRO tenant choca igual, con P2002.
// Es (2) lo que vuelve real el riesgo: sin el predicado de tenant, el par ajeno
// matcheaba y la escritura caía sobre la fila del otro negocio.
//
// Contexto: hallazgo lateral de la verificación adversarial del 11/08/2026 sobre
// el cálculo de comisiones.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearCommissionOverride,
  setCommissionOverride,
  CROSS_TENANT_COMMISSION_ERROR,
  type CommissionOverrideScope,
  type CommissionOverrideStore,
} from "./commission-override-core";

type Row = CommissionOverrideScope & { commissionPercent: number };

// Error con la forma del P2002 de Prisma (el núcleo lo detecta por `code`).
class UniqueViolation extends Error {
  code = "P2002";
  constructor() {
    super("Unique constraint failed on the fields: (`professionalId`,`serviceId`)");
  }
}

function fakeStore(rows: Row[]): CommissionOverrideStore & { rows: Row[] } {
  const matches = (r: Row, w: CommissionOverrideScope) =>
    r.tenantId === w.tenantId &&
    r.professionalId === w.professionalId &&
    r.serviceId === w.serviceId;

  return {
    rows,
    async deleteMany({ where }) {
      const keep = rows.filter((r) => !matches(r, where));
      const count = rows.length - keep.length;
      rows.length = 0;
      rows.push(...keep);
      return { count };
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const r of rows) {
        if (!matches(r, where)) continue;
        r.commissionPercent = data.commissionPercent;
        count++;
      }
      return { count };
    },
    async create({ data }) {
      // Unique GLOBAL: NO incluye tenantId a propósito — así es el schema.
      const clash = rows.some(
        (r) => r.professionalId === data.professionalId && r.serviceId === data.serviceId,
      );
      if (clash) throw new UniqueViolation();
      rows.push({ ...data });
      return data;
    },
  };
}

// Fila del tenant A. El tenant B intentará escribirla pasando el par de A.
const rowA: Row = {
  tenantId: "tenant-a",
  professionalId: "prof-de-a",
  serviceId: "svc-de-a",
  commissionPercent: 30,
};
const scopeAjeno: CommissionOverrideScope = {
  tenantId: "tenant-b", // el atacante/bug corre bajo B…
  professionalId: "prof-de-a", // …pero manda el par de A por formData
  serviceId: "svc-de-a",
};

test("borrar con un tenantId ajeno no borra la fila del otro tenant", async () => {
  const store = fakeStore([{ ...rowA }]);

  const res = await clearCommissionOverride(store, scopeAjeno);

  assert.equal(res.count, 0, "no debe borrar ninguna fila");
  assert.deepEqual(store.rows, [rowA], "la fila del tenant A queda intacta");
});

test("guardar con un tenantId ajeno no pisa el porcentaje del otro tenant", async () => {
  const store = fakeStore([{ ...rowA }]);

  await assert.rejects(
    () => setCommissionOverride(store, scopeAjeno, 99),
    (e: Error) => e.message === CROSS_TENANT_COMMISSION_ERROR,
    "debe fallar cerrado, no escribir",
  );

  assert.deepEqual(store.rows, [rowA], "sigue en 30, y no se creó fila para B");
});

test("dentro del mismo tenant, borrar y guardar siguen funcionando", async () => {
  const propio: CommissionOverrideScope = {
    tenantId: "tenant-a",
    professionalId: "prof-de-a",
    serviceId: "svc-de-a",
  };

  const store = fakeStore([{ ...rowA }]);
  assert.equal(await setCommissionOverride(store, propio, 45), "updated");
  assert.equal(store.rows[0].commissionPercent, 45);

  assert.equal((await clearCommissionOverride(store, propio)).count, 1);
  assert.deepEqual(store.rows, []);

  assert.equal(await setCommissionOverride(store, propio, 20), "created");
  assert.deepEqual(store.rows, [{ ...propio, commissionPercent: 20 }]);
});

test("una carrera del mismo tenant no se confunde con un cruce de tenants", async () => {
  // El update inicial no matchea (todavía no hay fila) y entremedio otra escritura
  // del MISMO tenant inserta. El create choca con P2002 y el reintento debe cerrar
  // como update — no como error cross-tenant.
  const propio: CommissionOverrideScope = {
    tenantId: "tenant-a",
    professionalId: "prof-de-a",
    serviceId: "svc-de-a",
  };
  const store = fakeStore([]);
  const original = store.create.bind(store);
  let first = true;
  store.create = async (args) => {
    if (first) {
      first = false;
      store.rows.push({ ...propio, commissionPercent: 10 }); // la concurrente
    }
    return original(args);
  };

  assert.equal(await setCommissionOverride(store, propio, 55), "updated");
  assert.deepEqual(store.rows, [{ ...propio, commissionPercent: 55 }]);
});
