// ============================================================================
// TESTS de la capa CONSOLA de la fábrica de tenants (ADR-074 / RFC-003): el mapeo del formulario
// del wizard → `ProvisionTenantInput`, la clave de idempotencia, y el flujo dry-run → preview →
// commit idempotente ensamblado con STUBS (sin DB, sin efectos externos).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildProvisionInput,
  consoleIdempotencyKey,
  normalizeEdition,
  editionToProfile,
  suggestMonogram,
  type RawWizardForm,
} from "./console-input";
import { planProvision } from "./dry-run";
import { runTenantProvisioning } from "./provision";
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

// --- Fakes deterministas (mismo patrón que provisioning.test.ts, sin registry real) ---

function fakeResolveBlueprint(input: ProvisionTenantInput): BlueprintResolution {
  if (input.blueprint) return { id: input.blueprint, label: input.blueprint, note: "explícito", matched: true };
  if (input.rubro === "spa") return { id: "estetica", label: "Estética", note: "rubro→vertical", matched: true };
  return { id: "servicios", label: "Servicios", note: "default", matched: true };
}

function makePlanDeps(over: Partial<PlanDeps> = {}): PlanDeps {
  return {
    resolveBlueprint: fakeResolveBlueprint,
    baseModulesFor: (id) => (id === "estetica" ? ["agenda", "clients"] : ["catalog", "clients"]),
    empresaModules: [...EMPRESA_MODULE_IDS],
    collisions: new InMemoryCollisionChecker(),
    ...over,
  };
}

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

function fullForm(over: Partial<RawWizardForm> = {}): RawWizardForm {
  return {
    name: "Estética Norte",
    slug: "estetica-norte",
    ownerName: "Ana Ruiz",
    ownerEmail: "ana@estetica-norte.com",
    rubro: "spa",
    edicion: "empresa",
    accentPreset: "petroleo",
    frontTheme: "dark",
    monogram: "EN",
    subdomain: "estetica-norte",
    city: "Rosario",
    whatsapp: "+54 9 341 555",
    contactEmail: "hola@estetica-norte.com",
    ...over,
  };
}

// ====================== MAPEO DEL FORMULARIO ======================

test("buildProvisionInput: mapea todos los campos del wizard al contrato de la fábrica", () => {
  const input = buildProvisionInput(fullForm(), "dry-run");
  assert.equal(input.slug, "estetica-norte");
  assert.equal(input.name, "Estética Norte");
  assert.equal(input.rubro, "spa");
  assert.equal(input.edicion, "empresa");
  assert.equal(input.mode, "dry-run");
  assert.equal(input.admin.email, "ana@estetica-norte.com");
  assert.equal(input.admin.name, "Ana Ruiz");
  assert.equal(input.brandSheet?.accentPreset, "petroleo");
  assert.equal(input.brandSheet?.frontTheme, "dark");
  assert.equal(input.brandSheet?.subdomain, "estetica-norte");
  assert.equal(input.empresa?.city, "Rosario");
  assert.equal(input.empresa?.email, "hola@estetica-norte.com"); // contactEmail → empresa.email
  assert.equal(input.idempotencyKey, "console:estetica-norte");
});

test("buildProvisionInput: limpia vacíos a undefined y respeta el modo", () => {
  const input = buildProvisionInput({ name: "  X  ", slug: " x ", ownerEmail: "e@e.com" }, "commit");
  assert.equal(input.name, "X");
  assert.equal(input.slug, "x");
  assert.equal(input.mode, "commit");
  assert.equal(input.rubro, undefined);
  assert.equal(input.blueprint, undefined);
  assert.equal(input.brandSheet?.subdomain, undefined);
  assert.equal(input.empresa?.city, undefined);
});

test("buildProvisionInput: frontTheme sólo acepta light|dark, si no undefined", () => {
  assert.equal(buildProvisionInput(fullForm({ frontTheme: "light" }), "dry-run").brandSheet?.frontTheme, "light");
  assert.equal(buildProvisionInput(fullForm({ frontTheme: "raro" }), "dry-run").brandSheet?.frontTheme, undefined);
});

test("normalizeEdition: default comercio; sólo 'empresa' sube a empresa", () => {
  assert.equal(normalizeEdition(undefined), "comercio");
  assert.equal(normalizeEdition(""), "comercio");
  assert.equal(normalizeEdition("empresa"), "empresa");
  assert.equal(normalizeEdition("Empresa"), "comercio"); // exacto, no fuzzy
});

test("editionToProfile: comercio→lite, empresa→enterprise (RFC-003 P1)", () => {
  assert.equal(editionToProfile("comercio"), "lite");
  assert.equal(editionToProfile("empresa"), "enterprise");
});

test("consoleIdempotencyKey: determinística por slug, prefijo console:", () => {
  assert.equal(consoleIdempotencyKey("beauty-spa"), "console:beauty-spa");
  assert.equal(consoleIdempotencyKey(" beauty-spa "), "console:beauty-spa");
});

test("suggestMonogram: iniciales del nombre", () => {
  assert.equal(suggestMonogram("Estética Norte"), "EN");
  assert.equal(suggestMonogram("Magra"), "MA");
  assert.equal(suggestMonogram(""), "");
});

// ====================== FLUJO DRY-RUN → PREVIEW → COMMIT ======================

test("flujo consola: dry-run del form arma un plan.ok con el preview (blueprint + módulos)", async () => {
  const plan = await planProvision(buildProvisionInput(fullForm(), "dry-run"), makePlanDeps());
  assert.equal(plan.ok, true);
  assert.equal(plan.blueprint.id, "estetica");
  // Edición Empresa → módulos base + Empresa.
  for (const m of EMPRESA_MODULE_IDS) assert.ok(plan.modules.includes(m), `falta ${m}`);
  assert.ok(plan.objects.some((o) => o.kind === "owner"));
});

test("flujo consola: slug en uso → el preview marca colisión y el commit no procede", async () => {
  const deps = makeSagaDeps({ collisions: new InMemoryCollisionChecker(new Set(["estetica-norte"])) });
  const plan = await planProvision(buildProvisionInput(fullForm(), "dry-run"), deps);
  assert.equal(plan.ok, false);
  assert.ok(plan.collisions.some((c) => c.kind === "slug-taken"));
});

test("flujo consola: commit idempotente por idempotencyKey (doble submit del mismo slug)", async () => {
  const deps = makeSagaDeps();
  const first = await runTenantProvisioning(buildProvisionInput(fullForm(), "commit"), deps);
  const second = await runTenantProvisioning(buildProvisionInput(fullForm(), "commit"), deps);
  assert.equal(first.state, "ACTIVE");
  assert.deepEqual(second, first);
  assert.equal((deps.committer as EchoCommitter).commits.length, 1); // una sola escritura
});

test("flujo consola: commit devuelve el bootstrap sólo si el core generó password (no la trae el form)", async () => {
  const deps = makeSagaDeps();
  const out = await runTenantProvisioning(buildProvisionInput(fullForm(), "commit"), deps);
  // EchoCommitter genera bootstrap cuando el admin no trae password (el wizard no pide password).
  assert.equal(out.commit?.generatedPassword, "bootstrap-stub-pw");
});
