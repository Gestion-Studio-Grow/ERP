"use server";

// Server Actions del módulo FACTURACIÓN (ARCA). Gated por `billing:manage` (OWNER).
// Lee las facturas del tenant (RLS) con su estado fiscal y permite disparar el
// despacho a ARCA. Modo stub por defecto: procesa sin credenciales (CAE simulado);
// con `ARCA_MODO=real` + certificado/clave del emisor, factura de verdad.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { procesarEnviosDelNegocio, type DispatchResumen } from "@/lib/arca-dispatch";
import { modoDesdeEnv, type ModoArca } from "@/plugins/arca";
import { logger } from "@/lib/logger";
import { todayInBusinessTz } from "@/lib/datetime";
import { leerFiltros, totalesVacios, type FiltrosComprobantes, type PaginaDeComprobantes } from "@/lib/facturacion/lista-core";
import { leerPaginaDeComprobantes } from "@/lib/facturacion/lista.server";
import { TANDA_DE_ARCA, enviosASaltear } from "@/lib/facturacion/autorizar-en-tandas";

const FACTURACION_PATH = "/admin/facturacion";

export interface FacturaVista {
  id: string;
  fecha: string; // AAAAMMDD
  total: number;
  neto: number;
  iva: number;
  status: "PENDING" | "AUTHORIZED" | "REJECTED";
  cae: string | null;
  caeVencimiento: string | null;
  numero: number | null;
  puntoVenta: number;
  rechazoMotivo: string | null;
}

export interface EstadoFiscal {
  /** Modo del cliente ARCA: "stub" (sandbox) o "real". */
  modo: ModoArca;
  /** CUIT del emisor cargado en el tenant (metadata no sensible). */
  cuit: string | null;
  /** Punto de venta habilitado. */
  puntoVenta: number | null;
  /** true = ambiente de homologación (testing) de ARCA. */
  homologacion: boolean;
  /** Cantidad de facturas pendientes de autorización (status PENDING). */
  pendientes: number;
  /** ¿El negocio tiene algún comprobante (de cualquier mes y estado)? Decide qué pestaña abre. */
  hayComprobantes: boolean;
}

/**
 * Convierte un monto de la DB a `number` tolerando AMBOS esquemas: `Decimal(14,2)`
 * (DB migrada → el valor tiene `.toNumber()`) y el legado `Float`/`number` (tenant cuya
 * DB aún NO tiene la migración `invoice_money_decimal`, p. ej. CH prod). Así la pantalla
 * no asume el tipo de la columna. PURA. Con el schema migrado devuelve exactamente lo
 * mismo que `.toNumber()` (cero cambio de comportamiento).
 */
function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (v != null && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Estado fiscal "vacío pero válido" — para degradar sin romper la pantalla. */
function estadoFiscalVacio(): EstadoFiscal {
  return { modo: modoDesdeEnv(), cuit: null, puntoVenta: null, homologacion: true, pendientes: 0, hayComprobantes: false };
}

/**
 * Los comprobantes del negocio que esperan autorización. Con el negocio EXPLÍCITO en la consulta
 * (QA vuelta 2): no depende de que el cliente sea el de RLS ni del filtro por negocio del otro.
 */
function contarPendientes(tenantId: string): Promise<number> {
  return prisma.invoice.count({ where: { tenantId, status: "PENDING" } });
}

/** El estado fiscal del negocio: config de ARCA y cuántos comprobantes esperan autorización. */
async function leerEstadoFiscal(tenantId: string): Promise<EstadoFiscal> {
  const [tenant, pendientes, alguno] = await Promise.all([
    // Config fiscal aislada: si faltan las columnas `arca*` (schema viejo), no debe
    // voltear la lectura de facturas — cae a `null` y el estado usa sus defaults.
    prisma.tenant
      .findUnique({
        where: { id: tenantId },
        select: { arcaCuit: true, arcaPuntoVenta: true, arcaHomologacion: true },
      })
      .catch(() => null),
    contarPendientes(tenantId),
    // Uno solo, por el índice (tenantId, status): no cuenta los miles de un comercio.
    prisma.invoice.findFirst({ where: { tenantId }, select: { id: true } }),
  ]);
  return {
    modo: modoDesdeEnv(),
    cuit: tenant?.arcaCuit ?? null,
    puntoVenta: tenant?.arcaPuntoVenta ?? null,
    homologacion: tenant?.arcaHomologacion ?? true,
    pendientes,
    hayComprobantes: alguno !== null,
  };
}

/**
 * El panel de Facturación: el estado fiscal y UNA página de comprobantes con los filtros de la
 * URL (lista-core.ts) y los totales del filtro entero, calculados en la base (lista.server.ts).
 * Mismo criterio defensivo que `getFacturacion`: la barrera de rol bloquea; un fallo de lectura
 * deja la pantalla con la lista vacía y el aviso, no rompe.
 */
export async function getPanelDeFacturacion(
  sp: Record<string, string | string[] | undefined>,
): Promise<{ estado: EstadoFiscal; filtros: FiltrosComprobantes; lista: PaginaDeComprobantes; fallo: boolean }> {
  await requireCapability("billing:manage");
  const filtros = leerFiltros(sp, todayInBusinessTz());
  try {
    const tenantId = await getCurrentTenantId();
    const [estado, lista] = await Promise.all([leerEstadoFiscal(tenantId), leerPaginaDeComprobantes(tenantId, filtros)]);
    return { estado, filtros, lista, fallo: false };
  } catch (err) {
    logger.error("facturacion", "no se pudo leer la lista de comprobantes", err);
    return { estado: estadoFiscalVacio(), filtros, lista: { renglones: [], totales: totalesVacios(), pagina: 1, paginas: 1 }, fallo: true };
  }
}

/**
 * Trae las facturas del tenant (recientes) + el estado fiscal.
 *
 * DEFENSIVO (incidente CH prod 2026-07-09): tolera el schema VIEJO de un tenant cuya DB
 * todavía no aplicó las migraciones §C. Tres capas, todas inertes con el schema migrado:
 *   1. `toNum` lee el money como number-O-Decimal (no asume `.toNumber()`).
 *   2. la config fiscal (`arca*`) va con `.catch(()=>null)`: si faltan esas columnas, no
 *      voltea el resto.
 *   3. TODO el bloque de lectura en try/catch → ante cualquier mismatch de schema devuelve
 *      estado vacío + amable, sin disparar el error boundary del cliente en vivo.
 * Con la DB migrada (staging) NADA de esto se activa → comportamiento idéntico al anterior.
 * Reversible.
 */
export async function getFacturacion(): Promise<{ facturas: FacturaVista[]; estado: EstadoFiscal }> {
  // FUERA del try: la barrera de rol debe seguir BLOQUEANDO (no degradar a "vacío").
  await requireCapability("billing:manage");

  try {
    const tenantId = await getCurrentTenantId();

    const [invoices, estado] = await Promise.all([
      prisma.invoice.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true, fecha: true, total: true, neto: true, iva: true, status: true,
          cae: true, caeVencimiento: true, numero: true, puntoVenta: true, rechazoMotivo: true,
        },
      }),
      leerEstadoFiscal(tenantId),
    ]);

    return {
      // Borde del repositorio de Invoice (ADR-057): money en Decimal(14,2) → `number` vía
      // `toNum` (que además tolera el legado Float de una DB sin la migración aplicada).
      facturas: invoices.map((f) => ({
        ...f,
        neto: toNum(f.neto),
        iva: toNum(f.iva),
        total: toNum(f.total),
      })),
      estado,
    };
  } catch (err) {
    // Schema pre-migración (tabla/columna/tipo que no existe) o cualquier fallo de lectura:
    // NO romper la pantalla del cliente en vivo. Estado vacío; se registra para observabilidad.
    // El día que la DB esté migrada, el `try` funciona y este camino no se toca.
    logger.error("facturacion", "no se pudo leer la facturación (¿schema pre-migración?)", err);
    return { facturas: [], estado: estadoFiscalVacio() };
  }
}

/**
 * Manda UNA tanda de pendientes a ARCA (drena el outbox, a lo sumo 20: cabe en el tiempo de una
 * función). En modo stub obtiene un CAE simulado; en modo real, el CAE de ARCA. Devuelve el
 * resumen y cuántos quedan pendientes: la pantalla pide tandas hasta que no quede ninguno
 * (lib/facturacion/autorizar-en-tandas.ts), así «Autorizar los 59 pendientes» manda los 59.
 * `saltear`: los envíos que en el mismo toque ya fallaron por un error nuestro (no se vuelven a
 * mandar); `conErrorDelSistema`: los de esta tanda. Sólo excluye, y dentro de este negocio.
 */
export async function procesarFacturacionPendiente(
  saltear: unknown = [],
): Promise<DispatchResumen & { quedan: number; conErrorDelSistema: string[] }> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  const conErrorDelSistema: string[] = [];
  // ENG-012: sólo los envíos de ESTE negocio; el barrido de todos es del cron.
  const resumen = await procesarEnviosDelNegocio(tenantId, TANDA_DE_ARCA, undefined, {
    saltear: enviosASaltear(saltear),
    alFallarPorElSistema: (envioId) => conErrorDelSistema.push(envioId),
  });
  const quedan = await contarPendientes(tenantId);
  revalidatePath(FACTURACION_PATH);
  return { ...resumen, quedan, conErrorDelSistema };
}
