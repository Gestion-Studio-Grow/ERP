import { cache } from "react";
import { basePrisma } from "@/lib/prisma-base";
import { isDemoSandbox, DEMO_TENANT_ID } from "@/lib/demo-flag";

// Resolución del tenant actual — G1 (ADR-010 / ADR-001), blindada fail-closed (ADR-015),
// AHORA por request (ADR-018 §4).
//
// CÓMO RESUELVE (en orden):
//   0. Si `FORCE_TENANT_SLUG` está seteado → ese tenant, fijo, ignorando el host
//      (Opción A — "URLs gratis por tenant": un sitio por tenant, mismo repo, cada
//      sitio pineado a su slug; ver docs/runbooks/alta-magra.md). Fail-closed: si el
//      slug no matchea, THROW. **En PRODUCCIÓN con más de un tenant este paso está
//      PROHIBIDO y lanza** — ver `assertForcedSlugAllowedInProduction` abajo. NO
//      reemplaza RLS, y NO lo sustituye: el id que sale de acá es el que alimenta el
//      GUC de la policy, así que un slug equivocado se propaga a RLS.
//   1. Por SUBDOMINIO del host del request (`carolina.<base>` → tenant con
//      subdomain="carolina"). Cada tenant tiene su URL (Tenant.subdomain, agregado
//      por el control-plane, ADR-021). Aplica al sitio público y al backoffice del
//      tenant (ambos se sirven bajo el subdominio del tenant).
//   2. Si NO hay subdominio (apex, dev, o sin APP_BASE_DOMAIN configurado) y hay
//      EXACTAMENTE un tenant → ese (compatibilidad single-tenant: Carolina hoy).
//   3. Si no se puede resolver → THROW (fail-closed, ADR-015): nunca servir el
//      tenant equivocado en silencio. Con RLS activo, además, sin contexto no se ve
//      nada.
//
// USA cliente BASE (no `@/lib/prisma`): cuando RLS está ON, `prisma` es la extensión
// que LLAMA a esta función → usar el cliente extendido acá sería recursión. La tabla
// Tenant está fuera de RLS (se lee pre-contexto).
//
// cache() de React = dedupe POR REQUEST (no persistente): la extensión RLS llama a
// esto por operación; con cache() es una sola resolución por request.
//
// PATHS SIN HOST (jobs/cron/worker, API por slug): no pasan por acá con host →
// caen al fallback single-tenant (paso 2). Multi-tenant en esos paths se resuelve
// con contexto explícito (runInTenantContext) — ver la API pública (public-api-auth).

/**
 * Extrae el subdominio del host respecto de `APP_BASE_DOMAIN`. PURO y testeable.
 * - Sin APP_BASE_DOMAIN, sin host, apex (`base`/`www.base`), o host no relacionado
 *   (localhost, previews de Netlify) → `null` (→ fallback single-tenant).
 * - `caro.base.com` → `"caro"`.
 */
export function extractSubdomain(host: string | null | undefined): string | null {
  const base = process.env.APP_BASE_DOMAIN?.trim().toLowerCase();
  if (!base || !host) return null;
  let h = host.split(",")[0].trim().toLowerCase();
  h = h.split(":")[0]; // sacar puerto
  if (!h || h === base || h === `www.${base}`) return null;
  if (h.endsWith(`.${base}`)) {
    const sub = h.slice(0, h.length - base.length - 1).split(".")[0];
    return sub || null;
  }
  return null; // host ajeno al dominio base → single-tenant fallback
}

/**
 * Normaliza un host: toma el primero de una lista `x-forwarded-host` separada por
 * comas, saca el puerto, trim + lowercase. PURA. `null` si queda vacío.
 */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.split(",")[0].trim().toLowerCase().split(":")[0];
  return h || null;
}

/**
 * Parsea el mapa `TENANT_HOST_MAP` — `"host1=sub1;host2=sub2"` → Map(host→subdomain).
 * PURA y testeable. Es la pieza de "URLs .vercel.app gratis por tenant" (sin dominio
 * propio): cada hostname PLANO (ej. `chestetica-erp.vercel.app`) mapea al `subdomain`
 * de su tenant. Tolera espacios, entradas vacías y `;` sobrante. El valor es un
 * `Tenant.subdomain` (se resuelve por la misma vía que el routing por subdominio real).
 */
export function parseTenantHostMap(raw: string | undefined | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const entry of raw.split(";")) {
    const s = entry.trim();
    if (!s) continue;
    const eq = s.indexOf("=");
    if (eq <= 0) continue;
    const host = s.slice(0, eq).trim().toLowerCase().split(":")[0];
    const sub = s.slice(eq + 1).trim().toLowerCase();
    if (host && sub) map.set(host, sub);
  }
  return map;
}

/**
 * Hosts `.vercel.app` publicados desde el CÓDIGO, además de `TENANT_HOST_MAP`.
 *
 * Por qué existen: en Vercel la variable es SENSIBLE (no se puede leer, sólo reescribir entera).
 * Sumar un tenant obligaba a reescribir a ciegas el mapa de todos, y un error dejaba sin tienda a
 * los demás. Un host nuevo se suma acá, revisado en un commit. La variable sigue mandando: si el
 * mismo host está en `TENANT_HOST_MAP`, gana la variable (se corrige sin deploy). Sólo hosts
 * EXACTOS, resueltos a un `Tenant.subdomain` por la misma vía y con el mismo fail-closed que el mapa:
 * si el tenant no tiene ese subdomain, el request falla, no cae a otro tenant.
 */
export const HOSTS_PUBLICADOS: Readonly<Record<string, string>> = {
  "quebienoles-erp.vercel.app": "quebienoles",
};

/** El mapa de hosts que rige: el del código y, encima, el de `TENANT_HOST_MAP` (que gana). PURA. */
export function mapaDeHostsVigente(env: Record<string, string | undefined> = process.env): Map<string, string> {
  const mapa = new Map(Object.entries(HOSTS_PUBLICADOS));
  for (const [host, sub] of parseTenantHostMap(env.TENANT_HOST_MAP)) mapa.set(host, sub);
  return mapa;
}

/**
 * Subdominio mapeado para un host exacto (`HOSTS_PUBLICADOS` + `TENANT_HOST_MAP`), o `null` si el
 * host no está en el mapa. PURA (env inyectable para tests).
 */
export function hostMapSubdomain(
  host: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const h = normalizeHost(host);
  if (!h) return null;
  return mapaDeHostsVigente(env).get(h) ?? null;
}

/** Host del request (headers), o null fuera de un request (job/script). */
async function hostFromRequest(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get("x-forwarded-host") ?? h.get("host");
  } catch {
    return null;
  }
}

/**
 * Resuelve el tenantId a partir de un host. PURO respecto de Next (recibe el host),
 * así es testeable sin request. Fail-closed (ADR-015).
 *
 * Orden: 1) mapa EXACTO de hostname (`TENANT_HOST_MAP`, para URLs `.vercel.app`
 * planas sin dominio propio); 2) subdominio de `APP_BASE_DOMAIN` (dominio propio);
 * 3) fallback single-tenant. Ambos (1) y (2) resuelven a un `Tenant.subdomain`, así
 * que comparten el mismo lookup y el mismo fail-closed.
 */
export async function resolveTenantId(host: string | null | undefined): Promise<string> {
  const mapped = hostMapSubdomain(host);
  const sub = mapped ?? extractSubdomain(host);
  if (sub) {
    const t = await basePrisma.tenant.findUnique({
      where: { subdomain: sub },
      select: { id: true },
    });
    if (t) return t.id;
    throw new Error(
      `getCurrentTenantId: no hay tenant para el subdominio "${sub}"` +
        (mapped ? " (vía TENANT_HOST_MAP)" : "") +
        " (fail-closed, ADR-015). Revisá que el tenant tenga ese subdomain, el mapa de hosts, " +
        "o que la URL sea correcta.",
    );
  }

  // Sin subdominio: fallback single-tenant (compatibilidad Carolina).
  const tenants = await basePrisma.tenant.findMany({
    take: 2,
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (tenants.length === 1) return tenants[0].id;
  if (tenants.length === 0) {
    throw new Error(
      "getCurrentTenantId: no hay ningún tenant en la base. Se esperaba exactamente uno (ADR-015).",
    );
  }
  throw new Error(
    "getCurrentTenantId: hay más de un tenant y el request no trae subdominio para resolver " +
      "(ADR-015 / ADR-018 §4). Cada tenant debe accederse por su subdominio; los paths sin host " +
      "(jobs/API) deben resolver el tenant con contexto explícito (runInTenantContext).",
  );
}

/**
 * Slug de tenant forzado por env (`FORCE_TENANT_SLUG`), normalizado, o null si no
 * está. PURA y testeable. Es la pieza de la Opción A ("URLs gratis por tenant"):
 * cada sitio Netlify fija su tenant con esta var. Se normaliza (trim + lowercase)
 * para matchear los slugs, que son kebab en minúscula.
 */
export function forcedTenantSlug(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const v = env.FORCE_TENANT_SLUG?.trim().toLowerCase();
  return v ? v : null;
}

/**
 * PORTERO del pin por env en PRODUCCIÓN. Lanza si `FORCE_TENANT_SLUG` está seteado en
 * un deploy productivo que comparte base con MÁS DE UN tenant.
 *
 * POR QUÉ existe (no lo saques porque te sorprendió un throw en un deploy):
 * `FORCE_TENANT_SLUG` es la ÚNICA variable del sistema que colapsa el aislamiento sin
 * romper nada visible. Se aplica ANTES del host, así que fija TODO el deploy a un
 * tenant y el routing por hostname (`TENANT_HOST_MAP` / subdominio) deja de existir:
 * con N locales de un mismo cliente servidos por el mismo proyecto, los N muestran los
 * datos del tenant pineado y nadie ve un error. Peor: RLS NO ataja esto — el id que
 * devuelve `getCurrentTenantId` es el que va al GUC `app.current_tenant_id`, así que la
 * policy se aplica CON EL TENANT EQUIVOCADO y coopera con la fuga en vez de frenarla.
 * Es una fuga silenciosa de datos entre clientes, no una caída.
 *
 * POR QUÉ la guarda es `NODE_ENV === "production"` + `tenants > 1` y no un throw a secas:
 * el pin es legítimo y se usa a diario fuera de producción — scripts de RLS
 * (`prisma/rls/aislamiento-capa-app.ts:18`), tests, y dev local contra una base con
 * varios tenants sembrados. Y con UN solo tenant en la base no hay a quién filtrarle
 * nada, así que tampoco corresponde romper (es el caso del deploy de demo/preventa,
 * que además ni llega acá: `isDemoSandbox()` corta antes).
 *
 * Esto no inventa política nueva: los tres runbooks de deploy ya dicen "NO setear
 * FORCE_TENANT_SLUG" (docs/runbooks/deploy-vercel.md:73 y :120,
 * docs/runbooks/recuperar-chestetica.md:72, .env.vercel.template:73). Lo que faltaba era
 * que el código lo hiciera cumplir en vez de confiar en que nadie la deje puesta.
 *
 * `countTenants` está inyectado para testear sin DB; en runtime es `basePrisma.tenant.count`.
 * El costo es CERO en un deploy sano: sólo se cuenta si la var está seteada.
 */
export async function assertForcedSlugAllowedInProduction(
  slug: string,
  countTenants: () => Promise<number>,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (env.NODE_ENV !== "production") return;
  const tenants = await countTenants();
  if (tenants <= 1) return;
  throw new Error(
    `getCurrentTenantId: FORCE_TENANT_SLUG="${slug}" está seteada en un deploy de ` +
      `PRODUCCIÓN cuya base tiene ${tenants} tenants. Esa variable fija TODO el deploy a ` +
      `"${slug}" e IGNORA el host: cualquier otro sitio servido por este proyecto mostraría ` +
      `los datos de "${slug}", y RLS no lo ataja (el GUC se setea con ese mismo tenant ` +
      "equivocado). Fail-closed (ADR-015). CÓMO SE ARREGLA: Vercel → el proyecto → Settings → " +
      "Environment Variables → borrar FORCE_TENANT_SLUG del entorno Production → Redeploy. " +
      "El routing de producción es por host: TENANT_HOST_MAP o subdominio de APP_BASE_DOMAIN " +
      "(docs/runbooks/deploy-vercel.md §1).",
  );
}

/**
 * Resuelve el tenantId del slug forzado, o THROW fail-closed (ADR-015) si no existe.
 * `lookup` está inyectado para testear sin DB; en runtime es `basePrisma.tenant`.
 */
export async function resolveForcedTenantId(
  slug: string,
  lookup: (slug: string) => Promise<{ id: string } | null>,
): Promise<string> {
  const t = await lookup(slug);
  if (t) return t.id;
  throw new Error(
    `getCurrentTenantId: FORCE_TENANT_SLUG="${slug}" no matchea ningún tenant ` +
      "(fail-closed, ADR-015). Revisá el slug o que ese tenant exista.",
  );
}

/** Tenant del request actual. Fail-closed. Dedupe por request. */
export const getCurrentTenantId = cache(async (): Promise<string> => {
  // Paso -1: modo SANDBOX de preventa (docs/preventa/plan-acceso-sandbox-sin-password.md).
  // Pseudo-tenant fijo SIN pegarle a basePrisma — el sandbox no tiene DB real.
  if (isDemoSandbox()) return DEMO_TENANT_ID;

  // Paso 0: pin por env (Opción A). Domina sobre el host; si está seteado, el sitio
  // queda fijado a ese tenant. Usa el cliente BASE (sin RLS), como el resto de acá.
  // En producción multi-tenant el pin está PROHIBIDO y esto lanza: ver el porqué largo
  // en `assertForcedSlugAllowedInProduction` (resumen: dominar sobre el host arrastra al
  // GUC de RLS, así que la fuga es silenciosa y RLS no la frena).
  const forced = forcedTenantSlug();
  if (forced) {
    await assertForcedSlugAllowedInProduction(forced, () => basePrisma.tenant.count());
    return resolveForcedTenantId(forced, (slug) =>
      basePrisma.tenant.findUnique({ where: { slug }, select: { id: true } }),
    );
  }
  return resolveTenantId(await hostFromRequest());
});
