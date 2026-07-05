"use server";

// Server Actions del PLANO DE OPERADOR (control-plane, ADR-021). Todas:
//  - corren sobre `operatorPrisma` (conexión separada, cross-tenant), NUNCA sobre el
//    prisma de la app del tenant ni por `getCurrentTenantId()` (que es fail-closed).
//  - están guardadas por `requireOperator()` (sesión de operador, plano separado).
// El alta envuelve el `provisionTenant` de ADR-019 (no reimplementa nada): la consola
// es "una envoltura del provisioning" (ADR-021 §3).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { operatorPrisma } from "@/lib/operator-db";
import { requireOperator } from "@/lib/operator-session";
import {
  checkOperatorPassword,
  createOperatorToken,
  getOperatorCookieName,
} from "@/lib/operator-auth";
import { provisionTenant } from "../../scripts/provision-tenant";
import { resolveBlueprint, getBlueprint } from "@/blueprints";
import { defaultModulesForBlueprint, isModuleId } from "@/lib/operator-config";

// --- Sesión de operador -------------------------------------------------------

export async function operatorLogin(formData: FormData) {
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/operador");
  if (!checkOperatorPassword(password)) {
    redirect(`/operador/login?error=1&next=${encodeURIComponent(next)}`);
  }
  const cookieStore = await cookies();
  cookieStore.set(getOperatorCookieName(), await createOperatorToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect(next.startsWith("/operador") ? next : "/operador");
}

export async function operatorLogout() {
  const cookieStore = await cookies();
  cookieStore.delete(getOperatorCookieName());
  redirect("/operador/login");
}

// --- Alta de tenant desde la consola (envuelve provisionTenant, ADR-019) -------

export async function provisionFromConsole(formData: FormData) {
  await requireOperator();

  const name = String(formData.get("name") || "").trim();
  const slug = String(formData.get("slug") || "").trim();
  const ownerName = String(formData.get("ownerName") || "").trim();
  const ownerEmail = String(formData.get("ownerEmail") || "").trim();
  const blueprintFlag = String(formData.get("blueprint") || "").trim();
  const rubro = String(formData.get("rubro") || "").trim();
  const plan = String(formData.get("plan") || "trial").trim();
  const status = String(formData.get("status") || "TRIAL").trim() as "TRIAL" | "ACTIVE" | "SUSPENDED";
  const accentPreset = String(formData.get("accentPreset") || "").trim() || undefined;
  const frontTheme = String(formData.get("frontTheme") || "").trim() || undefined;
  const subdomain = String(formData.get("subdomain") || "").trim() || undefined;

  // Resolución del vertical: --blueprint explícito › rubro (selector, cae al comodín)
  // › default. Es el mismo criterio que el CLI.
  let blueprintId: string;
  if (blueprintFlag) {
    blueprintId = getBlueprint(blueprintFlag).id;
  } else if (rubro) {
    blueprintId = resolveBlueprint(rubro).blueprintId;
  } else {
    blueprintId = "servicios";
  }

  // Módulos: los tildados en el form, o los default del blueprint si no se eligió nada.
  const picked = formData.getAll("modules").map(String).filter(isModuleId);
  const modules = picked.length > 0 ? picked : defaultModulesForBlueprint(blueprintId);

  const back = (q: string) => redirect(`/operador/alta?${q}`);

  if (!name || !slug || !ownerEmail) {
    back("error=" + encodeURIComponent("Faltan nombre, slug o email del dueño."));
  }

  let result;
  try {
    result = await provisionTenant(operatorPrisma, {
      name,
      slug,
      owner: { name: ownerName || undefined, email: ownerEmail },
      blueprint: blueprintId,
      branding: accentPreset ? { shortLabel: name } : undefined,
      platform: { status, plan, subdomain, modules, accentPreset, frontTheme },
    });
  } catch (e) {
    // Acá cae, entre otros, el GATE de RLS (ADR-018): crear el 2º tenant sin RLS
    // aborta con un error explícito. La consola lo muestra, no lo esconde.
    back("error=" + encodeURIComponent(e instanceof Error ? e.message : String(e)));
    return;
  }

  revalidatePath("/operador");
  // La contraseña de bootstrap se muestra UNA vez en la ficha del tenant (si se generó).
  const pw = result.generatedPassword ? `&bootstrap=${encodeURIComponent(result.generatedPassword)}` : "";
  redirect(`/operador/tenants/${result.tenantId}?created=1${pw}`);
}

// --- Configuración por tenant (control-plane) ---------------------------------

async function updateTenant(tenantId: string, data: Record<string, unknown>) {
  await requireOperator();
  await operatorPrisma.tenant.update({ where: { id: tenantId }, data });
  revalidatePath(`/operador/tenants/${tenantId}`);
  revalidatePath("/operador");
}

export async function setTenantStatus(formData: FormData) {
  const tenantId = String(formData.get("tenantId") || "");
  const status = String(formData.get("status") || "TRIAL") as "TRIAL" | "ACTIVE" | "SUSPENDED";
  await updateTenant(tenantId, { status });
  redirect(`/operador/tenants/${tenantId}?ok=estado`);
}

export async function setTenantPlan(formData: FormData) {
  const tenantId = String(formData.get("tenantId") || "");
  const plan = String(formData.get("plan") || "").trim() || null;
  await updateTenant(tenantId, { plan });
  redirect(`/operador/tenants/${tenantId}?ok=plan`);
}

export async function setTenantBranding(formData: FormData) {
  const tenantId = String(formData.get("tenantId") || "");
  const accentPreset = String(formData.get("accentPreset") || "").trim() || null;
  const frontTheme = String(formData.get("frontTheme") || "").trim() || null;
  await updateTenant(tenantId, { accentPreset, frontTheme });
  redirect(`/operador/tenants/${tenantId}?ok=branding`);
}

export async function setTenantSubdomain(formData: FormData) {
  const tenantId = String(formData.get("tenantId") || "");
  const subdomain = String(formData.get("subdomain") || "").trim() || null;
  // Subdominio único: si choca, devolvemos error legible en vez de romper.
  if (subdomain) {
    const clash = await operatorPrisma.tenant.findFirst({
      where: { subdomain, id: { not: tenantId } },
      select: { id: true },
    });
    if (clash) {
      redirect(`/operador/tenants/${tenantId}?error=${encodeURIComponent(`El subdominio "${subdomain}" ya está en uso.`)}`);
    }
  }
  await updateTenant(tenantId, { subdomain });
  redirect(`/operador/tenants/${tenantId}?ok=link`);
}

export async function toggleTenantModule(formData: FormData) {
  await requireOperator();
  const tenantId = String(formData.get("tenantId") || "");
  const moduleId = String(formData.get("module") || "");
  if (!isModuleId(moduleId)) redirect(`/operador/tenants/${tenantId}?error=modulo`);

  const tenant = await operatorPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { modules: true },
  });
  if (!tenant) redirect("/operador?error=notfound");

  const current = new Set(tenant!.modules);
  if (current.has(moduleId)) current.delete(moduleId);
  else current.add(moduleId);

  await operatorPrisma.tenant.update({
    where: { id: tenantId },
    data: { modules: Array.from(current) },
  });
  revalidatePath(`/operador/tenants/${tenantId}`);
  revalidatePath("/operador");
  redirect(`/operador/tenants/${tenantId}?ok=modulos`);
}
