"use server";

/**
 * Server actions de FACTURITA (producto C, ADR-076). Mismo molde que el resto:
 * gated por capability + blueprint, tenant explícito en toda query, y el motor
 * de emisión del Core (createInvoiceInTx + despacho ARCA + nota de crédito) —
 * cero duplicación fiscal.
 */

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { createInvoiceInTx, crearNotaDeCredito } from "@/lib/invoice-core";
import {
  getFiscalProfile,
  isInvoicingEnabled,
  PerfilFiscalIncompletoError,
} from "@/lib/fiscal";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import { contarFacturasDelMes, fechaFiscalDelDia } from "@/lib/bancos-glue";
import { logger } from "@/lib/logger";
import { modoDesdeEnv } from "@/plugins/arca";
import { ambienteDelComprobante } from "@/lib/comprobante-pdf";
import { ACCION_RECEPTOR_DEL_COMPROBANTE } from "@/lib/comprobante-pdf-datos";
import { sumarAlCentavo, redondearAlCentavo } from "@/lib/dinero/redondeo";
import {
  esDePrueba,
  estadoLimite,
  mensajeDeEmision,
  numeroDeComprobante,
  origenDelRechazo,
  validarEmision,
  ventanaDeFechaArca,
  type EmisionFacturita,
  type EstadoEmision,
  type EstadoLimite,
} from "@/lib/facturita-core";
import { montosFacturita } from "@/lib/facturita-montos";
import {
  faltantesEmisor,
  validarDatosEmisor,
  type CampoEmisor,
  type DatosEmisorForm,
  type DatosEmisorGuardados,
} from "@/lib/facturita-emisor";

const PATH_APP = "/facturita/app";

/** Barrera del producto: sesión con permiso de facturación + tenant facturita. */
async function requireTenantFacturita(): Promise<{ tenantId: string; userId: string; homologacion: boolean }> {
  const user = await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  const tenant = await tenantTransaction(
    (tx) =>
      tx.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true, arcaHomologacion: true } }),
    { tenantId },
  );
  if (tenant?.blueprintId !== "facturita") {
    throw new Error("Esta pantalla es del producto Facturita.");
  }
  return { tenantId, userId: user.id, homologacion: tenant.arcaHomologacion ?? true };
}

// La fecha del comprobante es el día del NEGOCIO, no el del proceso. Armada con
// `getDate()` salía en la zona del proceso: con TZ=UTC (medido) una factura del 31/08 a
// las 22:30 hora argentina quedaba fechada 20260901, o sea en el período fiscal siguiente.
// No se exporta a propósito: en un archivo "use server" cada export es un endpoint.
function fechaHoy(): string {
  return fechaFiscalDelDia(new Date());
}

/** P2021/P2022: el código llegó antes que su migración (Gate 2). */
function esMigracionPendiente(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
}

/** Estado del tope mensual (5 gratis) para el tablero. */
export async function estadoFacturitaAction(): Promise<EstadoLimite> {
  const { tenantId } = await requireTenantFacturita();
  return estadoLimite(await contarFacturasDelMes(tenantId));
}

async function leerDatosEmisor(tenantId: string): Promise<DatosEmisorGuardados> {
  const t = await tenantTransaction(
    (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { arcaRazonSocial: true, arcaDomicilioFiscal: true, arcaInicioActividades: true, arcaIibb: true },
      }),
    { tenantId },
  );
  return {
    arcaRazonSocial: t?.arcaRazonSocial ?? null,
    arcaDomicilioFiscal: t?.arcaDomicilioFiscal ?? null,
    arcaInicioActividades: t?.arcaInicioActividades ?? null,
    arcaIibb: t?.arcaIibb ?? null,
  };
}

/**
 * Lo que la pantalla «Emitir» necesita saber del emisor: si es inscripto (muestra la alícuota), la
 * fecha fiscal de hoy y qué le falta para que el PDF de sus facturas salga. Sin perfil fiscal
 * cargado, `condicionIva: null`: la emisión igual lo frena con su mensaje.
 */
export async function datosEmisorFacturitaAction(): Promise<{
  condicionIva: string | null;
  hoy: string;
  faltantesPdf: string[];
}> {
  const { tenantId } = await requireTenantFacturita();
  const hoy = fechaHoy();
  const faltantesPdf = faltantesEmisor(await leerDatosEmisor(tenantId));
  try {
    const perfil = await getFiscalProfile(tenantId);
    return { condicionIva: perfil.condicionIva, hoy, faltantesPdf };
  } catch (err) {
    if (err instanceof PerfilFiscalIncompletoError) return { condicionIva: null, hoy, faltantesPdf };
    throw err;
  }
}

/** «Datos para tus facturas» (Mi cuenta): lo guardado hoy. */
export async function datosParaFacturasAction(): Promise<DatosEmisorGuardados> {
  const { tenantId } = await requireTenantFacturita();
  return leerDatosEmisor(tenantId);
}

export type ResultadoDatosEmisor =
  | { ok: true }
  | { ok: false; error: string; errores?: Partial<Record<CampoEmisor, string>> };

/**
 * Graba razón social, domicilio, inicio de actividades e IIBB en los MISMOS campos que lee el PDF,
 * parado en el propio negocio (`tenantTransaction`). No toca CUIT, punto de venta ni condición.
 */
export async function guardarDatosParaFacturasAction(form: DatosEmisorForm): Promise<ResultadoDatosEmisor> {
  const { tenantId, userId } = await requireTenantFacturita();
  const v = validarDatosEmisor(form, fechaHoy());
  if (!v.ok) return { ok: false, error: "Revisá los datos marcados.", errores: v.errores };
  await tenantTransaction(
    async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: v.datos });
      await tx.auditLog.create({
        data: {
          tenantId,
          actor: `user:${userId}`,
          action: "facturita.datos_para_facturas",
          entity: "Tenant",
          entityId: tenantId,
          changes: v.datos,
          channel: "admin",
        },
      });
    },
    { tenantId },
  );
  revalidatePath(PATH_APP, "layout");
  return { ok: true };
}

export type ResultadoEmisionFacturita =
  | { ok: true; invoiceId: string; limite: EstadoLimite; estado: EstadoEmision; mensaje: string }
  | { ok: false; error: string; invoiceId?: string; estado?: EstadoEmision };

/**
 * Emite una factura manual: valida receptor, concepto y total, respeta el tope de 5 por mes, y crea
 * la factura por el motor del Core (la letra la decide el sistema con el emisor y el receptor).
 * Con documento, guarda en la MISMA transacción quién es el comprador (nombre, condición,
 * domicilio) para el PDF: Invoice no tiene esas columnas (ver ACCION_RECEPTOR_DEL_COMPROBANTE).
 * Devuelve el estado REAL de la factura: autorizada (con CAE, o de prueba), pendiente o rechazada
 * (por ARCA o frenada por el sistema), nunca un «emitida» genérico.
 */
export async function emitirFacturitaAction(
  datos: EmisionFacturita,
): Promise<ResultadoEmisionFacturita> {
  const { tenantId, userId, homologacion } = await requireTenantFacturita();
  const hoy = fechaHoy();

  const validacion = validarEmision(datos, hoy);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const limite = estadoLimite(await contarFacturasDelMes(tenantId));
  if (!limite.puedeEmitir) {
    return { ok: false, error: limite.mensaje ?? "Llegaste al límite de facturas del plan de este mes." };
  }

  try {
    const perfil = await getFiscalProfile(tenantId);
    // Inscripto: IVA declarado en el renglón con la alícuota elegida (ivaPorProducto). C: sin IVA.
    const montos = montosFacturita(perfil.condicionIva, datos.total, validacion.alicuotaId);
    if (!montos.ok) return { ok: false, error: montos.error };

    const invoiceId = await tenantTransaction(
      async (tx) => {
        const id = await createInvoiceInTx(tx, {
          tenantId,
          concepto: validacion.concepto,
          fecha: hoy,
          emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta },
          // RG 5616: la condición REAL del comprador (con CUIT la eligió la persona; sin CUIT, consumidor final).
          receptor: validacion.receptor,
          neto: montos.neto,
          iva: montos.iva,
          total: montos.total,
          ...(montos.ivaPorProducto ? { ivaPorProducto: true } : {}),
          ...(validacion.servicio
            ? {
                servicioDesde: validacion.servicio.desde,
                servicioHasta: validacion.servicio.hasta,
                vencimientoPago: validacion.servicio.vencimientoPago,
              }
            : {}),
          // Lo que se vendió, para el PDF y la lista (no viaja a ARCA). Necesita la migración
          // 20261022140000_invoice_abono_descripcion (Gate 2), igual que la consola.
          descripcion: validacion.descripcion,
        });
        if (validacion.ficha) {
          await tx.auditLog.create({
            data: {
              tenantId,
              actor: `user:${userId}`,
              action: ACCION_RECEPTOR_DEL_COMPROBANTE,
              entity: "Invoice",
              entityId: id,
              changes: {
                nombre: validacion.ficha.nombre,
                domicilio: validacion.ficha.domicilio,
                condicionIva: validacion.receptor.condicionIva,
              },
              channel: "admin",
            },
          });
        }
        return id;
      },
      { tenantId },
    );

    // Despacho a ARCA (CAE) si la facturación está encendida (stub/homologación/real).
    const encendida = isInvoicingEnabled();
    if (encendida) {
      await procesarEnviosDelNegocio(tenantId).catch((err) =>
        logger.warn("facturita", "despacho ARCA diferido (lo toma el próximo ciclo)", {
          tenantId,
          err: err instanceof Error ? err.message : String(err),
        }),
      );
    }

    revalidatePath(PATH_APP);

    // Cómo quedó de verdad: se lee la factura después del despacho.
    const f = await tenantTransaction(
      (tx) =>
        tx.invoice.findFirst({
          where: { id: invoiceId, tenantId },
          select: { status: true, rechazoMotivo: true, cae: true, numero: true, puntoVenta: true },
        }),
      { tenantId },
    );
    const estado: EstadoEmision =
      f?.status === "AUTHORIZED"
        ? {
            estado: "autorizada",
            dePrueba: esDePrueba(modoDesdeEnv(), homologacion),
            numero: numeroDeComprobante(f.puntoVenta, f.numero),
            cae: f.cae,
          }
        : f?.status === "REJECTED"
          ? { estado: "rechazada", origen: origenDelRechazo(f.rechazoMotivo), motivo: f.rechazoMotivo ?? "" }
          : {
              estado: "pendiente",
              motivo: encendida ? "esperando" : "apagada",
              ventanaDias: ventanaDeFechaArca(validacion.concepto),
            };

    if (estado.estado === "rechazada") {
      return { ok: false, error: mensajeDeEmision(estado), invoiceId, estado };
    }
    return { ok: true, invoiceId, limite: estadoLimite(limite.usadas + 1), estado, mensaje: mensajeDeEmision(estado) };
  } catch (err) {
    logger.error("facturita", "emisión falló", err, { tenantId });
    // Perfil fiscal sin cargar: reintentar no lo arregla, hay que cargar el dato.
    // Decirlo tal cual en vez del "probá en unos minutos" genérico.
    if (err instanceof PerfilFiscalIncompletoError) {
      return {
        ok: false,
        error:
          "Faltan los datos fiscales del negocio (CUIT y punto de venta). " +
          "Cargá el alta fiscal antes de emitir: no se emite con datos provisorios.",
      };
    }
    return {
      ok: false,
      error: "No se pudo emitir la factura. Probá de nuevo en unos minutos.",
    };
  }
}

// ---------------------------------------------------------------------------
// Mis facturas: lista con el ambiente de cada una y las notas de crédito
// ---------------------------------------------------------------------------

export interface FacturaFacturita {
  id: string;
  fecha: string; // AAAAMMDD
  numero: string | null;
  esNotaDeCredito: boolean;
  status: "PENDING" | "AUTHORIZED" | "REJECTED";
  total: number;
  descripcion: string | null;
  rechazoMotivo: string | null;
  /**
   * En qué ambiente de ARCA se autorizó: Invoice NO lo guarda (pendiente, con migración); se deduce
   * como el PDF (`ambienteDelComprobante`): el de hoy, salvo que el negocio haya cambiado de
   * ambiente después de autorizarla (`null` = no se sabe).
   */
  ambiente: "real" | "prueba" | null;
  /** Lo que queda por anular (autorizada, menos sus notas vivas). 0 = no se puede anular. */
  saldoAnulable: number;
}

export async function facturasFacturitaAction(): Promise<FacturaFacturita[]> {
  const { tenantId, homologacion } = await requireTenantFacturita();
  const { filas, cambio } = await tenantTransaction(
    async (tx) => {
      const filas = await tx.invoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true, fecha: true, numero: true, puntoVenta: true, status: true, total: true, descripcion: true,
          rechazoMotivo: true, authorizedAt: true, createdAt: true, comprobanteAsociadoId: true,
        },
      });
      const cambio = await tx.auditLog.findFirst({
        where: {
          tenantId,
          entity: "Tenant",
          entityId: tenantId,
          OR: [
            { changes: { path: ["arcaHomologacion", "despues"], equals: true } },
            { changes: { path: ["arcaHomologacion", "despues"], equals: false } },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      return { filas, cambio };
    },
    { tenantId },
  );
  const modo = modoDesdeEnv();
  const anulado = new Map<string, number[]>();
  for (const f of filas) {
    if (f.comprobanteAsociadoId && f.status !== "REJECTED") {
      anulado.set(f.comprobanteAsociadoId, [...(anulado.get(f.comprobanteAsociadoId) ?? []), Number(f.total)]);
    }
  }
  return filas.map((f) => {
    const total = Number(f.total);
    const esNota = f.comprobanteAsociadoId != null;
    const saldo =
      f.status === "AUTHORIZED" && !esNota ? redondearAlCentavo(total - sumarAlCentavo(anulado.get(f.id) ?? [])) : 0;
    return {
      id: f.id,
      fecha: f.fecha,
      numero: numeroDeComprobante(f.puntoVenta, f.numero),
      esNotaDeCredito: esNota,
      status: f.status as FacturaFacturita["status"],
      total,
      descripcion: f.descripcion ?? null,
      rechazoMotivo: f.rechazoMotivo,
      ambiente:
        f.status === "AUTHORIZED"
          ? ambienteDelComprobante({
              arcaHomologacion: homologacion,
              modoArca: modo,
              autorizadoEn: f.authorizedAt ?? f.createdAt,
              ultimoCambioDeAmbiente: cambio?.createdAt ?? null,
            })
          : null,
      saldoAnulable: saldo > 0 ? saldo : 0,
    };
  });
}

export type ResultadoAnularFacturita = { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * «Anular» una factura autorizada: nota de crédito asociada por TODO lo que queda (el motor toma la
 * factura con bloqueo y nunca anula más de lo facturado). Con la facturación encendida, la nota se
 * manda a ARCA enseguida. La nota usa uno de los lugares del cupo del mes, como cualquier
 * comprobante emitido.
 */
export async function anularFacturitaAction(facturaId: string, motivo: string): Promise<ResultadoAnularFacturita> {
  const { tenantId, userId } = await requireTenantFacturita();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(facturaId ?? "")) return { ok: false, error: "No encontramos esa factura." };
  const porque = (motivo ?? "").trim().slice(0, 200);
  if (porque.length < 3) return { ok: false, error: "Contá en pocas palabras por qué la anulás: queda escrito en la nota de crédito." };

  let r: Awaited<ReturnType<typeof crearNotaDeCredito>>;
  try {
    r = await crearNotaDeCredito({ tenantId, facturaId, motivo: porque, fecha: fechaHoy() });
  } catch (e) {
    if (esMigracionPendiente(e)) {
      return { ok: false, error: "La nota de crédito necesita un último paso de base de datos que todavía no se aplicó." };
    }
    logger.error("facturita", "no se pudo crear la nota de crédito", e, { tenantId });
    return { ok: false, error: "No se pudo anular la factura. Probá de nuevo en unos minutos." };
  }
  if (!r.ok) return r;
  await tenantTransaction(
    (tx) =>
      tx.auditLog.create({
        data: {
          tenantId,
          actor: `user:${userId}`,
          action: "facturita.nota_de_credito",
          entity: "Invoice",
          entityId: r.invoiceId,
          changes: { facturaId, motivo: porque },
          channel: "admin",
        },
      }),
    { tenantId },
  );

  let mensaje = "La nota de crédito quedó cargada y espera que ARCA la autorice. La ves en «Mis facturas».";
  if (isInvoicingEnabled()) {
    try {
      const d = await procesarEnviosDelNegocio(tenantId, 5, undefined, { ignorarEspera: true });
      const nota = await tenantTransaction(
        (tx) => tx.invoice.findFirst({ where: { id: r.invoiceId, tenantId }, select: { status: true, rechazoMotivo: true } }),
        { tenantId },
      );
      if (nota?.status === "AUTHORIZED") mensaje = "Listo: ARCA autorizó la nota de crédito y la factura quedó anulada.";
      else if (nota?.status === "REJECTED") {
        mensaje = mensajeDeEmision({ estado: "rechazada", origen: origenDelRechazo(nota.rechazoMotivo), motivo: nota.rechazoMotivo ?? "" });
      } else if (d.arcaNoDisponible) mensaje = "ARCA no responde ahora: la nota de crédito quedó pendiente y sale apenas conteste.";
    } catch (e) {
      logger.error("facturita", "no se pudo mandar la nota de crédito a ARCA", e, { tenantId });
    }
  }
  revalidatePath(`${PATH_APP}/facturas`);
  return { ok: true, mensaje };
}
