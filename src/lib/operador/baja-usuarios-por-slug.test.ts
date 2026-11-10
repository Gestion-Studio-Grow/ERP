import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@/generated/prisma/client";
import { bajaDeUsuariosPorSlug, dominioDe } from "./baja-usuarios-por-slug";

type U = { id: string; tenantId: string; name: string; email: string; role: string; active: boolean; deletedAt: Date | null; createdAt: number };

function fakeDb(usuarios: U[], falla: { auditoriaN?: number } = {}) {
  const audits: { entityId: string; actor: string; action: string; entity?: string; tenantId?: string; channel?: string; changes?: unknown }[] = [];
  const raws: string[] = [];
  let enTx = false;
  const tx = {
    $executeRaw: async (s: TemplateStringsArray, ...v: unknown[]) => {
      raws.push(s.join("?") + JSON.stringify(v));
      return 1;
    },
    user: {
      findMany: async ({ where }: { where: { tenantId: string; id?: { in: string[] }; role?: string; active?: boolean; deletedAt?: null } }) =>
        usuarios
          .filter((u) => u.tenantId === where.tenantId)
          .filter((u) => !("deletedAt" in where) || u.deletedAt === null)
          .filter((u) => !where.id || where.id.in.includes(u.id))
          .filter((u) => where.role === undefined || u.role === where.role)
          .filter((u) => where.active === undefined || u.active === where.active)
          .sort((a, b) => a.createdAt - b.createdAt),
      count: async ({ where }: { where: { tenantId: string; role: string; active: boolean; deletedAt?: null } }) =>
        usuarios.filter(
          (u) => u.tenantId === where.tenantId && u.role === where.role && u.active === where.active && (!("deletedAt" in where) || u.deletedAt === null),
        ).length,
      updateMany: async ({ where, data }: { where: { id: string; tenantId: string; active: boolean }; data: { active: boolean } }) => {
        const m = usuarios.filter((u) => u.id === where.id && u.tenantId === where.tenantId && u.active === where.active);
        m.forEach((u) => (u.active = data.active));
        return { count: m.length };
      },
    },
    auditLog: {
      create: async ({ data }: { data: { entityId: string; actor: string; action: string; entity?: string; tenantId?: string; channel?: string; changes?: unknown } }) => {
        if (falla.auditoriaN !== undefined && audits.length === falla.auditoriaN) throw new Error("falla simulada");
        audits.push(data);
        return { id: `audit-${audits.length}` };
      },
    },
  };
  const db = {
    tenant: { findUnique: async ({ where }: { where: { slug: string } }) => (where.slug === "spa" ? { id: "t1" } : null) },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      enTx = true;
      const snapshot = usuarios.map((u) => ({ ...u }));
      const n = audits.length;
      try {
        return await fn(tx);
      } catch (e) {
        usuarios.splice(0, usuarios.length, ...snapshot);
        audits.splice(n);
        throw e;
      } finally {
        enTx = false;
      }
    },
  };
  return { db: db as unknown as PrismaClient, audits, raws, usuarios, enTx: () => enTx };
}

const base = (): U[] => [
  { id: "maca", tenantId: "t1", name: "Maca", email: "m@gmail.com", role: "OWNER", active: true, deletedAt: null, createdAt: 1 },
  { id: "romina", tenantId: "t1", name: "Romina", email: "r@gmail.com", role: "RECEPTION", active: true, deletedAt: null, createdAt: 2 },
  { id: "dup", tenantId: "t1", name: "Dup", email: "d@gmail.com", role: "OWNER", active: true, deletedAt: null, createdAt: 3 },
  { id: "otro", tenantId: "t2", name: "Otro", email: "o@x.com", role: "OWNER", active: true, deletedAt: null, createdAt: 4 },
];
const args = { slug: "spa", confirmacion: "spa", actor: "sistema:operador (OPS-T)" };

test("dry-run: muestra el plan y no escribe nada", async () => {
  const f = fakeDb(base());
  const r = await bajaDeUsuariosPorSlug(f.db, { ...args, ids: ["romina", "dup"], aplicar: false });
  assert.ok(r.ok && !r.aplicado);
  assert.deepEqual(r.filas.map((x) => [x.id, x.activoAntes, x.activoDespues, x.cambia]), [["romina", true, false, true], ["dup", true, false, true]]);
  assert.deepEqual(r.dueniosActivosDespues.map((d) => d.id), ["maca"]);
  assert.equal(r.dueniosActivosDespues[0].dominio, "gmail.com");
  assert.ok(f.usuarios.every((u) => u.active));
  assert.equal(f.audits.length, 0);
  assert.match(f.raws[1], /pg_advisory_xact_lock/);
  assert.match(f.raws[1], /usuarios:t1/);
});

test("aplicar: baja, audita deactivate con la firma del operador y es idempotente", async () => {
  const f = fakeDb(base());
  const r = await bajaDeUsuariosPorSlug(f.db, { ...args, ids: ["romina", "dup"], aplicar: true });
  assert.ok(r.ok && r.aplicado);
  assert.equal(f.usuarios.find((u) => u.id === "romina")!.active, false);
  assert.equal(f.usuarios.find((u) => u.id === "dup")!.active, false);
  assert.deepEqual(f.audits.map((a) => [a.entityId, a.action, a.actor]), [
    ["romina", "deactivate", "operator:sistema:operador (OPS-T)"],
    ["dup", "deactivate", "operator:sistema:operador (OPS-T)"],
  ]);
  assert.deepEqual(
    f.audits.map((a) => [a.tenantId, a.entity, a.channel, a.changes]),
    [["t1", "User", "admin", { active: false }], ["t1", "User", "admin", { active: false }]],
  );
  const r2 = await bajaDeUsuariosPorSlug(f.db, { ...args, ids: ["romina", "dup"], aplicar: true });
  assert.ok(r2.ok && r2.filas.every((x) => !x.cambia));
  assert.equal(f.audits.length, 2);
});

test("guarda de último dueño sobre el lote: no deja el negocio sin dueño y no escribe", async () => {
  const f = fakeDb(base());
  const r = await bajaDeUsuariosPorSlug(f.db, { ...args, ids: ["maca", "dup"], aplicar: true });
  assert.ok(!r.ok);
  assert.match(r.error, /sin dueño/);
  assert.ok(f.usuarios.every((u) => u.active));
  assert.equal(f.audits.length, 0);
});

test("un id de otro negocio frena todo sin escribir", async () => {
  const f = fakeDb(base());
  const r = await bajaDeUsuariosPorSlug(f.db, { ...args, ids: ["romina", "otro"], aplicar: true });
  assert.ok(!r.ok);
  assert.match(r.error, /otro/);
  assert.ok(f.usuarios.every((u) => u.active));
});

test("confirmación distinta del slug, sin actor o sin ids: no hace nada", async () => {
  const f = fakeDb(base());
  assert.equal((await bajaDeUsuariosPorSlug(f.db, { ...args, confirmacion: "otro", ids: ["romina"], aplicar: true })).ok, false);
  assert.equal((await bajaDeUsuariosPorSlug(f.db, { ...args, actor: " ", ids: ["romina"], aplicar: true })).ok, false);
  assert.equal((await bajaDeUsuariosPorSlug(f.db, { ...args, ids: [" "], aplicar: true })).ok, false);
  assert.equal((await bajaDeUsuariosPorSlug(f.db, { ...args, slug: "nada", confirmacion: "nada", ids: ["romina"], aplicar: true })).ok, false);
  assert.ok(f.usuarios.every((u) => u.active));
});

test("dominioDe no expone la parte local", () => {
  assert.equal(dominioDe("alguien@gmail.com"), "gmail.com");
  assert.equal(dominioDe("sin-arroba"), "(sin dominio)");
});

test("un dueño borrado (deletedAt) no cuenta como dueño que queda", async () => {
  const us = base();
  us.push({ id: "borrado", tenantId: "t1", name: "B", email: "b@gmail.com", role: "OWNER", active: true, deletedAt: new Date(), createdAt: 5 });
  const f = fakeDb(us);
  const r = await bajaDeUsuariosPorSlug(f.db, { ...args, ids: ["maca", "dup"], aplicar: true });
  assert.ok(!r.ok);
  assert.match(r.error, /sin dueño/);
  assert.equal(f.audits.length, 0);
});

test("una falla a mitad de camino deshace todo (sin escrituras parciales)", async () => {
  const f = fakeDb(base(), { auditoriaN: 1 });
  await assert.rejects(bajaDeUsuariosPorSlug(f.db, { ...args, ids: ["romina", "dup"], aplicar: true }));
  assert.ok(f.usuarios.every((u) => u.active));
  assert.equal(f.audits.length, 0);
});
