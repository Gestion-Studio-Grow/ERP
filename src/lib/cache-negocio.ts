// CACHÉ DE LECTURA POR NEGOCIO (tanda 11 de la revisión, 10/11/2026).
//
// La app es multi-tenant por host y todo el árbol es `force-dynamic` (src/app/layout.tsx): cada visita a una
// vidriera vuelve a leer catálogo y marca aunque no hayan cambiado. Esto guarda esas lecturas PÚBLICAS en la caché
// de datos de Next (`unstable_cache`, la vía sin Cache Components: node_modules/next/dist/docs/01-app/02-guides/
// caching-without-cache-components.md), con tres reglas que no se negocian:
//
//   1. AISLAMIENTO. La clave y la etiqueta llevan SIEMPRE el `tenantId`. No hay forma de pedir una entrada sin
//      negocio: un `tenantId` vacío o con forma rara corta con error antes de tocar la caché (falla cerrada).
//      El lector corre dentro de `runInTenantContext(tenantId)`, así que Prisma (candado de tenant y RLS) usa ESE
//      negocio y no lee `headers()` — que dentro de una caché no está permitido.
//   2. FRESCURA ACOTADA. Toda entrada vence sola (`revalidate`, segundos). Es el techo de lo viejo que puede verse
//      un dato aunque algún camino de escritura no invalide (ventas que mueven stock, scripts, cron).
//   3. INVALIDACIÓN AL EDITAR. `invalidarNegocio(tenantId, recurso)` vence la entrada de ese negocio y sólo de ese.
//
// Sólo para lecturas PÚBLICAS y serializables a JSON (la caché guarda JSON: un `Date` o un `Decimal` vuelven como
// texto). Nada que dependa de la sesión o del usuario pasa por acá.

import { revalidateTag, unstable_cache } from "next/cache";
import { runInTenantContext } from "@/lib/tenant-context";

/** Recursos cacheables. Lista cerrada: agregar uno es una decisión que se revisa. */
export type RecursoDelNegocio = "vidriera";

// Los ids de negocio son cuid/uuid: letras, números, guion y guion bajo. Cualquier otra cosa (vacío, espacios,
// separadores) no entra en una clave: evita que dos negocios distintos compongan la misma clave.
const FORMA_DEL_ID = /^[A-Za-z0-9_-]{1,64}$/;

export class NegocioInvalidoParaCacheError extends Error {
  constructor() {
    super("cache-negocio: tenantId ausente o con forma inválida; no se lee ni se escribe la caché.");
    this.name = "NegocioInvalidoParaCacheError";
  }
}

function exigirNegocio(tenantId: unknown): asserts tenantId is string {
  if (typeof tenantId !== "string" || !FORMA_DEL_ID.test(tenantId)) throw new NegocioInvalidoParaCacheError();
}

/** Partes de la clave: el negocio va siempre, en su propia posición. */
export function claveDelNegocio(tenantId: string, recurso: RecursoDelNegocio): string[] {
  exigirNegocio(tenantId);
  return ["negocio", tenantId, recurso];
}

/** Etiqueta de invalidación: una por (negocio, recurso). */
export function etiquetaDelNegocio(tenantId: string, recurso: RecursoDelNegocio): string {
  exigirNegocio(tenantId);
  return `negocio:${tenantId}:${recurso}`;
}

/** La forma de `unstable_cache` que usa este módulo; inyectable para probar el aislamiento sin Next. */
export type EnvolverConCache = <T>(
  leer: () => Promise<T>,
  clave: string[],
  opciones: { tags: string[]; revalidate: number },
) => () => Promise<T>;

export type OpcionesDeCache = {
  /** Segundos hasta que la entrada vence sola. Obligatorio: no hay caché «para siempre» por negocio. */
  revalidate: number;
  envolver?: EnvolverConCache;
  /** Corre el lector con el negocio en contexto (Prisma lo toma de ahí). Inyectable en pruebas. */
  enContexto?: <T>(tenantId: string, fn: () => Promise<T>) => Promise<T>;
};

/**
 * Devuelve un lector cacheado por negocio. `leer` recibe el `tenantId` explícito y corre con ese negocio en
 * contexto; no debe leer `headers()` ni `cookies()`.
 */
export function cachePorNegocio<T>(
  recurso: RecursoDelNegocio,
  leer: (tenantId: string) => Promise<T>,
  opciones: OpcionesDeCache,
): (tenantId: string) => Promise<T> {
  const envolver = opciones.envolver ?? (unstable_cache as EnvolverConCache);
  const enContexto = opciones.enContexto ?? ((tenantId, fn) => runInTenantContext(tenantId, fn));
  return (tenantId: string) => {
    exigirNegocio(tenantId);
    return envolver(
      // `async` + `await` adentro: las promesas de Prisma son perezosas y el contexto tiene que seguir vivo.
      () => enContexto(tenantId, async () => await leer(tenantId)),
      claveDelNegocio(tenantId, recurso),
      { tags: [etiquetaDelNegocio(tenantId, recurso)], revalidate: opciones.revalidate },
    )();
  };
}

/**
 * Vence la entrada de ESE negocio. Se llama después de editar (acción de servidor o manejador de ruta).
 * `{ expire: 0 }`: el próximo pedido lee fresco, sin servir lo viejo (guía de `revalidateTag` de Next 16).
 * Fuera de un pedido (script, cron) Next no deja invalidar: no rompe la escritura; el dato vence por `revalidate`.
 * Devuelve si pudo vencerla.
 */
export function invalidarNegocio(
  tenantId: string,
  recurso: RecursoDelNegocio,
  vencer: (etiqueta: string, perfil: { expire: number }) => void = revalidateTag,
): boolean {
  // Todo adentro del `try`: esto corre DESPUÉS de guardar, y no puede convertir una escritura hecha en un error.
  // Un id con forma inválida no tiene entrada que vencer (las lecturas con ese id cortan antes de cachear).
  try {
    vencer(etiquetaDelNegocio(tenantId, recurso), { expire: 0 });
    return true;
  } catch {
    return false;
  }
}
