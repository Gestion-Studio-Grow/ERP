/**
 * GLUE del módulo BANCOS — el puente entre el plugin puro (src/plugins/bancos)
 * y el Core (Prisma/RLS/facturación). Mismo rol que arca-dispatch para ARCA:
 * es el único módulo que conoce a los dos lados; la dependencia va plugin→Core
 * (ADR-002), el plugin nunca importa esto.
 *
 * Acá viven:
 *  - las implementaciones REALES (Prisma) de los ports del plugin: aprendizaje
 *    del clasificador (tabla ReglaClasificacionBancoTenant), detección cruzada
 *    banco↔MP (contra Invoice) e idempotencia entre corridas (hash ya visto);
 *  - la lógica PURA del borde (testeable sin DB): mapeo de clasificaciones al
 *    vocabulario de producto, armado de filas a persistir, resumen del lote,
 *    validación de los datos de revisión (CUIT con dígito verificador), rango
 *    del mes y conversión Decimal→number (ADR-057).
 *
 * Las Server Actions ("use server") viven en bancos-actions.ts; este archivo
 * NO es un action module a propósito (exporta clases y funciones sync).
 *
 * DINERO (ADR-057): Decimal(14,2) en DB, `number` en memoria; la conversión se
 * confina a `toNum` (mismo criterio que facturacion-actions.ts).
 * AISLAMIENTO (ADR-018): todo port recibe el tenantId EXPLÍCITO y lo mete en
 * el predicado de cada query.
 */

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { runInTenantContext } from "@/lib/tenant-context";
import { createInvoice } from "@/lib/invoice-core";
import { calcularImpuestos, getFiscalProfile, isInvoicingEnabled } from "@/lib/fiscal";
import { processArcaOutbox, type DispatchResumen } from "@/lib/arca-dispatch";
import { logger } from "@/lib/logger";
import {
  CAP_FACTURAS_MES_DEFAULT,
  cuitValido,
  normalizarCuit,
  normalizarTexto,
  DOC_TIPO_CONSUMIDOR_FINAL,
  type AprendizajeBancoPort,
  type ClasificacionBanco,
  type ConfigBancos,
  type CorreccionBanco,
  type DeteccionCruzadaPort,
  type MovimientoBancario,
  type PropuestaFactura,
  type ResultadoClasificacionBanco,
  type ResultadoExtracto,
} from "@/plugins/bancos";

// ── Vocabulario del schema (uniones literales = los enums de prisma) ─────────

export type ClasificacionMovimientoDb =
  | "venta"
  | "comision"
  | "impuesto"
  | "transferencia_propia"
  | "reverso"
  | "prestamo"
  | "egreso"
  | "otro";

export type EstadoPropuestaDb = "auto" | "revision" | "no_facturable" | "descartado" | "emitida";

// ── Borde Decimal → number (ADR-057, mismo criterio que facturacion-actions) ─

/**
 * Convierte un monto de la DB a `number` tolerando Decimal (`.toNumber()`),
 * number crudo o string. PURA.
 */
export function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (v != null && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Rango [primer día del mes, primer día del mes siguiente) para filtrar por createdAt. PURA. */
export function rangoMesActual(ahora: Date = new Date()): { gte: Date; lt: Date } {
  return {
    gte: new Date(ahora.getFullYear(), ahora.getMonth(), 1),
    lt: new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1),
  };
}

// ── Clasificación del plugin → vocabulario de producto ───────────────────────

/**
 * Proyecta el resultado del clasificador (regla que matcheó) al enum de
 * negocio que persiste la DB. PURA. La regla `comision-impuesto` del plugin
 * junta ambas cosas; acá se separa por la leyenda (comisión/mantenimiento vs
 * impuestos/retenciones) para que el contador vea la categoría correcta.
 */
export function mapearClasificacion(
  resultado: ResultadoClasificacionBanco,
  mov: Pick<MovimientoBancario, "monto" | "descripcion">,
): ClasificacionMovimientoDb {
  switch (resultado.reglaId) {
    case "credito-venta":
      return "venta";
    case "comision-impuesto": {
      const d = normalizarTexto(mov.descripcion);
      return d.includes("comision") || d.includes("mantenimiento") ? "comision" : "impuesto";
    }
    case "transferencia-propia":
    case "cuenta-propia":
      return "transferencia_propia";
    case "contraasiento-reverso":
      return "reverso";
    case "prestamo-plazo-fijo":
      return "prestamo";
    case "debito-egreso":
    case "monto-cero":
      return "egreso";
  }
  // Aprendizaje, reglas extra del tenant o REVISAR: se decide por la clasificación.
  if (resultado.clasificacion === "FACTURABLE") return "venta";
  if (resultado.clasificacion === "NO_FACTURABLE") return mov.monto < 0 ? "egreso" : "otro";
  return "otro";
}

// ── Resumen del lote (lo que ve la UI al importar) ───────────────────────────

export interface ResumenPropuestas {
  /** Movimientos NUEVOS persistidos (auto + revisión + no facturables). */
  importados: number;
  /** Descartados por dedup (mismo hash en el archivo o en una corrida anterior). */
  duplicados: number;
  autos: number;
  aRevisar: number;
  noFacturables: number;
}

/** Cuenta las propuestas por estado. PURA. */
export function resumirPropuestas(propuestas: PropuestaFactura[]): ResumenPropuestas {
  const por = (estado: string) => propuestas.filter((p) => p.estado === estado).length;
  const duplicados = por("descartado");
  return {
    importados: propuestas.length - duplicados,
    duplicados,
    autos: por("auto"),
    aRevisar: por("revision"),
    noFacturables: por("no_facturable"),
  };
}

// ── Config del módulo desde el Tenant (patrón arca*, ADR-022 §5 opción B) ────

/** Lo que se lee del Tenant para armar la config del plugin. */
export interface TenantBancosRow {
  bancosUmbralIdentificacion: unknown; // Decimal | null (se convierte con toNum)
  bancosCapFacturasMes: number | null;
  bancosDomicilioEmisor: string | null;
  arcaPuntoVenta: number | null;
  arcaCuit: string | null;
}

export interface ConfigTenantBancos {
  /** Config parcial para el plugin (los nulos caen a los defaults del producto). */
  config: Partial<ConfigBancos>;
  /** CUITs propios del comercio (hoy: el CUIT emisor) → transferencias propias no se facturan. */
  cuitsPropios: string[];
  /** Cap efectivo (con default), para los mensajes y KPIs del glue. */
  capFacturasMes: number;
}

/** Tenant row → config del módulo. PURA. */
export function configBancosDesdeTenant(row: TenantBancosRow): ConfigTenantBancos {
  return {
    config: {
      ...(row.bancosUmbralIdentificacion != null
        ? { umbralIdentificacion: toNum(row.bancosUmbralIdentificacion) }
        : {}),
      ...(row.bancosCapFacturasMes != null ? { capFacturasMes: row.bancosCapFacturasMes } : {}),
      ...(row.bancosDomicilioEmisor != null ? { domicilioEmisor: row.bancosDomicilioEmisor } : {}),
      ...(row.arcaPuntoVenta != null ? { puntoVenta: row.arcaPuntoVenta } : {}),
    },
    cuitsPropios: row.arcaCuit ? [normalizarCuit(row.arcaCuit)] : [],
    capFacturasMes: row.bancosCapFacturasMes ?? CAP_FACTURAS_MES_DEFAULT,
  };
}

// ── Validación de los datos de revisión (umbral de identificación) ───────────

export interface DatosRevision {
  /** Catálogo ARCA: 80=CUIT, 86=CUIL, 96=DNI, 99=consumidor final. */
  docTipo: number;
  docNro: string;
  nombreReceptor?: string;
  descripcionServicio?: string;
}

export type ValidacionRevision = { ok: true; docNro: string } | { ok: false; error: string };

const DOC_CUIT = 80;
const DOC_CUIL = 86;
const DOC_DNI = 96;
const DOC_CONSUMIDOR_FINAL = 99;

/**
 * Valida los datos que completa el usuario para una propuesta en revisión.
 * CUIT/CUIL se validan con dígito verificador (módulo 11) — un número inventado
 * no puede llegar al comprobante. PURA.
 *
 * DocTipo 99 (consumidor final) se acepta SIN identificación: es el caso de una
 * revisión por posible duplicado o por cap, donde el usuario solo confirma.
 */
export function validarDatosRevision(datos: DatosRevision): ValidacionRevision {
  const docNro = normalizarCuit(datos.docNro ?? "");

  if (datos.docTipo === DOC_CONSUMIDOR_FINAL) {
    if (docNro !== "" && docNro !== "0") {
      return { ok: false, error: "Consumidor final se confirma sin número de documento: dejá el campo vacío." };
    }
    return { ok: true, docNro: "0" };
  }

  const nombre = datos.nombreReceptor?.trim() ?? "";
  const descripcion = datos.descripcionServicio?.trim() ?? "";
  if (!nombre || !descripcion) {
    return {
      ok: false,
      error:
        "Para identificar al receptor hacen falta el nombre y la descripción del servicio/venta.",
    };
  }

  if (datos.docTipo === DOC_CUIT || datos.docTipo === DOC_CUIL) {
    if (!cuitValido(docNro)) {
      return { ok: false, error: "El CUIT no es válido: revisá los 11 números." };
    }
    return { ok: true, docNro };
  }

  if (datos.docTipo === DOC_DNI) {
    if (!/^\d{7,8}$/.test(docNro)) {
      return { ok: false, error: "El DNI lleva 7 u 8 dígitos." };
    }
    return { ok: true, docNro };
  }

  return { ok: false, error: "Tipo de documento no soportado (usá CUIT, CUIL, DNI o consumidor final)." };
}

// ── Filas a persistir (resultado del plugin → MovimientoImportado) ───────────

export interface FilaMovimiento {
  tenantId: string;
  importacionId: string;
  hash: string;
  fecha: string;
  monto: number;
  descripcion: string;
  contraparte: string | null;
  referencia: string | null;
  clasificacion: ClasificacionMovimientoDb;
  estadoPropuesta: EstadoPropuestaDb;
  requiereIdentificacion: boolean;
  motivoRevision: string | null;
  docTipo: number | null;
  docNro: string | null;
  nombreReceptor: string | null;
  descripcionServicio: string | null;
}

/**
 * Convierte el resultado del plugin en las filas de `MovimientoImportado` a
 * persistir. Los `descartado` (duplicados) NO se persisten: ya existen de una
 * corrida anterior (o son la repetición dentro del mismo archivo) — el unique
 * [tenantId, hash] es la red de contención de todos modos. PURA.
 */
export function armarFilasMovimientos(
  tenantId: string,
  importacionId: string,
  resultado: Pick<ResultadoExtracto, "movimientos" | "propuestas" | "clasificaciones">,
): FilaMovimiento[] {
  const porId = new Map(resultado.movimientos.map((m) => [m.id, m]));
  const filas: FilaMovimiento[] = [];
  for (const p of resultado.propuestas) {
    if (p.estado === "descartado") continue;
    const mov = porId.get(p.movimientoId);
    if (!mov) continue; // no debería pasar: toda propuesta sale de un movimiento
    const clasif = resultado.clasificaciones.get(p.movimientoId);
    filas.push({
      tenantId,
      importacionId,
      hash: mov.id,
      fecha: mov.fecha,
      monto: mov.monto,
      descripcion: mov.descripcion,
      contraparte: mov.contraparte ?? null,
      referencia: mov.referencia ?? null,
      clasificacion: clasif ? mapearClasificacion(clasif, mov) : "otro",
      estadoPropuesta: p.estado,
      requiereIdentificacion: p.requiereIdentificacion,
      motivoRevision: p.motivo ?? null,
      docTipo: p.docTipo ?? null,
      docNro: p.docTipo !== undefined ? String(p.docNro ?? 0) : null,
      nombreReceptor: p.nombre ?? null,
      descripcionServicio: p.descripcionServicio ?? null,
    });
  }
  return filas;
}

// ── Ports REALES (Prisma) del plugin ─────────────────────────────────────────

/**
 * Aprendizaje del clasificador persistido POR TENANT (la implementación "real"
 * que el propio contrato del plugin define: tabla por tenant; el stub en
 * memoria queda para tests/simulador). Match por contraparte primero (lo más
 * confiable) y por descripción normalizada exacta después — mismo orden que
 * `AprendizajeBancoEnMemoria`.
 */
export class AprendizajeBancoPrisma implements AprendizajeBancoPort {
  constructor(private readonly tenantId: string) {}

  async buscar(mov: MovimientoBancario): Promise<ClasificacionBanco | null> {
    if (mov.contraparte) {
      const porContraparte = await prisma.reglaClasificacionBancoTenant.findFirst({
        where: { tenantId: this.tenantId, contraparte: mov.contraparte },
        select: { clasificacion: true },
      });
      if (porContraparte) return porContraparte.clasificacion as ClasificacionBanco;
    }
    const desc = normalizarTexto(mov.descripcion);
    const porDescripcion = await prisma.reglaClasificacionBancoTenant.findFirst({
      where: { tenantId: this.tenantId, contraparte: null, descripcionNormalizada: desc },
      select: { clasificacion: true },
    });
    return porDescripcion ? (porDescripcion.clasificacion as ClasificacionBanco) : null;
  }

  async registrar(c: CorreccionBanco): Promise<void> {
    const where = c.contraparte
      ? { tenantId: this.tenantId, contraparte: c.contraparte }
      : c.descripcionNormalizada
        ? {
            tenantId: this.tenantId,
            contraparte: null,
            descripcionNormalizada: c.descripcionNormalizada,
          }
        : null;
    if (!where) return; // sin patrón no hay nada que aprender
    const existente = await prisma.reglaClasificacionBancoTenant.findFirst({
      where,
      select: { id: true },
    });
    if (existente) {
      await prisma.reglaClasificacionBancoTenant.updateMany({
        where: { id: existente.id, tenantId: this.tenantId },
        data: { clasificacion: c.clasificacion },
      });
    } else {
      await prisma.reglaClasificacionBancoTenant.create({
        data: {
          tenantId: this.tenantId,
          contraparte: c.contraparte ?? null,
          descripcionNormalizada: c.descripcionNormalizada ?? null,
          clasificacion: c.clasificacion,
        },
      });
    }
  }
}

/**
 * Detección cruzada banco↔MP REAL: ¿ya hay una factura del tenant con esta
 * fecha y este total? (típico: el cobro entró por MP, MP lo facturó, y el
 * mismo monto aparece acreditado en el extracto del banco).
 */
export function crearDeteccionCruzadaInvoices(tenantId: string): DeteccionCruzadaPort {
  return {
    async facturadoPorOtraVia(fecha: string, monto: number): Promise<boolean> {
      const existente = await prisma.invoice.findFirst({
        where: { tenantId, fecha, total: monto },
        select: { id: true },
      });
      return existente !== null;
    },
  };
}

/**
 * Idempotencia ENTRE corridas: el hash ya está persistido para este tenant.
 * `excluirImportacionId` es para el re-proceso de `confirmarMapeoAction`: las
 * filas provisionales de la MISMA importación no deben marcarse a sí mismas
 * como duplicadas (se borran y se recrean en la misma pasada).
 */
export function crearYaProcesado(
  tenantId: string,
  excluirImportacionId?: string,
): (hash: string) => Promise<boolean> {
  return async (hash: string) => {
    const visto = await prisma.movimientoImportado.findFirst({
      where: {
        tenantId,
        hash,
        ...(excluirImportacionId ? { importacionId: { not: excluirImportacionId } } : {}),
      },
      select: { id: true },
    });
    return visto !== null;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORES con tenantId EXPLÍCITO (refactor de reuso para el producto Contador).
// ═══════════════════════════════════════════════════════════════════════════════
//
// Antes vivían dentro de las Server Actions (bancos-actions.ts), atados al tenant
// AMBIENTAL (getCurrentTenantId). El panel del contador (src/lib/cartera-*) opera
// sobre los clientes de su cartera —otros tenants— así que necesita llamarlos con
// el tenantId del CLIENTE, sin evadir RLS: todo corre vía tenantTransaction /
// runInTenantContext con ese id (jamás operatorPrisma). Las actions existentes
// quedan como wrappers finos (capability + tenant actual + revalidate) con el
// MISMO comportamiento de siempre.

/** Facturas del tenant creadas este mes (todas las vías). tenantId explícito. */
export async function contarFacturasDelMes(tenantId: string): Promise<number> {
  return tenantTransaction(
    (tx) => tx.invoice.count({ where: { tenantId, createdAt: rangoMesActual() } }),
    { tenantId },
  );
}

export interface ImportacionVista {
  id: string;
  nombreArchivo: string;
  origen: string;
  estado: string;
  totalMovimientos: number;
  createdAt: string; // ISO
}

export interface KpisFacturacionBancaria {
  /** Facturas del tenant creadas este mes (todas las vías: banco, MP, turnos). */
  facturasMes: number;
  capFacturasMes: number;
  capRestante: number;
  montoFacturadoMes: number;
  pendientesRevision: number;
  /** Propuestas en estado `auto`, listas para emitir en lote (aditivo, lo usa la cartera). */
  listasParaEmitir: number;
  ultimasImportaciones: ImportacionVista[];
}

/**
 * KPIs de facturación bancaria de UN tenant, con tenantId EXPLÍCITO. Todas las
 * queries corren dentro de una única tenantTransaction (GUC = tenantId) → seguras
 * bajo RLS aunque el llamador sea el panel del contador operando otro tenant.
 */
export async function kpisFacturacionBancaria(tenantId: string): Promise<KpisFacturacionBancaria> {
  const rango = rangoMesActual();

  const [tenant, facturasMes, montoAgg, pendientesRevision, listasParaEmitir, ultimas] =
    await tenantTransaction(
      (tx) =>
        Promise.all([
          tx.tenant.findUnique({
            where: { id: tenantId },
            select: { bancosCapFacturasMes: true },
          }),
          tx.invoice.count({ where: { tenantId, createdAt: rango } }),
          tx.invoice.aggregate({
            _sum: { total: true },
            where: { tenantId, createdAt: rango, status: { not: "REJECTED" } },
          }),
          tx.movimientoImportado.count({ where: { tenantId, estadoPropuesta: "revision" } }),
          tx.movimientoImportado.count({ where: { tenantId, estadoPropuesta: "auto" } }),
          tx.importacionBancaria.findMany({
            where: { tenantId },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              nombreArchivo: true,
              origen: true,
              estado: true,
              totalMovimientos: true,
              createdAt: true,
            },
          }),
        ]),
      { tenantId },
    );

  const capFacturasMes = tenant?.bancosCapFacturasMes ?? CAP_FACTURAS_MES_DEFAULT;
  return {
    facturasMes,
    capFacturasMes,
    capRestante: Math.max(0, capFacturasMes - facturasMes),
    montoFacturadoMes: toNum(montoAgg._sum.total ?? 0),
    pendientesRevision,
    listasParaEmitir,
    ultimasImportaciones: ultimas.map((u) => ({
      id: u.id,
      nombreArchivo: u.nombreArchivo,
      origen: u.origen,
      estado: u.estado,
      totalMovimientos: u.totalMovimientos,
      createdAt: u.createdAt.toISOString(),
    })),
  };
}

export interface ResultadoEmision {
  emitidas: number;
  bloqueadasPorCap: number;
  capAlcanzado: boolean;
  mensaje?: string;
  errores: { movimientoId: string; error: string }[];
  /** Resumen del despacho a ARCA (solo si ARCA_INVOICING_ENABLED está prendido). */
  despachoArca?: DispatchResumen;
}

/**
 * Emite las propuestas `auto` de UN tenant, con tenantId EXPLÍCITO. Es el core de
 * `emitirPropuestasAction` (mismo claim idempotente auto→emitida, mismo cap del
 * mes, mismo despacho a ARCA); el cuerpo entero corre bajo `runInTenantContext`
 * para que TODA operación Prisma —incluidas las lecturas sueltas— resuelva el GUC
 * al tenant pedido y no al ambiental (clave cuando lo llama el contador sobre un
 * cliente de su cartera).
 */
export async function emitirPropuestas(
  tenantId: string,
  seleccion: string[] | "auto",
): Promise<ResultadoEmision> {
  return runInTenantContext(tenantId, async () => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { bancosCapFacturasMes: true, arcaPuntoVenta: true },
    });
    const cap = tenant?.bancosCapFacturasMes ?? CAP_FACTURAS_MES_DEFAULT;
    const facturasMes = await contarFacturasDelMes(tenantId);

    const movimientos = await prisma.movimientoImportado.findMany({
      where: {
        tenantId,
        estadoPropuesta: "auto",
        ...(seleccion === "auto" ? {} : { id: { in: seleccion } }),
      },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
    });
    if (movimientos.length === 0) {
      return { emitidas: 0, bloqueadasPorCap: 0, capAlcanzado: false, errores: [] };
    }

    const perfil = getFiscalProfile(tenantId);
    const puntoVenta = tenant?.arcaPuntoVenta ?? perfil.puntoVenta;

    let emitidas = 0;
    let bloqueadas = 0;
    const errores: { movimientoId: string; error: string }[] = [];

    for (const mov of movimientos) {
      // Cap de facturas del mes (regla comercial del dueño): al 100% se BLOQUEA.
      if (facturasMes + emitidas >= cap) {
        bloqueadas++;
        continue;
      }

      // CLAIM idempotente: solo el que pasa auto→emitida factura. Un doble clic o
      // dos sesiones simultáneas no generan dos comprobantes del mismo movimiento.
      const claim = await tenantTransaction(
        (tx) =>
          tx.movimientoImportado.updateMany({
            where: { id: mov.id, tenantId, estadoPropuesta: "auto" },
            data: { estadoPropuesta: "emitida" },
          }),
        { tenantId },
      );
      if (claim.count === 0) continue; // otro lo agarró (o cambió de estado)

      try {
        // El monto del banco es TOTAL IVA-incluido; el Core calcula neto/IVA (ADR-006).
        const montoTotal = Math.abs(toNum(mov.monto));
        const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, montoTotal);
        const invoiceId = await createInvoice({
          tenantId,
          // Concepto 1 (productos/venta directa), mismo criterio que invoice-from-mp:
          // concepto 2 (servicios) exigiría fechas de servicio que el extracto no trae.
          concepto: 1,
          fecha: mov.fecha,
          emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta },
          receptor: {
            docTipo: mov.docTipo ?? DOC_TIPO_CONSUMIDOR_FINAL,
            docNro: Number(mov.docNro ?? 0) || 0,
            condicionIva: "CONSUMIDOR_FINAL",
          },
          neto,
          iva,
          total,
        });
        await tenantTransaction(
          (tx) =>
            tx.movimientoImportado.updateMany({
              where: { id: mov.id, tenantId },
              data: { invoiceId },
            }),
          { tenantId },
        );
        emitidas++;
      } catch (err) {
        // Falló la creación: soltar el claim para que se pueda reintentar.
        await tenantTransaction(
          (tx) =>
            tx.movimientoImportado.updateMany({
              where: { id: mov.id, tenantId, invoiceId: null },
              data: { estadoPropuesta: "auto" },
            }),
          { tenantId },
        );
        const mensaje = err instanceof Error ? err.message : String(err);
        errores.push({ movimientoId: mov.id, error: mensaje });
        logger.error("bancos", "no se pudo emitir la factura del movimiento", err, {
          tenantId,
          movimientoId: mov.id,
        });
      }
    }

    // Con la facturación encendida, drenar el outbox → plugin ARCA → CAE (stub en dev).
    let despachoArca: DispatchResumen | undefined;
    if (emitidas > 0 && isInvoicingEnabled()) {
      despachoArca = await processArcaOutbox();
    }

    const capAlcanzado = bloqueadas > 0 || facturasMes + emitidas >= cap;
    return {
      emitidas,
      bloqueadasPorCap: bloqueadas,
      capAlcanzado,
      ...(capAlcanzado
        ? {
            mensaje:
              `Se alcanzó el tope de ${cap} facturas del mes` +
              (bloqueadas > 0
                ? `: ${bloqueadas} ${bloqueadas === 1 ? "propuesta quedó" : "propuestas quedaron"} SIN emitir. Se emiten recién el mes próximo (o subiendo el tope en la configuración del módulo).`
                : "."),
          }
        : {}),
      errores,
      ...(despachoArca ? { despachoArca } : {}),
    };
  });
}
