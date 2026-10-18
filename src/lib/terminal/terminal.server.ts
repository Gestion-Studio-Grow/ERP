// ============================================================================
// ¿ESTE NEGOCIO TIENE EL MÓDULO `terminal`? — lo decide el servidor, nunca el navegador.
// ============================================================================
//
// Plan: docs/producto/PLAN-TERMINALES-MOSTRADOR.md §6 T-2/T-4. El perfil del equipo (ancho del
// ticket, imprimir solo, sonido, vibración, lector) es opcional: SÓLO vale si el negocio tiene
// el módulo `terminal` asignado (`Tenant.modules[]`, ADR-054/055). Sin el módulo —CH, que está
// vivo en producción— Vender, la Caja con lector y Ventas del día trabajan exactamente como
// antes. Por eso la página lo pregunta acá y se lo pasa al cliente por props: el `localStorage`
// del equipo nunca decide si el módulo está.
//
// La regla es la MISMA que abre «Este equipo» (`requireApp("terminal")`): la app `terminal`
// (moduloDuro, depende de `pos`) para este rol en este negocio. Lectura cacheada por request
// (`getNegocioApps`), así que no suma consultas a la página.
//
// `server-only`: lee la base a través de `getNegocioApps`.

import "server-only";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import type { SessionUser } from "@/lib/session";
import type { TerminalDelEquipo } from "./usar-perfil";

/**
 * Lo que necesita el navegador para leer el perfil de ESTE equipo para ESTA persona, o `null`
 * si el negocio no tiene el módulo (o la persona no puede abrir «Este equipo»). Nunca tira: si
 * algo falla al decidir, `null` = como siempre.
 */
export async function terminalDelEquipo(user: Pick<SessionUser, "id" | "role" | "tenantId">): Promise<TerminalDelEquipo | null> {
  try {
    const negocio = await getNegocioApps(user.role);
    if (!appPermitida(appPorId("terminal"), negocio)) return null;
    const slug = await getCurrentTenantSlug();
    // Sin slug (no debería pasar con sesión) el negocio se distingue por su id, como en «Este equipo».
    return { tenantSlug: slug ?? user.tenantId, userId: user.id };
  } catch (e) {
    // Las señales de Next (redirect, render dinámico) viajan con `digest`: ésas no se tragan.
    if (e && typeof e === "object" && "digest" in e) throw e;
    return null;
  }
}
