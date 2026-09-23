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
//   · Fiado y Cuentas a pagar son de la ola 3 (su pantalla todavía no es la final).
// Esas apps van al Inicio sin número hasta que su frente escriba el loader.

import { businessWallTimeToUtc, dateStrInBusinessTz, fmtTime } from "@/lib/datetime";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { formatDayLabel } from "@/lib/caja/cierre-diario";
import { filtrosFacturacionMes } from "@/lib/bancos-glue";
import { bordesDelPeriodo } from "@/lib/report-ingresos";
import { DEFAULT_REPORT_RANGE_DAYS } from "@/lib/report-config";
import { saldoIvaDesdeGrupos, whereAnuladasConFactura, whereComprobantesDelMes } from "@/lib/libros/libro-iva";
import { mesDelNegocio, nombreDelMes } from "@/lib/libros/fecha-fiscal";
import { consultaAuditoriaCierre, datoCierreDelMes, mesParaCerrar } from "@/lib/cierre-mes/cierre-mes";
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
 * "12 comprobantes este mes · 1 rechazado por ARCA", y en alerta las ventas ANULADAS que
 * tienen factura y ninguna nota de crédito. "Este mes" es el MISMO corte que usan la
 * facturación automática y la cartera del contador (`filtrosFacturacionMes`, bancos-glue.ts:
 * lo emitido por `createdAt` en el mes del negocio), así que los tres cuentan lo mismo.
 *
 * Un rechazo no va a "Para atender hoy": queda en el mes aunque ya se haya vuelto a emitir, y
 * una alerta que no se apaga deja de leerse. La anulada con factura SÍ: pide una acción (la
 * nota de crédito en ARCA) y hasta que se haga infla lo facturado del mes. Se cuenta entre lo
 * emitido este mes, con el mismo `where` que el paso del Cierre del mes
 * (`whereAnuladasConFactura`); lo de meses anteriores lo levanta el cierre de ese mes.
 *
 * Límite conocido: el sistema todavía no registra notas de crédito, así que la alerta sigue
 * aunque la nota ya se haya emitido en ARCA. Se va sola cuando termina el mes (cuenta lo
 * emitido este mes); el Cierre del mes la deja como paso pendiente que se puede confirmar.
 *
 * DOS consultas, no una (como la frontera del Cierre del día): el total y los rechazados
 * salen de un `groupBy` por estado, y "cuya venta se anuló" es un filtro por relación que un
 * `groupBy` no puede expresar. Hacerlo en UNA obligaría a traer todas las facturas del mes
 * con el estado de su venta y contar en memoria: más filas, más lecturas (el `select` de la
 * relación son otras dos) y una segunda definición de "anulada con factura" al lado de
 * `whereAnuladasConFactura`, que es la del Cierre del mes. Las dos de acá son conteos por
 * índice y salen en paralelo.
 */
export const facturacion: LoaderKpi = async ({ db, tenantId, ahora }) => {
  const { cupo } = filtrosFacturacionMes(ahora);
  const [grupos, anuladas] = await Promise.all([
    db.invoice.groupBy({
      by: ["status"],
      where: { tenantId, ...cupo },
      _count: { _all: true },
    }),
    db.invoice.count({ where: whereAnuladasConFactura(tenantId, cupo) }),
  ]);
  const total = grupos.reduce((s, g) => s + g._count._all, 0);
  const rechazados = grupos.find((g) => g.status === "REJECTED")?._count._all ?? 0;
  const base = `${plural(total, "comprobante", "comprobantes")} este mes`;
  const valor = fmtNumberAR(total);
  const detalle =
    rechazados > 0 ? `${base} · ${fmtNumberAR(rechazados)} ${plural(rechazados, "rechazado", "rechazados")} por ARCA` : base;
  if (anuladas === 0) return { valor, detalle };
  return {
    valor,
    detalle,
    alerta: {
      valor: fmtNumberAR(anuladas),
      texto: `${plural(anuladas, "venta anulada", "ventas anuladas")} con factura sin nota de crédito`,
    },
  };
};

// ── Libro IVA ────────────────────────────────────────────────────────────────

/**
 * "IVA de septiembre: $X a pagar". Sale SÓLO de comprobantes con CAE del mes, con el MISMO
 * `where` que la pantalla (`whereComprobantesDelMes`), agrupados por tipo en una consulta.
 * La cuenta también es la de la pantalla (`saldoIvaDesdeGrupos`): el IVA con signo, las
 * notas de crédito restan y el crédito va en 0 (sin facturas de proveedor no hay crédito).
 *
 * Sólo para un Responsable Inscripto (alguna A o B en el mes): con sólo C (monotributo) el
 * botón va sin número, igual que la pantalla, que a un monotributista no le muestra el libro.
 * Sin comprobantes en el mes no hay número que dar: '—' con el motivo, y la pantalla muestra
 * el mismo '—' en el saldo. Es plata: pide reports:read (lo declara el catálogo).
 */
export const libroIva: LoaderKpi = async ({ db, tenantId, ahora, monto }) => {
  if (!monto) return null;
  const mes = mesDelNegocio(ahora);
  const grupos = await db.invoice.groupBy({
    by: ["tipoComprobante"],
    where: whereComprobantesDelMes(tenantId, mes),
    _sum: { iva: true },
  });
  const r = saldoIvaDesdeGrupos(grupos.map((g) => ({ tipoComprobante: g.tipoComprobante, iva: Number(g._sum.iva ?? 0) })));
  if (r.condicion === "monotributo") return null;
  if (r.condicion === "sin-comprobantes") {
    return { sinDato: `Todavía no hay comprobantes con CAE de ${nombreDelMes(mes)}` };
  }
  return {
    valor: fmtMoneyARS(Math.abs(r.saldo), 0),
    detalle: `IVA de ${nombreDelMes(mes)} ${r.saldo >= 0 ? "a pagar" : "a favor"}, sólo de comprobantes`,
  };
};

// ── Cierre del mes ───────────────────────────────────────────────────────────

/**
 * "Agosto · 7 de 8 pasos listos · paquete descargado por Ana el 03/09". Una consulta: las
 * filas de auditoría del mes anterior (congelar, reabrir, descargas). Los pasos listos salen
 * de la foto que se guardó al congelar; antes de congelar dice "sin congelar", y desde el
 * día 3 del mes va a "Para atender hoy" (`datoCierreDelMes`).
 */
export const cierreDelMes: LoaderKpi = async ({ db, tenantId, ahora }) => {
  const mes = mesParaCerrar(ahora);
  const filas = await db.auditLog.findMany(consultaAuditoriaCierre(tenantId, mes));
  const dia = Number(dateStrInBusinessTz(ahora).slice(8, 10));
  return datoCierreDelMes(filas, ahora, dia);
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
  "libro-iva": libroIva,
  "cierre-del-mes": cierreDelMes,
};
