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
import { crearNotaDeCreditoInTx } from "@/lib/invoice-core";
import {
  getFiscalProfile,
  isInvoicingEnabled,
  PerfilFiscalIncompletoError,
} from "@/lib/fiscal";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import { emitirComprobanteManual } from "@/lib/facturacion/emision-manual.server";
import { contarFacturasDelMes, fechaFiscalDelDia } from "@/lib/bancos-glue";
import { logger } from "@/lib/logger";
import { modoDesdeEnv } from "@/plugins/arca";
import { ambienteDelComprobante } from "@/lib/comprobante-pdf";
import { ACCION_RECEPTOR_DEL_COMPROBANTE, ENTIDAD_RECEPTOR_DEL_COMPROBANTE } from "@/lib/comprobante-pdf-datos";
import {
  anulacionSegunCupo,
  errorDeNotaRechazada,
  estadoDeAnulacion,
  estadoLimite,
  numeroDeComprobante,
  origenDelRechazo,
  type EmisionFacturita,
  type EstadoEmision,
  type EstadoLimite,
} from "@/lib/facturita-core";
import {
  ACCION_EMISION,
  ENTIDAD_EMISION,
  MAX_ATAJOS,
  UNIDAD_SERVICIO,
  atajoDesdeProducto,
  atajoDesdeUltima,
  validarAtajo,
  type Atajo,
} from "@/lib/facturita-atajos";
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
  | { ok: true; invoiceId: string; limite: EstadoLimite; estado: EstadoEmision; mensaje: string; repetida?: true }
  | { ok: false; error: string; invoiceId?: string; estado?: EstadoEmision };

/**
 * Emite una factura manual de Factoque. La barrera es la del producto (capability + blueprint); la
 * emisión es el motor compartido (`emitirComprobanteManual`, src/lib/facturacion/emision-manual.server.ts):
 * el mismo que usan el panel de cualquier negocio y la consola del contador. El tope de 5 por mes
 * lo aplica el motor porque el negocio es del plan Factoque.
 */
export async function emitirFacturitaAction(
  datos: EmisionFacturita,
): Promise<ResultadoEmisionFacturita> {
  const { tenantId, userId } = await requireTenantFacturita();
  const r = await emitirComprobanteManual({ tenantId, actor: `user:${userId}`, revalidar: [PATH_APP] }, datos);
  if (!r.ok) return r;
  // Un negocio Factoque siempre tiene tope; el `?? ` sólo cubre el tipo.
  return { ...r, limite: r.limite ?? estadoLimite(await contarFacturasDelMes(tenantId)) };
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
  /** «anulada» sólo con la nota AUTORIZADA por ARCA; con la nota pendiente, «en_curso». */
  anulacion: "ninguna" | "en_curso" | "anulada";
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
          id: true, fecha: true, numero: true, puntoVenta: true, status: true, total: true,
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
  // La descripción se lee aparte y tolerante: sin la migración 20261022140000 (P2021/P2022) la
  // lista sale igual, sin descripciones (mismo criterio que comprobante-pdf-datos.ts).
  const descripciones = await tenantTransaction(
    (tx) => tx.invoice.findMany({ where: { tenantId, id: { in: filas.map((f) => f.id) } }, select: { id: true, descripcion: true } }),
    { tenantId },
  )
    .then((xs) => new Map(xs.map((x) => [x.id, x.descripcion ?? null])))
    .catch((e: unknown) => {
      if (esMigracionPendiente(e)) return new Map<string, string | null>();
      throw e;
    });
  const modo = modoDesdeEnv();
  const notas = filas.map((f) => ({ asociado: f.comprobanteAsociadoId, status: f.status, total: Number(f.total) }));
  return filas.map((f) => {
    const total = Number(f.total);
    const esNota = f.comprobanteAsociadoId != null;
    const anul = !esNota && f.status === "AUTHORIZED" ? estadoDeAnulacion(total, notas.filter((n) => n.asociado === f.id)) : null;
    const saldo = anul?.saldo ?? 0;
    return {
      id: f.id,
      fecha: f.fecha,
      numero: numeroDeComprobante(f.puntoVenta, f.numero),
      esNotaDeCredito: esNota,
      status: f.status as FacturaFacturita["status"],
      total,
      descripcion: descripciones.get(f.id) ?? null,
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
      anulacion: anul?.estado ?? "ninguna",
    };
  });
}

export type ResultadoAnularFacturita = { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * «Anular» una factura autorizada: nota de crédito asociada por TODO lo que queda (el motor toma la
 * factura con bloqueo y nunca anula más de lo facturado). La nota ocupa un lugar del cupo del mes,
 * como cualquier comprobante (hasta que el dueño decida otra cosa): sin lugar, no se anula y se
 * dice qué hacer. En la MISMA transacción se le copia a la nota la ficha del comprador de la
 * factura (`ComprobanteReceptor`), así el PDF de la nota sale con el mismo comprador. Con la
 * facturación encendida, la nota va a ARCA enseguida; si ARCA (o el sistema) la rechaza, es un
 * error: la factura sigue vigente.
 */
export async function anularFacturitaAction(facturaId: string, motivo: string): Promise<ResultadoAnularFacturita> {
  const { tenantId, userId } = await requireTenantFacturita();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(facturaId ?? "")) return { ok: false, error: "No encontramos esa factura." };
  const porque = (motivo ?? "").trim().slice(0, 200);
  if (porque.length < 3) return { ok: false, error: "Contá en pocas palabras por qué la anulás: queda escrito en la nota de crédito." };

  const cupo = anulacionSegunCupo(estadoLimite(await contarFacturasDelMes(tenantId)));
  if (!cupo.ok) return cupo;

  let r: Awaited<ReturnType<typeof crearNotaDeCreditoInTx>>;
  try {
    r = await tenantTransaction(
      async (tx) => {
        const nota = await crearNotaDeCreditoInTx(tx, { tenantId, facturaId, motivo: porque, fecha: fechaHoy() });
        if (!nota.ok) return nota;
        const ficha = await tx.auditLog.findFirst({
          where: { tenantId, entity: ENTIDAD_RECEPTOR_DEL_COMPROBANTE, entityId: facturaId, action: ACCION_RECEPTOR_DEL_COMPROBANTE },
          orderBy: { createdAt: "desc" },
          select: { changes: true },
        });
        if (ficha?.changes) {
          await tx.auditLog.create({
            data: {
              tenantId,
              actor: `user:${userId}`,
              action: ACCION_RECEPTOR_DEL_COMPROBANTE,
              entity: ENTIDAD_RECEPTOR_DEL_COMPROBANTE,
              entityId: nota.invoiceId,
              changes: ficha.changes,
              channel: "admin",
            },
          });
        }
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: `user:${userId}`,
            action: "facturita.nota_de_credito",
            entity: "Invoice",
            entityId: nota.invoiceId,
            changes: { facturaId, motivo: porque },
            channel: "admin",
          },
        });
        return nota;
      },
      { tenantId },
    );
  } catch (e) {
    if (esMigracionPendiente(e)) {
      return { ok: false, error: "La nota de crédito necesita un último paso de base de datos que todavía no se aplicó." };
    }
    logger.error("facturita", "no se pudo crear la nota de crédito", e, { tenantId });
    return { ok: false, error: "No se pudo anular la factura. Probá de nuevo en unos minutos." };
  }
  if (!r.ok) return r;
  const notaId = r.invoiceId;

  let mensaje =
    "La nota de crédito quedó cargada y espera que ARCA la autorice: hasta entonces, la anulación está en curso. Usó uno de los comprobantes del mes.";
  if (isInvoicingEnabled()) {
    try {
      const d = await procesarEnviosDelNegocio(tenantId, 5, undefined, { ignorarEspera: true });
      const nota = await tenantTransaction(
        (tx) => tx.invoice.findFirst({ where: { id: notaId, tenantId }, select: { status: true, rechazoMotivo: true } }),
        { tenantId },
      );
      if (nota?.status === "AUTHORIZED") mensaje = "Listo: ARCA autorizó la nota de crédito y la factura quedó anulada.";
      else if (nota?.status === "REJECTED") {
        revalidatePath(`${PATH_APP}/facturas`);
        return { ok: false, error: errorDeNotaRechazada(origenDelRechazo(nota.rechazoMotivo), nota.rechazoMotivo) };
      } else if (d.arcaNoDisponible) {
        mensaje = "ARCA no responde ahora: la nota de crédito quedó pendiente y la anulación está en curso. Sale apenas conteste.";
      }
    } catch (e) {
      logger.error("facturita", "no se pudo mandar la nota de crédito a ARCA", e, { tenantId });
    }
  }
  revalidatePath(`${PATH_APP}/facturas`);
  return { ok: true, mensaje };
}

// ---------------------------------------------------------------------------
// Mis productos: lo que el negocio factura seguido, como botones de la pantalla de emitir
// ---------------------------------------------------------------------------

/** Los productos guardados (los más nuevos primero) y «Repetir la última», si se puede repetir. */
export async function atajosFacturitaAction(): Promise<{ productos: Atajo[]; ultima: Atajo | null }> {
  const { tenantId } = await requireTenantFacturita();
  const { filas, registro } = await tenantTransaction(
    async (tx) => ({
      filas: await tx.product.findMany({
        where: { tenantId, active: true, deletedAt: null, price: { gt: 0 } },
        select: { id: true, name: true, price: true, unit: true },
        orderBy: { createdAt: "desc" },
        take: MAX_ATAJOS,
      }),
      registro: await tx.auditLog.findFirst({
        where: { tenantId, entity: ENTIDAD_EMISION, action: ACCION_EMISION },
        orderBy: { createdAt: "desc" },
        select: { changes: true },
      }),
    }),
    { tenantId },
  );
  return {
    productos: filas.map(atajoDesdeProducto).filter((a): a is Atajo => a !== null),
    ultima: atajoDesdeUltima(registro?.changes),
  };
}

export type ResultadoAtajo = { ok: true; atajo: Atajo } | { ok: false; error: string };

/** Guarda un producto (detalle + precio) del propio negocio. No controla stock ni se vende en otro canal. */
export async function guardarAtajoFacturitaAction(form: {
  detalle: unknown;
  precio: unknown;
  concepto?: unknown;
}): Promise<ResultadoAtajo> {
  const { tenantId, userId } = await requireTenantFacturita();
  const v = validarAtajo(form);
  if (!v.ok) return v;
  const r = await tenantTransaction(
    async (tx) => {
      const cuantos = await tx.product.count({ where: { tenantId, active: true, deletedAt: null } });
      if (cuantos >= MAX_ATAJOS) return null;
      const p = await tx.product.create({
        data: {
          tenantId,
          name: v.detalle,
          price: v.precio,
          unit: v.concepto === "servicios" ? UNIDAD_SERVICIO : "unidades",
          trackStock: false,
        },
        select: { id: true, name: true, price: true, unit: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actor: `user:${userId}`,
          action: "facturita.producto_guardado",
          entity: "Product",
          entityId: p.id,
          changes: { detalle: v.detalle, precio: v.precio, concepto: v.concepto },
          channel: "admin",
        },
      });
      return p;
    },
    { tenantId },
  );
  if (!r) return { ok: false, error: `Ya tenés ${MAX_ATAJOS} productos: sacá uno para guardar otro.` };
  revalidatePath(PATH_APP);
  const atajo = atajoDesdeProducto(r);
  return atajo ? { ok: true, atajo } : { ok: false, error: "No se pudo guardar el producto." };
}

/** Saca un producto de la lista (baja lógica): las facturas ya emitidas no cambian. */
export async function quitarAtajoFacturitaAction(productoId: unknown): Promise<{ ok: boolean }> {
  const { tenantId, userId } = await requireTenantFacturita();
  if (typeof productoId !== "string" || !productoId) return { ok: false };
  const n = await tenantTransaction(
    async (tx) => {
      const r = await tx.product.updateMany({
        where: { id: productoId, tenantId, deletedAt: null },
        data: { active: false, deletedAt: new Date() },
      });
      if (r.count === 1) {
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: `user:${userId}`,
            action: "facturita.producto_quitado",
            entity: "Product",
            entityId: productoId,
            channel: "admin",
          },
        });
      }
      return r.count;
    },
    { tenantId },
  );
  if (n === 1) revalidatePath(PATH_APP);
  return { ok: n === 1 };
}
