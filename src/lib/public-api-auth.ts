/**
 * Autenticación de la API pública de ingesta (superficie II de ADR-020).
 *
 * Es la puerta de un front EXTERNO (el WordPress/WooCommerce que el estudio del
 * cliente ya tiene) hacia el backoffice. No usa la sesión con cookie del panel
 * (`requireCapability`, ADR-017) — eso es para humanos en `/admin`. Un servidor
 * externo se autentica con una **api-key por tenant** en el header
 * `Authorization: Bearer <key>` y declara a qué tenant escribe con
 * `X-Tenant-Slug`.
 *
 * Resolución de tenant (multi-tenant, ADR-018 §4): el tenant se resuelve por el
 * slug DECLARADO (`X-Tenant-Slug`). El slug es solo el SELECTOR — la seguridad
 * está en la **api-key por slug**: un slug sin su clave correcta se rechaza (401),
 * y un slug sin clave configurada se rechaza cerrado (503). El caller envuelve el
 * trabajo en `runInTenantContext(tenantId)` para que RLS aísle por ese tenant.
 *
 * La api-key esperada vive en env (no en la DB): así el contrato no depende de
 * una migración en Neon y prod queda seguro por default (sin env → 503, cerrado).
 *   - `EXTERNAL_ORDERS_API_KEYS` = JSON `{"<slug>":"<key>", ...}` (multi-tenant), o
 *   - `EXTERNAL_ORDERS_API_KEY`  = una sola clave (caso single-tenant de hoy).
 */

import { timingSafeEqual } from "node:crypto";
import { basePrisma } from "@/lib/prisma-base";

/** Error con status HTTP para responder JSON uniforme desde las rutas. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type AuthenticatedTenant = { tenantId: string; slug: string };

/** Compara dos claves en tiempo constante (evita filtrar largo/contenido). */
function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Extrae la api-key del header `Authorization: Bearer` o `X-Api-Key`. */
function readApiKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  const x = request.headers.get("x-api-key");
  return x ? x.trim() : null;
}

/** Clave esperada para un slug, leída de env. Null = API no configurada. */
function expectedKeyForSlug(slug: string): string | null {
  const map = process.env.EXTERNAL_ORDERS_API_KEYS;
  if (map) {
    try {
      const parsed = JSON.parse(map) as Record<string, string>;
      const k = parsed[slug];
      if (typeof k === "string" && k.length > 0) return k;
    } catch {
      // JSON mal formado: se trata como no configurado (fail-closed).
    }
  }
  const single = process.env.EXTERNAL_ORDERS_API_KEY;
  return single && single.length > 0 ? single : null;
}

/**
 * Autentica el request de ingesta externa. Devuelve el tenant resuelto o lanza
 * `ApiError` (401 sin/clave inválida, 403 slug no coincide, 503 API no
 * configurada). El `slug` puede venir por header `X-Tenant-Slug` o por el body.
 */
export async function authenticatePublicApi(
  request: Request,
  slugFromBody?: string | null,
): Promise<AuthenticatedTenant> {
  const providedKey = readApiKey(request);
  if (!providedKey) {
    throw new ApiError(401, "missing_api_key", "Falta la api-key (Authorization: Bearer <key>).");
  }

  const declaredSlug =
    (request.headers.get("x-tenant-slug") || slugFromBody || "").trim().toLowerCase();
  if (!declaredSlug) {
    throw new ApiError(400, "missing_tenant", "Falta el tenant (header X-Tenant-Slug o campo `tenant`).");
  }

  // Multi-tenant (ADR-018 §4): el tenant se resuelve por el slug DECLARADO. La
  // seguridad NO está en el slug (es solo el selector) sino en la api-key por
  // slug (expectedKeyForSlug) — un slug sin la clave correcta se rechaza. Se usa
  // basePrisma: leer Tenant no debe pasar por la extensión RLS (no hay contexto
  // de tenant todavía; es justamente lo que estamos resolviendo).
  const tenant = await basePrisma.tenant.findUnique({
    where: { slug: declaredSlug },
    select: { id: true, slug: true },
  });
  if (!tenant) {
    throw new ApiError(403, "tenant_mismatch", "El tenant declarado no existe o no está habilitado.");
  }

  const expected = expectedKeyForSlug(tenant.slug);
  if (!expected) {
    throw new ApiError(503, "api_not_configured", "La API de ingesta no está configurada para este tenant.");
  }
  if (!keysMatch(providedKey, expected)) {
    throw new ApiError(401, "invalid_api_key", "La api-key es inválida.");
  }

  return { tenantId: tenant.id, slug: tenant.slug };
}
