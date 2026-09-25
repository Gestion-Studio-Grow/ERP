/**
 * Dispatcher del Plugin ARCA (Integration Engine, ADR-006 / ADR-002 / ADR-022).
 *
 * Es el GLUE del borde: lee el outbox del Core, arma el evento que el plugin
 * entiende y corre su handler, inyectándole el cliente de ARCA del tenant y el
 * comando `registerFiscalDocument` del Core. Es el único módulo que conoce a los
 * dos lados (por eso importa el plugin); el Core (`invoice-core`) no importa el
 * plugin — la dependencia va plugin→Core (ADR-002).
 *
 * Dos entradas: `processArcaOutbox()` barre todos los negocios y la llama SÓLO el cron
 * (`/api/cron/arca-outbox`); `procesarEnviosDelNegocio(tenantId)` procesa los de un negocio y
 * la llaman las acciones del panel y la facturación (ENG-012). Cada envío se toma con reserva,
 * de a uno por negocio (`arca-reserva.ts`, ENG-019).
 */

import { Prisma } from "@/generated/prisma/client";
import { operatorPrisma } from "@/lib/operator-db";
import { tenantTransaction } from "@/lib/rls";
import { cuitValido, normalizarCuit } from "@/lib/cuit";
import {
  cerrarEnvioDeFacturaNoPendiente,
  markInvoiceRejected,
  numeroUsadoPorOtraFactura,
  registerFiscalDocument,
  type InvoiceCreatedPayload,
} from "@/lib/invoice-core";
import {
  procesarInvoiceCreated,
  ArcaPasajeroError,
  ArcaRechazoError,
  ComprobanteInvalidoError,
  crearAfipClient,
  modoDesdeEnv,
  CondicionIva,
  type AfipClient,
  type EmisorConfig,
  type CredencialEmisor,
  type HandlerDeps,
  type InvoiceCreatedEvent,
  type TicketAcceso,
} from "@/plugins/arca";
import { credencialParaTenant } from "@/lib/fiscal/tenant-cert";
import { leerTicketAcceso, guardarTicketAcceso } from "@/lib/fiscal/arca-ta-store";
import { logger } from "@/lib/logger";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import {
  anotarFallaYSoltar,
  anotarIntentoConReserva,
  CorridaDeEnvios,
  soltarReserva,
  tomarSiguienteEnvio,
  verificarAccesoDelOperador,
  type EnTransaccion,
  type EnvioTomado,
} from "@/lib/arca-reserva";

/**
 * Config fiscal no sensible del tenant (lo que la DB SÍ guarda). El cert/clave
 * NO están acá: los resuelve la factory desde env/secret (ADR-022 §5).
 */
export interface ConfigFiscalTenant {
  cuit: number;
  homologacion: boolean;
}

/** Lee la config fiscal de un tenant. Seam inyectable (default: Prisma). */
export type LeerConfigFiscal = (
  tenantId: string,
) => Promise<ConfigFiscalTenant | null>;

/**
 * Lector real: toma la metadata fiscal del `Tenant` (ADR-022 §5, opción B).
 * `tenantId` EXPLÍCITO vía `tenantTransaction`, no ambiental: lo llama el
 * worker (`processArcaOutbox`), sin request/host — con RLS_ENFORCEMENT on,
 * `getCurrentTenantId()` ambiental rompería con >1 tenant. `Tenant` no tiene
 * policy propia (excluida de RLS, ADR-018), pero la resolución del tenant
 * pasa igual por acá, así que se le da el contexto explícito de todas formas.
 */
const leerConfigFiscalPrisma: LeerConfigFiscal = async (tenantId) => {
  const t = await tenantTransaction(
    (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { arcaCuit: true, arcaHomologacion: true },
      }),
    { tenantId },
  );
  if (!t) return null;
  // `arcaCuit` es texto en DB (no entra en Int32) y puede venir con guiones: se
  // normaliza antes de pasarlo a número (`Number("20-11111111-2")` daba NaN).
  return {
    cuit: t.arcaCuit ? Number(normalizarCuit(t.arcaCuit)) : 0,
    homologacion: t.arcaHomologacion,
  };
};

/**
 * Construye el resolvedor `clientePara(tenantId)` a partir de un lector de
 * config y el entorno. Testeable offline sin DB (se le inyecta un lector fake).
 *
 * "Encender, no construir" (ADR-022): arma el `EmisorConfig` del tenant desde su
 * metadata y delega en `crearAfipClient`, que elige STUB vs SOAP real según
 * `ARCA_MODO`. Con `ARCA_MODO` sin setear (default), SIEMPRE devuelve el stub —
 * ARCA queda apagado aunque el enganche esté completo. Un tenant sin config
 * fiscal cargada cae a un stub `cuit:0` (inofensivo en modo stub).
 *
 * Pero SOLO en modo stub: apenas el modo habla con ARCA de verdad (real u
 * homologación), un tenant sin CUIT válido LANZA en vez de mandar `cuit:0`. Es
 * el mismo criterio que `getFiscalProfile` (src/lib/fiscal.ts) — no emitir es
 * reversible, emitir con un CUIT inventado no.
 */
export function crearClientePara(
  leer: LeerConfigFiscal = leerConfigFiscalPrisma,
  env: Record<string, string | undefined> = process.env,
  resolverCredencial: (tenantId: string) => Promise<CredencialEmisor> = credencialParaTenant,
  leerTicket: (tenantId: string) => Promise<TicketAcceso | undefined> = leerTicketAcceso,
  guardarTicket: (tenantId: string, ta: TicketAcceso) => Promise<void> = guardarTicketAcceso,
): (tenantId: string) => Promise<AfipClient> {
  return async (tenantId) => {
    const cfg = await leer(tenantId);
    if (modoDesdeEnv(env) !== "stub" && !cuitValido(cfg?.cuit ?? 0)) {
      throw new Error(
        `El tenant ${tenantId} no tiene un CUIT válido cargado (arcaCuit) y ARCA está en modo ` +
          `${modoDesdeEnv(env)}. No se despacha: un comprobante emitido con un CUIT inventado no se ` +
          `borra, se anula con nota de crédito. Cargá el CUIT del emisor — acción humana.`,
      );
    }
    const config: EmisorConfig = cfg ?? { cuit: 0, homologacion: true };
    const modo = modoDesdeEnv(env);

    // En stub NO se firma ni se autentica → no se toca la credencial ni el TA.
    if (modo !== "real" && modo !== "homologacion") {
      return crearAfipClient(config, { env });
    }

    // 🔒 ADR-066: la credencial se resuelve POR TENANT (cifrada en la DB), NUNCA de un env
    // compartido. Si el tenant no tiene credencial cargada, `credencialParaTenant` lanza →
    // fail-closed.
    const credencial = await resolverCredencial(tenantId);
    // Reutilización del TA (ADR-022 §6): si hay un TA vigente persistido, se lo damos al
    // cliente para que NO re-loguee (WSAA bloquea `alreadyAuthenticated` ~10-15 min). Cuando
    // el cliente acuña uno nuevo, `alRenovarTicket` lo persiste (cifrado) para la próxima
    // invocación — el seam que cierra el ciclo en serverless.
    const ticketInicial = await leerTicket(tenantId);
    return crearAfipClient(config, {
      env,
      credencial,
      ticketInicial,
      alRenovarTicket: (ta) => guardarTicket(tenantId, ta),
    });
  };
}

/**
 * Resuelve el cliente de ARCA de un tenant (su config fiscal). Default de
 * producción: lee del `Tenant` y respeta `ARCA_MODO` (stub mientras no se
 * encienda). El plugin es tenant-agnóstico: acá es donde entra el tenant.
 */
export const clientePara = crearClientePara();

/** Convierte el payload guardado (condicionIva como texto) al evento del plugin. */
function aEventoPlugin(p: InvoiceCreatedPayload): InvoiceCreatedEvent {
  return {
    invoiceId: p.invoiceId,
    tenantId: p.tenantId,
    concepto: p.concepto,
    fecha: p.fecha,
    emisor: {
      cuit: p.emisor.cuit,
      condicionIva: p.emisor.condicionIva as CondicionIva,
      puntoVenta: p.emisor.puntoVenta,
    },
    receptor: {
      docTipo: p.receptor.docTipo,
      docNro: p.receptor.docNro,
      condicionIva: p.receptor.condicionIva as CondicionIva,
    },
    neto: p.neto,
    iva: p.iva,
    total: p.total,
    ivaPorProducto: p.ivaPorProducto === true,
    servicioDesde: p.servicioDesde,
    servicioHasta: p.servicioHasta,
    vencimientoPago: p.vencimientoPago,
    intentoArca: p.intentoArca,
  };
}

/**
 * Lo que el despacho recibe de afuera. `anotarIntento` y `registrar` NO: los arma el despacho
 * atados al envío que procesa (anotar y registrar sólo escriben si ese envío sigue abierto).
 */
// El reloj (`fechaDeEnvio`) lo pone el despacho: el día del negocio en que se pide el CAE.
export type DepsDespacho = Omit<HandlerDeps, "anotarIntento" | "registrar" | "fechaDeEnvio">;

const DEPS_DESPACHO: DepsDespacho = {
  clientePara,
  numeroUsadoPorOtraFactura,
};

/**
 * El envío ya estaba cerrado, o su reserva pasó a otro despacho, cuando este quiso anotar el
 * número: no se pide el CAE.
 */
class EnvioCerradoError extends Error {
  constructor(eventoId: string) {
    super(`El envío ${eventoId} ya estaba cerrado o lo tomó otro despacho: no se le pide nada a ARCA.`);
    this.name = "EnvioCerradoError";
  }
}

/**
 * El motivo que queda en `lastError`: el mensaje y, si ARCA mandó códigos, los códigos. Un error
 * de la base queda sólo con su código (P2002…): el mensaje de Prisma trae la ruta del archivo,
 * la consulta y el código fuente, y eso no se guarda (estándar §4).
 */
export function motivoDelError(err: unknown): string {
  if (err instanceof ArcaPasajeroError && err.observaciones.length > 0) {
    return `${err.message} [${err.observaciones.map((o) => `${o.codigo}: ${o.mensaje}`).join("; ")}]`;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return `La base de datos no aceptó la operación (código ${err.code}).`;
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError || err instanceof Prisma.PrismaClientValidationError) {
    return "La base de datos no aceptó la operación.";
  }
  return err instanceof Error ? err.message : String(err);
}

export interface DispatchResumen {
  procesados: number;
  autorizados: number;
  rechazados: number;
  fallidos: number;
  /**
   * Envíos que este despacho NO cerró: otro despacho ya lo había hecho, la venta se volvió a
   * facturar, o su factura ya no estaba pendiente. Si alguno llegó a obtener un CAE, ese CAE no
   * se registró en ninguna factura: mayor a 0 es para mirar (ENG-019).
   */
  descartados: number;
}

/** La transacción de un negocio, con su contexto de RLS (escrituras del envío y toma por negocio). */
const enElNegocio =
  (tenantId: string): EnTransaccion =>
  (fn) =>
    tenantTransaction((tx) => fn(tx), { tenantId });

/** El cliente del operador (cruza negocios). Inyectable para los tests de ENG-027. */
export type ClienteOperador = Pick<typeof operatorPrisma, "$queryRaw" | "$transaction">;

/**
 * CRON · Barrido de TODOS los negocios (lo llama sólo `/api/cron/arca-outbox`). Usa la conexión
 * del operador, que tiene que ver los envíos de todos (ADR-021); si no los ve, lanza
 * `ProcesadorArcaSinAccesoError` antes de leer, en vez de devolver "0 procesados" (ENG-027).
 * Cada envío se toma con reserva (`arca-reserva.ts`, ENG-019) y se escribe en la transacción de
 * SU negocio (`tenantTransaction` con el `tenantId` de la fila, ADR-018 §4).
 */
export async function processArcaOutbox(
  limit = 20,
  deps: DepsDespacho = DEPS_DESPACHO,
  operador: ClienteOperador = operatorPrisma,
): Promise<DispatchResumen> {
  await verificarAccesoDelOperador(operador);
  return despacharEnvios((fn) => operador.$transaction((tx) => fn(tx)), null, limit, deps);
}

/**
 * ENG-012 · Los envíos pendientes de UN negocio (lo llaman las acciones del panel y la
 * facturación de ventas, turnos y pagos). Toma y escribe con la conexión de la app, dentro del
 * contexto de RLS de ese negocio y con el filtro explícito por negocio: nunca ve, toca ni cuenta
 * envíos de otro. No necesita la conexión del operador.
 */
export async function procesarEnviosDelNegocio(
  tenantId: string,
  limit = 20,
  deps: DepsDespacho = DEPS_DESPACHO,
): Promise<DispatchResumen> {
  return despacharEnvios(enElNegocio(tenantId), tenantId, limit, deps);
}

/**
 * Toma de a un envío (con reserva) y lo manda al plugin, hasta `limit` o hasta que no quede
 * ninguno que se pueda tomar ahora.
 * - Factura que ya no está PENDING → cierra el envío sin llamar a ARCA (descartado).
 * - Éxito → `registerFiscalDocument` registra el CAE y cierra el envío en una transacción.
 * - Rechazo de ARCA → `markInvoiceRejected` rechaza la factura y cierra el envío, también juntos.
 *   Si el envío ya estaba cerrado, ninguno de los dos escribe (descartado).
 * - Otro error → deja el evento pendiente, incrementa `attempts`, guarda el error y suelta la
 *   reserva.
 */
async function despacharEnvios(
  tomarEn: EnTransaccion,
  soloDelNegocio: string | null,
  limit: number,
  deps: DepsDespacho,
): Promise<DispatchResumen> {
  const resumen: DispatchResumen = {
    procesados: 0,
    autorizados: 0,
    rechazados: 0,
    fallidos: 0,
    descartados: 0,
  };
  const corrida = new CorridaDeEnvios();

  while (corrida.vistos.length < limit) {
    const envio = await tomarSiguienteEnvio(tomarEn, corrida, soloDelNegocio);
    if (!envio) break;
    try {
      await despacharUno(envio, corrida.token, deps, resumen);
    } catch (err) {
      // Algo falló al anotar la falla misma: se suelta la reserva (si se puede) y sigue el lote.
      await soltarReserva(enElNegocio(envio.tenantId), envio, corrida.token).catch(() => undefined);
      logger.error("arca", "no se pudo cerrar el intento de un envío", err, { tenantId: envio.tenantId });
      resumen.fallidos++;
    }
  }

  return resumen;
}

async function despacharUno(
  envio: EnvioTomado,
  token: string,
  deps: DepsDespacho,
  resumen: DispatchResumen,
): Promise<void> {
  const payload = envio.payload as InvoiceCreatedPayload;
  const enSuNegocio = enElNegocio(envio.tenantId);
  try {
    if (await cerrarEnvioDeFacturaNoPendiente(envio.id, payload.invoiceId, envio.tenantId)) {
      resumen.descartados++;
      return;
    }
    let registrado = false;
    await procesarInvoiceCreated(aEventoPlugin(payload), {
      ...deps,
      // El día del negocio en que se pide el CAE: la decisión controla contra él la ventana de ARCA.
      fechaDeEnvio: () => fechaFiscalDelDia(),
      anotarIntento: async (intento) => {
        if (!(await anotarIntentoConReserva(enSuNegocio, envio, token, intento))) {
          throw new EnvioCerradoError(envio.id);
        }
      },
      registrar: async (doc) => {
        registrado = await registerFiscalDocument(doc, envio.id);
      },
    });
    if (registrado) {
      resumen.autorizados++;
      resumen.procesados++;
    } else {
      resumen.descartados++;
    }
  } catch (err) {
    if (err instanceof EnvioCerradoError) {
      resumen.descartados++;
    } else if (err instanceof ArcaRechazoError || err instanceof ComprobanteInvalidoError) {
      // Rechazo del comprobante (ARCA lo evaluó y dijo que está mal, o no pasó la validación
      // local): la factura queda rechazada y el envío cerrado, en una sola transacción. La
      // venta se puede volver a facturar (`createInvoiceInTx` con `reabrirSiRechazada`).
      const motivo =
        err instanceof ArcaRechazoError
          ? err.observaciones.map((o) => `${o.codigo}: ${o.mensaje}`).join("; ")
          : err.errores.map((e) => `${e.campo}: ${e.mensaje}`).join("; ");
      try {
        if (await markInvoiceRejected(payload.invoiceId, envio.tenantId, motivo, envio.id)) {
          resumen.rechazados++;
          resumen.procesados++;
        } else {
          resumen.descartados++;
        }
      } catch (errAlRechazar) {
        // No se pudo guardar el rechazo: el envío sigue abierto y se reintenta; el resto del
        // lote sigue.
        await anotarFallaYSoltar(enSuNegocio, envio, token, motivoDelError(errAlRechazar));
        resumen.fallidos++;
      }
    } else {
      // Error pasajero (ENG-021: sin respuesta a tiempo, 5xx, token, WSAA caído, respuesta
      // cortada, 10016) o cualquier otro que no sea un rechazo: la factura sigue pendiente y
      // el evento se reintenta. El reintento consulta antes de pedir otro CAE (ENG-020).
      await anotarFallaYSoltar(enSuNegocio, envio, token, motivoDelError(err));
      resumen.fallidos++;
    }
  }
}
