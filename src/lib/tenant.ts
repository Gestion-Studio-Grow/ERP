import { cache } from "react";
import { basePrisma } from "@/lib/prisma-base";

// Resolución del tenant actual — G1 (ADR-010 / ADR-001), blindada fail-closed (ADR-015),
// AHORA por request (ADR-018 §4).
//
// CÓMO RESUELVE (en orden):
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
 * Parsea `TENANT_HOST_MAP` ("host1=sub1;host2=sub2") a un mapa host→subdomain.
 * PURO y testeable — no toca `process.env` directamente.
 */
export function parseTenantHostMap(raw: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const entry of raw.split(";")) {
    const [rawHost, rawSub] = entry.split("=");
    const h = rawHost?.trim().toLowerCase();
    const s = rawSub?.trim().toLowerCase();
    if (h && s) map.set(h, s);
  }
  return map;
}

/**
 * Extrae el subdominio/tenant-slug del host del request. PURO y testeable.
 * - Primero consulta `TENANT_HOST_MAP` (mapeo explícito host→subdomain): imprescindible
 *   para URLs `.vercel.app` gratis, donde no hay dominio propio y por lo tanto no se puede
 *   tratar el host entero como "subdominio de APP_BASE_DOMAIN" (documentado en
 *   `docs/runbooks/recuperar-chestetica.md`; antes de este fix la variable se documentaba
 *   pero no se leía en ningún lado → cargarla en Vercel no tenía ningún efecto).
 * - Si no matchea ahí, cae al recorte por `APP_BASE_DOMAIN` (dominio propio real).
 * - Sin ninguno de los dos, sin host, apex (`base`/`www.base`), o host no relacionado
 *   (localhost, previews) → `null` (→ fallback single-tenant).
 * - `caro.base.com` → `"caro"`.
 */
export function extractSubdomain(host: string | null | undefined): string | null {
  if (!host) return null;
  let h = host.split(",")[0].trim().toLowerCase();
  h = h.split(":")[0]; // sacar puerto
  if (!h) return null;

  const mapped = parseTenantHostMap(process.env.TENANT_HOST_MAP).get(h);
  if (mapped) return mapped;

  const base = process.env.APP_BASE_DOMAIN?.trim().toLowerCase();
  if (!base) return null;
  if (h === base || h === `www.${base}`) return null;
  if (h.endsWith(`.${base}`)) {
    const sub = h.slice(0, h.length - base.length - 1).split(".")[0];
    return sub || null;
  }
  return null; // host ajeno al dominio base → single-tenant fallback
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
 */
export async function resolveTenantId(host: string | null | undefined): Promise<string> {
  const sub = extractSubdomain(host);
  if (sub) {
    const t = await basePrisma.tenant.findUnique({
      where: { subdomain: sub },
      select: { id: true },
    });
    if (t) return t.id;
    throw new Error(
      `getCurrentTenantId: no hay tenant para el subdominio "${sub}" (fail-closed, ADR-015). ` +
        "Revisá que el tenant tenga ese subdomain o que la URL sea correcta.",
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

/** Tenant del request actual. Fail-closed. Dedupe por request. */
export const getCurrentTenantId = cache(async (): Promise<string> => {
  return resolveTenantId(await hostFromRequest());
});
