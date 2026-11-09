// GSG-MIA-004 · T1 — el taller de stands es un tenant aparte y no le cambia nada a nadie más.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@/generated/prisma/client";
import { defaultModulesForBlueprint } from "@/blueprints/presets-meta";
import { getBlueprint, resolveBlueprint } from "@/blueprints";
import { construirCatalogo } from "./catalog";
import { resolverActivacion } from "./activation";
import { tallerStandsEnabled } from "./flags";
import { appDelPanelCerrado } from "@/apps/visibles";
import { altaTallerAle, motivoFreno, SLUG_TALLER } from "../../scripts/taller-stands/alta-taller-ale";

test("beauty-spa (servicios) y mia-producciones (productora) conservan sus módulos por defecto", () => {
  assert.deepEqual(defaultModulesForBlueprint("servicios"), ["agenda", "catalog", "clients", "waitlist", "reminders", "reports", "commissions"]);
  assert.deepEqual(defaultModulesForBlueprint("productora"), ["proyectos", "clients", "reports", "arca"]);
});

test("el onboarding por texto libre no cae en el taller de stands: las frases de MIA siguen en productora", () => {
  for (const frase of ["productora de eventos", "stands", "armado de stands", "taller de stands", "arquitectura promocional"]) {
    assert.notEqual(resolveBlueprint(frase).blueprintId, "taller-stands", frase);
  }
  assert.equal(resolveBlueprint("productora de eventos").blueprintId, "productora");
});

test("el rubro taller-stands existe y su preset trae proyectos, stock y su módulo propio", () => {
  assert.equal(getBlueprint("taller-stands").id, "taller-stands");
  assert.deepEqual(defaultModulesForBlueprint("taller-stands"), ["proyectos", "clients", "catalog", "inventario", "reports", "arca", "taller-stands"]);
});

test("activación: el taller resuelve todo su preset; el módulo no entra en otro rubro", () => {
  const reg = construirCatalogo();
  const taller = resolverActivacion({ tenantId: "t", blueprintId: "taller-stands", modules: defaultModulesForBlueprint("taller-stands") }, reg);
  assert.deepEqual(taller.incompatibles, []);
  assert.deepEqual(taller.dependenciasFaltantes, []);
  assert.ok(taller.activos.some((d) => d.id === "taller-stands"));
  const mia = resolverActivacion({ tenantId: "m", blueprintId: "productora", modules: [...defaultModulesForBlueprint("productora"), "taller-stands"] }, reg);
  assert.ok(mia.incompatibles.some((r) => r.id === "taller-stands"));
});

test("el taller no hereda el panel cerrado de la productora", () => {
  const n = { blueprintId: "taller-stands", modulosAsignados: defaultModulesForBlueprint("taller-stands") } as unknown as Parameters<typeof appDelPanelCerrado>[0];
  assert.equal(appDelPanelCerrado(n), null);
});

test("interruptor TALLER_STANDS_ENABLED: apagado por defecto", () => {
  assert.equal(tallerStandsEnabled({}), false);
  assert.equal(tallerStandsEnabled({ TALLER_STANDS_ENABLED: "1" }), true);
});

test("alta: frena con el interruptor apagado, fuera de local y en Neon sin la rama nombrada", () => {
  const on = { TALLER_STANDS_ENABLED: "1" };
  assert.match(motivoFreno("postgresql://u@localhost:5433/db", undefined, {})!, /apagado/);
  assert.equal(motivoFreno("postgresql://u@localhost:5433/db", undefined, on), null);
  const neon = "postgresql://u@ep-rama-123-pooler.us-east-2.aws.neon.tech/db";
  assert.match(motivoFreno(neon, undefined, on)!, /rama-neon/);
  assert.match(motivoFreno(neon, "ep-otra-999", on)!, /no es el endpoint/);
  assert.equal(motivoFreno(neon, "ep-rama-123", on), null);
  assert.match(motivoFreno("postgresql://u@db.example.com/db", undefined, on)!, /no permitido/);
});

/** Base falsa: anota operaciones; `existe` simula un re-run. */
function baseFalsa(existe: boolean, rls = true) {
  const ops: string[] = [];
  const tx = {
    tenant: {
      findUnique: async () => (ops.push("findUnique"), existe ? { id: "t1", modules: ["x"] } : null),
      count: async () => (ops.push("count"), 3),
      create: async (a: { data: Record<string, unknown> }) => (ops.push(`create:${JSON.stringify(a.data)}`), { id: "nuevo" }),
    },
    user: { create: async () => (ops.push("user.create"), {}) },
    $queryRaw: async () => [{ relname: "Appointment", relrowsecurity: rls }, { relname: "Client", relrowsecurity: rls }],
  };
  const prisma = { $transaction: async (cb: (t: unknown) => unknown) => cb(tx) } as unknown as PrismaClient;
  return { prisma, ops };
}

test("alta idempotente y sin usuarios", async () => {
  const nueva = baseFalsa(false);
  const r = await altaTallerAle(nueva.prisma);
  assert.equal(r.creado, true);
  const create = nueva.ops.find((o) => o.startsWith("create:"))!;
  assert.match(create, new RegExp(`"slug":"${SLUG_TALLER}"`));
  assert.match(create, /"blueprintId":"taller-stands"/);
  assert.ok(!nueva.ops.includes("user.create"));

  const rerun = baseFalsa(true);
  const r2 = await altaTallerAle(rerun.prisma);
  assert.equal(r2.creado, false);
  assert.deepEqual(rerun.ops, ["findUnique"]);
});

test("alta: sin RLS activo no crea el tenant", async () => {
  await assert.rejects(altaTallerAle(baseFalsa(false, false).prisma), /ADR-018/);
});

// GSG-MIA-004 · T2 — el despiece no se le muestra a nadie más.
test("T2: servicios y productora no cambian y no ven el despiece aunque el interruptor esté prendido", async () => {
  const { tallerVisible } = await import("@/lib/taller-stands/core");
  assert.deepEqual(defaultModulesForBlueprint("servicios"), ["agenda", "catalog", "clients", "waitlist", "reminders", "reports", "commissions"]);
  assert.deepEqual(defaultModulesForBlueprint("productora"), ["proyectos", "clients", "reports", "arca"]);
  for (const blueprintId of ["servicios", "productora"]) {
    assert.equal(tallerVisible({ flag: true, modules: defaultModulesForBlueprint(blueprintId), blueprintId }), false, blueprintId);
    assert.equal(tallerVisible({ flag: true, modules: [...defaultModulesForBlueprint(blueprintId), "taller-stands"], blueprintId }), false, blueprintId);
  }
  assert.equal(tallerVisible({ flag: true, modules: defaultModulesForBlueprint("taller-stands"), blueprintId: "taller-stands" }), true);
  assert.equal(tallerVisible({ flag: false, modules: defaultModulesForBlueprint("taller-stands"), blueprintId: "taller-stands" }), false);
});
