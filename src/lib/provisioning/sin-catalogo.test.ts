// ============================================================================
// ALTA SIN CATÁLOGO — un local que nace dentro de una red (Mis locales) no lleva el catálogo de
// ejemplo del rubro: nace vacío y recibe la lista de la casa. Sin esto, un local de MAGRA abierto
// desde el wizard nacía con "Vacío 20 kg, Lomo 14 kg…": stock fantasma a la venta.
//
// Se EJECUTA la cadena entera que decide: el mapeo del formulario (buildProvisionInput), el plan
// del preview (planProvision) y el committer real (adr019Committer → provisionTenant de ADR-019)
// contra una base falsa que anota cada escritura.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@/generated/prisma/client";
import { buildProvisionInput, type RawWizardForm } from "./console-input";
import { planProvision } from "./dry-run";
import { adr019Committer } from "./adapters";
import { EMPRESA_MODULE_IDS, InMemoryCollisionChecker } from "./stubs";
import type { PlanDeps } from "./ports";
import type { ProvisionPlan } from "./types";

const FORM: RawWizardForm = { slug: "magra-lomas", name: "MAGRA Lomas", rubro: "carniceria", ownerEmail: "lomas@magra.test" };

/**
 * Una base falsa: `$transaction(cb)` corre `cb` con un `tx` que anota `modelo.operación`. El
 * negocio ya existe (re-provisioning: no dispara el gate de RLS) y no tiene productos, así que
 * el catálogo de ejemplo se sembraría si nadie lo frena.
 */
function baseFalsa() {
  const llamadas: string[] = [];
  const modelo = (nombre: string) =>
    new Proxy(
      {},
      {
        get: (_, op) => async () => {
          llamadas.push(`${nombre}.${String(op)}`);
          if (op === "findUnique" || op === "upsert" || op === "create") return { id: `${nombre}-1` };
          if (op === "count") return 0;
          return null;
        },
      },
    );
  // `$executeRaw` es el `set_config` que para la transacción en el negocio (RLS): se anota con el id.
  const executeRaw = async (_: TemplateStringsArray, ...valores: unknown[]) => {
    llamadas.push(`guc:${String(valores[0])}`);
    return 1;
  };
  const tx = new Proxy({}, { get: (_, m) => (m === "$executeRaw" ? executeRaw : modelo(String(m))) });
  const prisma = { $transaction: async (cb: (t: unknown) => unknown) => cb(tx) } as unknown as PrismaClient;
  return { prisma, llamadas };
}

const PLAN = { blueprint: { id: "carniceria" }, modules: ["pos", "catalog"] } as unknown as ProvisionPlan;

test("el formulario: sólo `sinCatalogo: true` pide el alta sin catálogo", () => {
  assert.equal(buildProvisionInput({ ...FORM, sinCatalogo: true }, "commit").sinCatalogo, true);
  assert.equal(buildProvisionInput(FORM, "commit").sinCatalogo, false);
  // Un valor que no es el booleano (p. ej. un string manipulado) no lo activa.
  assert.equal(buildProvisionInput({ ...FORM, sinCatalogo: "true" as unknown as boolean }, "commit").sinCatalogo, false);
});

test("el committer real: con `sinCatalogo` no siembra ningún producto; sin él, siembra como siempre", async () => {
  const red = baseFalsa();
  const r = await adr019Committer(red.prisma).commit(buildProvisionInput({ ...FORM, sinCatalogo: true }, "commit"), PLAN);
  assert.equal(r.catalogSeeded, false);
  assert.deepEqual(
    red.llamadas.filter((l) => l.startsWith("product.")),
    [],
    "un local de una red nace sin productos de ejemplo",
  );

  const suelto = baseFalsa();
  const s = await adr019Committer(suelto.prisma).commit(buildProvisionInput(FORM, "commit"), PLAN);
  assert.equal(s.catalogSeeded, true, "un negocio suelto sigue naciendo con el catálogo de su rubro");
  assert.ok(suelto.llamadas.filter((l) => l === "product.create").length > 0);
});

test("el alta se para en el negocio apenas lo crea, antes de escribir el dueño y lo demás (RLS)", async () => {
  const b = baseFalsa();
  await adr019Committer(b.prisma).commit(buildProvisionInput(FORM, "commit"), PLAN);
  const upsert = b.llamadas.indexOf("tenant.upsert");
  const guc = b.llamadas.indexOf("guc:tenant-1");
  assert.ok(upsert >= 0 && guc === upsert + 1, `el set_config va justo después del alta del negocio: ${b.llamadas.join(", ")}`);
  const primeraDelNegocio = b.llamadas.findIndex((l) => /^(user|businessSettings|product|service)\./.test(l));
  assert.ok(primeraDelNegocio > guc, "nada del negocio se escribe ni se lee antes de pararse en él");
});

test("el preview no promete un catálogo que el alta no va a sembrar", async () => {
  const deps: PlanDeps = {
    resolveBlueprint: () => ({ id: "carniceria", label: "Carnicería", note: "explícito", matched: true }),
    baseModulesFor: () => ["pos", "catalog"],
    empresaModules: [...EMPRESA_MODULE_IDS],
    collisions: new InMemoryCollisionChecker(),
  };
  const red = await planProvision(buildProvisionInput({ ...FORM, sinCatalogo: true }, "dry-run"), deps);
  assert.deepEqual(red.objects.map((o) => o.kind), ["tenant", "owner", "settings"]);
  const suelto = await planProvision(buildProvisionInput(FORM, "dry-run"), deps);
  assert.deepEqual(suelto.objects.map((o) => o.kind), ["tenant", "owner", "settings", "catalog"]);
});
