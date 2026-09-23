// ============================================================================
// NÚMEROS DE CLIENTES — Campañas.
// ============================================================================
//
// Mismas reglas que todos los loaders de esta carpeta (ver mostrador.server.ts).
//
// Queda para el frente comercial (ola 3), con su porqué: "clientes nuevos este mes" es
// primera visita o primer pedido, una regla del motor comercial que todavía no tiene una
// consulta propia; la agenda, la lista de espera, las reseñas y los recordatorios son de
// negocios de turnos, y en la ola 1 ninguno de esos ve el Inicio por apps (CH sigue con el
// de hoy). Van sin número hasta entonces.

import { fmtNumberAR } from "@/components/ui/format";
import { plural, type LoaderKpi } from "./nucleo.server";

/**
 * "120 anotados": los de la campaña presencial, los mismos que lista la pantalla
 * (campania/page.tsx: `leadCampania` del negocio). Si la tabla todavía no existe en la base
 * del negocio, '—' con el motivo en vez de un error: es un estado conocido de la migración.
 */
export const campanias: LoaderKpi = async ({ db, tenantId }) => {
  try {
    const n = await db.leadCampania.count({ where: { tenantId } });
    return { valor: fmtNumberAR(n), detalle: plural(n, "anotado", "anotados") };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") {
      return { sinDato: "La campaña todavía no está habilitada en este negocio" };
    }
    throw e;
  }
};

export const LOADERS_COMERCIAL: Readonly<Record<string, LoaderKpi>> = { campanias };
