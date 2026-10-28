// ============================================================================
// CARTERA — las llaves del panel del estudio y las lecturas de SU cartera (SERVIDOR).
// ============================================================================
//
// Vivían adentro de `cartera-actions.ts` sin exportar. Las sacamos acá porque las necesitan
// también las reglas de abono y el lote del mes (`cartera-abonos.ts`) y la exportación de la
// cartera: una sola copia de «quién es el estudio» y «este cliente es de su cartera».
//
// SIN "use server", A PROPÓSITO: estas funciones reciben un tenantId. En un archivo "use server"
// serían endpoints que cualquiera llama con un id ajeno. Las llaman sólo las actions y las rutas
// del panel DESPUÉS de `exigirEstudio()` (que saca el estudio de la sesión, nunca de un input).
//
// AISLAMIENTO (ADR-018 / ADR-077 §4): la cartera se lee con el tenant del ESTUDIO (RLS sobre
// CarteraCliente); la tabla Tenant está fuera de RLS por diseño y sólo se lee metadata de control
// de ids que ya salieron de la cartera. Jamás operatorPrisma.

import "server-only";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { decidirAcceso } from "@/lib/multilocal/multilocal-core";
import type { EstadoCartera, FilaCarteraDb, MetaCliente } from "@/lib/cartera-core";

export type GateEstudio = { ok: true; estudioTenantId: string } | { ok: false; error: string };

/**
 * La llave compuesta del panel: capability `cartera:manage` (redirige si no hay sesión o rol) +
 * módulo `cartera` asignado al tenant actual, y sin `multilocal` al lado (`decidirAcceso`).
 */
export async function exigirEstudio(): Promise<GateEstudio> {
  await requireCapability("cartera:manage");
  const estudioTenantId = await getCurrentTenantId();
  // Chequeo DURO sobre la asignación (Tenant.modules), independiente del flag del registry. Con
  // `multilocal` al lado tampoco: la casa de una red guarda sus locales en la misma tabla y el
  // panel los trataría como clientes (y podría emitir facturas por ellos).
  const tenant = await basePrisma.tenant.findUnique({
    where: { id: estudioTenantId },
    select: { modules: true },
  });
  const acceso = decidirAcceso(tenant?.modules ?? null, "estudio");
  if (!acceso.ok) return acceso;
  return { ok: true, estudioTenantId };
}

/** Filas de la cartera del estudio (tenant del ESTUDIO: RLS + predicado explícito). Sin las de baja. */
export async function filasDeCarteraDb(estudioTenantId: string): Promise<FilaCarteraDb[]> {
  const filas = await tenantTransaction(
    (tx) =>
      tx.carteraCliente.findMany({
        where: { tenantId: estudioTenantId, estado: { not: "baja" } },
        orderBy: { alias: "asc" },
        select: { id: true, clienteTenantId: true, alias: true, estado: true },
      }),
    { tenantId: estudioTenantId },
  );
  return filas.map((f) => ({ ...f, estado: f.estado as EstadoCartera }));
}

/** UNA fila de la cartera (la guarda de pertenencia). */
export async function buscarFilaCartera(estudioTenantId: string, clienteTenantId: string): Promise<FilaCarteraDb | null> {
  const fila = await tenantTransaction(
    (tx) =>
      tx.carteraCliente.findUnique({
        where: { tenantId_clienteTenantId: { tenantId: estudioTenantId, clienteTenantId } },
        select: { id: true, clienteTenantId: true, alias: true, estado: true },
      }),
    { tenantId: estudioTenantId },
  );
  return fila ? { ...fila, estado: fila.estado as EstadoCartera } : null;
}

/**
 * Metadata de los clientes de la cartera en UNA lectura. Los ids llegan SOLO de
 * `filasDeCarteraDb(estudio)`: nunca de un input. Sólo metadata de control, ningún dato de negocio.
 */
export async function metadataClientesDb(ids: string[]): Promise<Map<string, MetaCliente>> {
  const tenants = await basePrisma.tenant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      slug: true,
      subdomain: true,
      arcaCuit: true,
      arcaPuntoVenta: true,
      arcaHomologacion: true,
      arcaCondicionIva: true,
      bancosCapFacturasMes: true,
    },
  });
  return new Map(
    tenants.map((t) => [
      t.id,
      {
        nombre: t.name,
        slug: t.slug,
        subdomain: t.subdomain,
        arcaCuit: t.arcaCuit,
        arcaPuntoVenta: t.arcaPuntoVenta,
        arcaHomologacion: t.arcaHomologacion,
        arcaCondicionIva: t.arcaCondicionIva,
        capFacturasMes: t.bancosCapFacturasMes,
      },
    ]),
  );
}
