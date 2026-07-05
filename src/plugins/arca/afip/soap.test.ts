// Tests de las funciones puras de armado/parseo del adapter SOAP de ARCA
// (WSAA + WSFEv1). Harness node:test + tsx (ADR-026). SIN red: se mockea el
// `SoapTransport`; el `TraSigner` real (certificado) NO se ejercita acá.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AlicuotaIvaId,
  Concepto,
  TipoComprobante,
  TipoDocumento,
} from '../domain/catalogos';
import { ComprobanteArca } from '../domain/comprobante';
import { ArcaRechazoError } from './port';
import {
  CredencialRequeridaSigner,
  ENDPOINTS_HOMOLOGACION,
  ENDPOINTS_PRODUCCION,
  SoapAfipClient,
  SoapTransport,
  TicketAcceso,
  armarFECAESolicitarRequest,
  armarLoginTicketRequest,
  armarUltimoAutorizadoRequest,
  desescaparXml,
  endpointsPara,
  escaparXml,
  extraerTag,
  extraerTags,
  parsearFECAESolicitarResponse,
  parsearLoginTicketResponse,
  parsearObservaciones,
  parsearUltimoAutorizadoResponse,
  ticketVigente,
} from './soap';

// ── Fixtures ────────────────────────────────────────────────────────────────

const TA: TicketAcceso = {
  token: 'PD94bWwgdG9rZW4=',
  sign: 'c2lnbg==',
  expiration: '2026-07-05T18:00:00.000-03:00',
};

function comprobanteFacturaA(): ComprobanteArca {
  return {
    puntoVenta: 3,
    tipo: TipoComprobante.FacturaA,
    concepto: Concepto.Productos,
    docTipo: TipoDocumento.CUIT,
    docNro: 20111111112,
    fecha: '20260705',
    neto: 1000,
    iva: [{ id: AlicuotaIvaId.VeintiUno, baseImponible: 1000, importe: 210 }],
    total: 1210,
    invoiceId: 'inv-1',
    tenantId: 't-1',
  };
}

function comprobanteFacturaCServicios(): ComprobanteArca {
  return {
    puntoVenta: 1,
    tipo: TipoComprobante.FacturaC,
    concepto: Concepto.Servicios,
    docTipo: TipoDocumento.ConsumidorFinal,
    docNro: 0,
    fecha: '20260705',
    neto: 500,
    iva: [{ id: AlicuotaIvaId.Cero, baseImponible: 500, importe: 0 }],
    total: 500,
    servicioDesde: '20260701',
    servicioHasta: '20260705',
    vencimientoPago: '20260710',
    invoiceId: 'inv-2',
    tenantId: 't-1',
  };
}

// LoginTicketResponse tal como WSAA lo devuelve (envuelto y escapado en el body).
const LOGIN_RESPONSE_OK = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov">
      <loginCmsReturn>&lt;?xml version="1.0" encoding="UTF-8" standalone="yes"?&gt;
&lt;loginTicketResponse version="1.0"&gt;
  &lt;header&gt;
    &lt;source&gt;CN=wsaahomo&lt;/source&gt;
    &lt;generationTime&gt;2026-07-05T14:00:00.000-03:00&lt;/generationTime&gt;
    &lt;expirationTime&gt;2026-07-06T02:00:00.000-03:00&lt;/expirationTime&gt;
  &lt;/header&gt;
  &lt;credentials&gt;
    &lt;token&gt;VE9LRU4tQUJD&lt;/token&gt;
    &lt;sign&gt;U0lHTi1YWVo=&lt;/sign&gt;
  &lt;/credentials&gt;
&lt;/loginTicketResponse&gt;</loginCmsReturn>
    </loginCmsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

// FECompUltimoAutorizadoResponse OK (último autorizado = 42).
const ULTIMO_RESPONSE_OK = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECompUltimoAutorizadoResult>
        <PtoVta>3</PtoVta>
        <CbteTipo>1</CbteTipo>
        <CbteNro>42</CbteNro>
      </FECompUltimoAutorizadoResult>
    </FECompUltimoAutorizadoResponse>
  </soap:Body>
</soap:Envelope>`;

// FECAESolicitarResponse aprobado (Resultado=A) con CAE.
const CAE_RESPONSE_OK = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAESolicitarResult>
        <FeCabResp>
          <Cuit>20111111112</Cuit>
          <PtoVta>3</PtoVta>
          <CbteTipo>1</CbteTipo>
          <Resultado>A</Resultado>
          <CantReg>1</CantReg>
        </FeCabResp>
        <FeDetResp>
          <FECAEDetResponse>
            <Concepto>1</Concepto>
            <DocTipo>80</DocTipo>
            <DocNro>20111111112</DocNro>
            <CbteDesde>43</CbteDesde>
            <CbteHasta>43</CbteHasta>
            <Resultado>A</Resultado>
            <CAE>67200000000000</CAE>
            <CAEFchVto>20260715</CAEFchVto>
          </FECAEDetResponse>
        </FeDetResp>
      </FECAESolicitarResult>
    </FECAESolicitarResponse>
  </soap:Body>
</soap:Envelope>`;

// FECAESolicitarResponse rechazado (Resultado=R) con Observaciones.
const CAE_RESPONSE_RECHAZO = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAESolicitarResult>
        <FeCabResp>
          <Resultado>R</Resultado>
        </FeCabResp>
        <FeDetResp>
          <FECAEDetResponse>
            <CbteDesde>43</CbteDesde>
            <Resultado>R</Resultado>
            <CAE/>
            <CAEFchVto/>
            <Observaciones>
              <Obs>
                <Code>10015</Code>
                <Msg>El campo ImpTotal no cierra con el detalle.</Msg>
              </Obs>
              <Obs>
                <Code>10016</Code>
                <Msg>Numeracion no correlativa.</Msg>
              </Obs>
            </Observaciones>
          </FECAEDetResponse>
        </FeDetResp>
      </FECAESolicitarResult>
    </FECAESolicitarResponse>
  </soap:Body>
</soap:Envelope>`;

// Respuesta con <Errors> a nivel método (p.ej. token vencido).
const RESPONSE_ERRORS = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAESolicitarResult>
        <Errors>
          <Err>
            <Code>600</Code>
            <Msg>ValidacionDeToken: Token invalido.</Msg>
          </Err>
        </Errors>
      </FECAESolicitarResult>
    </FECAESolicitarResponse>
  </soap:Body>
</soap:Envelope>`;

// ── Utilidades XML puras ─────────────────────────────────────────────────────

test('escaparXml / desescaparXml son inversas para caracteres especiales', () => {
  const s = `a & b < c > d " e ' f`;
  assert.equal(desescaparXml(escaparXml(s)), s);
});

test('extraerTag ignora prefijo de namespace y atributos', () => {
  assert.equal(extraerTag('<ar:CbteNro>7</ar:CbteNro>', 'CbteNro'), '7');
  assert.equal(extraerTag('<Resultado foo="1">A</Resultado>', 'Resultado'), 'A');
  assert.equal(extraerTag('<x>y</x>', 'CbteNro'), undefined);
});

test('extraerTags devuelve todas las ocurrencias', () => {
  const xml = '<Obs><Code>1</Code></Obs><Obs><Code>2</Code></Obs>';
  assert.equal(extraerTags(xml, 'Obs').length, 2);
});

// ── Endpoints ────────────────────────────────────────────────────────────────

test('endpointsPara elige homologación o producción según config', () => {
  assert.deepEqual(
    endpointsPara({ cuit: 20111111112, homologacion: true }),
    ENDPOINTS_HOMOLOGACION,
  );
  assert.deepEqual(
    endpointsPara({ cuit: 20111111112, homologacion: false }),
    ENDPOINTS_PRODUCCION,
  );
});

// ── WSAA ─────────────────────────────────────────────────────────────────────

test('armarLoginTicketRequest incluye header, service y ventana temporal', () => {
  const ahora = new Date('2026-07-05T12:00:00.000Z');
  const tra = armarLoginTicketRequest('wsfe', ahora, 10 * 60 * 1000);
  assert.match(tra, /<loginTicketRequest version="1.0">/);
  assert.match(tra, /<service>wsfe<\/service>/);
  // uniqueId = epoch en segundos.
  assert.match(tra, new RegExp(`<uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId>`));
  // generationTime en el pasado, expirationTime en el futuro.
  assert.match(tra, /<generationTime>2026-07-05T11:50:00Z<\/generationTime>/);
  assert.match(tra, /<expirationTime>2026-07-05T12:10:00Z<\/expirationTime>/);
});

test('parsearLoginTicketResponse desescapa y extrae token/sign/expiration', () => {
  const ta = parsearLoginTicketResponse(LOGIN_RESPONSE_OK);
  assert.equal(ta.token, 'VE9LRU4tQUJD');
  assert.equal(ta.sign, 'U0lHTi1YWVo=');
  assert.equal(ta.expiration, '2026-07-06T02:00:00.000-03:00');
});

test('parsearLoginTicketResponse falla si falta token', () => {
  const roto = LOGIN_RESPONSE_OK.replace(/token/g, 'nope');
  assert.throws(() => parsearLoginTicketResponse(roto), /LoginTicketResponse inválido/);
});

test('ticketVigente respeta expiration y margen', () => {
  const ta: TicketAcceso = { token: 't', sign: 's', expiration: '2026-07-05T12:00:00.000Z' };
  assert.equal(ticketVigente(ta, new Date('2026-07-05T11:00:00.000Z')), true);
  assert.equal(ticketVigente(ta, new Date('2026-07-05T12:00:00.000Z')), false); // vencido
  // dentro del margen de seguridad → no vigente.
  assert.equal(ticketVigente(ta, new Date('2026-07-05T11:59:30.000Z'), 60_000), false);
});

// ── WSFEv1: FECompUltimoAutorizado ───────────────────────────────────────────

test('armarUltimoAutorizadoRequest arma Auth + PtoVta + CbteTipo', () => {
  const body = armarUltimoAutorizadoRequest(TA, 20111111112, 3, TipoComprobante.FacturaA);
  assert.match(body, /<ar:FECompUltimoAutorizado>/);
  assert.match(body, /<ar:Token>PD94bWwgdG9rZW4=<\/ar:Token>/);
  assert.match(body, /<ar:Cuit>20111111112<\/ar:Cuit>/);
  assert.match(body, /<ar:PtoVta>3<\/ar:PtoVta>/);
  assert.match(body, /<ar:CbteTipo>1<\/ar:CbteTipo>/);
});

test('parsearUltimoAutorizadoResponse devuelve el CbteNro', () => {
  assert.equal(parsearUltimoAutorizadoResponse(ULTIMO_RESPONSE_OK), 42);
});

test('parsearUltimoAutorizadoResponse lanza ArcaRechazoError ante <Errors>', () => {
  assert.throws(
    () => parsearUltimoAutorizadoResponse(RESPONSE_ERRORS),
    (e: unknown) => e instanceof ArcaRechazoError && e.observaciones[0].codigo === 600,
  );
});

// ── WSFEv1: FECAESolicitar (armado) ──────────────────────────────────────────

test('armarFECAESolicitarRequest (Factura A) discrimina IVA y arma AlicIva', () => {
  const body = armarFECAESolicitarRequest(TA, 20111111112, comprobanteFacturaA(), 43);
  assert.match(body, /<ar:CbteTipo>1<\/ar:CbteTipo>/);
  assert.match(body, /<ar:CbteDesde>43<\/ar:CbteDesde>/);
  assert.match(body, /<ar:CbteHasta>43<\/ar:CbteHasta>/);
  assert.match(body, /<ar:ImpNeto>1000\.00<\/ar:ImpNeto>/);
  assert.match(body, /<ar:ImpIVA>210\.00<\/ar:ImpIVA>/);
  assert.match(body, /<ar:ImpTotal>1210\.00<\/ar:ImpTotal>/);
  // array Iva presente con la alícuota 21%.
  assert.match(body, /<ar:AlicIva><ar:Id>5<\/ar:Id>/);
  assert.match(body, /<ar:BaseImp>1000\.00<\/ar:BaseImp>/);
});

test('armarFECAESolicitarRequest (Factura C) NO discrimina IVA ni manda <Iva>, y arma fechas de servicio', () => {
  const body = armarFECAESolicitarRequest(TA, 20111111112, comprobanteFacturaCServicios(), 10);
  assert.match(body, /<ar:CbteTipo>11<\/ar:CbteTipo>/);
  assert.match(body, /<ar:ImpIVA>0\.00<\/ar:ImpIVA>/);
  assert.doesNotMatch(body, /<ar:AlicIva>/); // C no manda detalle de IVA
  assert.match(body, /<ar:FchServDesde>20260701<\/ar:FchServDesde>/);
  assert.match(body, /<ar:FchServHasta>20260705<\/ar:FchServHasta>/);
  assert.match(body, /<ar:FchVtoPago>20260710<\/ar:FchVtoPago>/);
});

// ── WSFEv1: FECAESolicitar (parseo) ──────────────────────────────────────────

test('parsearFECAESolicitarResponse OK devuelve ResultadoCae con CAE y número autorizado', () => {
  const comp = comprobanteFacturaA();
  const res = parsearFECAESolicitarResponse(CAE_RESPONSE_OK, comp, 43);
  assert.equal(res.cae, '67200000000000');
  assert.equal(res.caeVencimiento, '20260715');
  assert.equal(res.numero, 43);
  assert.equal(res.puntoVenta, 3);
  assert.equal(res.tipo, TipoComprobante.FacturaA);
});

test('parsearFECAESolicitarResponse rechazo (Resultado=R) lanza ArcaRechazoError con observaciones', () => {
  const comp = comprobanteFacturaA();
  assert.throws(
    () => parsearFECAESolicitarResponse(CAE_RESPONSE_RECHAZO, comp, 43),
    (e: unknown) => {
      assert.ok(e instanceof ArcaRechazoError);
      assert.equal(e.observaciones.length, 2);
      assert.deepEqual(e.observaciones[0], {
        codigo: 10015,
        mensaje: 'El campo ImpTotal no cierra con el detalle.',
      });
      assert.equal(e.observaciones[1].codigo, 10016);
      return true;
    },
  );
});

test('parsearFECAESolicitarResponse mapea <Errors> a ArcaRechazoError', () => {
  const comp = comprobanteFacturaA();
  assert.throws(
    () => parsearFECAESolicitarResponse(RESPONSE_ERRORS, comp, 43),
    (e: unknown) =>
      e instanceof ArcaRechazoError &&
      e.observaciones[0].codigo === 600 &&
      /Token invalido/.test(e.observaciones[0].mensaje),
  );
});

test('parsearObservaciones extrae code + msg de cada <Obs>', () => {
  const obs = parsearObservaciones(CAE_RESPONSE_RECHAZO);
  assert.equal(obs.length, 2);
  assert.equal(obs[0].codigo, 10015);
});

// ── Cliente (con transporte mockeado, SIN red) ───────────────────────────────

/** Transporte fake que responde según la SOAPAction/URL. */
class FakeTransport implements SoapTransport {
  llamadas: Array<{ url: string; action: string; body: string }> = [];
  constructor(private readonly rutas: (action: string, body: string) => string) {}
  async post(url: string, action: string, body: string): Promise<string> {
    this.llamadas.push({ url, action, body });
    return this.rutas(action, body);
  }
}

/** Signer fake que "firma" sin certificado (solo para el flujo del cliente). */
const signerFake = { firmarCms: async () => 'CMS-FAKE-BASE64' };

test('SoapAfipClient.ultimoAutorizado autentica una vez y golpea WSFEv1', async () => {
  const transport = new FakeTransport((action) =>
    action.endsWith('FECompUltimoAutorizado') ? ULTIMO_RESPONSE_OK : LOGIN_RESPONSE_OK,
  );
  const client = new SoapAfipClient(
    { cuit: 20111111112, homologacion: true },
    { transport, signer: signerFake },
  );
  const n = await client.ultimoAutorizado(3, TipoComprobante.FacturaA);
  assert.equal(n, 42);
  // 1 login (WSAA) + 1 consulta (WSFEv1).
  assert.equal(transport.llamadas.length, 2);
  assert.equal(transport.llamadas[0].url, ENDPOINTS_HOMOLOGACION.wsaa);
  assert.equal(transport.llamadas[1].url, ENDPOINTS_HOMOLOGACION.wsfev1);
});

test('SoapAfipClient.solicitarCae resuelve numeración (ultimo+1) y devuelve el CAE', async () => {
  const transport = new FakeTransport((action) => {
    if (action === '') return LOGIN_RESPONSE_OK; // WSAA (SOAPAction vacía)
    if (action.endsWith('FECompUltimoAutorizado')) return ULTIMO_RESPONSE_OK; // ⇒ 42
    return CAE_RESPONSE_OK; // FECAESolicitar
  });
  const client = new SoapAfipClient(
    { cuit: 20111111112, homologacion: true },
    { transport, signer: signerFake },
  );
  const res = await client.solicitarCae(comprobanteFacturaA());
  assert.equal(res.cae, '67200000000000');
  // El request de CAE debió enviar CbteDesde=43 (ultimo 42 + 1).
  const reqCae = transport.llamadas.find((c) => c.action.endsWith('FECAESolicitar'));
  assert.ok(reqCae);
  assert.match(reqCae!.body, /<ar:CbteDesde>43<\/ar:CbteDesde>/);
});

test('SoapAfipClient cachea el ticket: no reautentica en la 2da operación', async () => {
  let logins = 0;
  const transport = new FakeTransport((action) => {
    if (action === '') {
      logins++;
      return LOGIN_RESPONSE_OK;
    }
    return ULTIMO_RESPONSE_OK;
  });
  const client = new SoapAfipClient(
    { cuit: 20111111112, homologacion: true },
    { transport, signer: signerFake, ahora: () => new Date('2026-07-05T12:00:00Z') },
  );
  await client.ultimoAutorizado(3, TipoComprobante.FacturaA);
  await client.ultimoAutorizado(3, TipoComprobante.FacturaB);
  assert.equal(logins, 1); // el TA de LOGIN_RESPONSE_OK vence en 2026-07-06
});

test('El signer por defecto exige credencial (acción humana)', async () => {
  const signer = new CredencialRequeridaSigner();
  await assert.rejects(() => signer.firmarCms('<tra/>'), /credencial requerida/);
});
