// ============================================================================
// CONTEXTO DE APPS DEL NEGOCIO ACTUAL (servidor) — lo que `appsVisibles` necesita saber.
// ============================================================================
//
// La decisión es pura y vive en src/apps/visibles.ts; acá sólo se LEE: la fila del tenant,
// los flags, el interruptor "Trabaja por apps", el perfil y si está la migración cárnica.
// Todo cacheado por request (`react.cache`): el layout, la guardia de la página y "App no
// disponible" comparten la misma lectura.
//
// NO lleva "use server": eso publicaría cada export como endpoint. Es un lector de servidor
// que llaman páginas, layouts y `requireApp`; nunca recibe un tenantId de afuera: el
// negocio es siempre el del request (`getCurrentTenantId`).
//
// `server-only`: importa el valor `prisma`. Si un client component lo importara por error,
// Turbopack fallaría en el build con un mensaje confuso (tsc no lo ve); con esta línea el
// error dice exactamente qué pasó. Next lo resuelve solo, sin instalar el paquete
// (node_modules/next/types/global.d.ts).

import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import type { PermisoOverride, Role } from "@/lib/capabilities";
import { getActiveProfile } from "@/lib/profile-gating";
import { lotesYDespieceListos } from "@/lib/carniceria/schema-probe";
import { resolveRubroId } from "@/blueprints/retail/rubros";
import { catalogo } from "@/modules/catalog";
import { moduleRegistryEnabled } from "@/modules/flags";
import { appsOcultasDelNegocio, enInicioPorAppsDelNegocio, interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { ocultasParaElPanel } from "@/cambios/interruptores-core";
import { SOPORTE_GSG } from "@/cambios/interruptores";
import type { EstadoInterruptores } from "@/cambios/interruptores-core";
import { permisoDadoAlgunaVez } from "@/lib/soporte/consentimiento.server";
import {
  resolverContextoApps,
  type ContextoApps,
  type NegocioApps,
  type TenantParaApps,
} from "./visibles";

/**
 * La fila del negocio actual, o `null` si no se pudo leer. Se loguea y NO se tira: una
 * falla acá deja al negocio sin gate por módulo (el comportamiento de hoy) y con las apps
 * `moduloDuro` CERRADAS, porque sin la asignación no hay cómo probar que es la casa.
 */
const leerTenant = cache(async (): Promise<TenantParaApps | null> => {
  try {
    const id = await getCurrentTenantId();
    const t = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, blueprintId: true, modules: true },
    });
    return t ? { id: t.id, slug: t.slug, blueprintId: t.blueprintId, modules: t.modules } : null;
  } catch (err) {
    logger.warn("apps", "no se pudo leer el negocio para decidir sus apps; queda sin gate por módulo", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
});

/**
 * El gate por módulo del negocio actual. `null` = sin gate, idéntico a hoy: CH y todo
 * negocio sin el interruptor "Trabaja por apps" o con la asignación vacía. El interruptor se lee
 * UNA vez por request (src/cambios/interruptores.server.ts), en paralelo con la fila del negocio;
 * si esa lectura falla, queda apagado.
 */
/** Los módulos asignados al negocio del request (la misma fila, leída una vez por request). */
export const modulosDelNegocio = cache(async (): Promise<readonly string[]> => (await leerTenant())?.modules ?? []);

export const getContextoApps = cache(async (): Promise<ContextoApps | null> => {
  const [t, enInicioPorApps] = await Promise.all([leerTenant(), enInicioPorAppsDelNegocio()]);
  if (!t) return null;
  return resolverContextoApps(t, { registroGlobal: moduleRegistryEnabled(), enInicioPorApps }, catalogo());
});

/**
 * Todo lo que decide qué apps ve una persona con este `role` en el negocio actual. Con `overrides` (las
 * excepciones de la matriz de QUIEN MIRA: `user.overrides`), una casilla apagada también cierra la app
 * (`rolPuedeEntrar`); lo usan `requireApp`/`requireAppAccion`, la barra y el Inicio.
 */
export const getNegocioApps = cache(async (role: Role, overrides?: ReadonlyArray<PermisoOverride>): Promise<NegocioApps> => {
  const [t, contexto, perfil, carniceriaLista, ocultas, interruptores] = await Promise.all([
    leerTenant(),
    getContextoApps(),
    getActiveProfile(),
    lotesYDespieceListos(),
    appsOcultasDelNegocio(),
    // La misma lectura cacheada del request (una consulta): decide las apps con `interruptor`.
    interruptoresDelNegocio(),
  ]);
  return {
    role,
    contexto,
    modulosAsignados: t?.modules ?? [],
    blueprintId: t?.blueprintId ?? null,
    perfil,
    // El mismo criterio que la barra (getCurrentTenantRubro): blueprint retail conocido o,
    // si no hay, el mapa por slug (los locales de MAGRA se llaman magra-<localidad>).
    esMostrador: t ? resolveRubroId({ slug: t.slug, blueprintId: t.blueprintId }) != null : false,
    carniceriaLista,
    // Las apps que GSG ocultó en este negocio. Nunca en un negocio con candado del dueño (CH): aunque
    // hubiera una fila, su menú queda como siempre (paridad-menu.test.ts). Sin la fila del negocio,
    // tampoco: no hay contra qué slug probarlo.
    ocultas: ocultasParaElPanel(t?.slug, ocultas),
    interruptores,
    ...((await soporteSoloParaRevocar(role, t?.id, interruptores)) && { soporteSoloRevocar: true }),
    ...(overrides !== undefined && { overrides }),
  };
});

/**
 * ¿El titular de este negocio dio alguna vez el permiso a la IA de soporte? Con el interruptor apagado, decide
 * si la pantalla del permiso sigue a mano EN PAUSA (para sacarlo o ver que quedó sacado). Una lectura por
 * request y por negocio (`react.cache`), la compartan las distintas llaves de `getNegocioApps` y la pantalla.
 * Si la lectura falla, no (la pantalla responde «no encontrado» y el menú no la ofrece).
 */
export const soporteEnPausaAMano = cache(async (tenantId: string): Promise<boolean> => {
  try {
    return await permisoDadoAlgunaVez(tenantId);
  } catch {
    return false;
  }
});

/**
 * Soporte GSG apagado y el titular que alguna vez dio el permiso a la IA: la app del permiso sigue a mano,
 * en pausa, para que lo pueda sacar (si no, volvería a valer al prender; certificación de la tanda 3). Sólo
 * OWNER y sólo si el interruptor se prendió alguna vez y hoy está apagado: un negocio que nunca lo tocó
 * (casi todos) no pudo dar el permiso y no paga la consulta.
 */
async function soporteSoloParaRevocar(role: Role, tenantId: string | undefined, interruptores: EstadoInterruptores): Promise<boolean> {
  const s = interruptores[SOPORTE_GSG];
  if (role !== "OWNER" || !tenantId || !s || s.encendido || s.cuando == null) return false;
  return soporteEnPausaAMano(tenantId);
}
