// ============================================================================
// TECLAS FIJADAS DEL MOSTRADOR — leer y guardar, con control de versión (Magra tanda 2 · 2A).
// ============================================================================
//
// DÓNDE SE GUARDA. Sin migración, con el patrón de supermercado/config-repo.ts y envios/config.ts:
// cada cambio es una fila de `AuditLog` (entity "TeclasFijadas", entityId = tenantId) y la vigente
// es la MÁS NUEVA. La tabla tiene `tenantId` con su política de RLS y el rastro (quién, cuándo,
// qué) sale gratis; la purga de la auditoría no la toca (PURGE_EXEMPT_ENTITIES).
//
// QUÉ SE GUARDA. Sólo ids de productos DEL NEGOCIO: al guardar se cruzan con el catálogo de la base
// filtrando por `tenantId` (un id de otro negocio, inventado o borrado, se descarta sin error). Al
// leer, la pantalla vuelve a cruzarlos con lo que hoy se vende (`teclasPrincipales`).
//
// CONCURRENCIA. Guardar exige la versión leída (el id de la fila vigente, o null si nunca se
// guardó): si otra persona guardó en el medio se tira `RechazoDeDominio`, en vez de pisarle el
// cambio. El llamador corre esto en una transacción serializable (`tenantTransaction`).
//
// Recibe el cliente por parámetro (sin "use server" ni `server-only`): lo usan la acción, el lector
// de la página y los tests con la base efímera.

import type { Prisma } from "@/generated/prisma/client";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { leerTeclasFijadas } from "@/app/admin/(dashboard)/vender/reglas-venta";
import { ACCION_FIJAR_TECLAS, ENTIDAD_TECLAS_FIJADAS } from "./marcas";

type Db = Pick<Prisma.TransactionClient, "auditLog" | "product">;

export const CAMBIO_MIENTRAS_MIRABAS_TECLAS =
  "Otra persona cambió las teclas mientras las elegías. Volvé a abrir Vender para ver cómo quedaron y elegilas de nuevo.";

export type TeclasFijadasLeidas = {
  ids: string[];
  /** El id de la fila vigente (lo que se manda de vuelta al guardar); null = nunca se guardó. */
  version: string | null;
};

async function vigente(db: Pick<Db, "auditLog">, tenantId: string) {
  const [fila] = await db.auditLog.findMany({
    where: { tenantId, entity: ENTIDAD_TECLAS_FIJADAS, entityId: tenantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: { id: true, changes: true },
  });
  return fila;
}

/** Las teclas fijadas del negocio (vacío si nunca se fijaron o la fila no se puede leer). */
export async function leerTeclasFijadasDelNegocio(db: Pick<Db, "auditLog">, tenantId: string): Promise<TeclasFijadasLeidas> {
  const fila = await vigente(db, tenantId);
  if (!fila) return { ids: [], version: null };
  return { ids: leerTeclasFijadas((fila.changes as { ids?: unknown } | null)?.ids), version: fila.id };
}

/**
 * Guarda la lista entera con control de versión. Sólo quedan los ids que son productos de ESTE
 * negocio y no están borrados. Devuelve la versión nueva y la lista que quedó.
 */
export async function guardarTeclasFijadasEnTx(
  db: Db,
  tenantId: string,
  d: { ids: unknown; actor: string; versionLeida: string | null },
): Promise<TeclasFijadasLeidas> {
  const pedidos = leerTeclasFijadas(d.ids);
  const actual = await vigente(db, tenantId);
  if ((actual?.id ?? null) !== d.versionLeida) throw new RechazoDeDominio(CAMBIO_MIENTRAS_MIRABAS_TECLAS);
  const delNegocio =
    pedidos.length === 0
      ? []
      : await db.product.findMany({ where: { tenantId, id: { in: pedidos }, deletedAt: null }, select: { id: true } });
  const validos = new Set(delNegocio.map((p) => p.id));
  const ids = pedidos.filter((id) => validos.has(id));
  const fila = await db.auditLog.create({
    data: {
      tenantId,
      actor: d.actor,
      action: ACCION_FIJAR_TECLAS,
      entity: ENTIDAD_TECLAS_FIJADAS,
      entityId: tenantId,
      changes: { ids } as Prisma.InputJsonValue,
      channel: "admin",
    },
    select: { id: true },
  });
  return { ids, version: fila.id };
}
