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
import { createInvoiceInTx, crearNotaDeCreditoInTx } from "@/lib/invoice-core";
import { vincularCobroInTx } from "@/lib/facturacion/cobros-facturados";
import { claveAlmacenada } from "@/lib/facturacion/clave-origen";

/** ¿La base tiene el libro de cobros facturados? (sin abortar la transacción si no está). */
async function hayLibroDeCobros(tx: { $queryRaw<T>(q: TemplateStringsArray, ...v: unknown[]): Promise<T> }): Promise<boolean> {
  const [fila] = await tx.$queryRaw<{ hay: boolean }[]>`SELECT to_regclass('"CobroFacturado"') IS NOT NULL AS hay`;
  return fila?.hay === true;
}
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
import { ACCION_RECEPTOR_DEL_COMPROBANTE, ENTIDAD_RECEPTOR_DEL_COMPROBANTE } from "@/lib/comprobante-pdf-datos";
import {
  anulacionSegunCupo,
  errorDeNotaRechazada,
  esDePrueba,
  estadoDeAnulacion,
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
  ACCION_EMISION,
  ENTIDAD_EMISION,
  MAX_ATAJOS,
  UNIDAD_SERVICIO,
  atajoDesdeProducto,
  atajoDesdeUltima,
  claveEmisionValida,
  validarAtajo,
  type Atajo,
  type RegistroEmision,
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

/** `AuditLog.entityId` del registro: la clave del pedido, o la factura si el pedido no trajo clave. */
function idDelRegistro(clave: string | null, invoiceId: string): string {
  return clave ? `clave:${clave}` : `factura:${invoiceId}`;
}

function invoiceIdDelRegistro(changes: unknown): string | null {
  const id = (changes as { invoiceId?: unknown } | null)?.invoiceId;
  return typeof id === "string" && id ? id : null;
}

/** La factura que ya emitió esta clave en este negocio, si la hay. */
async function facturaDeLaClave(tenantId: string, clave: string): Promise<string | null> {
  const r = await tenantTransaction(
    (tx) =>
      tx.auditLog.findFirst({
        where: { tenantId, entity: ENTIDAD_EMISION, entityId: idDelRegistro(clave, "") },
        select: { changes: true },
      }),
    { tenantId },
  );
  return invoiceIdDelRegistro(r?.changes);
}

export type ResultadoEmisionFacturita =
  | { ok: true; invoiceId: string; limite: EstadoLimite; estado: EstadoEmision; mensaje: string; repetida?: true }
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

  // La condición del emisor decide qué exige el comprador (la A lleva su domicilio). Sin perfil
  // cargado, `null`: la emisión lo frena más abajo con su mensaje.
  const condicionEmisor = await getFiscalProfile(tenantId)
    .then((p) => p.condicionIva)
    .catch((e: unknown) => {
      if (e instanceof PerfilFiscalIncompletoError) return null;
      throw e;
    });
  const validacion = validarEmision(datos, hoy, { condicionEmisor });
  if (!validacion.ok) return { ok: false, error: validacion.error };
  // Una clave que no tiene la forma no se ignora: sin ella se perdería la guarda del doble toque.
  if (datos.claveEmision !== undefined && !claveEmisionValida(datos.claveEmision)) {
    return { ok: false, error: "No se pudo emitir: recargá la pantalla y probá de nuevo." };
  }
  const clave = datos.claveEmision ?? null;

  // El mismo pedido otra vez (doble toque, reintento): la factura ya existe, no se cuenta de nuevo
  // contra el tope ni se pide otro CAE. Se contesta con cómo quedó la primera.
  const yaEmitida = clave ? await facturaDeLaClave(tenantId, clave) : null;
  const limite = estadoLimite(await contarFacturasDelMes(tenantId));
  if (!yaEmitida && !limite.puedeEmitir) {
    return { ok: false, error: limite.mensaje ?? "Llegaste al límite de facturas del plan de este mes." };
  }

  try {
    const perfil = await getFiscalProfile(tenantId);
    // Inscripto: IVA declarado en el renglón con la alícuota elegida (ivaPorProducto). C: sin IVA.
    const montos = montosFacturita(perfil.condicionIva, datos.total, validacion.alicuotaId);
    if (!montos.ok) return { ok: false, error: montos.error };

    // `descripcion` necesita la migración 20261022140000 (Gate 2). En una base sin ella (P2022) la
    // factura se crea igual, sin la descripción (el PDF cae al concepto), en vez de no emitir.
    const crear = (conDescripcion: boolean) => tenantTransaction(
      async (tx) => {
        if (clave) {
          // Dos pedidos con la misma clave se ponen en fila: el segundo espera a que el primero
          // confirme y encuentra su registro. Nunca dos facturas (ni dos CAE) por un doble toque.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`facturita-emision:${tenantId}:${clave}`}))`;
          const previa = await tx.auditLog.findFirst({
            where: { tenantId, entity: ENTIDAD_EMISION, entityId: idDelRegistro(clave, "") },
            select: { changes: true },
          });
          const previaId = invoiceIdDelRegistro(previa?.changes);
          if (previaId) return previaId;
        }
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
          ...(conDescripcion ? { descripcion: validacion.descripcion } : {}),
        });
        // Clave de origen `manual:<clave>` en el libro de cobros facturados (índice único): la
        // misma guarda del doble toque, ahora también a nivel base (contrato de estados v1).
        // Tolera una base sin la migración 20261022150000_cobro_facturado (Gate 2): sin la tabla
        // queda la guarda de siempre (candado + registro de la emisión, más abajo).
        if (clave && (await hayLibroDeCobros(tx))) {
          await vincularCobroInTx(tx, tenantId, { clave: claveAlmacenada({ tipo: "manual", id: clave }), importe: montos.total }, id);
        }
        if (validacion.ficha) {
          await tx.auditLog.create({
            data: {
              tenantId,
              actor: `user:${userId}`,
              action: ACCION_RECEPTOR_DEL_COMPROBANTE,
              entity: ENTIDAD_RECEPTOR_DEL_COMPROBANTE,
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
        // El registro de la emisión, en la MISMA transacción que la factura: guarda del doble toque
        // (por su clave) y fuente de «Repetir la última».
        const registro: RegistroEmision = {
          invoiceId: id,
          descripcion: validacion.descripcion,
          total: montos.total,
          concepto: datos.concepto ?? "productos",
          consumidorFinal: validacion.receptor.condicionIva === "CONSUMIDOR_FINAL" && !validacion.ficha,
        };
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: `user:${userId}`,
            action: ACCION_EMISION,
            entity: ENTIDAD_EMISION,
            entityId: idDelRegistro(clave, id),
            changes: { ...registro },
            channel: "admin",
          },
        });
        return id;
      },
      { tenantId },
    );
    const invoiceId =
      yaEmitida ??
      (await crear(true).catch((e: unknown) => {
        if (esMigracionPendiente(e)) return crear(false);
        throw e;
      }));
    const repetida = yaEmitida !== null;

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

    // Desde acá la factura YA EXISTE: un error al leer cómo quedó no puede contestarse como «no se
    // emitió», porque la pantalla tiraría la clave y el reintento pediría otro CAE (certificación
    // M1). Se contesta pendiente con su id: el estado real lo muestra «Mis facturas».
    const pendiente: EstadoEmision = { estado: "pendiente", motivo: encendida ? "esperando" : "apagada", ventanaDias: ventanaDeFechaArca(validacion.concepto) };
    try {
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
            : pendiente;

      if (estado.estado === "rechazada") {
        return { ok: false, error: mensajeDeEmision(estado), invoiceId, estado };
      }
      const limiteDespues = estadoLimite(await contarFacturasDelMes(tenantId));
      return { ok: true, invoiceId, limite: limiteDespues, estado, mensaje: mensajeDeEmision(estado), ...(repetida ? { repetida } : {}) };
    } catch (err) {
      logger.error("facturita", "factura creada; falló leer su estado", err, { tenantId, invoiceId });
      return {
        ok: true,
        invoiceId,
        limite: estadoLimite(limite.usadas + (repetida ? 0 : 1)),
        estado: pendiente,
        mensaje: mensajeDeEmision(pendiente),
        ...(repetida ? { repetida } : {}),
      };
    }
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
