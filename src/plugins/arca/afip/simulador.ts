/**
 * SIMULADOR DE ARCA para tests (ENG-020 / ENG-021). NO se exporta desde el plugin: sólo lo
 * importan los tests. Jamás se usa en modo real: sus CAE empiezan con "SIM".
 *
 * Es un `fetch` que contesta como WSAA (`loginCms`) y WSFEv1 (`FECompUltimoAutorizado`,
 * `FECAESolicitar`, `FECompConsultar`). Se enchufa en el transporte REAL
 * (`new FetchSoapTransport({ fetch: sim.fetch })`), así que también se ejercitan el corte por
 * tiempo, los códigos HTTP y la lectura de la respuesta. Guarda estado como ARCA: el último
 * número por punto de venta y tipo, y cada comprobante autorizado con sus datos.
 *
 * Las respuestas están armadas desde el manual del desarrollador de WSFEv1 y de WSAA:
 * PROVISIONAL A CONFIRMAR hasta reemplazarlas por las grabadas en la prueba de homologación
 * del dueño (esta máquina no llega a *.afip.gov.ar).
 *
 * Fallas que se pueden pedir para el PRÓXIMO llamado a un método (`sim.fallarProximo`):
 *  - 'timeout-antes'    el pedido no llega: ARCA no hace nada y nunca contesta.
 *  - 'timeout-despues'  ARCA procesa (autoriza, si corresponde) y la respuesta se pierde.
 *  - 'respuesta-cortada' ARCA procesa y la respuesta llega partida al medio (HTTP 200).
 *  - 'autoriza-tarde'   (FECAESolicitar) el pedido llega, la respuesta se pierde y ARCA lo
 *                       autoriza RECIÉN DESPUÉS de contestar la próxima FECompConsultar: la
 *                       consulta ve "no existe" (602) y el último autorizado ya lo incluye.
 *  - 'caido'            el servicio no está: HTTP 503 con un SOAP Fault.
 *  - 'sin-red'          no hay conexión (el fetch falla, como un ECONNREFUSED).
 *  - { error, mensaje } WSFEv1 contesta `<Errors>` con ese código (p. ej. 600, 501).
 *  - { rechazo }        FECAESolicitar contesta Resultado=R con esas observaciones.
 */

import { extraerTag } from './soap';
import type { ObservacionArca } from './port';

export type MetodoArca = 'loginCms' | 'FECompUltimoAutorizado' | 'FECAESolicitar' | 'FECompConsultar';

export type FallaSimulada =
  | 'timeout-antes'
  | 'timeout-despues'
  | 'respuesta-cortada'
  | 'caido'
  | 'sin-red'
  | 'autoriza-tarde'
  | { error: number; mensaje: string }
  | { rechazo: ObservacionArca[] };

/** Un comprobante como lo guarda el simulador (texto, tal como viajó). */
export interface ComprobanteSimulado {
  puntoVenta: number;
  tipo: number;
  numero: number;
  cae: string;
  caeVencimiento: string;
  concepto: string;
  docTipo: string;
  docNro: string;
  fecha: string;
  impTotal: string;
  impNeto: string;
  impIva: string;
}

const NS_WSFE = 'http://ar.gov.afip.dif.FEV1/';

function sobre(cuerpo: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
    `<soap:Body>${cuerpo}</soap:Body></soap:Envelope>`
  );
}

function faultSoap(codigo: string, texto: string): string {
  return sobre(`<soap:Fault><faultcode>${codigo}</faultcode><faultstring>${texto}</faultstring></soap:Fault>`);
}

function erroresWsfe(metodo: string, codigo: number, mensaje: string): string {
  return sobre(
    `<${metodo}Response xmlns="${NS_WSFE}"><${metodo}Result>` +
      `<Errors><Err><Code>${codigo}</Code><Msg>${mensaje}</Msg></Err></Errors>` +
      `<Events><Evt><Code>0</Code><Msg>Simulador de ARCA (provisional a confirmar).</Msg></Evt></Events>` +
      `</${metodo}Result></${metodo}Response>`,
  );
}

function campo(xml: string, tag: string): string {
  const v = extraerTag(xml, tag);
  if (v === undefined) throw new Error(`Simulador de ARCA: el pedido no trae <${tag}>.`);
  return v.trim();
}

/** Espera hasta que el transporte corte (abort); si nunca corta, nunca contesta. */
function esperarElCorte(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, rechazar) => {
    const cortar = () => rechazar(new DOMException('This operation was aborted', 'AbortError'));
    if (signal?.aborted) cortar();
    else signal?.addEventListener('abort', cortar, { once: true });
  });
}

export class SimuladorArca {
  private ultimos = new Map<string, number>();
  private autorizados = new Map<string, ComprobanteSimulado>();
  private fallas = new Map<MetodoArca, FallaSimulada[]>();
  private tokenVigente?: string;
  private logins = 0;
  private secuenciaCae = 0;
  /** Pedidos 'autoriza-tarde' que ARCA recibió y todavía no confirmó. */
  private sinConfirmar: string[] = [];
  /** Cada llamado que llegó, en orden (los 'timeout-antes' y 'sin-red' no llegan). */
  readonly llamados: MetodoArca[] = [];

  constructor(private readonly caeVencimiento = '20261004') {}

  /** Programa una falla para el PRÓXIMO llamado a `metodo` (se encolan). */
  fallarProximo(metodo: MetodoArca, falla: FallaSimulada): this {
    const cola = this.fallas.get(metodo) ?? [];
    cola.push(falla);
    this.fallas.set(metodo, cola);
    return this;
  }

  /** Lo que ARCA tiene autorizado, en orden de número. */
  comprobantesAutorizados(): ComprobanteSimulado[] {
    return [...this.autorizados.values()].sort((a, b) => a.numero - b.numero);
  }

  /** Cuántos CAE emitió ARCA para (puntoVenta, tipo). */
  cantidadDeCae(): number {
    return this.autorizados.size;
  }

  /** Invalida el token emitido (como cuando ARCA lo da por vencido): el próximo uso da 600. */
  invalidarToken(): void {
    this.tokenVigente = undefined;
  }

  /** El `fetch` que contesta como ARCA. */
  readonly fetch: typeof fetch = async (entrada, init) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    const cabeceras = new Headers(init?.headers);
    const accion = cabeceras.get('SOAPAction') ?? '';
    const cuerpo = typeof init?.body === 'string' ? init.body : '';
    const metodo: MetodoArca = url.includes('wsaa')
      ? 'loginCms'
      : ((['FECompUltimoAutorizado', 'FECAESolicitar', 'FECompConsultar'] as const).find((m) =>
          accion.endsWith(m),
        ) ?? (() => {
          throw new Error(`Simulador de ARCA: SOAPAction desconocida "${accion}".`);
        })());

    const falla = this.fallas.get(metodo)?.shift();
    if (falla === 'sin-red') throw new TypeError('fetch failed (simulador: sin conexión con ARCA)');
    if (falla === 'timeout-antes') return esperarElCorte(init?.signal);
    this.llamados.push(metodo);
    if (falla === 'caido') {
      return new Response(faultSoap('soap:Server', 'Servicio no disponible (simulador).'), { status: 503 });
    }
    if (falla && typeof falla === 'object' && 'error' in falla) {
      return new Response(erroresWsfe(metodo, falla.error, falla.mensaje), { status: 200 });
    }

    if (falla === 'autoriza-tarde') {
      this.sinConfirmar.push(cuerpo);
      return esperarElCorte(init?.signal);
    }
    const respuesta = this.contestar(metodo, cuerpo, falla && typeof falla === 'object' ? falla.rechazo : undefined);
    if (metodo === 'FECompConsultar') {
      // Lo que ARCA tenía en proceso se confirma DESPUÉS de haber contestado esta consulta.
      for (const pedido of this.sinConfirmar.splice(0)) this.solicitar(pedido);
    }
    if (falla === 'timeout-despues') return esperarElCorte(init?.signal);
    if (falla === 'respuesta-cortada') {
      return new Response(respuesta.slice(0, Math.floor(respuesta.length / 2)), { status: 200 });
    }
    return new Response(respuesta, { status: 200 });
  };

  private contestar(metodo: MetodoArca, cuerpo: string, rechazo?: ObservacionArca[]): string {
    if (metodo === 'loginCms') return this.login();
    const token = campo(cuerpo, 'Token');
    if (!this.tokenVigente || token !== this.tokenVigente) {
      return erroresWsfe(metodo, 600, 'ValidacionDeToken: No validaron las credenciales de acceso (simulador).');
    }
    if (metodo === 'FECompUltimoAutorizado') {
      const pv = Number(campo(cuerpo, 'PtoVta'));
      const tipo = Number(campo(cuerpo, 'CbteTipo'));
      return sobre(
        `<FECompUltimoAutorizadoResponse xmlns="${NS_WSFE}"><FECompUltimoAutorizadoResult>` +
          `<PtoVta>${pv}</PtoVta><CbteTipo>${tipo}</CbteTipo><CbteNro>${this.ultimos.get(`${pv}:${tipo}`) ?? 0}</CbteNro>` +
          `</FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>`,
      );
    }
    if (metodo === 'FECompConsultar') return this.consultar(cuerpo);
    return this.solicitar(cuerpo, rechazo);
  }

  private login(): string {
    this.logins++;
    this.tokenVigente = `TOKEN-SIM-${this.logins}`;
    const ticket =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><loginTicketResponse version="1.0">` +
      `<header><source>CN=wsaahomo, O=AFIP, C=AR</source><destination>SERIALNUMBER=CUIT 20111111112</destination>` +
      `<uniqueId>${this.logins}</uniqueId><generationTime>2026-09-24T10:00:00.000-03:00</generationTime>` +
      `<expirationTime>2099-09-24T22:00:00.000-03:00</expirationTime></header>` +
      `<credentials><token>${this.tokenVigente}</token><sign>SIGN-SIM-${this.logins}</sign></credentials>` +
      `</loginTicketResponse>`;
    const escapado = ticket.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return sobre(
      `<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
        `<loginCmsReturn>${escapado}</loginCmsReturn></loginCmsResponse>`,
    );
  }

  private solicitar(cuerpo: string, rechazo?: ObservacionArca[]): string {
    const pv = Number(campo(cuerpo, 'PtoVta'));
    const tipo = Number(campo(cuerpo, 'CbteTipo'));
    const numero = Number(campo(cuerpo, 'CbteDesde'));
    const clave = `${pv}:${tipo}`;
    const esperado = (this.ultimos.get(clave) ?? 0) + 1;
    const obs =
      rechazo ??
      (numero !== esperado
        ? [
            {
              codigo: 10016,
              mensaje:
                'El numero o fecha del comprobante no se corresponde con el proximo a autorizar. ' +
                'Consultar metodo FECompUltimoAutorizado.',
            },
          ]
        : undefined);
    const detalleComun =
      `<Concepto>${campo(cuerpo, 'Concepto')}</Concepto><DocTipo>${campo(cuerpo, 'DocTipo')}</DocTipo>` +
      `<DocNro>${campo(cuerpo, 'DocNro')}</DocNro><CbteDesde>${numero}</CbteDesde><CbteHasta>${numero}</CbteHasta>` +
      `<CbteFch>${campo(cuerpo, 'CbteFch')}</CbteFch>`;
    const cabecera = (resultado: string) =>
      `<FeCabResp><Cuit>${campo(cuerpo, 'Cuit')}</Cuit><PtoVta>${pv}</PtoVta><CbteTipo>${tipo}</CbteTipo>` +
      `<FchProceso>20260924100000</FchProceso><CantReg>1</CantReg><Resultado>${resultado}</Resultado>` +
      `<Reproceso>N</Reproceso></FeCabResp>`;
    if (obs) {
      return sobre(
        `<FECAESolicitarResponse xmlns="${NS_WSFE}"><FECAESolicitarResult>${cabecera('R')}` +
          `<FeDetResp><FECAEDetResponse>${detalleComun}<Resultado>R</Resultado>` +
          `<Observaciones>${obs.map((o) => `<Obs><Code>${o.codigo}</Code><Msg>${o.mensaje}</Msg></Obs>`).join('')}</Observaciones>` +
          `<CAE></CAE><CAEFchVto></CAEFchVto></FECAEDetResponse></FeDetResp>` +
          `</FECAESolicitarResult></FECAESolicitarResponse>`,
      );
    }
    this.secuenciaCae++;
    const cae = `SIM${String(this.secuenciaCae).padStart(11, '0')}`;
    this.ultimos.set(clave, numero);
    this.autorizados.set(`${clave}:${numero}`, {
      puntoVenta: pv,
      tipo,
      numero,
      cae,
      caeVencimiento: this.caeVencimiento,
      concepto: campo(cuerpo, 'Concepto'),
      docTipo: campo(cuerpo, 'DocTipo'),
      docNro: campo(cuerpo, 'DocNro'),
      fecha: campo(cuerpo, 'CbteFch'),
      impTotal: campo(cuerpo, 'ImpTotal'),
      impNeto: campo(cuerpo, 'ImpNeto'),
      impIva: campo(cuerpo, 'ImpIVA'),
    });
    return sobre(
      `<FECAESolicitarResponse xmlns="${NS_WSFE}"><FECAESolicitarResult>${cabecera('A')}` +
        `<FeDetResp><FECAEDetResponse>${detalleComun}<Resultado>A</Resultado>` +
        `<CAE>${cae}</CAE><CAEFchVto>${this.caeVencimiento}</CAEFchVto></FECAEDetResponse></FeDetResp>` +
        `</FECAESolicitarResult></FECAESolicitarResponse>`,
    );
  }

  private consultar(cuerpo: string): string {
    const pv = Number(campo(cuerpo, 'PtoVta'));
    const tipo = Number(campo(cuerpo, 'CbteTipo'));
    const numero = Number(campo(cuerpo, 'CbteNro'));
    const c = this.autorizados.get(`${pv}:${tipo}:${numero}`);
    if (!c) {
      return erroresWsfe(
        'FECompConsultar',
        602,
        'No existen datos en nuestros registros para los parametros ingresados.',
      );
    }
    return sobre(
      `<FECompConsultarResponse xmlns="${NS_WSFE}"><FECompConsultarResult><ResultGet>` +
        `<Concepto>${c.concepto}</Concepto><DocTipo>${c.docTipo}</DocTipo><DocNro>${c.docNro}</DocNro>` +
        `<CbteDesde>${c.numero}</CbteDesde><CbteHasta>${c.numero}</CbteHasta><CbteFch>${c.fecha}</CbteFch>` +
        `<ImpTotal>${c.impTotal}</ImpTotal><ImpTotConc>0</ImpTotConc><ImpNeto>${c.impNeto}</ImpNeto>` +
        `<ImpOpEx>0</ImpOpEx><ImpTrib>0</ImpTrib><ImpIVA>${c.impIva}</ImpIVA>` +
        `<MonId>PES</MonId><MonCotiz>1</MonCotiz>` +
        `<Resultado>A</Resultado><CodAutorizacion>${c.cae}</CodAutorizacion><EmisionTipo>CAE</EmisionTipo>` +
        `<FchVto>${c.caeVencimiento}</FchVto><FchProceso>20260924100000</FchProceso>` +
        `<PtoVta>${c.puntoVenta}</PtoVta><CbteTipo>${c.tipo}</CbteTipo>` +
        `</ResultGet></FECompConsultarResult></FECompConsultarResponse>`,
    );
  }
}
