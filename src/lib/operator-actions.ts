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
import { requestIp } from "@/lib/audit-core";
import { loginRateLimiter, loginKey } from "@/lib/rate-limit";
import { cargarCredencialTenant } from "@/lib/fiscal/tenant-cert";
import { interpretarCuitInput } from "@/lib/fiscal/cuit-input";
import { operatorSetMustChange } from "@/lib/must-change-password";
import {
  resetOwnerPasswordCore,
  type OwnerResetPort,
  type OwnerResetResult,
  type OwnerResetRow,
} from "@/lib/owner-password-reset";
import { catalogo } from "@/modules/catalog";
import {
  mismoConjunto,
  planFijarAsignacion,
  validarCambio,
} from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import {
  choqueDePuntoDeVenta,
  motivoDeChoque,
  puntosDeVentaUsados,
  type NegocioFiscal,
} from "@/app/operador/(console)/tenants/[id]/candado-punto-venta";
import { flagsDeApps, leerNegocioParaActivar } from "@/app/operador/(console)/tenants/[id]/negocio.server";

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
  // C-2 · La contraseña de bootstrap YA NO viaja por la URL. Iba en el query string
  // (`&bootstrap=<clave en claro>`), así que quedaba en el historial del navegador, en
  // los access-logs de Vercel/CDN y en cualquier proxy intermedio — un secreto de alta
  // (el OWNER del tenant) registrado en tres lugares que nadie audita.
  //
  // Esta acción es LEGACY y ya no tiene llamadores: la superó el wizard, que entrega la
  // clave fuera de la URL. Se corrige igual en vez de dejarla como trampa para el
  // próximo que la conecte. Si vuelve a hacer falta mostrarla, se entrega por el valor
  // de retorno del action, como hace el reset de contraseña.
  redirect(`/operador/tenants/${result.tenantId}?created=1`);
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

// --- Candado: un CUIT no repite punto de venta entre negocios ------------------
// La regla vive pura en candado-punto-venta.ts. Acá está lo que no se puede testear sin base:
// leer a los otros negocios del CUIT y serializar a dos operadores que guardan a la vez.
// Sin el índice UNIQUE(arcaCuit, arcaPuntoVenta), que necesita migración, dos transacciones
// podrían leer "libre" las dos y escribir el mismo número. El lock de Postgres por CUIT
// (`pg_advisory_xact_lock`, se suelta solo al terminar la transacción) hace que la segunda
// espere a la primera y lea lo que ésta escribió (medido en Postgres local: la segunda espera
// y termina rechazada). Con el pooler de Neon en modo transacción debería comportarse igual,
// porque el lock vive y muere dentro de la transacción; eso no está medido contra Neon.

type Tx = Prisma.TransactionClient;

async function bloquearCuit(tx: Tx, cuit: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`arca-punto-venta:${cuit}`}))`;
}

/** El motivo del rechazo si otro negocio ya usa este CUIT con este punto de venta, o null. */
async function buscarChoque(
  tx: Tx,
  tenantId: string,
  cuit: string | null,
  puntoVenta: number | null,
): Promise<string | null> {
  if (!cuit || !puntoVenta) return null;
  const otros: NegocioFiscal[] = await tx.tenant.findMany({
    where: { arcaCuit: cuit, id: { not: tenantId } },
    select: { id: true, name: true, slug: true, arcaCuit: true, arcaPuntoVenta: true },
  });
  const otro = choqueDePuntoDeVenta({ tenantId, cuit, puntoVenta }, otros);
  return otro ? motivoDeChoque(cuit, puntoVenta, otro, puntosDeVentaUsados(tenantId, cuit, otros)) : null;
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

  // Candado fiscal: si el negocio ya tiene punto de venta, el CUIT nuevo no puede traer un
  // talonario que otro negocio ya numera. Lectura, chequeo y escritura en una transacción con
  // el lock del CUIT (`bloquearCuit`).
  const r = await operatorPrisma.$transaction(async (tx) => {
    if (nuevoCuit) await bloquearCuit(tx, nuevoCuit);
    const propio = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { arcaCuit: true, arcaPuntoVenta: true },
    });
    if (!propio) return { tipo: "no-existe" as const };
    const choque = await buscarChoque(tx, tenantId, nuevoCuit, propio.arcaPuntoVenta);
    if (choque) return { tipo: "choque" as const, motivo: choque };

    await tx.tenant.update({ where: { id: tenantId }, data: { arcaCuit: nuevoCuit } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actor: `operator:${op}`,
        action: nuevoCuit ? "fiscal.cuit.set" : "fiscal.cuit.clear",
        entity: "Tenant",
        entityId: tenantId,
        changes: { arcaCuit: nuevoCuit, antes: propio.arcaCuit },
      },
    });
    return { tipo: "ok" as const };
  });
  if (r.tipo === "no-existe") redirect("/operador?error=notfound");
  if (r.tipo === "choque") {
    redirect(`/operador/tenants/${tenantId}?error=${encodeURIComponent(r.motivo)}`);
  }

  revalidatePath(`/operador/tenants/${tenantId}`);
  const msg = nuevoCuit ? `CUIT del emisor guardado (${nuevoCuit})${aviso}` : "CUIT del emisor borrado";
  redirect(`/operador/tenants/${tenantId}?ok=${encodeURIComponent(msg)}`);
}

// --- Punto de venta de ARCA por tenant ----------------------------------------
// `Tenant.arcaPuntoVenta` (schema.prisma:246) EXISTE desde siempre y hasta hoy no tenía UI en
// ningún lado: se seteaba por SQL a mano. Eso lo hacía el paso que más se olvida de una apertura,
// y el más caro: `construirPerfilFiscal` LANZA sin punto de venta (src/lib/fiscal.ts:178-186) y la
// emisión corre best-effort dentro de un try/catch → el local cobra, la factura no sale, y se
// descubre a fin de mes. Va acá, al lado del CUIT, porque son el mismo trámite.
// Auditada, como el resto de las escrituras fiscales del control-plane.
export async function setTenantArcaPuntoVenta(formData: FormData) {
  const op = await requireOperator();
  const tenantId = String(formData.get("tenantId") || "").trim();
  const raw = String(formData.get("arcaPuntoVenta") || "").trim();

  let punto: number | null = null;
  if (raw !== "") {
    // Sólo dígitos: ARCA numera los puntos de venta de 1 a 99999 (5 dígitos en el CAE).
    if (!/^\d{1,5}$/.test(raw)) {
      redirect(
        `/operador/tenants/${tenantId}?error=${encodeURIComponent(
          `"${raw}" no es un punto de venta válido: va un número entero de 1 a 99999 (el que ARCA habilitó para este CUIT).`,
        )}`,
      );
    }
    punto = Number(raw);
    if (punto <= 0) {
      redirect(
        `/operador/tenants/${tenantId}?error=${encodeURIComponent("El punto de venta tiene que ser mayor que cero.")}`,
      );
    }
  }

  // Candado fiscal: el mismo CUIT no puede repetir punto de venta en otro negocio. Se lee el
  // CUIT del negocio, se toma su lock y recién ahí se mira a los demás y se escribe.
  const r = await operatorPrisma.$transaction(async (tx) => {
    const antes = await tx.tenant.findUnique({ where: { id: tenantId }, select: { arcaCuit: true } });
    if (!antes) return { tipo: "no-existe" as const };
    if (punto && antes.arcaCuit) await bloquearCuit(tx, antes.arcaCuit);
    // Se relee con el lock tomado: el CUIT pudo cambiar en el medio.
    const propio = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { arcaCuit: true, arcaPuntoVenta: true },
    });
    if (!propio) return { tipo: "no-existe" as const };
    if (propio.arcaCuit !== antes.arcaCuit) return { tipo: "cambio" as const };
    const choque = await buscarChoque(tx, tenantId, propio.arcaCuit, punto);
    if (choque) return { tipo: "choque" as const, motivo: choque };

    await tx.tenant.update({ where: { id: tenantId }, data: { arcaPuntoVenta: punto } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actor: `operator:${op}`,
        action: punto ? "fiscal.puntoVenta.set" : "fiscal.puntoVenta.clear",
        entity: "Tenant",
        entityId: tenantId,
        changes: { arcaPuntoVenta: punto, antes: propio.arcaPuntoVenta, arcaCuit: propio.arcaCuit },
      },
    });
    return { tipo: "ok" as const };
  });
  if (r.tipo === "no-existe") redirect("/operador?error=notfound");
  if (r.tipo === "cambio") {
    redirect(
      `/operador/tenants/${tenantId}?error=${encodeURIComponent(
        "El CUIT de este negocio cambió mientras editabas. No se guardó nada: revisá los datos de ahora y cargá el punto de venta de nuevo.",
      )}`,
    );
  }
  if (r.tipo === "choque") {
    redirect(`/operador/tenants/${tenantId}?error=${encodeURIComponent(r.motivo)}`);
  }

  revalidatePath(`/operador/tenants/${tenantId}`);
  const msg = punto ? `Punto de venta guardado (${punto})` : "Punto de venta borrado";
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
// PORT armado sobre el control-plane (operatorPrisma, cross-tenant / BYPASSRLS). El núcleo
// (`resetOwnerPasswordCore`) es puro y no conoce Prisma → testeable con un doble en memoria.
function operatorResetPort(): OwnerResetPort {
  return {
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
}

export async function resetOwnerPassword(tenantId: string): Promise<OwnerResetResult> {
  const op = await requireOperator();
  const result = await resetOwnerPasswordCore(operatorResetPort(), { tenantId, operatorSubject: op });
  if (result.ok) revalidatePath(`/operador/tenants/${tenantId}`);
  return result;
}

// --- Reset de OWNER: por qué YA NO existe la versión masiva --------------------
//
// Esta acción hacía `tenant.findMany()` SIN FILTRO y le cambiaba la contraseña al OWNER de
// TODOS los tenants de la plataforma, detrás de un solo click de confirmación. Su comentario
// decía que se podía porque "ninguno tiene un cliente real usándolo hoy": ESO ERA FALSO.
// `beauty-spa` (CH Estética) está VIVO en producción y su dueña entra con esa contraseña. Un
// click dejaba a una clienta real afuera de su propio sistema, sin forma de volver atrás: el
// hash anterior se pisa y la temporal se muestra UNA sola vez en pantalla — si el operador
// cierra la pestaña, la recuperación es otro reset y una llamada incómoda.
//
// Agravante: el "cambio forzado en el próximo ingreso" que la pantalla promete NO funciona hoy.
// La columna `mustChangePassword` no está aplicada en la base (Gate 2), así que `setMustChange`
// devuelve `persisted:false` y la temporal queda válida para siempre. O sea: el disparo masivo
// no sólo saca a la dueña — deja N contraseñas temporales vivas en un papel.
//
// Se neutraliza en vez de borrarse porque su llamador (la tarjeta de la consola) no es de este
// frente: manteniendo la firma, el botón sigue compilando pero ya no puede hacer daño, y el
// operador lee en pantalla qué hacer en su lugar. El reemplazo es `resetOwnerPasswordDeTenant`:
// uno por vez, tipeando el slug del tenant.
export async function resetAllOwnerPasswords(): Promise<
  { ok: true; rows: OwnerResetRow[] } | { ok: false; error: string }
> {
  await requireOperator();
  return {
    ok: false,
    error:
      "El reset MASIVO está deshabilitado a propósito. Reseteaba la contraseña del OWNER de " +
      "TODOS los tenants de una vez, incluida CH Estética, que está viva en producción: un " +
      "click dejaba a la dueña afuera de su sistema. Hacelo de a uno, desde la ficha del " +
      "tenant (Tenants → el local → Contraseña del OWNER), tipeando su slug para confirmar.",
  };
}

// Reset del OWNER de UN tenant, confirmado tipeando su slug exacto. El slug es el nombre que el
// operador está viendo en pantalla: obliga a mirar A QUIÉN le está cambiando la contraseña, que
// es justo el paso que el botón masivo se salteaba. Devuelve la temporal UNA vez (sólo en el
// retorno: nunca se persiste en claro, nunca se loguea, no va por la URL) y queda auditado.
export async function resetOwnerPasswordDeTenant(
  tenantId: string,
  slugTipeado: string,
): Promise<OwnerResetResult> {
  const op = await requireOperator();

  const tenant = await operatorPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, name: true },
  });
  if (!tenant) return { ok: false, error: "Ese tenant no existe." };

  // Comparación exacta salvo espacios/mayúsculas: el slug ya es minúscula-y-guiones por
  // construcción, y pedir precisión tipográfica sólo genera reintentos, no seguridad.
  if (slugTipeado.trim().toLowerCase() !== tenant.slug.trim().toLowerCase()) {
    return {
      ok: false,
      error: `Para confirmar, escribí exactamente el slug del tenant ("${tenant.slug}").`,
    };
  }

  const result = await resetOwnerPasswordCore(operatorResetPort(), { tenantId, operatorSubject: op });
  if (result.ok) {
    revalidatePath(`/operador/tenants/${tenantId}`);
    revalidatePath("/operador");
  }
  return result;
}

// --- Módulos del negocio: activación validada, condicional y auditada ------------------
// `Tenant.modules` decide qué apps ve un negocio del Inicio por apps (APPS_INICIO) y, en el
// Comerciante, ya decide su menú. Hasta la ola 1 esta action escribía el arreglo crudo: sin
// validar dependencias ni rubro, sin auditoría, y dos pestañas se pisaban (la segunda borraba
// lo de la primera sin enterarse). Ahora:
//   1. el formulario trae la asignación que el operador VIO en la vista previa (`vistos`); si
//      la base ya no es esa, se rechaza con "cambió mientras editabas" y no se escribe nada;
//   2. el plan sale de `validarCambio` (planActivar / planDesactivar, más los candados de la
//      consola: CH sin el OK del dueño, cartera y multilocal juntos);
//   3. la escritura es condicional sobre el arreglo leído (`modules: { equals }`): si otro la
//      cambió entre la lectura y acá, no pisa;
//   4. escritura y auditoría (antes y después) van en la misma transacción: no hay cambio
//      de módulos sin su rastro.

const CAMBIO_MIENTRAS_EDITABAS =
  "El negocio cambió mientras editabas: otra pestaña u otra persona le cambió los módulos. " +
  "No se guardó nada. Revisá la vista previa con los datos de ahora y confirmá de nuevo.";

/** Vuelve a la tarjeta de apps de la ficha con el mensaje (y la vista previa abierta, si hay). */
function volverAApps(tenantId: string, q: Record<string, string>): never {
  redirect(`/operador/tenants/${tenantId}?${new URLSearchParams(q).toString()}#apps`);
}

/** La asignación que el operador vio al armar la vista previa, o `null` si el campo no es válido. */
function leerVistos(valor: FormDataEntryValue | null): string[] | null {
  try {
    const v: unknown = JSON.parse(String(valor ?? ""));
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : null;
  } catch {
    return null;
  }
}

/**
 * Escribe la asignación nueva SÓLO si la base sigue teniendo la que se leyó, y deja la
 * auditoría en la misma transacción. `false` = alguien la cambió en el medio.
 */
async function escribirModulosAuditado(
  tenantId: string,
  leidos: string[],
  nuevos: string[],
  audit: { actor: string; action: string; changes: Prisma.InputJsonValue },
): Promise<boolean> {
  return operatorPrisma.$transaction(async (tx) => {
    const r = await tx.tenant.updateMany({
      where: { id: tenantId, modules: { equals: leidos } },
      data: { modules: nuevos },
    });
    if (r.count !== 1) return false;
    await tx.auditLog.create({
      data: { tenantId, entity: "Tenant", entityId: tenantId, ...audit },
    });
    return true;
  });
}

function nombresDeModulos(ids: readonly string[]): string {
  const cat = catalogo();
  return ids.map((id) => `“${cat.buscar(id)?.nombre ?? id}”`).join(", ");
}

export async function toggleTenantModule(formData: FormData) {
  const op = await requireOperator();
  const tenantId = String(formData.get("tenantId") || "").trim();
  const modulo = String(formData.get("module") || "").trim();
  const accion = String(formData.get("accion") || "").trim();
  const vistos = leerVistos(formData.get("vistos"));

  if (!isModuleId(modulo) || (accion !== "activar" && accion !== "desactivar") || vistos === null) {
    volverAApps(tenantId, { error: "El pedido llegó incompleto. Recargá la ficha y probá de nuevo." });
  }

  const tenant = await operatorPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, blueprintId: true, modules: true },
  });
  if (!tenant) redirect("/operador?error=notfound");

  if (!mismoConjunto(tenant.modules, vistos)) {
    volverAApps(tenantId, { modulo, error: CAMBIO_MIENTRAS_EDITABAS });
  }

  // Se vuelve a decidir con la base fresca: que el botón estuviera habilitado no prueba nada.
  const plan = validarCambio(tenant, { accion, modulo }, catalogo());
  if (!plan.ok) volverAApps(tenantId, { modulo, error: plan.motivo });
  const nombre = nombresDeModulos([modulo]);
  if (plan.sinCambios) {
    volverAApps(tenantId, { ok: `No había nada que cambiar: ${nombre} ya estaba ${accion === "activar" ? "activo" : "apagado"}.` });
  }

  const guardado = await escribirModulosAuditado(tenantId, tenant.modules, plan.despues, {
    actor: `operator:${op}`,
    action: accion === "activar" ? "module.activate" : "module.deactivate",
    changes: { modulo, accion, incluidos: plan.incluidos, antes: tenant.modules, despues: plan.despues },
  });
  if (!guardado) volverAApps(tenantId, { modulo, error: CAMBIO_MIENTRAS_EDITABAS });

  revalidatePath(`/operador/tenants/${tenantId}`);
  revalidatePath("/operador");
  const extra = plan.incluidos.length > 0 ? ` Se activó también: ${nombresDeModulos(plan.incluidos)}.` : "";
  volverAApps(tenantId, { ok: `${accion === "activar" ? "Activaste" : "Apagaste"} ${nombre}.${extra}` });
}

// "Fijar asignación actual": suma los módulos mínimos para que, con el Inicio por apps
// prendido, el negocio vea las apps de su menú de siempre. Es el paso previo a sumarlo a
// APPS_INICIO. Nunca saca un módulo (eso es un cambio de a uno, con su vista previa). En CH
// está bloqueado hasta el OK del dueño, y el bloqueo vive acá, no sólo en el botón.
export async function fijarAsignacionActual(formData: FormData) {
  const op = await requireOperator();
  const tenantId = String(formData.get("tenantId") || "").trim();
  const vistos = leerVistos(formData.get("vistos"));
  if (vistos === null) {
    volverAApps(tenantId, { error: "El pedido llegó incompleto. Recargá la ficha y probá de nuevo." });
  }

  const negocio = await leerNegocioParaActivar(tenantId);
  if (!negocio) redirect("/operador?error=notfound");
  if (!mismoConjunto(negocio.modules, vistos)) volverAApps(tenantId, { error: CAMBIO_MIENTRAS_EDITABAS });

  const plan = planFijarAsignacion(negocio, flagsDeApps(), catalogo());
  if (!plan.ok) volverAApps(tenantId, { error: plan.motivo });
  if (plan.sinCambios) {
    volverAApps(tenantId, { ok: "No había nada que fijar: con sus módulos ya ve todas las apps de su menú de siempre." });
  }

  const guardado = await escribirModulosAuditado(tenantId, [...negocio.modules], plan.despues, {
    actor: `operator:${op}`,
    action: "module.fijar-asignacion",
    changes: {
      agregados: plan.agregados,
      antes: [...negocio.modules],
      despues: plan.despues,
      appsQueNoSeRecuperan: plan.noSeRecuperan.map((x) => x.app.id),
    },
  });
  if (!guardado) volverAApps(tenantId, { error: CAMBIO_MIENTRAS_EDITABAS });

  revalidatePath(`/operador/tenants/${tenantId}`);
  revalidatePath("/operador");
  const pendientes =
    plan.noSeRecuperan.length > 0
      ? ` Ojo: igual perdería ${plan.noSeRecuperan.map((x) => x.app.nombre).join(", ")}.`
      : " Con el Inicio por apps no pierde ninguna app de su menú de siempre.";
  volverAApps(tenantId, { ok: `Asignación fijada: se sumaron ${nombresDeModulos(plan.agregados)}.${pendientes}` });
}
