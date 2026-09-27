// ============================================================================
// NÚMEROS DEL MOSTRADOR DE SUPERMERCADO — Caja con lector y Ofertas de la semana. Cada uno se
// registra en el mapa de su dominio (mostrador.server.ts y precios.server.ts).
// ============================================================================
//
// Mismas reglas que los vecinos (ver mostrador.server.ts): UNA consulta por número, con el `db`
// del contexto y el negocio en el `where`, sin caché entre requests.

import { businessWallTimeToUtc } from "@/lib/datetime";
import { nextDayKey } from "@/lib/caja/cierre-diario";
import { fmtNumberAR } from "@/components/ui/format";
import { ACCION_PROMOS_DE_LA_VENTA } from "@/lib/supermercado/marcas";
import { leerPromociones } from "@/lib/supermercado/config-repo";
import { diaDeLaSemana, vigenteEn } from "@/lib/supermercado/promociones";
import { plural, type LoaderKpi } from "./nucleo.server";

/** "12 tickets con promo hoy": las filas de promos que dejó el alta de cada venta de hoy. */
export const cajaRapida: LoaderKpi = async ({ db, tenantId, hoy }) => {
  const n = await db.auditLog.count({
    where: {
      tenantId,
      entity: "Order",
      action: ACCION_PROMOS_DE_LA_VENTA,
      createdAt: { gte: businessWallTimeToUtc(hoy, "00:00"), lt: businessWallTimeToUtc(nextDayKey(hoy), "00:00") },
    },
  });
  return { valor: fmtNumberAR(n), detalle: plural(n, "ticket con promo hoy", "tickets con promo hoy") };
};

/** "4 promos hoy", y en alerta las que vencen en los próximos 3 días. */
export const ofertas: LoaderKpi = async ({ db, tenantId, hoy }) => {
  const promos = await leerPromociones(db, tenantId);
  const dia = diaDeLaSemana(hoy);
  const hoyVigentes = promos.filter((p) => vigenteEn(p, { fecha: hoy, diaSemana: dia })).length;
  const enTres = nextDayKey(nextDayKey(nextDayKey(hoy)));
  const vencen = promos.filter((p) => p.activa && p.hasta && p.hasta >= hoy && p.hasta <= enTres).length;
  if (promos.length === 0) return { sinDato: "Todavía no hay promos cargadas" };
  return {
    valor: fmtNumberAR(hoyVigentes),
    detalle: plural(hoyVigentes, "promo vale hoy", "promos valen hoy"),
    ...(vencen > 0 ? { alerta: { valor: fmtNumberAR(vencen), texto: plural(vencen, "promo vence en 3 días", "promos vencen en 3 días") } } : {}),
  };
};
