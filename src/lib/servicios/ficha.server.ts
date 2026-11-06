// Ficha completa del servicio — lecturas y escrituras, TOLERANTES a que la migración
// 20261104123000_servicio_completo todavía no esté aplicada (Gate 2: main despliega antes de
// migrar). Sin las tablas, toda lectura devuelve la ficha vacía (`disponible: false`) y el
// catálogo, la agenda y la reserva funcionan exactamente como antes; el formulario esconde los
// campos nuevos. Ninguna consulta de Service se cruza con estas tablas: se leen aparte, por id.

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import type { TxClient } from "@/lib/booking-core";
import { FICHA_VACIA, minutosEnAgenda, type FichaDelServicio } from "./ficha";

/** ¿El error es «la tabla o la columna todavía no existe»? (P2021/P2022, o el 42P01 de Postgres). */
export function faltaLaMigracion(e: unknown): boolean {
  const o = typeof e === "object" && e !== null ? (e as { code?: unknown; message?: unknown; meta?: unknown }) : null;
  if (!o) return false;
  if (o.code === "P2021" || o.code === "P2022" || o.code === "42P01") return true;
  const texto = `${String(o.message ?? "")} ${JSON.stringify(o.meta ?? {})}`;
  return /(ServiceDetail|ServiceFoto)/.test(texto) && /(does not exist|no existe|TableDoesNotExist|ColumnNotFound)/i.test(texto);
}

export interface FichasDelCatalogo {
  /** false: la migración no está aplicada; el formulario no muestra los campos nuevos. */
  disponible: boolean;
  fichas: Map<string, FichaDelServicio>;
  /** Ids de las fotos de cada servicio, en orden. La foto se pide a /servicios/foto/[id]. */
  fotos: Map<string, string[]>;
}

const NADA: FichasDelCatalogo = { disponible: false, fichas: new Map(), fotos: new Map() };

/** Fichas y fotos (sólo los ids) de varios servicios del negocio, en dos consultas. */
export async function fichasDeServicios(tenantId: string, serviceIds: readonly string[]): Promise<FichasDelCatalogo> {
  try {
    const ids = [...new Set(serviceIds)];
    const [fichas, fotos] = await Promise.all([
      prisma.serviceDetail.findMany({
        where: { tenantId, ...(ids.length ? { serviceId: { in: ids } } : { serviceId: "__ninguno__" }) },
        select: { serviceId: true, priceToDefine: true, calendarMin: true, depositPercent: true, modality: true, kind: true, reminderNote: true },
      }),
      prisma.serviceFoto.findMany({
        where: { tenantId, ...(ids.length ? { serviceId: { in: ids } } : { serviceId: "__ninguno__" }) },
        select: { id: true, serviceId: true },
        orderBy: [{ serviceId: "asc" }, { posicion: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    const porServicio = new Map<string, FichaDelServicio>();
    for (const f of fichas) {
      const { serviceId, ...ficha } = f;
      porServicio.set(serviceId, ficha);
    }
    const porFoto = new Map<string, string[]>();
    for (const f of fotos) porFoto.set(f.serviceId, [...(porFoto.get(f.serviceId) ?? []), f.id]);
    return { disponible: true, fichas: porServicio, fotos: porFoto };
  } catch (e) {
    if (faltaLaMigracion(e)) return NADA;
    throw e;
  }
}

/** La ficha de un servicio (o la vacía si no hay fila o falta la migración). */
export async function fichaDelServicio(tenantId: string, serviceId: string): Promise<FichaDelServicio> {
  try {
    const f = await prisma.serviceDetail.findFirst({
      where: { tenantId, serviceId },
      select: { priceToDefine: true, calendarMin: true, depositPercent: true, modality: true, kind: true, reminderNote: true },
    });
    return f ?? FICHA_VACIA;
  } catch (e) {
    if (faltaLaMigracion(e)) return FICHA_VACIA;
    throw e;
  }
}

/** ¿Están las tablas de la ficha? Una consulta mínima; se usa antes de abrir una transacción. */
export async function fichaDisponible(tenantId: string): Promise<boolean> {
  try {
    await prisma.serviceDetail.findFirst({ where: { tenantId }, select: { id: true } });
    return true;
  } catch (e) {
    if (faltaLaMigracion(e)) return false;
    throw e;
  }
}

/** Minutos que el servicio bloquea en la agenda (calendarMin ?? durationMin). */
export async function minutosEnAgendaDelServicio(tenantId: string, service: { id: string; durationMin: number }): Promise<number> {
  const ficha = await fichaDelServicio(tenantId, service.id);
  return minutosEnAgenda(service.durationMin, ficha.calendarMin);
}

/**
 * Aclaraciones para el recordatorio de varios servicios (serviceId → nota). Sin migración, vacío.
 * En su PROPIA transacción del negocio: la usa también el barrido de recordatorios (cron, sin
 * request de dónde sacar el negocio), y si la tabla falta, la que se cae es ésta y no la del envío.
 */
export async function notasDeRecordatorio(tenantId: string, serviceIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(serviceIds)];
  if (ids.length === 0) return new Map();
  try {
    const filas = await tenantTransaction(
      (tx) =>
        tx.serviceDetail.findMany({
          where: { tenantId, serviceId: { in: ids }, reminderNote: { not: null } },
          select: { serviceId: true, reminderNote: true },
        }),
      { tenantId },
    );
    return new Map(filas.filter((f) => f.reminderNote).map((f) => [f.serviceId, f.reminderNote as string]));
  } catch (e) {
    if (faltaLaMigracion(e)) return new Map();
    throw e;
  }
}

/**
 * Guarda la ficha DENTRO de la transacción del alta/edición. Quien llama confirmó antes, con
 * `fichaDisponible`, que la tabla existe: un error de tabla adentro de una transacción la aborta
 * entera, así que no se intenta a ciegas.
 */
export async function guardarFichaEnTx(tx: TxClient, tenantId: string, serviceId: string, ficha: FichaDelServicio): Promise<void> {
  await tx.serviceDetail.upsert({
    where: { serviceId },
    create: { tenantId, serviceId, ...ficha },
    update: { ...ficha },
  });
}

/** Una foto guardada, lista para servir. Sólo JPEG/WebP: un SVG podría traer código adentro. */
export async function fotoDeServicioGuardada(tenantId: string, id: string): Promise<{ tipo: string; bytes: Buffer } | null> {
  if (!/^[a-z0-9]{10,40}$/.test(id)) return null;
  try {
    const f = await prisma.serviceFoto.findFirst({ where: { id, tenantId }, select: { url: true } });
    const m = f?.url.match(/^data:(image\/(?:jpeg|webp));base64,(.+)$/);
    if (!m) return null;
    const bytes = Buffer.alloc(Buffer.byteLength(m[2], "base64"));
    bytes.write(m[2], "base64");
    return { tipo: m[1], bytes };
  } catch (e) {
    if (faltaLaMigracion(e)) return null;
    throw e;
  }
}
