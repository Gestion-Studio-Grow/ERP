// Fábrica de tenants — MOTOR DE DRY-RUN (ADR-061).
//
// `planProvision(input, deps)` resuelve el blueprint, deriva los módulos de la edición,
// lista los objetos a crear, detecta colisiones de slug/host y advertencias de brand sheet
// — SIN escribir nada. Es el MISMO motor que alimenta la consola de operador (RFC-003 §3.1,
// preview en vivo) y el self-service futuro. El commit sólo procede si `plan.ok` (sin colisiones).

import type { ProvisionTenantInput, ProvisionPlan, PlannedObject, PlanCollision, PlanWarning } from "./types";
import type { PlanDeps } from "./ports";
import { isValidSlug, isValidHost, isValidEmail } from "./slug";

/** Acentos de branding conocidos (para advertir si el brand sheet pide uno raro). Fuente: `ACCENT_PRESET_IDS` en src/lib/operator-config.ts. */
const KNOWN_ACCENTS = new Set(["petroleo", "oxblood", "rosa", "celeste", "verde", "ambar"]);

/**
 * Arma el PLAN del alta sin tocar la base. Idempotente y puro (las consultas de colisión
 * van por el puerto `CollisionChecker`). No lanza por colisiones: las reporta en el plan.
 */
export async function planProvision(input: ProvisionTenantInput, deps: PlanDeps): Promise<ProvisionPlan> {
  const slug = (input.slug ?? "").trim();
  const name = (input.name ?? "").trim();
  const collisions: PlanCollision[] = [];
  const warnings: PlanWarning[] = [];

  // 1. Blueprint (resolución + cómo se decidió).
  const blueprint = deps.resolveBlueprint(input);

  // 2. Módulos de la edición: base del rubro + Empresa si corresponde (invariante enterprise ⊇ lite).
  const base = deps.baseModulesFor(blueprint.id);
  const modules =
    input.edicion === "empresa" ? Array.from(new Set([...base, ...deps.empresaModules])) : [...base];

  // 3. Validación de slug (no se auto-corrige: colisión bloqueante — ADR-019).
  if (!slug) {
    collisions.push({ kind: "slug-invalid", message: "Falta el slug." });
  } else if (!isValidSlug(slug)) {
    collisions.push({
      kind: "slug-invalid",
      message: `Slug inválido: "${slug}". Debe ser kebab-case URL-safe (minúsculas, dígitos, guiones).`,
    });
  } else if (await deps.collisions.slugTaken(slug)) {
    collisions.push({ kind: "slug-taken", message: `El slug "${slug}" ya está en uso.` });
  }

  // 4. Validación del email del admin.
  const email = (input.admin?.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    collisions.push({ kind: "email-invalid", message: `Email del dueño inválido: "${input.admin?.email ?? ""}".` });
  }

  // 5. Host/subdominio (opcional): si viene, se valida formato + unicidad.
  const subdomain = input.brandSheet?.subdomain?.trim();
  if (subdomain) {
    if (!isValidHost(subdomain)) {
      collisions.push({ kind: "host-invalid", message: `Subdominio inválido: "${subdomain}".` });
    } else if (await deps.collisions.hostTaken(subdomain)) {
      collisions.push({ kind: "host-taken", message: `El subdominio "${subdomain}" ya está en uso.` });
    }
  } else {
    warnings.push({ code: "no-subdomain", message: "Sin subdominio: el tenant no tendrá link propio hasta asignarlo." });
  }

  // 6. Advertencias de brand sheet (no bloquean).
  const accent = input.brandSheet?.accentPreset;
  if (accent && !KNOWN_ACCENTS.has(accent)) {
    warnings.push({ code: "unknown-accent", message: `Acento "${accent}" no está en los presets conocidos.` });
  }
  if (!input.brandSheet?.monogram && !name) {
    warnings.push({ code: "no-monogram", message: "Sin monograma ni nombre: el preview de marca quedará vacío." });
  }
  if (!blueprint.matched && (input.rubro || input.blueprint)) {
    warnings.push({
      code: "blueprint-fallback",
      message: `El rubro no matcheó un vertical propio → se usa el comodín "${blueprint.id}".`,
    });
  }

  // 7. Objetos que el alta crearía (para el preview del wizard).
  const objects: PlannedObject[] = [
    { kind: "tenant", label: "Tenant", detail: `${name || "(sin nombre)"} · /${slug || "(sin slug)"}` },
    { kind: "owner", label: "Usuario OWNER", detail: email || "(sin email)" },
    { kind: "settings", label: "BusinessSettings", detail: "branding/localización del negocio" },
    { kind: "catalog", label: "Catálogo del blueprint", detail: `sembrado por "${blueprint.id}" si el tenant está vacío` },
  ];

  return {
    slug,
    name,
    edicion: input.edicion,
    blueprint,
    modules,
    objects,
    collisions,
    warnings,
    ok: collisions.length === 0,
  };
}
