/**
 * ADAPTER real: implementa AfipClient contra los web services de ARCA (ex-AFIP):
 * WSAA (autenticación) + WSFEv1 (facturación electrónica). Ver ADR-022 §6/§7.
 *
 * Diseño para testabilidad SIN red ni credenciales (el "día de las credenciales
 * es encender, no construir"):
 *  - Las funciones de armado/parseo de XML son PURAS y exportadas (sin I/O), así
 *    se testean con fixtures de XML representativos de ARCA.
 *  - El transporte HTTP vive detrás del puerto `SoapTransport` (inyectable):
 *    en producción hace `fetch` POST; en tests se mockea.
 *  - La firma CMS/PKCS#7 del TRA (requiere certificado X.509 — riesgo técnico #1
 *    de ADR-022 §6) vive detrás del puerto `TraSigner` (inyectable). El default
 *    lanza "credencial requerida (acción humana)": enchufar el cert es trivial y
 *    NO hay secretos en el repo.
 *
 * NOTA: este adapter NO calcula IVA (ADR-006) — solo mapea los montos que el
 * Core ya calculó al payload de WSFEv1.
 */

import {
  CondicionIvaReceptorId,
  Concepto,
  MONEDA_PESOS,
  TipoComprobante,
  informaIvaWsfe,
} from '../domain/catalogos';
import { ComprobanteArca } from '../domain/comprobante';
import {
  AfipClient,
  ArcaRechazoError,
  EmisorConfig,
  ObservacionArca,
  ResultadoCae,
} from './port';

// ────────────────────────────────────────────────────────────────────────────
// Puertos inyectables (seams para testear sin red ni certificado)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Transporte SOAP. En producción: `fetch` POST con `SOAPAction`. En tests: mock.
 * Devuelve el cuerpo de la respuesta como string (XML crudo).
 */
export interface SoapTransport {
  post(url: string, soapAction: string, body: string): Promise<string>;
}

/**
 * Firma el TRA (LoginTicketRequest) y devuelve el CMS/PKCS#7 en base64, que es
 * lo que WSAA espera en `<in0>`. Requiere el certificado X.509 + su clave
 * privada del emisor (por tenant) — dato sensible, NUNCA en el repo.
 */
export interface TraSigner {
  /** @param traXml el LoginTicketRequest ya armado (XML). */
  firmarCms(traXml: string): Promise<string>;
}

/**
 * Ticket de acceso vigente (resultado de WSAA). Se cachea hasta `expiration`.
 */
export interface TicketAcceso {
  token: string;
  sign: string;
  /** Vencimiento del TA, ISO-8601 (tal como lo devuelve WSAA). */
  expiration: string;
}

/**
 * Signer por defecto: NO firma. Lanza indicando que falta una acción humana
 * (proveer certificado + clave). Sustituilo por una implementación real
 * (p.ej. con node:crypto / un CMS de PKCS#7) el día que haya credenciales.
 */
export class CredencialRequeridaSigner implements TraSigner {
  async firmarCms(_traXml: string): Promise<string> {
    throw new Error(
      'ARCA: firma CMS del TRA no disponible — credencial requerida (acción ' +
        'humana). Inyectá un TraSigner con el certificado X.509 + clave privada ' +
        'del emisor (por tenant). Ver ADR-022 §6.',
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Endpoints WSAA / WSFEv1 (homologación vs producción)
// ────────────────────────────────────────────────────────────────────────────

/** URLs de los WS según entorno (elegido por `EmisorConfig.homologacion`). */
export interface EndpointsArca {
  wsaa: string;
  wsfev1: string;
}

export const ENDPOINTS_HOMOLOGACION: EndpointsArca = {
  wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  wsfev1: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
};

export const ENDPOINTS_PRODUCCION: EndpointsArca = {
  wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
  wsfev1: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
};

export function endpointsPara(config: EmisorConfig): EndpointsArca {
  return config.homologacion ? ENDPOINTS_HOMOLOGACION : ENDPOINTS_PRODUCCION;
}

const WSFE_NS = 'http://ar.gov.afip.dif.FEV1/';

// ────────────────────────────────────────────────────────────────────────────
// Utilidades XML puras (mínimas, sin dependencias)
// ────────────────────────────────────────────────────────────────────────────

/** Escapa un valor para insertarlo como texto de un nodo XML. */
export function escaparXml(v: string | number): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Extrae el texto del PRIMER elemento con nombre local `tag` (ignora namespace
 * prefix). Devuelve `undefined` si no aparece. Parser mínimo suficiente para las
 * respuestas concretas de WSAA/WSFEv1 (no es un parser XML general).
 */
export function extraerTag(xml: string, tag: string): string | undefined {
  // Permite prefijo de namespace opcional (`ns:tag`) y atributos en la apertura.
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`,
    'i',
  );
  const m = re.exec(xml);
  return m ? m[1] : undefined;
}

/** Como `extraerTag` pero devuelve TODAS las ocurrencias (para listas). */
export function extraerTags(xml: string, tag: string): string[] {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`,
    'gi',
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/** Deshace las entidades XML básicas (inverso de `escaparXml`). */
export function desescaparXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// ────────────────────────────────────────────────────────────────────────────
// WSAA — armado del TRA y parseo del LoginTicketResponse (PURO)
// ────────────────────────────────────────────────────────────────────────────

/** Formatea una fecha a ISO-8601 sin milisegundos (formato que ARCA espera). */
function isoSinMs(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Arma el `LoginTicketRequest` (TRA) XML para WSAA. `uniqueId` debe ser único y
 * creciente entre pedidos (se usa el epoch en segundos por defecto).
 * @param service servicio destino (para WSFEv1 es `wsfe`).
 */
export function armarLoginTicketRequest(
  service = 'wsfe',
  ahora: Date = new Date(),
  ventanaMs = 10 * 60 * 1000, // ±10 min: gen. en el pasado, exp. en el futuro
): string {
  const uniqueId = Math.floor(ahora.getTime() / 1000);
  const generationTime = isoSinMs(new Date(ahora.getTime() - ventanaMs));
  const expirationTime = isoSinMs(new Date(ahora.getTime() + ventanaMs));
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<loginTicketRequest version="1.0">` +
    `<header>` +
    `<uniqueId>${uniqueId}</uniqueId>` +
    `<generationTime>${generationTime}</generationTime>` +
    `<expirationTime>${expirationTime}</expirationTime>` +
    `</header>` +
    `<service>${escaparXml(service)}</service>` +
    `</loginTicketRequest>`
  );
}

/**
 * Parsea el `LoginTicketResponse` que devuelve WSAA → `{ token, sign, expiration }`.
 * WSAA devuelve el ticket dentro del SOAP body como XML escapado (entidades),
 * así que primero se desescapa el contenido de `<loginCmsReturn>` si existe.
 */
export function parsearLoginTicketResponse(xml: string): TicketAcceso {
  // WSAA envuelve el ticket en `<loginCmsReturn>` con el XML escapado.
  const envuelto = extraerTag(xml, 'loginCmsReturn');
  const ticket = envuelto ? desescaparXml(envuelto) : xml;

  const token = extraerTag(ticket, 'token');
  const sign = extraerTag(ticket, 'sign');
  const expiration = extraerTag(ticket, 'expirationTime');

  if (!token || !sign || !expiration) {
    throw new Error(
      'WSAA: LoginTicketResponse inválido (falta token/sign/expirationTime).',
    );
  }
  return { token, sign, expiration };
}

/** ¿El ticket sigue vigente respecto de `ahora` (con margen de seguridad)? */
export function ticketVigente(
  ta: TicketAcceso,
  ahora: Date = new Date(),
  margenMs = 60 * 1000,
): boolean {
  const exp = Date.parse(ta.expiration);
  if (Number.isNaN(exp)) return false;
  return exp - margenMs > ahora.getTime();
}

/** Envuelve el CMS firmado en el sobre SOAP de `loginCms` (WSAA). */
export function armarSobreLoginCms(cmsBase64: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
    `<soapenv:Body>` +
    `<wsaa:loginCms>` +
    `<wsaa:in0>${escaparXml(cmsBase64)}</wsaa:in0>` +
    `</wsaa:loginCms>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

// ────────────────────────────────────────────────────────────────────────────
// WSFEv1 — FECompUltimoAutorizado (PURO)
// ────────────────────────────────────────────────────────────────────────────

/** Bloque `<ar:Auth>` compartido por todas las operaciones de WSFEv1. */
function bloqueAuth(ta: TicketAcceso, cuit: number): string {
  return (
    `<ar:Auth>` +
    `<ar:Token>${escaparXml(ta.token)}</ar:Token>` +
    `<ar:Sign>${escaparXml(ta.sign)}</ar:Sign>` +
    `<ar:Cuit>${cuit}</ar:Cuit>` +
    `</ar:Auth>`
  );
}

function sobreWsfe(cuerpo: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:ar="${WSFE_NS}">` +
    `<soapenv:Body>${cuerpo}</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

/** Arma el request de `FECompUltimoAutorizado` (CbteTipo, PtoVta). */
export function armarUltimoAutorizadoRequest(
  ta: TicketAcceso,
  cuit: number,
  puntoVenta: number,
  tipo: TipoComprobante,
): string {
  return sobreWsfe(
    `<ar:FECompUltimoAutorizado>` +
      bloqueAuth(ta, cuit) +
      `<ar:PtoVta>${puntoVenta}</ar:PtoVta>` +
      `<ar:CbteTipo>${tipo}</ar:CbteTipo>` +
      `</ar:FECompUltimoAutorizado>`,
  );
}

/**
 * Parsea la respuesta de `FECompUltimoAutorizado` → número.
 * Si viene `<Errors>`, lanza `ArcaRechazoError`.
 */
export function parsearUltimoAutorizadoResponse(xml: string): number {
  lanzarSiErrores(xml);
  const cbteNro = extraerTag(xml, 'CbteNro');
  if (cbteNro === undefined) {
    throw new Error(
      'WSFEv1: respuesta de FECompUltimoAutorizado sin CbteNro.',
    );
  }
  const n = Number(cbteNro);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`WSFEv1: CbteNro inválido en la respuesta: "${cbteNro}".`);
  }
  return n;
}

// ────────────────────────────────────────────────────────────────────────────
// WSFEv1 — FECAESolicitar (PURO)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Arma el request de `FECAESolicitar` desde un `ComprobanteArca` con el número
 * ya resuelto. Mapea los montos que el Core calculó al payload de WSFEv1.
 * IMPORTANTE: `numero` debe venir resuelto (el caller usa ultimoAutorizado + 1).
 */
export function armarFECAESolicitarRequest(
  ta: TicketAcceso,
  cuit: number,
  comp: ComprobanteArca,
  numero: number,
): string {
  const importeIva = comp.iva.reduce((s, x) => s + x.importe, 0);
  const informaIva = informaIvaWsfe(comp.tipo);

  // Comprobantes que informan IVA (tipo A y B, emisor Responsable Inscripto)
  // mandan ImpNeto + ImpIVA y el array <Iva>. Los que no (C) mandan el importe
  // en ImpNeto sin <Iva>. (Antes esto miraba `discriminaIva` = solo A, y dejaba
  // la Factura B sin <Iva> con ImpIVA=0 → ImpTotal ≠ ImpNeto → rechazo de ARCA.)
  const impNeto = comp.neto;
  const impIva = informaIva ? importeIva : 0;
  const impTotal = comp.total;

  const detalleIva = informaIva
    ? `<ar:Iva>` +
      comp.iva
        .map(
          (sub) =>
            `<ar:AlicIva>` +
            `<ar:Id>${sub.id}</ar:Id>` +
            `<ar:BaseImp>${fmt(sub.baseImponible)}</ar:BaseImp>` +
            `<ar:Importe>${fmt(sub.importe)}</ar:Importe>` +
            `</ar:AlicIva>`,
        )
        .join('') +
      `</ar:Iva>`
    : '';

  const fechasServicio =
    comp.concepto === Concepto.Servicios ||
    comp.concepto === Concepto.ProductosYServicios
      ? `<ar:FchServDesde>${escaparXml(comp.servicioDesde ?? comp.fecha)}</ar:FchServDesde>` +
        `<ar:FchServHasta>${escaparXml(comp.servicioHasta ?? comp.fecha)}</ar:FchServHasta>` +
        `<ar:FchVtoPago>${escaparXml(comp.vencimientoPago ?? comp.fecha)}</ar:FchVtoPago>`
      : '';

  const detalle =
    `<ar:FECAEDetRequest>` +
    `<ar:Concepto>${comp.concepto}</ar:Concepto>` +
    `<ar:DocTipo>${comp.docTipo}</ar:DocTipo>` +
    `<ar:DocNro>${comp.docNro}</ar:DocNro>` +
    `<ar:CbteDesde>${numero}</ar:CbteDesde>` +
    `<ar:CbteHasta>${numero}</ar:CbteHasta>` +
    `<ar:CbteFch>${escaparXml(comp.fecha)}</ar:CbteFch>` +
    `<ar:ImpTotal>${fmt(impTotal)}</ar:ImpTotal>` +
    `<ar:ImpTotConc>0</ar:ImpTotConc>` +
    `<ar:ImpNeto>${fmt(impNeto)}</ar:ImpNeto>` +
    `<ar:ImpOpEx>0</ar:ImpOpEx>` +
    `<ar:ImpIVA>${fmt(impIva)}</ar:ImpIVA>` +
    `<ar:ImpTrib>0</ar:ImpTrib>` +
    fechasServicio +
    `<ar:MonId>${MONEDA_PESOS}</ar:MonId>` +
    `<ar:MonCotiz>1</ar:MonCotiz>` +
    `<ar:CondicionIVAReceptorId>${condicionIvaReceptor(comp)}</ar:CondicionIVAReceptorId>` +
    detalleIva +
    `</ar:FECAEDetRequest>`;

  return sobreWsfe(
    `<ar:FECAESolicitar>` +
      bloqueAuth(ta, cuit) +
      `<ar:FeCAEReq>` +
      `<ar:FeCabReq>` +
      `<ar:CantReg>1</ar:CantReg>` +
      `<ar:PtoVta>${comp.puntoVenta}</ar:PtoVta>` +
      `<ar:CbteTipo>${comp.tipo}</ar:CbteTipo>` +
      `</ar:FeCabReq>` +
      `<ar:FeDetReq>${detalle}</ar:FeDetReq>` +
      `</ar:FeCAEReq>` +
      `</ar:FECAESolicitar>`,
  );
}

/** Formatea un monto a 2 decimales (formato de WSFEv1). */
function fmt(n: number): string {
  return n.toFixed(2);
}

/**
 * Resuelve el `CondicionIVAReceptorId` (obligatorio, RG 5616). Usa el del
 * comprobante si vino resuelto (lo setea `construirComprobante` desde la
 * condición real del receptor); si no, cae a Consumidor Final — el default
 * seguro para el comprobante a consumidor final sin identificar.
 */
function condicionIvaReceptor(comp: ComprobanteArca): CondicionIvaReceptorId {
  return comp.condicionIvaReceptorId ?? CondicionIvaReceptorId.ConsumidorFinal;
}

/**
 * Parsea la respuesta de `FECAESolicitar`:
 *  - OK  → `ResultadoCae` (CAE + vencimiento + numeración).
 *  - Rechazo → lanza `ArcaRechazoError` con las `Observaciones`/`Errores`
 *    mapeadas a `ObservacionArca[]`.
 *
 * @param comp     el comprobante que se envió (para completar tipo/PtoVta).
 * @param numero   el número que se envió (fallback si la respuesta no lo trae).
 */
export function parsearFECAESolicitarResponse(
  xml: string,
  comp: ComprobanteArca,
  numero: number,
): ResultadoCae {
  // 1) Errores de nivel método (Auth, formato) → rechazo.
  lanzarSiErrores(xml);

  // 2) Resultado de cabecera: 'A' aprobado, 'R' rechazado, 'P' parcial.
  const resultado = extraerTag(xml, 'Resultado');

  // 3) Observaciones a nivel detalle (motivos del rechazo/aprobación parcial).
  const observaciones = parsearObservaciones(xml);

  if (resultado === 'R' || resultado === 'P') {
    throw new ArcaRechazoError(
      `ARCA rechazó el comprobante (Resultado=${resultado}).`,
      observaciones.length > 0
        ? observaciones
        : [{ codigo: 0, mensaje: 'Rechazado sin observaciones detalladas.' }],
    );
  }

  const cae = extraerTag(xml, 'CAE');
  const caeVencimiento = extraerTag(xml, 'CAEFchVto');
  if (!cae || !caeVencimiento) {
    throw new ArcaRechazoError(
      'ARCA no devolvió CAE (respuesta sin CAE/CAEFchVto).',
      observaciones,
    );
  }

  // El número autorizado, si viene en el detalle; si no, el que se envió.
  const cbteDesde = extraerTag(xml, 'CbteDesde');
  const numeroAutorizado =
    cbteDesde !== undefined ? Number(cbteDesde) : numero;

  return {
    cae,
    caeVencimiento,
    numero: Number.isInteger(numeroAutorizado) ? numeroAutorizado : numero,
    puntoVenta: comp.puntoVenta,
    tipo: comp.tipo,
  };
}

/**
 * Extrae las `<Obs>` (observaciones a nivel detalle) → `ObservacionArca[]`.
 * Cada `<Obs>` trae `<Code>` + `<Msg>`.
 */
export function parsearObservaciones(xml: string): ObservacionArca[] {
  const obs = extraerTags(xml, 'Obs');
  return obs.map((bloque) => ({
    codigo: Number(extraerTag(bloque, 'Code') ?? 0),
    mensaje: (extraerTag(bloque, 'Msg') ?? '').trim(),
  }));
}

/**
 * Si la respuesta trae `<Errors>` a nivel método (Auth inválida, formato, etc.)
 * lanza `ArcaRechazoError` mapeando cada `<Err>` (`<Code>`+`<Msg>`).
 */
export function lanzarSiErrores(xml: string): void {
  const bloqueErrors = extraerTag(xml, 'Errors');
  if (!bloqueErrors) return;
  const errs = extraerTags(bloqueErrors, 'Err');
  if (errs.length === 0) return;
  const observaciones: ObservacionArca[] = errs.map((e) => ({
    codigo: Number(extraerTag(e, 'Code') ?? 0),
    mensaje: (extraerTag(e, 'Msg') ?? '').trim(),
  }));
  throw new ArcaRechazoError('ARCA devolvió errores.', observaciones);
}

// ────────────────────────────────────────────────────────────────────────────
// Transporte por defecto (fetch) — usado en producción, mockeable en tests
// ────────────────────────────────────────────────────────────────────────────

/** Transporte real: POST SOAP 1.1 con `SOAPAction`. */
export class FetchSoapTransport implements SoapTransport {
  async post(url: string, soapAction: string, body: string): Promise<string> {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: soapAction,
      },
      body,
    });
    const texto = await res.text();
    if (!res.ok) {
      throw new Error(
        `ARCA: transporte SOAP falló (HTTP ${res.status}). Cuerpo: ${texto.slice(0, 500)}`,
      );
    }
    return texto;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Cliente
// ────────────────────────────────────────────────────────────────────────────

/** Dependencias inyectables del cliente (todas con default de producción). */
export interface SoapAfipClientDeps {
  transport?: SoapTransport;
  signer?: TraSigner;
  /** Reloj inyectable (para tests de expiración). */
  ahora?: () => Date;
  /**
   * TA previamente obtenido y persistido (p.ej. cacheado por tenant en la DB).
   * Si sigue vigente, el cliente lo reusa en vez de re-loguear contra WSAA
   * (WSAA rechaza un segundo login mientras haya un TA válido:
   * `coe.alreadyAuthenticated`). Clave para procesos efímeros/serverless.
   */
  ticketInicial?: TicketAcceso;
  /**
   * Callback que se dispara cuando el cliente OBTIENE un TA nuevo de WSAA (no
   * cuando reusa el `ticketInicial` vigente). Es el seam para PERSISTIR el TA
   * (cifrado, por tenant) apenas se acuña, así la próxima invocación —incluso en
   * otro proceso serverless— lo reusa en vez de re-loguear (evita el bloqueo
   * `alreadyAuthenticated` de ~10-15 min). No debe lanzar: un fallo al persistir
   * no puede tumbar la emisión (se ignora; a lo sumo se re-loguea la próxima).
   */
  alRenovarTicket?: (ta: TicketAcceso) => void | Promise<void>;
}

/**
 * Adapter real de ARCA. Implementa `AfipClient` sobre WSAA + WSFEv1.
 *
 * Sin credenciales, el `signer` por defecto (`CredencialRequeridaSigner`) hace
 * que cualquier operación que necesite autenticar falle con un mensaje claro de
 * "acción humana requerida". Con un `TraSigner` real + `EmisorConfig`, funciona.
 */
export class SoapAfipClient implements AfipClient {
  private readonly transport: SoapTransport;
  private readonly signer: TraSigner;
  private readonly ahora: () => Date;
  private readonly alRenovarTicket?: (ta: TicketAcceso) => void | Promise<void>;
  private ticket?: TicketAcceso;

  constructor(
    private readonly config: EmisorConfig,
    deps: SoapAfipClientDeps = {},
  ) {
    this.transport = deps.transport ?? new FetchSoapTransport();
    this.signer = deps.signer ?? new CredencialRequeridaSigner();
    this.ahora = deps.ahora ?? (() => new Date());
    this.alRenovarTicket = deps.alRenovarTicket;
    this.ticket = deps.ticketInicial;
  }

  private get endpoints(): EndpointsArca {
    return endpointsPara(this.config);
  }

  /** TA vigente en caché (para persistirlo y reusarlo entre procesos). */
  get ticketActual(): TicketAcceso | undefined {
    return this.ticket;
  }

  /**
   * Devuelve un TA vigente, reautenticando contra WSAA solo si hace falta
   * (cachea el ticket hasta su `expiration`, ADR-022 §6).
   */
  private async autenticar(): Promise<TicketAcceso> {
    if (this.ticket && ticketVigente(this.ticket, this.ahora())) {
      return this.ticket;
    }
    const tra = armarLoginTicketRequest('wsfe', this.ahora());
    const cms = await this.signer.firmarCms(tra); // ← seam del certificado
    const sobre = armarSobreLoginCms(cms);
    const respuesta = await this.transport.post(this.endpoints.wsaa, '', sobre);
    this.ticket = parsearLoginTicketResponse(respuesta);
    // Persistir el TA recién acuñado (seam de caché por tenant). Best-effort: si
    // falla, no debe tumbar la emisión — a lo sumo la próxima invocación re-loguea.
    if (this.alRenovarTicket) {
      try {
        await this.alRenovarTicket(this.ticket);
      } catch {
        // Ignorado a propósito: persistir el TA es una optimización, no un requisito.
      }
    }
    return this.ticket;
  }

  async ultimoAutorizado(
    puntoVenta: number,
    tipo: TipoComprobante,
  ): Promise<number> {
    const ta = await this.autenticar();
    const body = armarUltimoAutorizadoRequest(
      ta,
      this.config.cuit,
      puntoVenta,
      tipo,
    );
    const respuesta = await this.transport.post(
      this.endpoints.wsfev1,
      `${WSFE_NS}FECompUltimoAutorizado`,
      body,
    );
    return parsearUltimoAutorizadoResponse(respuesta);
  }

  async solicitarCae(comp: ComprobanteArca): Promise<ResultadoCae> {
    const ta = await this.autenticar();

    // Numeración: la verdad la tiene ARCA (ADR-022 §6). Si el comprobante no
    // trae número, se resuelve con ultimoAutorizado + 1.
    const numero =
      comp.numero ??
      (await this.ultimoAutorizado(comp.puntoVenta, comp.tipo)) + 1;

    const body = armarFECAESolicitarRequest(
      ta,
      this.config.cuit,
      comp,
      numero,
    );
    const respuesta = await this.transport.post(
      this.endpoints.wsfev1,
      `${WSFE_NS}FECAESolicitar`,
      body,
    );
    return parsearFECAESolicitarResponse(respuesta, comp, numero);
  }
}
