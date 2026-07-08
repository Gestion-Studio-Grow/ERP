"use server";

// Server Actions del módulo FACTURACIÓN (ARCA). Gated por `billing:manage` (OWNER).
// Lee las facturas del tenant (RLS) con su estado fiscal y permite disparar el
// despacho a ARCA. Modo stub por defecto: procesa sin credenciales (CAE simulado);
// con `ARCA_MODO=real` + certificado/clave del emisor, factura de verdad.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { processArcaOutbox, type DispatchResumen } from "@/lib/arca-dispatch";
import { modoDesdeEnv, type ModoArca } from "@/plugins/arca";

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
}

/** Trae las facturas del tenant (recientes) + el estado fiscal. */
export async function getFacturacion(): Promise<{ facturas: FacturaVista[]; estado: EstadoFiscal }> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  const [invoices, tenant, pendientes] = await Promise.all([
    prisma.invoice.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, fecha: true, total: true, neto: true, iva: true, status: true,
        cae: true, caeVencimiento: true, numero: true, puntoVenta: true, rechazoMotivo: true,
      },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { arcaCuit: true, arcaPuntoVenta: true, arcaHomologacion: true },
    }),
    prisma.invoice.count({ where: { status: "PENDING" } }),
  ]);

  return {
    // Borde del repositorio de Invoice (ADR-057): el dinero se persiste en Decimal(14,2)
    // pero el contrato de la vista es `number` → se convierte acá con `.toNumber()`. Es el
    // ÚNICO punto donde el sistema ve el Decimal; del borde para afuera, todo `number`.
    facturas: invoices.map((f) => ({
      ...f,
      neto: f.neto.toNumber(),
      iva: f.iva.toNumber(),
      total: f.total.toNumber(),
    })),
    estado: {
      modo: modoDesdeEnv(),
      cuit: tenant?.arcaCuit ?? null,
      puntoVenta: tenant?.arcaPuntoVenta ?? null,
      homologacion: tenant?.arcaHomologacion ?? true,
      pendientes,
    },
  };
}

/**
 * Dispara el despacho de las facturas pendientes a ARCA (drena el outbox). En modo
 * stub obtiene un CAE simulado; en modo real, el CAE de ARCA. Devuelve el resumen.
 */
export async function procesarFacturacionPendiente(): Promise<DispatchResumen> {
  await requireCapability("billing:manage");
  const resumen = await processArcaOutbox();
  revalidatePath(FACTURACION_PATH);
  return resumen;
}
