// ============================================================================
// exigirCasa — la guardia de Mis locales, en cada página y en cada action.
// ============================================================================
//
// Mis locales lee datos de OTROS negocios. La capability sola no alcanza (la tiene cualquier
// OWNER) y el menú no protege nada: la barrera es que ESTE negocio tenga el módulo
// `multilocal` asignado, leído de la base en el momento (`Tenant.modules`), sin pasar por el
// gate por módulo ni por ningún flag. Es el mismo molde que `exigirEstudio` de la cartera del
// contador (cartera-actions.ts), con la exclusión mutua de los dos paneles (`decidirAcceso`).
//
// La página ya pasó por `requireApp` (que exige el módulo con `moduloDuro`); esto se repite
// igual, porque la action no pasa por la página: un POST directo a la action llega acá sin
// haber visto ningún `requireApp`.
//
// NO lleva "use server": eso la publicaría como endpoint. `server-only`: importa el cliente
// de base; si un client component la importara por error, el build lo dice con claridad.

import "server-only";
import { cache } from "react";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { basePrisma } from "@/lib/prisma-base";
import type { SessionUser } from "@/lib/session";
import { decidirAcceso } from "./multilocal-core";

/**
 * Lo que puede pedir una pantalla de Mis locales. La dueña (`multilocal:manage`) ve todo; el
 * encargado de la casa (RECEPTION, `stock:read`) ve sólo el stock de los locales, sin plata.
 */
export type CapacidadCasa = "multilocal:manage" | "stock:read";

export type Casa =
  | { ok: true; casaId: string; nombre: string; user: SessionUser }
  | { ok: false; error: string };

/**
 * Exige que la persona tenga la capability y que el negocio del request sea la casa de una
 * red. Sin sesión o sin la capability, `requireCapability` redirige (login o la casa del rol).
 * Sin el módulo, devuelve el porqué para mostrarlo: nunca tira.
 *
 * El negocio es SIEMPRE el del request (`getCurrentTenantId`): no recibe un id de afuera.
 * Cacheada por request: la página y sus números leen `Tenant.modules` una sola vez.
 */
export const exigirCasa = cache(async (capability: CapacidadCasa): Promise<Casa> => {
  const user = await requireCapability(capability);
  const casaId = await getCurrentTenantId();
  // Tenant está fuera de RLS por diseño (es la raíz del aislamiento): se lee con el cliente
  // base, igual que exigirEstudio. Sólo se toman el nombre y los módulos.
  const t = await basePrisma.tenant.findUnique({ where: { id: casaId }, select: { name: true, modules: true } });
  const acceso = decidirAcceso(t?.modules ?? null, "casa");
  if (!acceso.ok) return acceso;
  return { ok: true, casaId, nombre: t!.name, user };
});
