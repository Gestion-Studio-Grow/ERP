// ============================================================================
// CONFIGURACIÓN DEL SUPERMERCADO EN LA BASE — promos, formato de balanza y listas de proveedor.
// ============================================================================
//
// DÓNDE SE GUARDA, Y POR QUÉ. Sin migración: cada cambio es una fila de `AuditLog` (entity
// "Promocion", "ConfigBalanza", "ListaDeProveedor") y el estado vigente es la fila MÁS NUEVA de
// cada una. Es el mismo patrón que ya usan los interruptores ("Interruptor") y el régimen de la
// Factura A ("RegimenFacturaA"): la tabla tiene `tenantId` con su política de RLS, el rastro
// (quién, cuándo, qué cambió) sale gratis, y la purga de la auditoría no las toca
// (audit-retention.ts, PURGE_EXEMPT_ENTITIES). El día que haga falta una tabla propia, sólo
// cambia este archivo.
//
// CONCURRENCIA. Guardar exige la versión que se leyó (el id de la fila vigente): si otra persona
// guardó en el medio, se rechaza y se pide volver a mirar, en vez de pisarle el cambio. Se corre
// en una transacción serializable (el llamador la abre con `tenantTransaction`).
//
// Recibe el cliente por parámetro (sin "use server" ni `server-only`): lo usan las acciones y
// las páginas con el cliente de la app, y los tests de integración con la base efímera.

import type { Prisma } from "@/generated/prisma/client";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { ENTIDAD_CONFIG_CAJA, ENTIDAD_LISTA_PROVEEDOR, ENTIDAD_PROMOCION } from "./marcas";
import { promocionDesdeAfuera, type Promocion } from "./promociones";
import { FORMATO_BALANZA_POR_DEFECTO, formatoDesdeAfuera, type FormatoBalanza } from "./balanza";

type Db = Pick<Prisma.TransactionClient, "auditLog">;

export const CAMBIO_MIENTRAS_MIRABAS =
  "Otra persona cambió esto mientras lo mirabas. Volvé a abrirlo para ver cómo quedó y hacé tu cambio de nuevo.";

/** La fila vigente de cada `entityId` de una entidad del negocio. */
async function vigentes(db: Db, tenantId: string, entity: string, entityId?: string) {
  return db.auditLog.findMany({
    where: { tenantId, entity, ...(entityId ? { entityId } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    distinct: ["entityId"],
    select: { id: true, entityId: true, action: true, actor: true, changes: true, createdAt: true },
  });
}

/** Controla la versión y escribe la fila nueva. Tira `RechazoDeDominio` si alguien se adelantó. */
async function escribir(
  db: Db,
  d: { tenantId: string; entity: string; entityId: string; action: string; actor: string; changes: unknown; versionLeida: string | null },
): Promise<string> {
  const [ultima] = await vigentes(db, d.tenantId, d.entity, d.entityId);
  if ((ultima?.id ?? null) !== d.versionLeida) throw new RechazoDeDominio(CAMBIO_MIENTRAS_MIRABAS);
  const fila = await db.auditLog.create({
    data: {
      tenantId: d.tenantId,
      actor: d.actor,
      action: d.action,
      entity: d.entity,
      entityId: d.entityId,
      changes: d.changes as Prisma.InputJsonValue,
      channel: "admin",
    },
    select: { id: true },
  });
  return fila.id;
}

// ── Promociones ──────────────────────────────────────────────────────────────

export type PromocionGuardada = Promocion & {
  /** El id de la fila vigente: lo que se manda de vuelta al guardar. */
  version: string;
  actualizada: Date;
  /** Quién la guardó por última vez (actor "user:<id>"). */
  por: string;
};

export type AccionPromocion = "crear" | "editar" | "pausar" | "activar" | "borrar";

/** Las promos del negocio (sin las borradas), ordenadas por prioridad. */
export async function leerPromociones(db: Db, tenantId: string): Promise<PromocionGuardada[]> {
  const filas = await vigentes(db, tenantId, ENTIDAD_PROMOCION);
  const out: PromocionGuardada[] = [];
  for (const f of filas) {
    if (f.action === "borrar") continue;
    const p = promocionDesdeAfuera((f.changes as { promocion?: unknown } | null)?.promocion);
    if (p) out.push({ ...p, version: f.id, actualizada: f.createdAt, por: f.actor });
  }
  return out.sort((a, b) => a.prioridad - b.prioridad || a.nombre.localeCompare(b.nombre, "es"));
}

/** Guarda una promo (alta, edición, pausa, reactivación o baja) con control de versión. */
export async function guardarPromocionEnTx(
  db: Db,
  tenantId: string,
  d: { promocion: Promocion; accion: AccionPromocion; actor: string; versionLeida: string | null },
): Promise<string> {
  if (d.accion === "crear" && d.versionLeida !== null) throw new RechazoDeDominio("Una promo nueva no tiene versión anterior.");
  if (d.accion !== "crear" && d.versionLeida === null) throw new RechazoDeDominio("Esa promo no existe: volvé a abrir la lista.");
  return escribir(db, {
    tenantId,
    entity: ENTIDAD_PROMOCION,
    entityId: d.promocion.id,
    action: d.accion,
    actor: d.actor,
    changes: { promocion: d.promocion },
    versionLeida: d.versionLeida,
  });
}

// ── Caja con lector: formato de la balanza y encargados ─────────────────────

export type ConfigCaja = {
  formato: FormatoBalanza;
  /**
   * Usuarios (ids) que autorizan anular un renglón o un ticket en la caja, además de los dueños.
   * Los roles del sistema son tres (dueño, recepción, profesional): el encargado de turno de un
   * súper es alguien de recepción que el dueño elige acá, sin inventar un rol nuevo.
   */
  encargados: string[];
};

export type ConfigCajaLeida = ConfigCaja & { version: string | null; porDefecto: boolean };

/** La configuración de la caja del negocio, o la de fábrica si nunca se configuró. */
export async function leerConfigCaja(db: Db, tenantId: string): Promise<ConfigCajaLeida> {
  const [f] = await vigentes(db, tenantId, ENTIDAD_CONFIG_CAJA, tenantId);
  const c = (f?.changes ?? null) as { formato?: unknown; encargados?: unknown } | null;
  const formato = c ? formatoDesdeAfuera(c.formato) : null;
  const encargados = Array.isArray(c?.encargados) ? c!.encargados.filter((x): x is string => typeof x === "string") : [];
  return formato
    ? { formato, encargados, version: f!.id, porDefecto: false }
    : { formato: FORMATO_BALANZA_POR_DEFECTO, encargados, version: f?.id ?? null, porDefecto: true };
}

export async function guardarConfigCajaEnTx(
  db: Db,
  tenantId: string,
  d: { config: ConfigCaja; actor: string; versionLeida: string | null },
): Promise<string> {
  return escribir(db, {
    tenantId,
    entity: ENTIDAD_CONFIG_CAJA,
    entityId: tenantId,
    action: "guardar",
    actor: d.actor,
    changes: { formato: d.config.formato, encargados: [...new Set(d.config.encargados)] },
    versionLeida: d.versionLeida,
  });
}

// ── Listas de precios de proveedores ────────────────────────────────────────

export type RenglonDeLista = { codigo: string; nombre: string; costo: number };
export type ListaGuardada = {
  proveedorId: string;
  renglones: RenglonDeLista[];
  /** AAAA-MM-DD: desde cuándo vale la lista (la fecha que trae el proveedor). */
  vigenteDesde: string;
  version: string;
  cargada: Date;
  por: string;
};

function renglonesDesdeFila(v: unknown): RenglonDeLista[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const r = x as Partial<RenglonDeLista>;
    return typeof r.codigo === "string" && typeof r.nombre === "string" && typeof r.costo === "number" && Number.isFinite(r.costo)
      ? [{ codigo: r.codigo, nombre: r.nombre, costo: r.costo }]
      : [];
  });
}

/** La lista vigente de cada proveedor que tiene una (o de uno solo). */
export async function leerListasDeProveedor(db: Db, tenantId: string, proveedorId?: string): Promise<ListaGuardada[]> {
  const filas = await vigentes(db, tenantId, ENTIDAD_LISTA_PROVEEDOR, proveedorId);
  return filas.flatMap((f) => {
    if (!f.entityId || f.action === "borrar") return [];
    const c = (f.changes ?? {}) as { renglones?: unknown; vigenteDesde?: unknown };
    return [
      {
        proveedorId: f.entityId,
        renglones: renglonesDesdeFila(c.renglones),
        vigenteDesde: typeof c.vigenteDesde === "string" ? c.vigenteDesde : f.createdAt.toISOString().slice(0, 10),
        version: f.id,
        cargada: f.createdAt,
        por: f.actor,
      },
    ];
  });
}

export async function guardarListaDeProveedorEnTx(
  db: Db,
  tenantId: string,
  d: { proveedorId: string; renglones: RenglonDeLista[]; vigenteDesde: string; actor: string; versionLeida: string | null },
): Promise<string> {
  return escribir(db, {
    tenantId,
    entity: ENTIDAD_LISTA_PROVEEDOR,
    entityId: d.proveedorId,
    action: "cargar",
    actor: d.actor,
    changes: { renglones: d.renglones, vigenteDesde: d.vigenteDesde },
    versionLeida: d.versionLeida,
  });
}
