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
import { Prisma } from "@/generated/prisma/client";
import { operatorPrisma } from "@/lib/operator-db";
import { requireOperator } from "@/lib/operator-session";
import {
  checkOperatorPassword,
  createOperatorToken,
  getOperatorCookieName,
} from "@/lib/operator-auth";
import { provisionTenant } from "../../scripts/provision-tenant";
import { resolveBlueprint, getBlueprint } from "@/blueprints";
import { suggestedAccentForBlueprint, isModuleId } from "@/lib/operator-config";
import { modulosBaseParaAlta } from "@/lib/provisioning/adapters";
import { requestIp } from "@/lib/audit";
import { loginRateLimiter, loginKey } from "@/lib/rate-limit";
import { cargarCredencialTenant } from "@/lib/fiscal/tenant-cert";
import { interpretarCuitInput } from "@/lib/fiscal/cuit-input";
import { operatorSetMustChange } from "@/lib/must-change-password";
import {
  resetOwnerPasswordCore,
  type OwnerResetPort,
  type OwnerResetResult,
} from "@/lib/owner-password-reset";

// --- Sesión de operador -------------------------------------------------------

export async function operatorLogin(formData: FormData) {
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/operador");

  // Rate limiting anti fuerza bruta (Célula 2): 5 fallos / 15 min por IP. El plano
  // de operador es cross-tenant (más sensible) → mismo freno que /admin.
  const key = loginKey("operator", (await requestIp()) ?? "unknown");
  if (loginRateLimiter.blocked(key)) {
    redirect(`/operador/login?error=throttled&next=${encodeURIComponent(next)}`);
  }

  if (!checkOperatorPassword(password)) {
    loginRateLimiter.fail(key);
    redirect(`/operador/login?error=1&next=${encodeURIComponent(next)}`);
  }
  loginRateLimiter.reset(key);
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

  // Módulos: los tildados en el form, o el set base del PRODUCTO que deriva del blueprint
  // si no se eligió nada (ADR-089: Comerciante nace con su núcleo de facturación, no con el
  // default de "generico" que traía "Agregar turno"; verticales caen al default legado).
  const picked = formData.getAll("modules").map(String).filter(isModuleId);
  const modules = picked.length > 0 ? picked : modulosBaseParaAlta(blueprintId);

  // Acento/tema: si el operador no eligió, cae al sugerido por el preset del rubro.
  const suggested = suggestedAccentForBlueprint(blueprintId);
  const effectiveAccent = accentPreset ?? suggested?.accent;
  const effectiveTheme = frontTheme ?? suggested?.theme;

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
      platform: { status, plan, subdomain, modules, accentPreset: effectiveAccent, frontTheme: effectiveTheme },
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

// --- CUIT del emisor por tenant (ADR-066) -------------------------------------
// Setea/limpia `Tenant.arcaCuit`. Va ANTES del certificado: el guard fail-closed
// compara el CUIT del subject del cert contra este valor (al cargar el cert y al
// firmar). Acción de operador, AUDITADA. Valida dígito verificador (no solo forma).
export async function setTenantArcaCuit(formData: FormData) {
  const op = await requireOperator();
  const tenantId = String(formData.get("tenantId") || "").trim();
  const raw = String(formData.get("arcaCuit") || "");

  const parsed = interpretarCuitInput(raw);
  if (parsed.accion === "error") {
    redirect(`/operador/tenants/${tenantId}?error=${encodeURIComponent(parsed.motivo)}`);
  }
  const nuevoCuit = parsed.accion === "set" ? parsed.cuit : null;

  // Coherencia con el guard: si ya hay un cert cargado de OTRO CUIT, ese cert queda
  // inservible (la firma lo va a rechazar). Se avisa en el mensaje, sin romper.
  let aviso = "";
  try {
    const cred = await operatorPrisma.tenantFiscalCredential.findUnique({
      where: { tenantId },
      select: { certCuit: true },
    });
    if (cred && nuevoCuit && cred.certCuit !== nuevoCuit) {
      aviso =
        ` — ojo: el certificado cargado es del CUIT ${cred.certCuit}. ` +
        `Volvé a cargar el cert de ${nuevoCuit} o no va a poder firmar.`;
    }
  } catch {
    // Tabla de credenciales todavía sin aplicar (Gate 2): no hay cert que chequear.
  }

  await operatorPrisma.tenant.update({ where: { id: tenantId }, data: { arcaCuit: nuevoCuit } });
  await operatorPrisma.auditLog.create({
    data: {
      tenantId,
      actor: `operator:${op}`,
      action: nuevoCuit ? "fiscal.cuit.set" : "fiscal.cuit.clear",
      entity: "Tenant",
      entityId: tenantId,
      changes: { arcaCuit: nuevoCuit },
    },
  });
  revalidatePath(`/operador/tenants/${tenantId}`);
  const msg = nuevoCuit ? `CUIT del emisor guardado (${nuevoCuit})${aviso}` : "CUIT del emisor borrado";
  redirect(`/operador/tenants/${tenantId}?ok=${encodeURIComponent(msg)}`);
}

// --- Credencial fiscal ARCA por tenant (ADR-066) ------------------------------
// Carga/rota el certificado del emisor, CIFRADO en reposo (envelope). Acción de
// operador, AUDITADA. El material lo pega el operador (nunca el agente); acá NUNCA se
// loguea ni se persiste en claro. Requiere la migración `TenantFiscalCredential`
// aplicada (Gate 2) y `FISCAL_MASTER_KEY` seteada.
export async function cargarCredencialFiscal(formData: FormData) {
  const op = await requireOperator();
  const tenantId = String(formData.get("tenantId") || "").trim();
  const certPem = String(formData.get("certPem") || "").trim();
  const keyPem = String(formData.get("keyPem") || "").trim();

  if (!tenantId || !certPem || !keyPem) {
    redirect(`/operador/tenants/${tenantId}?error=${encodeURIComponent("Pegá el certificado y la clave (PEM).")}`);
  }

  // El trabajo va en try/catch; el redirect de éxito queda AFUERA (redirect() lanza por
  // diseño y no debe caer en el catch de error).
  let mensajeOk: string;
  try {
    const r = await cargarCredencialTenant({ tenantId, certPem, keyPem, actor: `operator:${op}` });
    mensajeOk = `credencial fiscal ${r.rotada ? "rotada" : "cargada"} (CUIT ${r.certCuit})`;
  } catch (e) {
    redirect(`/operador/tenants/${tenantId}?error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  revalidatePath(`/operador/tenants/${tenantId}`);
  redirect(`/operador/tenants/${tenantId}?ok=${encodeURIComponent(mensajeOk)}`);
}

// --- Reset de contraseña del OWNER (revelado único) ---------------------------
// El dueño necesita entrar por primera vez al backoffice de un tenant y anotarse la
// contraseña. Esta acción:
//  1) genera una contraseña temporal fuerte (`generateStrongPassword`, alta entropía);
//  2) guarda SOLO el hash (`hashPassword`, mismo scrypt del login) — el claro NUNCA se
//     persiste, NUNCA se loguea, NUNCA se manda por email;
//  3) marca al OWNER para cambio forzado en el próximo ingreso (`mustChangePassword`);
//  4) audita quién/a-quién/cuándo, SIN el valor.
// Devuelve el claro UNA vez para que la ficha lo muestre con revelado único (BootstrapReveal):
// no va por la URL ni queda en ningún lado. Si se pierde, se resetea de nuevo.
// Guardada por `requireOperator()` como el resto del control-plane.
export async function resetOwnerPassword(tenantId: string): Promise<OwnerResetResult> {
  const op = await requireOperator();

  // PORT armado sobre el control-plane (operatorPrisma, cross-tenant / BYPASSRLS). El núcleo
  // (`resetOwnerPasswordCore`) es puro y no conoce Prisma → testeable con un doble en memoria.
  const port: OwnerResetPort = {
    findOwner: (tid) =>
      operatorPrisma.user.findFirst({
        where: { tenantId: tid, role: "OWNER", active: true, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true },
      }),
    setPasswordHash: async (userId, passwordHash) => {
      await operatorPrisma.user.update({ where: { id: userId }, data: { passwordHash } });
    },
    setMustChange: (userId, value) => operatorSetMustChange(operatorPrisma, userId, value),
    audit: async (entry) => {
      await operatorPrisma.auditLog.create({
        data: { ...entry, changes: entry.changes as Prisma.InputJsonValue },
      });
    },
  };

  const result = await resetOwnerPasswordCore(port, { tenantId, operatorSubject: op });
  if (result.ok) revalidatePath(`/operador/tenants/${tenantId}`);
  return result;
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
