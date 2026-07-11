"use server";

// Server Actions del módulo BANCOS — importación de extractos bancarios y
// facturación de las propuestas. Gated por `billing:manage` (misma pantalla de
// Facturación del backoffice que ARCA, ver src/plugins/bancos/module.ts) y
// mismo molde que facturacion-actions.ts.
//
// Flujo completo:
//   procesarExtractoAction (sube el archivo, propone) →
//   [confirmarMapeoAction si la confianza del mapeo < 0.8] →
//   [completarRevisionAction para las que exigen identificación] →
//   emitirPropuestasAction (createInvoice del Core + despacho a ARCA) →
//   kpisFacturacionAction (tablero del mes).
//
// AISLAMIENTO (ADR-018): tenantId EXPLÍCITO en el predicado de TODA query y en
// cada tenantTransaction. DINERO (ADR-057): Decimal(14,2) en DB, number en
// memoria (conversión en `toNum` del glue).
//
// NOTA Gate 2: la migración `20260711120000_add_bancos_importacion` NO está
// aplicada a Neon — en prod estas actions no operan hasta ese OK del dueño
// (mismo estado que el resto del camino fiscal, ARCA_INVOICING_ENABLED off).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { createInvoice } from "@/lib/invoice-core";
import { calcularImpuestos, getFiscalProfile, isInvoicingEnabled } from "@/lib/fiscal";
import { processArcaOutbox, type DispatchResumen } from "@/lib/arca-dispatch";
import { logger } from "@/lib/logger";
import {
  ClasificadorBancarioPorReglas,
  procesarExtracto,
  registrarCorreccionBanco,
  CAP_FACTURAS_MES_DEFAULT,
  DOC_TIPO_CONSUMIDOR_FINAL,
  type AlertaBancos,
  type ArchivoExtracto,
  type MapeoColumnas,
  type MovimientoBancario,
} from "@/plugins/bancos";
import {
  AprendizajeBancoPrisma,
  armarFilasMovimientos,
  configBancosDesdeTenant,
  crearDeteccionCruzadaInvoices,
  crearYaProcesado,
  rangoMesActual,
  resumirPropuestas,
  toNum,
  validarDatosRevision,
  type DatosRevision,
  type EstadoPropuestaDb,
  type ResumenPropuestas,
} from "@/lib/bancos-glue";

const FACTURACION_PATH = "/admin/facturacion";

// ── Tipos de retorno (los consume la UI) ─────────────────────────────────────

export type ResultadoProcesarExtracto =
  | {
      ok: true;
      importacionId: string;
      resumen: ResumenPropuestas;
      alertas: AlertaBancos[];
      /** El mapeo detectado/confirmado, para que la UI lo muestre y lo pueda corregir. */
      mapeo: MapeoColumnas;
      /** true ⇒ confianza < 0.8: la UI debe pedir confirmación antes de emitir. */
      requiereConfirmacionMapeo: boolean;
    }
  | { ok: false; error: string; alertas: AlertaBancos[] };

export interface PropuestaVista {
  id: string;
  importacionId: string;
  fecha: string; // AAAAMMDD
  monto: number;
  descripcion: string;
  contraparte: string | null;
  referencia: string | null;
  clasificacion: string;
  estadoPropuesta: EstadoPropuestaDb;
  requiereIdentificacion: boolean;
  motivoRevision: string | null;
  docTipo: number | null;
  docNro: string | null;
  nombreReceptor: string | null;
  descripcionServicio: string | null;
  invoiceId: string | null;
  createdAt: string; // ISO
}

export interface FiltroPropuestas {
  estadoPropuesta?: EstadoPropuestaDb;
  importacionId?: string;
}

export interface ImportacionVista {
  id: string;
  nombreArchivo: string;
  origen: string;
  estado: string;
  totalMovimientos: number;
  createdAt: string; // ISO
}

export interface DetalleImportacion extends ImportacionVista {
  mapeo: MapeoColumnas | null;
  /** Conteo de movimientos por estado de propuesta. */
  conteos: Partial<Record<EstadoPropuestaDb, number>>;
  movimientos: PropuestaVista[];
}

export type ResultadoSimple = { ok: true } | { ok: false; error: string };

export interface ResultadoEmision {
  emitidas: number;
  bloqueadasPorCap: number;
  capAlcanzado: boolean;
  mensaje?: string;
  errores: { movimientoId: string; error: string }[];
  /** Resumen del despacho a ARCA (solo si ARCA_INVOICING_ENABLED está prendido). */
  despachoArca?: DispatchResumen;
}

export interface KpisFacturacionBancaria {
  /** Facturas del tenant creadas este mes (todas las vías: banco, MP, turnos). */
  facturasMes: number;
  capFacturasMes: number;
  capRestante: number;
  montoFacturadoMes: number;
  pendientesRevision: number;
  ultimasImportaciones: ImportacionVista[];
}

// ── Helpers internos (no exportados: "use server" solo exporta async actions) ─

function aPropuestaVista(m: {
  id: string;
  importacionId: string;
  fecha: string;
  monto: unknown;
  descripcion: string;
  contraparte: string | null;
  referencia: string | null;
  clasificacion: string;
  estadoPropuesta: string;
  requiereIdentificacion: boolean;
  motivoRevision: string | null;
  docTipo: number | null;
  docNro: string | null;
  nombreReceptor: string | null;
  descripcionServicio: string | null;
  invoiceId: string | null;
  createdAt: Date;
}): PropuestaVista {
  return {
    id: m.id,
    importacionId: m.importacionId,
    fecha: m.fecha,
    monto: toNum(m.monto),
    descripcion: m.descripcion,
    contraparte: m.contraparte,
    referencia: m.referencia,
    clasificacion: m.clasificacion,
    estadoPropuesta: m.estadoPropuesta as EstadoPropuestaDb,
    requiereIdentificacion: m.requiereIdentificacion,
    motivoRevision: m.motivoRevision,
    docTipo: m.docTipo,
    docNro: m.docNro,
    nombreReceptor: m.nombreReceptor,
    descripcionServicio: m.descripcionServicio,
    invoiceId: m.invoiceId,
    createdAt: m.createdAt.toISOString(),
  };
}

async function contarFacturasDelMes(tenantId: string): Promise<number> {
  return prisma.invoice.count({ where: { tenantId, createdAt: rangoMesActual() } });
}

/**
 * Corre el pipeline del plugin y persiste el lote. Compartido por la
 * importación inicial y el re-proceso con mapeo confirmado (`reproceso`
 * trae el id de la importación existente + el mapeo que confirmó el usuario).
 */
async function procesarYPersistir(
  tenantId: string,
  archivo: ArchivoExtracto,
  reproceso?: { importacionId: string; mapeoConfirmado: MapeoColumnas },
): Promise<ResultadoProcesarExtracto> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      bancosUmbralIdentificacion: true,
      bancosCapFacturasMes: true,
      bancosDomicilioEmisor: true,
      arcaPuntoVenta: true,
      arcaCuit: true,
    },
  });
  if (!tenant) return { ok: false, error: "No se encontró el tenant.", alertas: [] };

  const cfg = configBancosDesdeTenant(tenant);
  const facturasEmitidasEsteMes = await contarFacturasDelMes(tenantId);

  const resultado = await procesarExtracto(archivo, {
    tenantId,
    clasificador: new ClasificadorBancarioPorReglas({
      config: { cuitsPropios: cfg.cuitsPropios },
      aprendizaje: new AprendizajeBancoPrisma(tenantId),
    }),
    config: cfg.config,
    facturasEmitidasEsteMes,
    deteccionCruzada: crearDeteccionCruzadaInvoices(tenantId),
    yaProcesado: crearYaProcesado(tenantId, reproceso?.importacionId),
    mapeoConfirmado: reproceso?.mapeoConfirmado,
  });

  if (!resultado.mapeo) {
    return {
      ok: false,
      error:
        resultado.alertas[0]?.mensaje ??
        "No se pudo reconocer la tabla del extracto. Revisá el archivo.",
      alertas: resultado.alertas,
    };
  }
  const mapeo = resultado.mapeo;

  const importacionId = await tenantTransaction(
    async (tx) => {
      let id: string;
      if (reproceso) {
        // Re-proceso: lo provisional se borra y se recrea con el mapeo confirmado.
        // (El guard de "nada emitido" lo hizo confirmarMapeoAction antes de llegar acá.)
        await tx.movimientoImportado.deleteMany({
          where: { tenantId, importacionId: reproceso.importacionId },
        });
        id = reproceso.importacionId;
      } else {
        const creada = await tx.importacionBancaria.create({
          data: {
            tenantId,
            nombreArchivo: archivo.nombre,
            origen: mapeo.origen,
            // Copia a un Uint8Array "puro": Prisma tipa Bytes como Uint8Array<ArrayBuffer>.
            archivo: new Uint8Array(archivo.contenido),
            mapeoJson: mapeo as unknown as object,
            estado: "procesada",
          },
          select: { id: true },
        });
        id = creada.id;
      }

      const filas = armarFilasMovimientos(tenantId, id, resultado);
      if (filas.length > 0) {
        // skipDuplicates: el unique [tenantId, hash] es la red ante carreras
        // (dos importaciones simultáneas del mismo extracto).
        await tx.movimientoImportado.createMany({ data: filas, skipDuplicates: true });
      }
      await tx.importacionBancaria.updateMany({
        where: { id, tenantId },
        data: {
          totalMovimientos: filas.length,
          mapeoJson: mapeo as unknown as object,
          ...(reproceso ? { estado: "confirmada" } : {}),
        },
      });
      return id;
    },
    { tenantId },
  );

  revalidatePath(FACTURACION_PATH);
  return {
    ok: true,
    importacionId,
    resumen: resumirPropuestas(resultado.propuestas),
    alertas: resultado.alertas,
    mapeo,
    requiereConfirmacionMapeo: mapeo.requiereConfirmacion,
  };
}

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Importa un extracto bancario (CSV/XLSX) subido como `formData.archivo`:
 * parsea, mapea columnas, clasifica, aplica las reglas del dueño y persiste el
 * lote + las propuestas. Idempotente entre corridas: un movimiento ya visto
 * (mismo hash) cuenta como duplicado y no se re-crea.
 */
/**
 * Tope de tamaño del extracto (OBS-4 del Gate): un extracto mensual real pesa
 * KB; 10 MB ya es holgadísimo. Corta antes de leer el archivo a memoria y de
 * persistir los bytes (cuida la RAM del server y el storage de Neon free).
 * (No se exporta: un archivo "use server" solo puede exportar funciones async;
 * el cliente ImportarExtracto repite el mismo tope inline.)
 */
const MAX_BYTES_EXTRACTO = 10 * 1024 * 1024;

export async function procesarExtractoAction(
  formData: FormData,
): Promise<ResultadoProcesarExtracto> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Subí el extracto del banco (CSV o XLSX).", alertas: [] };
  }
  if (archivo.size > MAX_BYTES_EXTRACTO) {
    return {
      ok: false,
      error:
        "El archivo pesa más de 10 MB — un extracto bancario normal pesa mucho menos. Revisá que sea el extracto y no otra cosa.",
      alertas: [],
    };
  }
  const contenido = new Uint8Array(await archivo.arrayBuffer());
  return procesarYPersistir(tenantId, { nombre: archivo.name, contenido });
}

/**
 * Re-procesa una importación con el mapeo de columnas CONFIRMADO/corregido por
 * el usuario (flujo de confianza < 0.8). Usa el archivo crudo guardado en la
 * importación — el usuario no lo vuelve a subir. Bloqueado si el lote ya tiene
 * facturas emitidas (no se re-interpreta un extracto ya facturado).
 */
export async function confirmarMapeoAction(
  importacionId: string,
  mapeoCorregido: MapeoColumnas,
): Promise<ResultadoProcesarExtracto> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  const importacion = await prisma.importacionBancaria.findFirst({
    where: { id: importacionId, tenantId },
    select: { id: true, nombreArchivo: true, archivo: true },
  });
  if (!importacion) {
    return { ok: false, error: "No se encontró la importación.", alertas: [] };
  }
  const emitidas = await prisma.movimientoImportado.count({
    where: { tenantId, importacionId, estadoPropuesta: "emitida" },
  });
  if (emitidas > 0) {
    return {
      ok: false,
      error:
        "Esta importación ya tiene facturas emitidas: no se puede re-procesar con otro mapeo.",
      alertas: [],
    };
  }

  return procesarYPersistir(
    tenantId,
    { nombre: importacion.nombreArchivo, contenido: importacion.archivo },
    {
      importacionId,
      // El usuario lo confirmó: confianza 1, sin pedir confirmación de nuevo.
      mapeoConfirmado: { ...mapeoCorregido, confianza: 1, requiereConfirmacion: false },
    },
  );
}

/** Lista las propuestas del tenant, filtrables por estado y/o importación. */
export async function listarPropuestasAction(
  filtro?: FiltroPropuestas,
): Promise<PropuestaVista[]> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  const movimientos = await prisma.movimientoImportado.findMany({
    where: {
      tenantId,
      ...(filtro?.estadoPropuesta ? { estadoPropuesta: filtro.estadoPropuesta } : {}),
      ...(filtro?.importacionId ? { importacionId: filtro.importacionId } : {}),
    },
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return movimientos.map(aPropuestaVista);
}

/** Detalle de una importación: metadata + mapeo + conteos + movimientos. */
export async function detalleImportacionAction(
  importacionId: string,
): Promise<DetalleImportacion | null> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  const importacion = await prisma.importacionBancaria.findFirst({
    where: { id: importacionId, tenantId },
    select: {
      id: true,
      nombreArchivo: true,
      origen: true,
      estado: true,
      totalMovimientos: true,
      createdAt: true,
      mapeoJson: true,
    },
  });
  if (!importacion) return null;

  const [grupos, movimientos] = await Promise.all([
    prisma.movimientoImportado.groupBy({
      by: ["estadoPropuesta"],
      where: { tenantId, importacionId },
      _count: { _all: true },
    }),
    prisma.movimientoImportado.findMany({
      where: { tenantId, importacionId },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const conteos: Partial<Record<EstadoPropuestaDb, number>> = {};
  for (const g of grupos) conteos[g.estadoPropuesta as EstadoPropuestaDb] = g._count._all;

  return {
    id: importacion.id,
    nombreArchivo: importacion.nombreArchivo,
    origen: importacion.origen,
    estado: importacion.estado,
    totalMovimientos: importacion.totalMovimientos,
    createdAt: importacion.createdAt.toISOString(),
    mapeo: (importacion.mapeoJson as unknown as MapeoColumnas) ?? null,
    conteos,
    movimientos: movimientos.map(aPropuestaVista),
  };
}

/**
 * Completa los datos de identificación de una propuesta en revisión (umbral):
 * valida CUIT/CUIL con dígito verificador y la pasa a `auto` (lista para emitir).
 */
export async function completarRevisionAction(
  movimientoId: string,
  datos: DatosRevision,
): Promise<ResultadoSimple> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  const validacion = validarDatosRevision(datos);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const res = await tenantTransaction(
    (tx) =>
      tx.movimientoImportado.updateMany({
        where: { id: movimientoId, tenantId, estadoPropuesta: "revision" },
        data: {
          docTipo: datos.docTipo,
          docNro: validacion.docNro,
          nombreReceptor: datos.nombreReceptor?.trim() || null,
          descripcionServicio: datos.descripcionServicio?.trim() || null,
          estadoPropuesta: "auto",
          motivoRevision: null,
        },
      }),
    { tenantId },
  );
  if (res.count === 0) {
    return { ok: false, error: "El movimiento no está en revisión (o no existe)." };
  }
  revalidatePath(FACTURACION_PATH);
  return { ok: true };
}

/**
 * Emite las propuestas en estado `auto`: por cada una llama a `createInvoice`
 * del Core (el Core calcula neto/IVA según el perfil fiscal, ADR-006) y marca
 * el movimiento `emitida` con su `invoiceId`. Respeta el cap de facturas del
 * mes (al 100% BLOQUEA el resto con mensaje claro) y, si la facturación está
 * encendida (`ARCA_INVOICING_ENABLED`), drena el outbox hacia ARCA para
 * obtener el CAE (stub en dev).
 *
 * `seleccion`: ids puntuales, o `"auto"` = todas las propuestas listas.
 */
export async function emitirPropuestasAction(
  seleccion: string[] | "auto",
): Promise<ResultadoEmision> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

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
  revalidatePath(FACTURACION_PATH);
  return {
    emitidas,
    bloqueadasPorCap: bloqueadas,
    capAlcanzado,
    ...(capAlcanzado
      ? {
          mensaje:
            `Se alcanzó el tope de ${cap} facturas del mes` +
            (bloqueadas > 0
              ? `: ${bloqueadas} propuesta(s) quedaron SIN emitir. Se emiten recién el mes próximo (o subiendo el tope en la configuración del módulo).`
              : "."),
        }
      : {}),
    errores,
    ...(despachoArca ? { despachoArca } : {}),
  };
}

/**
 * Marca un movimiento como NO facturable. Con `aprenderPatron`, además guarda
 * la corrección en el aprendizaje por tenant (tabla ReglaClasificacionBancoTenant):
 * la próxima importación clasifica ese patrón sola — mismo contrato que el
 * clasificador de MP (ADR-025 §12.1).
 */
export async function marcarNoFacturableAction(
  movimientoId: string,
  aprenderPatron = false,
): Promise<ResultadoSimple> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  const mov = await prisma.movimientoImportado.findFirst({
    where: { id: movimientoId, tenantId },
    select: {
      id: true,
      hash: true,
      fecha: true,
      monto: true,
      descripcion: true,
      contraparte: true,
      estadoPropuesta: true,
    },
  });
  if (!mov) return { ok: false, error: "No se encontró el movimiento." };
  if (mov.estadoPropuesta === "emitida") {
    return {
      ok: false,
      error: "Este movimiento ya tiene factura emitida: no se puede marcar no facturable.",
    };
  }

  await tenantTransaction(
    (tx) =>
      tx.movimientoImportado.updateMany({
        where: { id: movimientoId, tenantId },
        data: {
          estadoPropuesta: "no_facturable",
          motivoRevision: "Marcado no facturable por el usuario.",
        },
      }),
    { tenantId },
  );

  if (aprenderPatron) {
    const movimientoBancario: MovimientoBancario = {
      id: mov.hash,
      fecha: mov.fecha,
      monto: toNum(mov.monto),
      descripcion: mov.descripcion,
      ...(mov.contraparte ? { contraparte: mov.contraparte } : {}),
      origen: "banco",
    };
    await registrarCorreccionBanco(
      new AprendizajeBancoPrisma(tenantId),
      movimientoBancario,
      "NO_FACTURABLE",
    );
  }

  revalidatePath(FACTURACION_PATH);
  return { ok: true };
}

/** Config del módulo editable por el dueño. `null` = volver al default del plugin. */
export interface ConfigBancosInput {
  /** Pesos desde los cuales se exige identificar al receptor (default $600.000). */
  umbralIdentificacion: number | null;
  /** Tope de facturas automáticas por mes (default 159). */
  capFacturasMes: number | null;
  /** Domicilio comercial del emisor (obligatorio en el comprobante). */
  domicilioEmisor: string | null;
}

/**
 * Guarda la configuración del módulo BANCOS en el tenant (umbral de
 * identificación, cap de facturas/mes, domicilio del emisor). Mismo molde que
 * el resto: gated `billing:manage`, validación de inputs, `tenantTransaction`
 * con tenantId explícito (ADR-018).
 */
export async function guardarConfigBancosAction(
  input: ConfigBancosInput,
): Promise<ResultadoSimple> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();

  const umbral = input.umbralIdentificacion;
  if (umbral != null && (!Number.isFinite(umbral) || umbral <= 0)) {
    return {
      ok: false,
      error: "El umbral de identificación tiene que ser un monto mayor a cero.",
    };
  }
  const cap = input.capFacturasMes;
  if (cap != null && (!Number.isInteger(cap) || cap < 1 || cap > 100_000)) {
    return {
      ok: false,
      error: "El tope de facturas por mes tiene que ser un número entero entre 1 y 100.000.",
    };
  }
  const domicilio = input.domicilioEmisor?.trim() || null;
  if (domicilio != null && domicilio.length > 200) {
    return { ok: false, error: "El domicilio del emisor no puede superar los 200 caracteres." };
  }

  await tenantTransaction(
    (tx) =>
      tx.tenant.update({
        where: { id: tenantId },
        data: {
          bancosUmbralIdentificacion: umbral,
          bancosCapFacturasMes: cap,
          bancosDomicilioEmisor: domicilio,
        },
      }),
    { tenantId },
  );

  revalidatePath(FACTURACION_PATH);
  return { ok: true };
}

/** KPIs del módulo para el tablero: facturas vs cap, monto del mes, pendientes, últimas importaciones. */
export async function kpisFacturacionAction(): Promise<KpisFacturacionBancaria> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  const rango = rangoMesActual();

  const [tenant, facturasMes, montoAgg, pendientesRevision, ultimas] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { bancosCapFacturasMes: true },
    }),
    prisma.invoice.count({ where: { tenantId, createdAt: rango } }),
    prisma.invoice.aggregate({
      _sum: { total: true },
      where: { tenantId, createdAt: rango, status: { not: "REJECTED" } },
    }),
    prisma.movimientoImportado.count({ where: { tenantId, estadoPropuesta: "revision" } }),
    prisma.importacionBancaria.findMany({
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
  ]);

  const capFacturasMes = tenant?.bancosCapFacturasMes ?? CAP_FACTURAS_MES_DEFAULT;
  return {
    facturasMes,
    capFacturasMes,
    capRestante: Math.max(0, capFacturasMes - facturasMes),
    montoFacturadoMes: toNum(montoAgg._sum.total ?? 0),
    pendientesRevision,
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
