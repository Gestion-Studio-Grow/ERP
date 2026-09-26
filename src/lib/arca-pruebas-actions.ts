"use server";

// Banco de pruebas — ARCA (homologación/stub). Server Action gated por
// `billing:manage`. Emite UN comprobante de prueba (Factura C, monto chico) y
// registra el intento (logger). Deliberadamente AISLADA del outbox real
// (`processArcaOutbox`/`Invoice`/`OutboxEvent`): no depende de que las
// migraciones fiscales estén aplicadas a Neon (`docs/arquitectura/
// propuesta-activacion-arca-mp.md` bloque C, Gate 2 pendiente).
//
// Bloqueada en modo `real`: el banco de pruebas es para validar homologación
// sin arriesgar facturar de verdad — quien quiera facturar de verdad usa el
// flujo normal (`procesarFacturacionPendiente`).

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { getFiscalProfile, PerfilFiscalIncompletoError } from "@/lib/fiscal";
import { createInvoice } from "@/lib/invoice-core";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import {
  armarFacturaDePrueba,
  esReceptorDePrueba,
  nombreDelComprobante,
  textoDelReceptor,
} from "@/lib/factura-de-prueba";
import {
  crearAfipClient,
  modoDesdeEnv,
  credencialDesdeEnv,
  emitirFacturaDePrueba,
  CUIT_DE_PRUEBA,
  type ModoArca,
} from "@/plugins/arca";

export type ResultadoBancoPruebasArca =
  | {
      ok: true;
      modo: ModoArca;
      cae: string;
      caeVencimiento: string;
      numero: number;
      puntoVenta: number;
    }
  | { ok: false; modo: ModoArca; error: string };

/**
 * Lee CUIT y punto de venta del negocio para la prueba.
 *
 * El punto de venta NO tiene valor por defecto. Antes caía al 1 si faltaba, y eso daba un
 * falso "anda": la prueba salía con un talonario que no es el del local, mientras la
 * facturación real, sin punto de venta, no emite (`construirPerfilFiscal` lanza). Y en una
 * marca con varios locales bajo el mismo CUIT, el 1 es el talonario de OTRO local. Sin punto
 * de venta cargado, la prueba no corre y dice qué falta y quién lo carga.
 *
 * Sin CUIT se sigue usando el CUIT de prueba de ARCA (homologación o stub). Si la lectura
 * falla, tampoco se inventan datos: se devuelve el error.
 */
async function datosFiscalesDelTenant(
  tenantId: string,
): Promise<{ ok: true; cuit: number; puntoVenta: number } | { ok: false; error: string }> {
  let tenant: { arcaCuit: string | null; arcaPuntoVenta: number | null } | null;
  try {
    tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { arcaCuit: true, arcaPuntoVenta: true },
    });
  } catch (e) {
    logger.warn("arca.prueba", "No se pudo leer la config fiscal del tenant; no se emite la prueba", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return {
      ok: false,
      error: "No pudimos leer los datos fiscales del negocio, así que no se hizo la prueba. Probá de nuevo en un rato.",
    };
  }
  const puntoVenta = tenant?.arcaPuntoVenta ?? null;
  if (!puntoVenta || puntoVenta <= 0) {
    return {
      ok: false,
      error:
        "Falta el punto de venta de ARCA de este negocio, así que la prueba no corre: sin él, " +
        "tampoco sale la factura real. Pedile a Gestión Studio Grow que cargue el punto de venta " +
        "que ARCA habilitó para tu CUIT.",
    };
  }
  return { ok: true, cuit: tenant?.arcaCuit ? Number(tenant.arcaCuit) : CUIT_DE_PRUEBA, puntoVenta };
}

/**
 * Emite una factura de prueba contra el modo vigente (`ARCA_MODO`). Bloqueada
 * en modo `real`. Registra el intento (request/response resumido + estado) con
 * el logger estructurado — sin tocar `Invoice`/`OutboxEvent`.
 */
export async function emitirFacturaDePruebaAction(): Promise<ResultadoBancoPruebasArca> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  const modo = modoDesdeEnv();

  if (modo === "real") {
    return {
      ok: false,
      modo,
      error:
        "El banco de pruebas no corre en modo real (evita facturar de verdad). " +
        "Usá ARCA_MODO=stub o ARCA_MODO=homologacion para probar.",
    };
  }

  const datos = await datosFiscalesDelTenant(tenantId);
  if (!datos.ok) return { ok: false, modo, error: datos.error };
  const { cuit, puntoVenta } = datos;
  // Sin el CUIT: es un dato fiscal (y el de una persona humana es personal). §4 del estándar.
  logger.info("arca.prueba", "Emitiendo factura de prueba", { tenantId, modo, puntoVenta });

  try {
    // Banco de pruebas: usa el cert de PRUEBA de env (`ARCA_CERT_PEM`/`ARCA_KEY_PEM`),
    // aislado del camino REAL (que resuelve la credencial cifrada por tenant, ADR-066).
    // Bloqueado en modo real arriba: acá solo corre stub (no firma) u homologación (cert
    // de test, endpoint forzado a homologación — sin registros fiscales reales).
    const client = crearAfipClient({ cuit, homologacion: true }, { credencial: credencialDesdeEnv() });
    const resultado = await emitirFacturaDePrueba(client, { puntoVenta });

    if (resultado.ok) {
      logger.info("arca.prueba", "Factura de prueba autorizada", {
        tenantId,
        modo,
        puntoVenta,
        cae: resultado.cae,
        numero: resultado.numero,
      });
      return {
        ok: true,
        modo,
        cae: resultado.cae,
        caeVencimiento: resultado.caeVencimiento,
        numero: resultado.numero,
        puntoVenta: resultado.puntoVenta,
      };
    }

    const error =
      resultado.motivo === "rechazo"
        ? `ARCA rechazó el comprobante de prueba: ${resultado.observaciones
            .map((o) => `[${o.codigo}] ${o.mensaje}`)
            .join("; ")}`
        : resultado.mensaje;
    logger.warn("arca.prueba", "Factura de prueba no autorizada", {
      tenantId,
      modo,
      puntoVenta,
      motivo: resultado.motivo,
      error,
    });
    return { ok: false, modo, error };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo emitir la factura de prueba.";
    logger.error("arca.prueba", "Error al emitir factura de prueba", e, { tenantId, modo, puntoVenta });
    return { ok: false, modo, error: mensaje };
  }
}

export type ResultadoFacturaDePrueba =
  | { ok: true; comprobante: string; cae: string; receptor: string; total: number }
  | { ok: false; error: string };

/** El módulo que da derecho a facturar electrónicamente (ADR-098: lo asigna GSG). */
const MODULO_ARCA = "arca";

/**
 * Emite una factura de prueba DE VERDAD con ARCA en modo prueba (simulado): pasa por el mismo
 * motor que una venta, con la letra que decide el sistema, numeración correlativa y CAE simulado,
 * y queda guardada (lista, cartera del estudio, Libro IVA). Ver src/lib/factura-de-prueba.ts.
 *
 * Sólo en modo `stub`: en homologación y en real no emite nada por acá. Sólo para un negocio con
 * la facturación electrónica ASIGNADA (módulo `arca`): el resto (CH incluida) sigue con el banco
 * de pruebas de siempre, que no guarda nada. `receptorRaw` viene del formulario y se valida.
 */
export async function emitirFacturaDePruebaGuardadaAction(receptorRaw: unknown): Promise<ResultadoFacturaDePrueba> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  if (modoDesdeEnv() !== "stub") {
    return { ok: false, error: "La factura de prueba sólo se emite con ARCA en modo prueba (simulado)." };
  }
  if (!esReceptorDePrueba(receptorRaw)) {
    return { ok: false, error: "Elegí a quién va la factura de prueba: a un consumidor final o a un responsable inscripto." };
  }
  const negocio = await tenantTransaction(
    (tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { modules: true } }),
    { tenantId },
  );
  if (!negocio?.modules?.includes(MODULO_ARCA)) {
    return { ok: false, error: "Este negocio no tiene la facturación electrónica activada. La activa Gestión Studio Grow." };
  }

  let perfil: Awaited<ReturnType<typeof getFiscalProfile>>;
  try {
    perfil = await getFiscalProfile(tenantId);
  } catch (e) {
    if (e instanceof PerfilFiscalIncompletoError) {
      return {
        ok: false,
        error:
          "Faltan los datos fiscales del negocio (CUIT, punto de venta o condición frente al IVA), así que no sale " +
          "ninguna factura, tampoco la de prueba. Los carga Gestión Studio Grow.",
      };
    }
    throw e;
  }

  const hoy = fechaFiscalDelDia(new Date());
  const armada = armarFacturaDePrueba(perfil, receptorRaw, hoy);
  if (!armada.ok) return { ok: false, error: armada.error };

  const invoiceId = await createInvoice({
    tenantId,
    concepto: 1,
    fecha: hoy,
    emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta },
    receptor: armada.receptor,
    neto: armada.neto,
    iva: armada.iva,
    total: armada.total,
    ...(armada.ivaPorProducto ? { ivaPorProducto: true } : {}),
  });
  await procesarEnviosDelNegocio(tenantId);
  revalidatePath("/admin/facturacion");

  const f = await tenantTransaction(
    (tx) =>
      tx.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        select: {
          status: true, tipoComprobante: true, puntoVenta: true, numero: true, cae: true,
          total: true, docTipo: true, docNro: true, rechazoMotivo: true,
        },
      }),
    { tenantId },
  );
  // Sin CUIT ni documento del receptor en el log (§4): el id de la factura alcanza para rastrearla.
  logger.info("arca.prueba", "Factura de prueba guardada", {
    tenantId,
    invoiceId,
    estado: f?.status ?? null,
    tipo: f?.tipoComprobante ?? null,
    puntoVenta: f?.puntoVenta ?? null,
    numero: f?.numero ?? null,
  });
  if (f?.status === "REJECTED") {
    return { ok: false, error: `La factura de prueba no se autorizó: ${f.rechazoMotivo ?? "sin motivo informado"}. Quedó en la lista como rechazada.` };
  }
  const comprobante = nombreDelComprobante(f?.tipoComprobante, f?.puntoVenta ?? null, f?.numero ?? null);
  if (!f || f.status !== "AUTHORIZED" || !comprobante || !f.cae) {
    return { ok: false, error: "La factura de prueba quedó guardada pero todavía sin CAE: tocá «Procesar pendientes»." };
  }
  return {
    ok: true,
    comprobante,
    cae: f.cae,
    receptor: textoDelReceptor(f.docTipo, f.docNro),
    total: redondearAlCentavo(Number(f.total)),
  };
}
