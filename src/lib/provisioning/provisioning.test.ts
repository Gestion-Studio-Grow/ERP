// ============================================================================
// TESTS de la FÁBRICA DE TENANTS (ADR-061) — dry-run + saga (idempotencia/atomicidad).
// ============================================================================
//
// Cubre el motor de dry-run (resolución de blueprint, edición→módulos, colisiones, warnings)
// y la saga (transiciones, camino feliz, compensación ante fallo externo, idempotencia por
// idempotencyKey, y que un plan con colisiones no escribe). Todo con STUBS puros (stubs.ts):
// cero DB, cero efectos externos — la parte transaccional se prueba con el committer "echo".

import { test } from "node:test";
import assert from "node:assert/strict";

import { planProvision } from "./dry-run";
import { runTenantProvisioning, ProvisionBlockedError } from "./provision";
import {
  nextOnSuccess,
  canTransition,
  externalStepsCompletedAt,
  isTerminal,
} from "./state-machine";
import {
  EMPRESA_MODULE_IDS,
  InMemoryIdempotencyStore,
  InMemoryCollisionChecker,
  NoopHostBinder,
  NoopInviter,
  EchoCommitter,
} from "./stubs";
import type { PlanDeps, SagaDeps } from "./ports";
import type { ProvisionTenantInput, BlueprintResolution } from "./types";

// --- Fakes deterministas del PlanDeps (sin tocar el registry real de blueprints) ---

function fakeResolveBlueprint(input: ProvisionTenantInput): BlueprintResolution {
  if (input.blueprint) return { id: input.blueprint, label: input.blueprint, note: "explícito", matched: true };
  if (input.rubro === "rubro-raro") return { id: "generico", label: "Genérico", note: "comodín", matched: false };
  return { id: "servicios", label: "Servicios", note: "default", matched: true };
}

function makePlanDeps(overrides: Partial<PlanDeps> = {}): PlanDeps {
  return {
    resolveBlueprint: fakeResolveBlueprint,
    baseModulesFor: (id) => (id === "servicios" ? ["agenda", "clients", "catalog"] : ["catalog", "clients"]),
    empresaModules: [...EMPRESA_MODULE_IDS],
    collisions: new InMemoryCollisionChecker(),
    ...overrides,
  };
}

function baseInput(over: Partial<ProvisionTenantInput> = {}): ProvisionTenantInput {
  return {
    slug: "beauty-spa",
    name: "Beauty Spa",
    edicion: "comercio",
    admin: { name: "Ana", email: "ana@beauty.com" },
    mode: "dry-run",
    idempotencyKey: "key-1",
    brandSheet: { subdomain: "beautyspa", accentPreset: "petroleo" },
    ...over,
  };
}

// ====================== DRY-RUN ======================

test("dry-run: input válido → plan.ok, objetos listados, blueprint resuelto", async () => {
  const plan = await planProvision(baseInput(), makePlanDeps());
  assert.equal(plan.ok, true);
  assert.equal(plan.collisions.length, 0);
  assert.equal(plan.blueprint.id, "servicios");
  const kinds = plan.objects.map((o) => o.kind).sort();
  assert.deepEqual(kinds, ["catalog", "owner", "settings", "tenant"]);
});

test("dry-run: edición Empresa agrega los módulos Empresa (superset de Comercio)", async () => {
  const comercio = await planProvision(baseInput({ edicion: "comercio" }), makePlanDeps());
  const empresa = await planProvision(baseInput({ edicion: "empresa" }), makePlanDeps());
  // Invariante enterprise ⊇ lite: todo módulo de comercio está en empresa.
  for (const m of comercio.modules) assert.ok(empresa.modules.includes(m), `falta ${m}`);
  // Y empresa suma los 5 de ADR-060.
  for (const m of EMPRESA_MODULE_IDS) assert.ok(empresa.modules.includes(m), `empresa sin ${m}`);
  assert.ok(!comercio.modules.includes("cuentas-a-pagar"));
});

test("dry-run: slug ya en uso → colisión bloqueante, ok=false", async () => {
  const deps = makePlanDeps({ collisions: new InMemoryCollisionChecker(new Set(["beauty-spa"])) });
  const plan = await planProvision(baseInput(), deps);
  assert.equal(plan.ok, false);
  assert.ok(plan.collisions.some((c) => c.kind === "slug-taken"));
});

test("dry-run: slug inválido → colisión slug-invalid", async () => {
  const plan = await planProvision(baseInput({ slug: "Beauty Spa!" }), makePlanDeps());
  assert.equal(plan.ok, false);
  assert.ok(plan.collisions.some((c) => c.kind === "slug-invalid"));
});

test("dry-run: email inválido → colisión email-invalid", async () => {
  const plan = await planProvision(baseInput({ admin: { email: "no-es-mail" } }), makePlanDeps());
  assert.ok(plan.collisions.some((c) => c.kind === "email-invalid"));
});

test("dry-run: subdominio en uso → colisión host-taken", async () => {
  const deps = makePlanDeps({ collisions: new InMemoryCollisionChecker(new Set(), new Set(["beautyspa"])) });
  const plan = await planProvision(baseInput(), deps);
  assert.ok(plan.collisions.some((c) => c.kind === "host-taken"));
});

test("dry-run: acento desconocido → warning (no bloquea)", async () => {
  const plan = await planProvision(baseInput({ brandSheet: { subdomain: "x", accentPreset: "fucsia-neon" } }), makePlanDeps());
  assert.equal(plan.ok, true);
  assert.ok(plan.warnings.some((w) => w.code === "unknown-accent"));
});

test("dry-run: sin subdominio → warning no-subdomain", async () => {
  const plan = await planProvision(baseInput({ brandSheet: {} }), makePlanDeps());
  assert.ok(plan.warnings.some((w) => w.code === "no-subdomain"));
});

test("dry-run: rubro sin vertical propio → warning blueprint-fallback + matched=false", async () => {
  const plan = await planProvision(baseInput({ blueprint: undefined, rubro: "rubro-raro" }), makePlanDeps());
  assert.equal(plan.blueprint.matched, false);
  assert.ok(plan.warnings.some((w) => w.code === "blueprint-fallback"));
});

// ====================== MÁQUINA DE ESTADOS ======================

test("state-machine: camino feliz avanza en orden y ACTIVE es terminal", () => {
  assert.equal(nextOnSuccess("PENDING"), "DB_COMMITTED");
  assert.equal(nextOnSuccess("DB_COMMITTED"), "HOST_BOUND");
  assert.equal(nextOnSuccess("HOST_BOUND"), "INVITED");
  assert.equal(nextOnSuccess("INVITED"), "ACTIVE");
  assert.equal(nextOnSuccess("ACTIVE"), null);
  assert.ok(isTerminal("ACTIVE"));
  assert.ok(isTerminal("FAILED_COMPENSATED"));
});

test("state-machine: FAILED_COMPENSATED sólo desde estados externos (no desde PENDING)", () => {
  assert.equal(canTransition("DB_COMMITTED", "FAILED_COMPENSATED"), true);
  assert.equal(canTransition("HOST_BOUND", "FAILED_COMPENSATED"), true);
  assert.equal(canTransition("INVITED", "FAILED_COMPENSATED"), true);
  // Desde PENDING no: si el commit falla, no hubo saga que compensar.
  assert.equal(canTransition("PENDING", "FAILED_COMPENSATED"), false);
  // Saltos inválidos.
  assert.equal(canTransition("PENDING", "HOST_BOUND"), false);
});

test("state-machine: pasos externos completados por estado (para compensar en inverso)", () => {
  assert.deepEqual(externalStepsCompletedAt("DB_COMMITTED"), []);
  assert.deepEqual(externalStepsCompletedAt("HOST_BOUND"), ["host"]);
  assert.deepEqual(externalStepsCompletedAt("INVITED"), ["host", "invite"]);
  assert.deepEqual(externalStepsCompletedAt("ACTIVE"), ["host", "invite"]);
});

// ====================== SAGA ======================

function makeSagaDeps(over: Partial<SagaDeps> = {}): SagaDeps {
  return {
    ...makePlanDeps(),
    committer: new EchoCommitter(),
    host: new NoopHostBinder(),
    inviter: new NoopInviter(),
    idempotency: new InMemoryIdempotencyStore(),
    ...over,
  };
}

test("saga: mode dry-run devuelve el plan sin commit ni efectos, y no cachea", async () => {
  const deps = makeSagaDeps();
  const out = await runTenantProvisioning(baseInput({ mode: "dry-run" }), deps);
  assert.equal(out.state, "PENDING");
  assert.equal(out.commit, undefined);
  assert.equal((deps.committer as EchoCommitter).commits.length, 0);
  assert.equal((deps.host as NoopHostBinder).bound.length, 0);
  // No se cacheó (una consulta, no una ejecución).
  assert.equal(await deps.idempotency.get("key-1"), undefined);
});

test("saga: commit camino feliz → ACTIVE con host ligado, invitado y commit presente", async () => {
  const deps = makeSagaDeps();
  const out = await runTenantProvisioning(baseInput({ mode: "commit" }), deps);
  assert.equal(out.state, "ACTIVE");
  assert.ok(out.commit);
  assert.equal(out.commit!.tenantId, "tenant_beauty-spa");
  assert.equal(out.host!.bound, true);
  assert.equal(out.invited!.sent, true);
  assert.deepEqual((deps.host as NoopHostBinder).bound, ["beautyspa"]);
  assert.deepEqual((deps.inviter as NoopInviter).invited, ["ana@beauty.com"]);
});

test("saga: sin subdominio → host.bound=false pero igual llega a ACTIVE", async () => {
  const deps = makeSagaDeps();
  const out = await runTenantProvisioning(baseInput({ mode: "commit", brandSheet: {} }), deps);
  assert.equal(out.state, "ACTIVE");
  assert.equal(out.host!.bound, false);
  assert.equal((deps.host as NoopHostBinder).bound.length, 0);
});

test("saga: commit sobre plan con colisiones → ProvisionBlockedError, no escribe", async () => {
  const deps = makeSagaDeps({ collisions: new InMemoryCollisionChecker(new Set(["beauty-spa"])) });
  await assert.rejects(
    () => runTenantProvisioning(baseInput({ mode: "commit" }), deps),
    ProvisionBlockedError,
  );
  assert.equal((deps.committer as EchoCommitter).commits.length, 0);
});

test("saga: idempotencia por idempotencyKey → 2ª llamada devuelve el cacheado, no re-commitea", async () => {
  const deps = makeSagaDeps();
  const first = await runTenantProvisioning(baseInput({ mode: "commit" }), deps);
  const second = await runTenantProvisioning(baseInput({ mode: "commit" }), deps);
  assert.equal((deps.committer as EchoCommitter).commits.length, 1); // sólo una vez
  assert.deepEqual(second, first); // mismo outcome
});

test("saga: fallo al invitar → FAILED_COMPENSATED, host des-ligado (compensación), tenant NO borrado", async () => {
  const deps = makeSagaDeps({ inviter: new NoopInviter(true) });
  const out = await runTenantProvisioning(baseInput({ mode: "commit" }), deps);
  assert.equal(out.state, "FAILED_COMPENSATED");
  assert.equal(out.failure!.atState, "HOST_BOUND");
  assert.ok(out.failure!.compensated.includes("unbind-host"));
  // El host que se había ligado se compensó.
  assert.deepEqual((deps.host as NoopHostBinder).unbound, ["beautyspa"]);
  // El commit de DB sigue presente (aditivo/idempotente, NO se borra).
  assert.ok(out.commit);
});

test("saga: fallo del commit transaccional → propaga y no compensa (no hubo saga)", async () => {
  const deps = makeSagaDeps({ committer: new EchoCommitter({ failOnCommit: true }) });
  await assert.rejects(() => runTenantProvisioning(baseInput({ mode: "commit" }), deps), /commit falló/);
  assert.equal((deps.host as NoopHostBinder).bound.length, 0);
  assert.equal((deps.host as NoopHostBinder).unbound.length, 0);
});
