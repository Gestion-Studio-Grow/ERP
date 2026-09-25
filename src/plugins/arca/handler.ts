/**
 * Orquestación del plugin ARCA: el flujo de punta a punta de una autorización.
 *
 *   InvoiceCreated (Core, superficie III)
 *     → decidir el comprobante (decisión fiscal única: tipo, condición, fechas)
 *     → validar local (fallar barato, no contra ARCA)
 *     → solicitar CAE (AfipClient: WSAA + WSFEv1)
 *     → RegisterFiscalDocument (Core, superficie II)
 *
 * El plugin no toca la DB ni el Core directo: recibe un evento y llama un
 * comando, ambos por el contrato de `core-contract.ts` (ADR-002/020/022).
 */

import { AfipClient, ArcaPasajeroError, ArcaRechazoError, ComprobanteConsultado, ResultadoCae } from './afip/port';
import {
  IntentoArca,
  InvoiceCreatedEvent,
  NumeroUsadoPorOtraFactura,
  RegisterFiscalDocument,
} from './core-contract';
import {
  ComprobanteArca,
  ComprobanteSinDecisionError,
  comprobanteDeLaDecision,
  construirComprobante,
  decidirDelEvento,
  ivaInformadoAArca,
} from './domain/comprobante';
import { centavosDe } from '@/lib/dinero/redondeo';
import { validarComprobante } from './domain/validacion';
import { ivaSinAlicuotaPorProducto } from './domain/iva-por-producto';

export interface HandlerDeps {
  /**
   * Resuelve el cliente de ARCA del tenant (sus credenciales/CUIT). En dev/test
   * devuelve un `StubAfipClient`; en producción, el adapter real con el
   * certificado del tenant. El plugin es tenant-agnóstico: pide, no resuelve.
   */
  clientePara: (tenantId: string) => AfipClient | Promise<AfipClient>;
  /** Comando público del Core que registra el CAE (superficie II). */
  registrar: RegisterFiscalDocument;
  /**
   * ENG-020 · Guarda, ANTES de pedir el CAE, qué número se le va a pedir a ARCA para este
   * evento. Si falla, no se pide nada. Es lo que permite, si la respuesta se pierde, reconocer
   * en el reintento el comprobante que ARCA ya autorizó en vez de pedir otro.
   */
  anotarIntento: (intento: IntentoArca) => Promise<void>;
  /**
   * El día en que se pide el CAE (AAAAMMDD, día del negocio). Con él la decisión controla la
   * ventana de fechas que acepta ARCA. Lo da el Core (`fechaFiscalDelDia`): el plugin no mira
   * el reloj.
   */
  fechaDeEnvio: () => string;
  /**
   * ENG-020 · Consulta del Core: ¿ese número ya está registrado en otra factura del negocio?
   * Si sí, no se adopta aunque los datos coincidan (ver `autorizarSinDuplicar`).
   */
  numeroUsadoPorOtraFactura: NumeroUsadoPorOtraFactura;
}

/** Lo que `autorizarSinDuplicar` necesita del envío: anotar el número y saber si ya es de otra factura. */
export interface RegistroDeIntentos {
  anotar: (intento: IntentoArca) => Promise<void>;
  usadoPorOtraFactura: (intento: IntentoArca) => Promise<boolean>;
}

/** Error de validación previa (antes de pegarle a ARCA). */
export class ComprobanteInvalidoError extends Error {
  constructor(
    message: string,
    readonly errores: { campo: string; mensaje: string }[],
  ) {
    super(message);
    this.name = 'ComprobanteInvalidoError';
  }
}

/**
 * El comprobante que se emite sin que nadie mire: sólo si la decisión fiscal quedó "lista". Si
 * no, `ComprobanteInvalidoError` con los motivos de la decisión en castellano (qué falta y cómo
 * seguir): el Core lo guarda como motivo del rechazo y no se le pide nada a ARCA.
 */
function comprobanteParaEmitir(ev: InvoiceCreatedEvent, fechaDeEnvio: string): ComprobanteArca {
  try {
    return construirComprobante(ev, fechaDeEnvio);
  } catch (e) {
    if (!(e instanceof ComprobanteSinDecisionError)) throw e;
    throw new ComprobanteInvalidoError(
      `La factura ${ev.invoiceId} no se envía a ARCA: ${e.message}`,
      e.motivos
        .filter((m) => m.gravedad !== 'aviso')
        .map((m) => ({ campo: m.campo ?? m.codigo, mensaje: m.mensaje })),
    );
  }
}

/**
 * Procesa un evento `InvoiceCreated`: autoriza el comprobante en ARCA y devuelve
 * el CAE al Core. Devuelve el resultado para trazabilidad/logging del worker.
 */
export async function procesarInvoiceCreated(
  ev: InvoiceCreatedEvent,
  deps: HandlerDeps,
): Promise<ResultadoCae> {
  const fechaDeEnvio = deps.fechaDeEnvio();
  const registro: RegistroDeIntentos = {
    anotar: deps.anotarIntento,
    usadoPorOtraFactura: (intento) =>
      deps.numeroUsadoPorOtraFactura({ ...intento, tenantId: ev.tenantId, invoiceId: ev.invoiceId }),
  };

  // Con un número anotado, PRIMERO se mira si ARCA ya lo autorizó para este comprobante: si sí,
  // existe en ARCA y se registra aunque la validación local de hoy lo objete (validar antes lo
  // daba por rechazado con CAE en ARCA, y al volver a facturarlo salía un segundo CAE). Para
  // reconocerlo se usa el comprobante tal como se decidió el día de su fecha (la ventana contra
  // hoy no importa para adoptar uno ya autorizado). Sin número anotado se decide y valida
  // primero: se falla barato, sin pedirle nada a ARCA.
  let cliente: AfipClient | undefined;
  let resultado: ResultadoCae | null = null;
  let ultimoConocido: UltimoAutorizado | undefined;
  if (ev.intentoArca) {
    const comoSeDecidio = decidirDelEvento(ev, ev.fecha).comprobante;
    if (comoSeDecidio) {
      cliente = await deps.clientePara(ev.tenantId);
      const revision = await revisarIntento(
        cliente,
        comprobanteDeLaDecision(ev, comoSeDecidio),
        ev.intentoArca,
        registro,
      );
      resultado = revision.adoptado;
      ultimoConocido = revision.ultimoAutorizado;
    }
  }
  if (!resultado) {
    // ENG-024: un inscripto no emite con el IVA como tasa pareja sobre el total.
    const sinAlicuota = ivaSinAlicuotaPorProducto(ev);
    if (sinAlicuota) {
      throw new ComprobanteInvalidoError(
        `La factura ${ev.invoiceId} no se envía a ARCA: ${sinAlicuota.mensaje}`,
        [sinAlicuota],
      );
    }
    const comp = comprobanteParaEmitir(ev, fechaDeEnvio);
    const validacion = validarComprobante(comp);
    if (!validacion.ok) {
      throw new ComprobanteInvalidoError(
        `Comprobante de la factura ${ev.invoiceId} inválido; no se envía a ARCA.`,
        validacion.errores,
      );
    }
    cliente ??= await deps.clientePara(ev.tenantId);
    resultado = await pedirNumeroNuevo(cliente, comp, registro, ultimoConocido);
  }

  await deps.registrar({
    invoiceId: ev.invoiceId,
    tenantId: ev.tenantId,
    cae: resultado.cae,
    caeVencimiento: resultado.caeVencimiento,
    numero: resultado.numero,
    puntoVenta: resultado.puntoVenta,
    tipoComprobante: resultado.tipo,
  });

  return resultado;
}

/**
 * ENG-020 · ¿Es este comprobante autorizado el que se quiso emitir? Se compara todo lo que viaja
 * a ARCA y ARCA devuelve: punto de venta, tipo, fecha, documento, concepto, y total, neto e IVA
 * al centavo. Si algo no coincide, ese número lo usó otro comprobante y NO se adopta. Que
 * coincida NO alcanza por sí solo: dos ventas iguales dan iguales (ver `revisarIntento`).
 */
export function esElMismoComprobante(
  autorizado: ComprobanteConsultado,
  comp: ComprobanteArca,
): boolean {
  return (
    autorizado.puntoVenta === comp.puntoVenta &&
    autorizado.tipo === comp.tipo &&
    autorizado.fecha === comp.fecha &&
    autorizado.docTipo === comp.docTipo &&
    autorizado.docNro === comp.docNro &&
    autorizado.concepto === comp.concepto &&
    autorizado.totalCentavos === centavosDe(comp.total) &&
    autorizado.netoCentavos === centavosDe(comp.neto) &&
    autorizado.ivaCentavos === centavosDe(ivaInformadoAArca(comp))
  );
}

/** El último número que ARCA dio por autorizado para un punto de venta y tipo. */
interface UltimoAutorizado {
  puntoVenta: number;
  tipo: number;
  numero: number;
}

/**
 * Lo que se sabe del número anotado después de consultarlo: el comprobante adoptado, o `null`
 * (y, si ARCA dijo que no existe, el último autorizado que se miró para confirmarlo).
 */
interface RevisionDelIntento {
  adoptado: ResultadoCae | null;
  ultimoAutorizado?: UltimoAutorizado;
}

/**
 * ENG-020 · Revisa el número que anotó un envío anterior de este evento.
 *
 * Se consulta a ARCA ese número (`FECompConsultar`). Se adopta sólo si ARCA lo tiene
 * autorizado con estos mismos datos Y ninguna otra factura del negocio lo tiene registrado: dos
 * ventas iguales (mismo día, consumidor final, mismo total) coinciden en todo, y si la otra ya lo
 * registró, ese CAE es suyo. Si la consulta falla, lanza SIEMPRE pasajero: no se sabe si el
 * número se usó, así que ni se rechaza la factura ni se pide otro número.
 *
 * AUTORIZACIÓN TARDÍA: el corte propio es a los 15 s, pero ARCA puede seguir procesando el
 * pedido y confirmarlo después. Si la consulta dice "no existe" (602) pero el último autorizado
 * ya llegó a ese número, alguien lo usó en el medio, y puede ser nuestro pedido confirmado
 * tarde: lanza pasajero y NO se pide otro número. El reintento vuelve a consultar y ve el
 * comprobante con sus datos (se adopta si es éste; si es de otro, se pide el siguiente). Si el
 * último está por debajo, el pedido nunca se usó y se sigue con un número nuevo.
 */
async function revisarIntento(
  cliente: AfipClient,
  comp: ComprobanteArca,
  intento: IntentoArca,
  registro: RegistroDeIntentos,
): Promise<RevisionDelIntento> {
  let autorizado: ComprobanteConsultado | null;
  try {
    autorizado = await cliente.consultarComprobante(intento.puntoVenta, intento.tipo, intento.numero);
  } catch (e) {
    if (e instanceof ArcaRechazoError) {
      throw new ArcaPasajeroError(
        `No se pudo consultar en ARCA si el número ${intento.numero} ya se usó (se reintenta).`,
        e.observaciones,
        { cause: e },
      );
    }
    throw e;
  }
  if (!autorizado) {
    const ultimo = await cliente.ultimoAutorizado(intento.puntoVenta, intento.tipo);
    if (ultimo >= intento.numero) {
      throw new ArcaPasajeroError(
        `ARCA todavía no muestra el comprobante ${intento.numero}, pero ya autorizó hasta el ${ultimo}: ` +
          `puede ser el pedido anterior confirmado tarde. Se vuelve a consultar; no se pide otro número.`,
      );
    }
    return { adoptado: null, ultimoAutorizado: { puntoVenta: intento.puntoVenta, tipo: intento.tipo, numero: ultimo } };
  }
  if (!esElMismoComprobante(autorizado, comp)) return { adoptado: null };
  if (await registro.usadoPorOtraFactura(intento)) return { adoptado: null };
  return {
    adoptado: {
      cae: autorizado.cae,
      caeVencimiento: autorizado.caeVencimiento,
      numero: autorizado.numero,
      puntoVenta: autorizado.puntoVenta,
      tipo: comp.tipo,
    },
  };
}

/**
 * ENG-020 · Toma el próximo número (`FECompUltimoAutorizado` + 1), lo ANOTA y recién ahí pide el
 * CAE. Si la revisión del intento ya miró el último autorizado de este punto de venta y tipo, se
 * usa ése (sin una segunda llamada a ARCA).
 */
async function pedirNumeroNuevo(
  cliente: AfipClient,
  comp: ComprobanteArca,
  registro: RegistroDeIntentos,
  ultimoConocido?: UltimoAutorizado,
): Promise<ResultadoCae> {
  const ultimo =
    ultimoConocido && ultimoConocido.puntoVenta === comp.puntoVenta && ultimoConocido.tipo === comp.tipo
      ? ultimoConocido.numero
      : await cliente.ultimoAutorizado(comp.puntoVenta, comp.tipo);
  const numero = ultimo + 1;
  await registro.anotar({ puntoVenta: comp.puntoVenta, tipo: comp.tipo, numero });
  return cliente.solicitarCae({ ...comp, numero });
}

/**
 * ENG-020 · Pide el CAE sin emitir dos comprobantes para el mismo evento: si un envío anterior
 * anotó un número y ARCA ya lo autorizó para este comprobante (y no es de otra factura), lo
 * adopta; si no, pide el próximo número, anotándolo antes.
 */
export async function autorizarSinDuplicar(
  cliente: AfipClient,
  comp: ComprobanteArca,
  intentoPrevio: IntentoArca | undefined,
  registro: RegistroDeIntentos,
): Promise<ResultadoCae> {
  const revision: RevisionDelIntento = intentoPrevio
    ? await revisarIntento(cliente, comp, intentoPrevio, registro)
    : { adoptado: null };
  return revision.adoptado ?? pedirNumeroNuevo(cliente, comp, registro, revision.ultimoAutorizado);
}
