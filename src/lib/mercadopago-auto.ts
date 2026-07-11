/**
 * AUTO-FACTURADO de Mercado Pago — glue REAL (ADR-024/025, go-live suite).
 *
 * Cierra el circuito "todo cobro se factura solo": los pagos acreditados de
 * Mercado Pago entran al MISMO pipeline que el extracto bancario — se persisten
 * como `MovimientoImportado` (origen `mercadopago`) bajo una importación diaria
 * automática, con las MISMAS reglas del dueño (umbral de identificación, tope
 * mensual) y la MISMA cola de revisión. Así el tablero de Facturación automática
 * muestra banco + Mercado Pago juntos, y el cruce banco↔MP (mismo cobro por los
 * dos canales) lo resuelve la detección cruzada que ya existe.
 *
 * Idempotencia SIN migración nueva: el unique `[tenantId, hash]` de
 * `MovimientoImportado` con `hash = "mp:" + paymentId` garantiza que ver el
 * mismo pago por webhook Y por backfill no duplique ni el movimiento ni la
 * factura (ADR-025 §3). La `ReconciliacionPort` del plugin se implementa sobre
 * esa tabla (los estados terminales del plugin ↔ `estadoPropuesta`).
 *
 * Los reintentos de errores transitorios viven en memoria por corrida (el
 * webhook de MP ya reintenta solo); un fallo persistente escala a REVISAR.
 */

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { gatewayCobrosPara } from "@/lib/pagos-dispatch";
import { facturarPagoMP } from "@/lib/invoice-from-mp";
import {
  ClasificadorPorReglas,
  AprendizajeEnMemoria,
  facturarPagoSiCorresponde,
  sincronizarPagos,
  type ClasificadorPort,
  type IngestaDeps,
  type ResumenIngesta,
  type CriterioBusqueda,
  type PagoMP,
  type ReconciliacionPort,
} from "@/plugins/mercadopago";
import {
  configBancosDesdeTenant,
  contarFacturasDelMes,
  type ClasificacionMovimientoDb,
  type EstadoPropuestaDb,
} from "@/lib/bancos-glue";
import { UMBRAL_IDENTIFICACION_DEFAULT } from "@/plugins/bancos";

// ---------------------------------------------------------------------------
// Mapeos plugin ↔ DB
// ---------------------------------------------------------------------------

/** Fecha de hoy en formato ARCA AAAAMMDD (fallback si el pago no trae fecha). */
function hoyAAAAMMDD(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/** Clasificación del movimiento en DB según el tipo de operación del gateway. */
export function clasificacionDesdeOperacion(pago: PagoMP): ClasificacionMovimientoDb {
  switch (pago.operacion ?? "pago") {
    case "pago":
      return "venta";
    case "transferencia":
      return "transferencia_propia";
    case "devolucion":
      return "reverso";
    case "prestamo":
      return "prestamo";
    case "reintegro":
    case "otro":
    default:
      return "otro";
  }
}

/** Hash idempotente del movimiento MP (unique [tenantId, hash] en DB). */
export function hashPagoMP(paymentId: string): string {
  return `mp:${paymentId}`;
}

const TERMINALES: EstadoPropuestaDb[] = ["emitida", "no_facturable", "revision", "descartado"];

// ---------------------------------------------------------------------------
// Reconciliación sobre MovimientoImportado (la tabla que ya existe)
// ---------------------------------------------------------------------------

/**
 * `ReconciliacionPort` real: persiste cada decisión de la ingesta como un
 * `MovimientoImportado` de origen Mercado Pago. Cachea el pago en vuelo para
 * volcar sus datos (monto/fecha/descripcion) al persistir la decisión.
 */
export class ReconciliacionMovimientosMP implements ReconciliacionPort {
  private pagosEnVuelo = new Map<string, PagoMP>();
  private intentos = new Map<string, number>();

  constructor(private readonly tenantId: string) {}

  /** La ingesta no pasa el pago a los marcar*; lo anotamos antes de procesar. */
  recordarPago(pago: PagoMP): void {
    this.pagosEnVuelo.set(pago.id, pago);
  }

  async yaProcesado(paymentId: string): Promise<boolean> {
    const existente = await tenantTransaction(
      (tx) =>
        tx.movimientoImportado.findFirst({
          where: { tenantId: this.tenantId, hash: hashPagoMP(paymentId) },
          select: { estadoPropuesta: true },
        }),
      { tenantId: this.tenantId },
    );
    return existente != null && TERMINALES.includes(existente.estadoPropuesta as EstadoPropuestaDb);
  }

  private async persistir(
    paymentId: string,
    estado: EstadoPropuestaDb,
    extra: { invoiceId?: string; motivo?: string },
  ): Promise<void> {
    const pago = this.pagosEnVuelo.get(paymentId);
    const hash = hashPagoMP(paymentId);
    await tenantTransaction(
      async (tx) => {
        // Importación "sobre" diaria de Mercado Pago (una por día por tenant).
        const hoy = hoyAAAAMMDD();
        const nombre = `Mercado Pago (automático) ${hoy.slice(6, 8)}/${hoy.slice(4, 6)}/${hoy.slice(0, 4)}`;
        let importacion = await tx.importacionBancaria.findFirst({
          where: { tenantId: this.tenantId, origen: "mercadopago", nombreArchivo: nombre },
          select: { id: true },
        });
        if (!importacion) {
          importacion = await tx.importacionBancaria.create({
            data: {
              tenantId: this.tenantId,
              nombreArchivo: nombre,
              origen: "mercadopago",
              archivo: Buffer.alloc(0), // no hay archivo: la fuente es la API de MP
              mapeoJson: { fuente: "mercadopago", confianza: 1 },
              estado: "confirmada",
            },
            select: { id: true },
          });
        }

        await tx.movimientoImportado.upsert({
          where: { tenantId_hash: { tenantId: this.tenantId, hash } },
          create: {
            tenantId: this.tenantId,
            importacionId: importacion.id,
            hash,
            fecha: pago?.fechaAcreditacion ?? hoy,
            monto: pago?.monto ?? 0,
            descripcion: pago?.descripcion ?? `Cobro Mercado Pago ${paymentId}`,
            contraparte: pago?.contraparteNombre ?? null,
            referencia: paymentId,
            clasificacion: pago ? clasificacionDesdeOperacion(pago) : "otro",
            estadoPropuesta: estado,
            motivoRevision: extra.motivo ?? null,
            invoiceId: extra.invoiceId ?? null,
          },
          update: {
            estadoPropuesta: estado,
            motivoRevision: extra.motivo ?? null,
            ...(extra.invoiceId ? { invoiceId: extra.invoiceId } : {}),
          },
        });
        await tx.importacionBancaria.update({
          where: { id: importacion.id },
          data: { totalMovimientos: { increment: 1 } },
        });
      },
      { tenantId: this.tenantId },
    );
  }

  async marcarFacturado(paymentId: string, invoiceId: string): Promise<void> {
    await this.persistir(paymentId, "emitida", { invoiceId });
  }

  async marcarNoFacturable(paymentId: string, motivo: string): Promise<void> {
    await this.persistir(paymentId, "no_facturable", { motivo });
  }

  async marcarRevisar(paymentId: string, motivo: string): Promise<void> {
    await this.persistir(paymentId, "revision", { motivo });
  }

  async marcarRechazado(paymentId: string, motivo: string): Promise<void> {
    // Rechazo de ARCA: a la cola de revisión con el motivo (decisión humana).
    await this.persistir(paymentId, "revision", { motivo: `ARCA lo rechazó: ${motivo}` });
  }

  async marcarError(paymentId: string, motivo: string): Promise<number> {
    // Transitorio: NO persiste decisión (el webhook de MP reintenta solo).
    const n = (this.intentos.get(paymentId) ?? 0) + 1;
    this.intentos.set(paymentId, n);
    logger.warn("mercadopago", "fallo transitorio al facturar", { paymentId, motivo, intento: n });
    return n;
  }

  async listar() {
    return []; // el panel lee directo de MovimientoImportado (vista unificada)
  }
}

// ---------------------------------------------------------------------------
// Reglas del dueño encima del clasificador (umbral + tope, como en banco)
// ---------------------------------------------------------------------------

/**
 * Decorador del clasificador que aplica las reglas del dueño ANTES de facturar:
 * un cobro facturable que supera el umbral de identificación va a la cola de
 * revisión (necesita datos del comprador), y al llegar al tope del mes la
 * emisión automática se frena (queda en revisión, emisión manual).
 */
export function clasificadorConReglasDelDueno(
  base: ClasificadorPort,
  opts: { umbralIdentificacion: number; capFacturasMes: number; facturasDelMes: () => Promise<number> },
): ClasificadorPort {
  return {
    async clasificar(pago, tenantId) {
      const resultado = await base.clasificar(pago, tenantId);
      if (resultado.clasificacion !== "FACTURABLE") return resultado;
      if (pago.monto >= opts.umbralIdentificacion) {
        return {
          clasificacion: "REVISAR",
          motivo: `Supera el umbral de identificación: necesita los datos del comprador.`,
        };
      }
      if ((await opts.facturasDelMes()) >= opts.capFacturasMes) {
        return {
          clasificacion: "REVISAR",
          motivo: `Se alcanzó el tope de ${opts.capFacturasMes} facturas automáticas del mes: esta venta se emite solo a mano, con tu confirmación.`,
        };
      }
      return resultado;
    },
  };
}

// ---------------------------------------------------------------------------
// Entorno real + entradas (webhook / backfill)
// ---------------------------------------------------------------------------

export interface EntornoIngestaReal {
  deps: IngestaDeps;
  reconciliacion: ReconciliacionMovimientosMP;
}

/** Arma las dependencias REALES de la ingesta MP para un tenant. */
export async function crearEntornoReal(tenantId: string): Promise<EntornoIngestaReal> {
  const tenant = await tenantTransaction(
    (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: {
          bancosUmbralIdentificacion: true,
          bancosCapFacturasMes: true,
          bancosDomicilioEmisor: true,
          arcaPuntoVenta: true,
          arcaCuit: true,
        },
      }),
    { tenantId },
  );
  const configTenant = configBancosDesdeTenant({
    bancosUmbralIdentificacion: tenant?.bancosUmbralIdentificacion ?? null,
    bancosCapFacturasMes: tenant?.bancosCapFacturasMes ?? null,
    bancosDomicilioEmisor: tenant?.bancosDomicilioEmisor ?? null,
    arcaPuntoVenta: tenant?.arcaPuntoVenta ?? null,
    arcaCuit: tenant?.arcaCuit ?? null,
  });

  const reconciliacion = new ReconciliacionMovimientosMP(tenantId);
  // El conteo del tope se consulta una vez por corrida (suficiente: la ventana
  // de carrera la cierra el claim de emisión del lado de Invoice).
  let facturasMes: number | null = null;
  const facturasDelMes = async () => (facturasMes ??= await contarFacturasDelMes(tenantId));

  const clasificador = clasificadorConReglasDelDueno(
    new ClasificadorPorReglas({ aprendizaje: new AprendizajeEnMemoria() }),
    {
      umbralIdentificacion: configTenant.config.umbralIdentificacion ?? UMBRAL_IDENTIFICACION_DEFAULT,
      capFacturasMes: configTenant.capFacturasMes,
      facturasDelMes,
    },
  );

  const deps: IngestaDeps = {
    tenantId,
    client: await gatewayCobrosPara(tenantId),
    clasificador,
    reconciliacion,
    facturar: async (pago, tid) => {
      const invoiceId = await facturarPagoMP(pago, tid);
      if (invoiceId) facturasMes = (facturasMes ?? 0) + 1;
      return invoiceId;
    },
  };
  return { deps, reconciliacion };
}

function resumenVacio(): ResumenIngesta {
  return { leidos: 0, facturados: 0, noFacturables: 0, aRevisar: 0, rechazados: 0, saltados: 0, errores: 0 };
}

/**
 * Webhook REAL: un pago acreditado entra al pipeline (clasificar → reglas del
 * dueño → facturar / cola de revisión). Idempotente por payment_id.
 */
export async function procesarPagoStandalone(tenantId: string, paymentId: string): Promise<ResumenIngesta> {
  const { deps, reconciliacion } = await crearEntornoReal(tenantId);
  const resumen = resumenVacio();
  const pago = await deps.client.getPayment(paymentId);
  resumen.leidos++;
  reconciliacion.recordarPago(pago);
  await facturarPagoSiCorresponde(pago, deps, resumen);
  return resumen;
}

/**
 * Backfill REAL: trae el historial de cobros de la cuenta de Mercado Pago del
 * tenant y lo pasa por el mismo pipeline. Re-ejecutarlo no duplica.
 */
export async function sincronizarMercadoPago(
  tenantId: string,
  criterio: CriterioBusqueda = {},
): Promise<ResumenIngesta> {
  const { deps, reconciliacion } = await crearEntornoReal(tenantId);
  // Envolver getPayment/listPayments para cachear el pago antes de decidir.
  const client = deps.client;
  const depsConCache: IngestaDeps = {
    ...deps,
    client: {
      getPayment: async (id) => {
        const p = await client.getPayment(id);
        reconciliacion.recordarPago(p);
        return p;
      },
      listPayments: async (c) => {
        const pagina = await client.listPayments(c);
        for (const p of pagina.pagos) reconciliacion.recordarPago(p);
        return pagina;
      },
    },
  };
  return sincronizarPagos(depsConCache, criterio);
}

/** ¿La integración de Mercado Pago está con credenciales reales o en modo prueba? */
export function estadoIntegracionMP(): { conectado: boolean; modo: "real" | "prueba" } {
  const conectado = Boolean(process.env.MP_ACCESS_TOKEN);
  return { conectado, modo: conectado ? "real" : "prueba" };
}
