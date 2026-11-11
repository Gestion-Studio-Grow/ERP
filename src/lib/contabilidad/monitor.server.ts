/**
 * Lectura y escrituras del monitor de obligaciones (FC-11 · T7). Todo dentro de `tenantTransaction`
 * con el negocio explícito (RLS + candado de la app). Sin migración nueva: usa las tablas de la
 * ola 1 (`ObligacionFiscal`, `VencimientoFiscal`) y `AuditLog` para el responsable y el rastro de
 * quién marcó qué. Si la ola 1 no está aplicada, devuelve MIGRACION_PENDIENTE (nunca un 500).
 *
 * Quien llama decide el acceso (sesión, rol, módulo, cartera del estudio); acá llega el tenantId
 * del negocio YA verificado, nunca uno que venga de un formulario.
 */

import { tenantTransaction } from "@/lib/rls";
import { esMigracionPendiente, MENSAJE_MIGRACION_PENDIENTE } from "./repo";
import { armarMonitor, responsablePorDefecto, responsablesDesdeEventos, type Monitor, type Responsable } from "./monitor";
import { hoyEnArgentina, type AccionObligacion, type EstadoVencimiento } from "./vencimientos";
import { TABLA_VENCIMIENTOS_2026 } from "./tabla-vencimientos-2026";

/** Evento de AuditLog que guarda el responsable de una obligación (el último manda). */
export const ACCION_RESPONSABLE = "asignar_responsable";
const ENTIDAD_OBLIGACION = "ObligacionFiscal";
const ESTADOS_ABIERTOS = ["PENDIENTE", "EN_CURSO", "PRESENTADO"];
/** Ventana del monitor: lo cerrado de los últimos 45 días y lo que vence en los próximos 120. */
const DIAS_ATRAS = 45;
const DIAS_ADELANTE = 120;
const TOPE_FILAS = 500;

export interface ObligacionDelMonitor {
  id: string;
  codigo: string;
  nombre: string;
  organismo: string;
  accion: AccionObligacion;
  activa: boolean;
  responsable: Responsable;
}

export type LecturaMonitor =
  | { ok: true; monitor: Monitor; obligaciones: ObligacionDelMonitor[]; tieneEstudio: boolean; tablaProvisional: boolean }
  | { ok: false; error: "MIGRACION_PENDIENTE"; mensaje: string };

const sumarDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/**
 * El monitor del negocio. `tieneEstudio`: true desde el panel del estudio; desde el negocio, si no
 * se dice, se infiere de que el estudio ya haya marcado algo (no se lee la cartera ajena).
 */
export async function leerMonitor(tenantId: string, opts: { tieneEstudio?: boolean; ahora?: Date } = {}): Promise<LecturaMonitor> {
  const ahora = opts.ahora ?? new Date();
  const hoy = hoyEnArgentina(ahora);
  try {
    return await tenantTransaction(
      async (tx) => {
        const [obligaciones, vencimientos, eventos, delEstudio] = await Promise.all([
          tx.obligacionFiscal.findMany({
            where: { tenantId },
            orderBy: [{ activa: "desc" }, { nombre: "asc" }],
            select: { id: true, codigo: true, nombre: true, organismo: true, accion: true, activa: true },
          }),
          tx.vencimientoFiscal.findMany({
            where: {
              tenantId,
              fechaVencimiento: { lte: sumarDias(hoy, DIAS_ADELANTE) },
              OR: [{ fechaVencimiento: { gte: sumarDias(hoy, -DIAS_ATRAS) } }, { estado: { in: ESTADOS_ABIERTOS } }],
            },
            orderBy: { fechaVencimiento: "asc" },
            take: TOPE_FILAS,
            select: {
              id: true,
              obligacionId: true,
              periodo: true,
              cuota: true,
              fechaVencimiento: true,
              fechaPresentacion: true,
              fechaPago: true,
              estado: true,
              obligacion: { select: { codigo: true, nombre: true, organismo: true, jurisdiccion: true, accion: true } },
            },
          }),
          tx.auditLog.findMany({
            where: { tenantId, entity: ENTIDAD_OBLIGACION, action: ACCION_RESPONSABLE },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 200,
            select: { entityId: true, changes: true },
          }),
          opts.tieneEstudio === undefined
            ? tx.auditLog.count({ where: { tenantId, entity: "VencimientoFiscal", channel: "estudio" } })
            : Promise.resolve(opts.tieneEstudio ? 1 : 0),
        ]);
        const tieneEstudio = delEstudio > 0;
        const responsables = responsablesDesdeEventos(eventos);
        const monitor = armarMonitor(
          vencimientos.map((v) => ({
            id: v.id,
            obligacionId: v.obligacionId,
            codigo: v.obligacion.codigo,
            nombre: v.obligacion.nombre || v.obligacion.codigo,
            organismo: v.obligacion.organismo,
            jurisdiccion: v.obligacion.jurisdiccion,
            accion: v.obligacion.accion as AccionObligacion,
            periodo: v.periodo,
            cuota: v.cuota,
            fechaVencimiento: v.fechaVencimiento,
            fechaPresentacion: v.fechaPresentacion,
            fechaPago: v.fechaPago,
            estado: v.estado as EstadoVencimiento,
          })),
          { tieneEstudio, responsables, ahora },
        );
        return {
          ok: true as const,
          monitor,
          tieneEstudio,
          tablaProvisional: TABLA_VENCIMIENTOS_2026.provisional,
          obligaciones: obligaciones.map((o) => ({
            ...o,
            accion: o.accion as AccionObligacion,
            responsable: responsables.get(o.id) ?? responsablePorDefecto(o.accion as AccionObligacion, tieneEstudio),
          })),
        };
      },
      { tenantId },
    );
  } catch (e) {
    if (esMigracionPendiente(e)) return { ok: false, error: "MIGRACION_PENDIENTE", mensaje: MENSAJE_MIGRACION_PENDIENTE };
    throw e;
  }
}

export type ResultadoEscritura = { ok: true } | { ok: false; error: "MIGRACION_PENDIENTE" | "NO_ENCONTRADO"; mensaje: string };

/** Anota quién tiene una obligación. Verifica que la obligación sea de ESTE negocio. */
export async function asignarResponsable(
  tenantId: string,
  obligacionId: string,
  responsable: Responsable,
  actor: string,
): Promise<ResultadoEscritura> {
  try {
    return await tenantTransaction(
      async (tx) => {
        const o = await tx.obligacionFiscal.findFirst({ where: { id: obligacionId, tenantId }, select: { id: true } });
        if (!o) return { ok: false as const, error: "NO_ENCONTRADO" as const, mensaje: "No encontramos esa obligación." };
        await tx.auditLog.create({
          data: { tenantId, actor, action: ACCION_RESPONSABLE, entity: ENTIDAD_OBLIGACION, entityId: o.id, changes: { responsable }, channel: "admin" },
        });
        return { ok: true as const };
      },
      { tenantId },
    );
  } catch (e) {
    if (esMigracionPendiente(e)) return { ok: false, error: "MIGRACION_PENDIENTE", mensaje: MENSAJE_MIGRACION_PENDIENTE };
    throw e;
  }
}
