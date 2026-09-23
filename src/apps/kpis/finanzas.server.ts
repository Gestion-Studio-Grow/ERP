// ============================================================================
// NÚMEROS DE CAJA Y FINANZAS — Caja del día, Cierre, Facturación y Reportes.
// ============================================================================
//
// Mismas reglas que todos los loaders de esta carpeta (ver mostrador.server.ts): una
// operación por número, el `where` de la pantalla y nada de caché ni transacciones.
//
// Lo que queda para su frente, con su porqué:
//   · el efectivo esperado de la caja y el saldo o los duplicados del libro necesitan la
//     cuenta del arqueo (`buildCierreDiario`), que suma movimientos y no es una operación;
//   · Libro IVA, Fiado y Cuentas a pagar son del frente de finanzas de las olas 2 y 3.
// Esas apps van al Inicio sin número hasta que su frente escriba el loader.

import { businessWallTimeToUtc, fmtTime } from "@/lib/datetime";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { formatDayLabel } from "@/lib/caja/cierre-diario";
import { filtrosFacturacionMes } from "@/lib/bancos-glue";
import { bordesDelPeriodo } from "@/lib/report-ingresos";
import { DEFAULT_REPORT_RANGE_DAYS } from "@/lib/report-config";
import { fmtMoneyARS, fmtNumberAR } from "@/components/ui/format";
import { plural, type DatoKpi, type LoaderKpi } from "./nucleo.server";

// ── Caja del día ─────────────────────────────────────────────────────────────

/**
 * "Abierta desde las 9:10" o "Cerrada". Sólo en un local de mostrador: en servicios la caja
 * no tiene cajón ni turno de cajero (caja/page.tsx, `tieneCajonFisico`) y la app va sin
 * número. El `where` es el de la pantalla (`getCajaData`, caja-actions.ts: la sesión OPEN
 * más reciente del negocio).
 *
 * "Cerrada" no va a "Para atender hoy": a las 22 una caja cerrada es lo normal. Lo que sí
 * dice es qué hacer, porque vender en efectivo con la caja cerrada deja esa plata fuera del
 * arqueo del turno (cash-sale.ts).
 */
export const cajaDelDia: LoaderKpi = async ({ db, tenantId, esMostrador }) => {
  if (!esMostrador) return null;
  const abierta = await db.cashSession.findFirst({
    where: { tenantId, status: "OPEN" },
    orderBy: { openedAt: "desc" },
    select: { openedAt: true },
  });
  if (!abierta) return { valor: "Cerrada", detalle: "abrila antes de cobrar en efectivo" };
  return { valor: "Abierta", detalle: `desde las ${fmtTime(abierta.openedAt)}` };
};

// ── Cierre del día ───────────────────────────────────────────────────────────

/**
 * Hasta qué día está cerrada la caja, leído con la MISMA frontera que usa el cierre para
 * congelar el libro (`lastClosedDayTx`, frontera-cierre.ts). Son dos lecturas (el último
 * corte inicial y el último cierre) y no una: la frontera es el mayor de los dos, y
 * reescribirla en una sola consulta sería una segunda definición de "cerrado". Acá pesa más
 * que el tile y la pantalla digan lo mismo.
 */
export const cierreDelDia: LoaderKpi = async ({ db, tenantId, hoy }) => {
  const cerradoHasta = await lastClosedDayTx(db, tenantId);
  return resumirCierre(cerradoHasta, hoy);
};

/**
 * Los días que quedaron entre el último cierre y hoy. Hoy no cuenta: el día todavía no
 * terminó. Cerrado ayer (o hoy) = al día. Nunca cerrado = sin cierres, sin alerta: un
 * negocio que recién arranca no tiene nada atrasado. PURA.
 */
export function resumirCierre(cerradoHasta: string | null, hoy: string): DatoKpi {
  if (!cerradoHasta) return { valor: "Sin cierres", detalle: "todavía no se cerró ningún día" };
  const ultimo = formatDayLabel(cerradoHasta);
  const dias = diasEntre(cerradoHasta, hoy) - 1;
  if (dias <= 0) return { valor: "Al día", detalle: `último cierre ${ultimo}` };
  return {
    valor: ultimo,
    detalle: "último cierre",
    alerta: { valor: fmtNumberAR(dias), texto: `${plural(dias, "día", "días")} sin cerrar` },
  };
}

/** Días de calendario de `desde` a `hasta` (AAAA-MM-DD, sin hora ni zona). PURA. */
function diasEntre(desde: string, hasta: string): number {
  const utc = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((utc(hasta) - utc(desde)) / 86_400_000);
}

// ── Facturación ──────────────────────────────────────────────────────────────

/**
 * "12 comprobantes este mes · 1 rechazado por ARCA". "Este mes" es el MISMO corte que usan
 * la facturación automática y la cartera del contador (`filtrosFacturacionMes`,
 * bancos-glue.ts: lo emitido por `createdAt` en el mes del negocio), así que los tres
 * cuentan lo mismo. Un rechazo no va a "Para atender hoy": queda en el mes aunque ya se
 * haya vuelto a emitir, y una alerta que no se apaga deja de leerse.
 */
export const facturacion: LoaderKpi = async ({ db, tenantId, ahora }) => {
  const { cupo } = filtrosFacturacionMes(ahora);
  const grupos = await db.invoice.groupBy({
    by: ["status"],
    where: { tenantId, ...cupo },
    _count: { _all: true },
  });
  const total = grupos.reduce((s, g) => s + g._count._all, 0);
  const rechazados = grupos.find((g) => g.status === "REJECTED")?._count._all ?? 0;
  const detalle = `${plural(total, "comprobante", "comprobantes")} este mes`;
  return {
    valor: fmtNumberAR(total),
    detalle:
      rechazados > 0
        ? `${detalle} · ${fmtNumberAR(rechazados)} ${plural(rechazados, "rechazado", "rechazados")} por ARCA`
        : detalle,
  };
};

/**
 * "5 listas para emitir · 2 esperan tus datos". Los mismos dos conteos que muestra la
 * pantalla de facturación automática (`kpisFacturacionBancaria`, bancos-glue.ts: propuestas
 * en "auto" y en "revision"), en una sola lectura agrupada.
 */
export const facturacionAutomatica: LoaderKpi = async ({ db, tenantId }) => {
  const grupos = await db.movimientoImportado.groupBy({
    by: ["estadoPropuesta"],
    where: { tenantId, estadoPropuesta: { in: ["auto", "revision"] } },
    _count: { _all: true },
  });
  const listas = grupos.find((g) => g.estadoPropuesta === "auto")?._count._all ?? 0;
  const enRevision = grupos.find((g) => g.estadoPropuesta === "revision")?._count._all ?? 0;
  const detalle = plural(listas, "lista para emitir", "listas para emitir");
  return {
    valor: fmtNumberAR(listas),
    detalle:
      enRevision > 0
        ? `${detalle} · ${fmtNumberAR(enRevision)} ${plural(enRevision, "espera", "esperan")} tus datos`
        : detalle,
  };
};

// ── Reportes ─────────────────────────────────────────────────────────────────

/**
 * Lo cobrado en turnos en el período que Reportes abre por defecto: el mismo `where` y los
 * mismos bordes de día que `getReportData` (actions.ts), con `DEFAULT_REPORT_RANGE_DAYS`. Se
 * usa el período por defecto de la pantalla y no "7 días" porque Reportes no ofrece 7: el
 * tile llevaría a una pantalla con otro número.
 *
 * En un mostrador, Reportes suma sólo los pagos de TURNOS (lo dice la propia pantalla): el
 * número sería $0 con el local vendiendo todo el día. Ahí va '—' con el porqué.
 */
export const reportes: LoaderKpi = async ({ db, tenantId, hoy, esMostrador }) => {
  if (esMostrador) return { sinDato: "Las ventas del mostrador se ven en el libro de caja" };
  const { desde, hasta } = bordesDelPeriodo(hoy, DEFAULT_REPORT_RANGE_DAYS, businessWallTimeToUtc);
  const r = await db.payment.aggregate({
    where: { tenantId, status: "APPROVED", createdAt: { gte: desde, lte: hasta } },
    _sum: { amount: true },
  });
  return {
    valor: fmtMoneyARS(r._sum.amount ?? 0, 0),
    detalle: `cobrado en turnos, últimos ${DEFAULT_REPORT_RANGE_DAYS} días`,
  };
};

export const LOADERS_FINANZAS: Readonly<Record<string, LoaderKpi>> = {
  "caja-del-dia": cajaDelDia,
  "cierre-del-dia": cierreDelDia,
  facturacion,
  "facturacion-automatica": facturacionAutomatica,
  reportes,
};
