// Tests de la retención de AuditLog (ADR-026 · ADR-023 F8). Lógica pura + cliente
// mockeado (inyectado): no toca la DB. Corre con `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditRetentionCutoff,
  purgeAuditLogs,
  AUDIT_RETENTION_MONTHS,
} from "./audit-retention";

type PurgeClient = Parameters<typeof purgeAuditLogs>[0];

// Cliente mock mínimo: registra las llamadas y devuelve una cantidad fija. Se castea
// al tipo del delegate de Prisma (que la firma real deriva) — es un doble de test.
function makeMockClient(existing: number) {
  const calls = { count: 0, deleteMany: 0, lastWhere: undefined as unknown };
  const client = {
    auditLog: {
      count: async (args: { where: unknown }) => {
        calls.count++;
        calls.lastWhere = args.where;
        return existing;
      },
      deleteMany: async (args: { where: unknown }) => {
        calls.deleteMany++;
        calls.lastWhere = args.where;
        return { count: existing };
      },
    },
  } as unknown as PurgeClient;
  return { client, calls };
}

test("auditRetentionCutoff resta los meses pedidos respecto de `now`", () => {
  const now = new Date("2026-07-05T12:00:00.000Z");
  const cutoff = auditRetentionCutoff(12, now);
  // 12 meses antes = mismo mes/día, un año menos.
  assert.equal(cutoff.getUTCFullYear(), 2025);
  assert.equal(cutoff.getUTCMonth(), now.getUTCMonth());
  assert.equal(cutoff.getUTCDate(), now.getUTCDate());
});

test("auditRetentionCutoff usa AUDIT_RETENTION_MONTHS por default", () => {
  const now = new Date("2026-07-05T00:00:00.000Z");
  const cutoff = auditRetentionCutoff(undefined, now);
  const expected = new Date(now);
  expected.setMonth(expected.getMonth() - AUDIT_RETENTION_MONTHS);
  assert.equal(cutoff.getTime(), expected.getTime());
});

test("purgeAuditLogs por default es dry-run: cuenta y NO borra", async () => {
  const { client, calls } = makeMockClient(7);
  const res = await purgeAuditLogs(client);
  assert.equal(res.dryRun, true);
  assert.equal(res.affected, 7);
  assert.equal(calls.count, 1);
  assert.equal(calls.deleteMany, 0);
});

test("purgeAuditLogs con dryRun:false borra de verdad", async () => {
  const { client, calls } = makeMockClient(3);
  const res = await purgeAuditLogs(client, { dryRun: false });
  assert.equal(res.dryRun, false);
  assert.equal(res.affected, 3);
  assert.equal(calls.deleteMany, 1);
  assert.equal(calls.count, 0);
});

test("purgeAuditLogs filtra por un corte cercano a la ventana `months` pedida", async () => {
  const { client, calls } = makeMockClient(0);
  const antes = Date.now();
  await purgeAuditLogs(client, { months: 6 });
  const where = calls.lastWhere as { createdAt: { lt: Date } };
  const esperado = new Date(antes);
  esperado.setMonth(esperado.getMonth() - 6);
  // Tolerancia amplia por el tiempo entre `antes` y el `new Date()` interno.
  assert.ok(Math.abs(where.createdAt.lt.getTime() - esperado.getTime()) < 60_000);
});
