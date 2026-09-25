// ============================================================================
// ENG-020 + ENG-021 · Tests de contrato contra el simulador de ARCA.
// ============================================================================
//
// El cliente SOAP REAL (`SoapAfipClient` + `FetchSoapTransport`) habla con `SimuladorArca`, que
// contesta como WSAA y WSFEv1 (respuestas armadas desde el manual: provisional a confirmar con
// las grabadas en la homologación del dueño). Un caso por comportamiento del simulador:
// autoriza, rechaza, timeout antes y después de autorizar, respuesta cortada, WSAA caído, sin
// red, errores 5xx/600/10016. Y la regla de ENG-020 ejecutada: si la respuesta se perdió, el
// reintento consulta y adopta el comprobante ya autorizado; un solo CAE.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { SimuladorArca } from './simulador';
import { FetchSoapTransport, SoapAfipClient, TIMEOUT_ARCA_MS, centavosDeImporteArca } from './soap';
import { ArcaPasajeroError, ArcaRechazoError, type ResultadoCae } from './port';
import { autorizarSinDuplicar, esElMismoComprobante, procesarInvoiceCreated } from '../handler';
import type { IntentoArca, InvoiceCreatedEvent, RegisterFiscalDocumentInput } from '../core-contract';
import { CondicionIva, TipoComprobante } from '../domain/catalogos';
import { construirComprobante } from '../domain/comprobante';
import { fechaFiscalDelDia } from '@/lib/libros/fecha-fiscal';

const CORTE_MS = 40; // en los tests el transporte corta rápido; el valor real se prueba abajo

function clienteContra(sim: SimuladorArca): SoapAfipClient {
  return new SoapAfipClient(
    { cuit: 20111111112, homologacion: true },
    {
      transport: new FetchSoapTransport({ fetch: sim.fetch, timeoutMs: CORTE_MS }),
      signer: { firmarCms: async () => 'CMS-DE-PRUEBA' },
    },
  );
}

function evento(over: Partial<InvoiceCreatedEvent> = {}): InvoiceCreatedEvent {
  return {
    invoiceId: 'inv-1',
    tenantId: 't-1',
    concepto: 1,
    fecha: '20260924',
    emisor: { cuit: 20111111112, condicionIva: CondicionIva.ResponsableInscripto, puntoVenta: 1 },
    receptor: { docTipo: 99, docNro: 0, condicionIva: CondicionIva.ConsumidorFinal },
    neto: 1000,
    iva: [{ alicuotaId: 5, base: 1000, importe: 210 }],
    total: 1210,
    ivaPorProducto: true, // ENG-024: IVA de cada producto; sin esto un inscripto no emite.
    vencimientoPago: '20260924',
    ...over,
  };
}

const comprobante = (over: Partial<InvoiceCreatedEvent> = {}) => construirComprobante(evento(over));

/** Lo que haría el despacho: guarda el intento en el evento y registra el CAE. */
function despachoEnMemoria(sim: SimuladorArca) {
  let intento: IntentoArca | undefined;
  const registrados: RegisterFiscalDocumentInput[] = [];
  const correr = async (over: Partial<InvoiceCreatedEvent> = {}) =>
    procesarInvoiceCreated(
      { ...evento(over), intentoArca: intento },
      {
        clientePara: () => clienteContra(sim),
        registrar: async (r) => {
          registrados.push(r);
        },
        anotarIntento: async (i) => {
          intento = i;
        },
        numeroUsadoPorOtraFactura: async () => false,
        fechaDeEnvio: () => fechaFiscalDelDia(),
      },
    );
  return { correr, registrados, intento: () => intento };
}

/** El registro de intentos de un envío, en memoria: anota y dice qué números tienen otras facturas. */
function registroEnMemoria(numerosDeOtrasFacturas: number[] = []) {
  return {
    anotar: async (): Promise<void> => {},
    usadoPorOtraFactura: async (i: IntentoArca) => numerosDeOtrasFacturas.includes(i.numero),
  };
}

// ── El simulador, caso por caso, contra el cliente real ──────────────────────────────────

test('contrato · autoriza: CAE y número 1, y FECompConsultar devuelve ese mismo comprobante', async () => {
  const sim = new SimuladorArca();
  const cliente = clienteContra(sim);
  const r = await cliente.solicitarCae(comprobante());
  assert.equal(r.numero, 1);
  assert.match(r.cae, /^SIM\d{11}$/);
  const consultado = await cliente.consultarComprobante(1, TipoComprobante.FacturaB, 1);
  assert.ok(consultado);
  assert.equal(consultado.cae, r.cae);
  assert.equal(consultado.caeVencimiento, r.caeVencimiento);
  assert.equal(consultado.totalCentavos, 121000);
  assert.equal(consultado.docTipo, 99);
  assert.equal(consultado.fecha, '20260924');
});

test('contrato · rechaza (Resultado R con una observación del comprobante): ArcaRechazoError, 0 CAE', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', {
    rechazo: [{ codigo: 10015, mensaje: 'El campo ImpTotal no cierra con el detalle.' }],
  });
  await assert.rejects(
    clienteContra(sim).solicitarCae(comprobante()),
    (e: unknown) => e instanceof ArcaRechazoError && e.observaciones[0].codigo === 10015,
  );
  assert.equal(sim.cantidadDeCae(), 0);
});

test('contrato · timeout ANTES de autorizar: pasajero y ARCA no tiene nada (consultar da null)', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'timeout-antes');
  const cliente = clienteContra(sim);
  await assert.rejects(
    cliente.solicitarCae({ ...comprobante(), numero: 1 }),
    (e: unknown) => e instanceof ArcaPasajeroError && /no respondió/.test(e.message),
  );
  assert.equal(sim.cantidadDeCae(), 0);
  assert.equal(await cliente.consultarComprobante(1, TipoComprobante.FacturaB, 1), null);
});

test('contrato · timeout DESPUÉS de autorizar: pasajero, pero ARCA ya emitió el CAE del número 1', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'timeout-despues');
  const cliente = clienteContra(sim);
  await assert.rejects(cliente.solicitarCae({ ...comprobante(), numero: 1 }), ArcaPasajeroError);
  assert.equal(sim.cantidadDeCae(), 1);
  const consultado = await cliente.consultarComprobante(1, TipoComprobante.FacturaB, 1);
  assert.equal(consultado?.cae, sim.comprobantesAutorizados()[0].cae);
});

test('contrato · respuesta cortada después de autorizar: pasajero, nunca rechazo', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'respuesta-cortada');
  await assert.rejects(
    clienteContra(sim).solicitarCae({ ...comprobante(), numero: 1 }),
    (e: unknown) => e instanceof ArcaPasajeroError && !(e instanceof ArcaRechazoError),
  );
  assert.equal(sim.cantidadDeCae(), 1);
});

test('contrato · WSAA caído (HTTP 503 con SOAP Fault): pasajero y no se llega a pedir el CAE', async () => {
  const sim = new SimuladorArca().fallarProximo('loginCms', 'caido');
  await assert.rejects(
    clienteContra(sim).solicitarCae(comprobante()),
    (e: unknown) => e instanceof ArcaPasajeroError && /HTTP 503/.test(e.message),
  );
  assert.deepEqual(sim.llamados, ['loginCms']);
});

test('contrato · WSAA sin red: pasajero', async () => {
  const sim = new SimuladorArca().fallarProximo('loginCms', 'sin-red');
  await assert.rejects(clienteContra(sim).solicitarCae(comprobante()), ArcaPasajeroError);
  assert.equal(sim.cantidadDeCae(), 0);
});

test('contrato · WSAA contesta cortado (sin token): pasajero', async () => {
  const sim = new SimuladorArca().fallarProximo('loginCms', 'respuesta-cortada');
  await assert.rejects(clienteContra(sim).ultimoAutorizado(1, TipoComprobante.FacturaB), ArcaPasajeroError);
});

test('contrato · WSFEv1 caído (HTTP 503) al pedir el CAE: pasajero', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'caido');
  await assert.rejects(clienteContra(sim).solicitarCae({ ...comprobante(), numero: 1 }), ArcaPasajeroError);
  assert.equal(sim.cantidadDeCae(), 0);
});

for (const [codigo, mensaje] of [
  [500, 'Error interno de aplicacion.'],
  [501, 'Error interno de base de datos.'],
  [502, 'Error interno de base de datos - Autorizador.'],
  [600, 'ValidacionDeToken: No validaron las credenciales de acceso.'],
] as const) {
  test(`contrato · <Errors> ${codigo} al pedir el CAE: pasajero con el código a la vista`, async () => {
    const sim = new SimuladorArca().fallarProximo('FECAESolicitar', { error: codigo, mensaje });
    await assert.rejects(
      clienteContra(sim).solicitarCae({ ...comprobante(), numero: 1 }),
      (e: unknown) =>
        e instanceof ArcaPasajeroError && !(e instanceof ArcaRechazoError) && e.observaciones[0].codigo === codigo,
    );
  });
}

test('contrato · token que ARCA ya no reconoce: el simulador contesta 600 y es pasajero', async () => {
  const sim = new SimuladorArca();
  const cliente = clienteContra(sim);
  await cliente.ultimoAutorizado(1, TipoComprobante.FacturaB);
  sim.invalidarToken();
  await assert.rejects(
    cliente.solicitarCae({ ...comprobante(), numero: 1 }),
    (e: unknown) => e instanceof ArcaPasajeroError && e.observaciones[0].codigo === 600,
  );
});

test('contrato · número que no es el próximo (10016): pasajero, 0 CAE', async () => {
  const sim = new SimuladorArca();
  await assert.rejects(
    clienteContra(sim).solicitarCae({ ...comprobante(), numero: 5 }),
    (e: unknown) => e instanceof ArcaPasajeroError && e.observaciones[0].codigo === 10016,
  );
  assert.equal(sim.cantidadDeCae(), 0);
});

test('contrato · FECompConsultar de un número que no existe (602): null, no error', async () => {
  const sim = new SimuladorArca();
  assert.equal(await clienteContra(sim).consultarComprobante(1, TipoComprobante.FacturaB, 7), null);
});

test('contrato · FECompConsultar sin respuesta a tiempo: lanza pasajero (no contesta "no existe")', async () => {
  const sim = new SimuladorArca().fallarProximo('FECompConsultar', 'timeout-antes');
  await assert.rejects(clienteContra(sim).consultarComprobante(1, TipoComprobante.FacturaB, 1), ArcaPasajeroError);
});

test('el importe de ARCA se lee a centavos sin float: "1210" → 121000, "0.1" → 10, "1.005" no se adopta', () => {
  assert.equal(centavosDeImporteArca('1210'), 121000);
  assert.equal(centavosDeImporteArca('1210.5'), 121050);
  assert.equal(centavosDeImporteArca('0.1'), 10);
  assert.equal(centavosDeImporteArca('12.30000'), 1230);
  assert.throws(() => centavosDeImporteArca('1.005'), ArcaPasajeroError);
  assert.throws(() => centavosDeImporteArca('1e3'), ArcaPasajeroError);
});

// ── El transporte corta a los 15 s (DECISIONS.md P5) ─────────────────────────────────────

test('el transporte real corta a los 15 s: a los 14,999 s sigue esperando, a los 15 s es pasajero', async () => {
  assert.equal(TIMEOUT_ARCA_MS, 15_000);
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const sim = new SimuladorArca().fallarProximo('loginCms', 'timeout-antes');
    const transporte = new FetchSoapTransport({ fetch: sim.fetch }); // sin timeoutMs: el de producción
    let resultado: unknown = 'esperando';
    const llamado = transporte.post('https://wsaahomo.afip.gov.ar/ws/services/LoginCms', '', '<x/>').then(
      () => 'contestó',
      (e: unknown) => e,
    );
    void llamado.then((r) => (resultado = r));
    mock.timers.tick(14_999);
    await new Promise((r) => setImmediate(r));
    assert.equal(resultado, 'esperando');
    mock.timers.tick(1);
    const error = await llamado;
    assert.ok(error instanceof ArcaPasajeroError, String(error));
    assert.match(error.message, /no respondió en 15 s/);
  } finally {
    mock.timers.reset();
  }
});

// ── ENG-020: respuesta perdida, un solo CAE ──────────────────────────────────────────────

test('ENG-020 · ARCA autoriza y la respuesta se pierde: el reintento registra el número 1 y no pide un 2', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'timeout-despues');
  const despacho = despachoEnMemoria(sim);
  await assert.rejects(despacho.correr(), ArcaPasajeroError);
  assert.deepEqual(despacho.intento(), { puntoVenta: 1, tipo: TipoComprobante.FacturaB, numero: 1 });
  assert.equal(despacho.registrados.length, 0);

  const r = await despacho.correr();
  assert.equal(r.numero, 1);
  assert.equal(sim.cantidadDeCae(), 1, 'un solo CAE en ARCA');
  assert.equal(despacho.registrados.length, 1);
  assert.equal(despacho.registrados[0].numero, 1);
  assert.equal(despacho.registrados[0].cae, sim.comprobantesAutorizados()[0].cae);
  assert.equal(sim.llamados.filter((m) => m === 'FECAESolicitar').length, 1, 'no se pidió otro CAE');
});

test('ENG-020 · respuesta cortada después de autorizar: el reintento adopta el CAE, un solo comprobante', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'respuesta-cortada');
  const despacho = despachoEnMemoria(sim);
  await assert.rejects(despacho.correr(), ArcaPasajeroError);
  await despacho.correr();
  assert.equal(sim.cantidadDeCae(), 1);
  assert.equal(despacho.registrados[0].numero, 1);
});

test('ENG-020 · timeout ANTES de autorizar: el reintento consulta, no encuentra nada y pide el 1', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'timeout-antes');
  const despacho = despachoEnMemoria(sim);
  await assert.rejects(despacho.correr(), ArcaPasajeroError);
  assert.equal(sim.cantidadDeCae(), 0);
  const r = await despacho.correr();
  assert.equal(r.numero, 1);
  assert.equal(sim.cantidadDeCae(), 1);
  assert.ok(sim.llamados.includes('FECompConsultar'), 'consultó antes de volver a pedir');
});

test('ENG-020 · si la consulta no contesta, NO se pide otro CAE (queda pendiente)', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'timeout-despues');
  const despacho = despachoEnMemoria(sim);
  await assert.rejects(despacho.correr(), ArcaPasajeroError);
  sim.fallarProximo('FECompConsultar', 'timeout-antes');
  await assert.rejects(despacho.correr(), ArcaPasajeroError);
  assert.equal(sim.llamados.filter((m) => m === 'FECAESolicitar').length, 1);
  assert.equal(sim.cantidadDeCae(), 1);
  await despacho.correr();
  assert.equal(sim.cantidadDeCae(), 1);
  assert.equal(despacho.registrados[0].numero, 1);
});

test('ENG-020 · si el número anotado lo autorizó OTRO comprobante, no se adopta: se pide el siguiente', async () => {
  const sim = new SimuladorArca();
  const cliente = clienteContra(sim);
  // Otra venta, por otro total, se quedó con el número 1.
  await cliente.solicitarCae({ ...comprobante({ neto: 2000, iva: [{ alicuotaId: 5, base: 2000, importe: 420 }], total: 2420 }), numero: 1 });
  const registrados: ResultadoCae[] = [];
  const r = await autorizarSinDuplicar(
    cliente,
    comprobante(),
    { puntoVenta: 1, tipo: TipoComprobante.FacturaB, numero: 1 },
    registroEnMemoria(),
  );
  registrados.push(r);
  assert.equal(r.numero, 2);
  assert.notEqual(r.cae, sim.comprobantesAutorizados()[0].cae);
  assert.equal(sim.cantidadDeCae(), 2);
});

test('ENG-020 · si no se pudo anotar el número, no se pide el CAE', async () => {
  const sim = new SimuladorArca();
  await assert.rejects(
    autorizarSinDuplicar(clienteContra(sim), comprobante(), undefined, {
      ...registroEnMemoria(),
      anotar: async () => {
        throw new Error('la base no contestó');
      },
    }),
    /la base no contestó/,
  );
  assert.equal(sim.llamados.includes('FECAESolicitar'), false);
  assert.equal(sim.cantidadDeCae(), 0);
});

test('ENG-020 · el número se anota ANTES de pedir el CAE', async () => {
  const sim = new SimuladorArca();
  const orden: string[] = [];
  await autorizarSinDuplicar(clienteContra(sim), comprobante(), undefined, {
    ...registroEnMemoria(),
    anotar: async (i) => {
      orden.push(`anotado ${i.numero}; llamados a FECAESolicitar: ${sim.llamados.filter((m) => m === 'FECAESolicitar').length}`);
    },
  });
  assert.deepEqual(orden, ['anotado 1; llamados a FECAESolicitar: 0']);
});

test('ENG-021 · con un 600 el despacho no registra nada y el reintento autoriza con el mismo número', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', { error: 600, mensaje: 'ValidacionDeToken' });
  const despacho = despachoEnMemoria(sim);
  await assert.rejects(despacho.correr(), ArcaPasajeroError);
  const r = await despacho.correr();
  assert.equal(r.numero, 1);
  assert.equal(sim.cantidadDeCae(), 1);
});

test('ENG-020 · ARCA dio el CAE pero no se pudo guardar: el reintento adopta ese CAE y no pide otro', async () => {
  const sim = new SimuladorArca();
  let intento: IntentoArca | undefined;
  let fallarAlGuardar = true;
  const guardados: RegisterFiscalDocumentInput[] = [];
  const correr = () =>
    procesarInvoiceCreated(
      { ...evento(), intentoArca: intento },
      {
        clientePara: () => clienteContra(sim),
        registrar: async (r) => {
          if (fallarAlGuardar) throw new Error('la base no contestó');
          guardados.push(r);
        },
        anotarIntento: async (i) => {
          intento = i;
        },
        numeroUsadoPorOtraFactura: async () => false,
        fechaDeEnvio: () => fechaFiscalDelDia(),
      },
    );
  await assert.rejects(correr(), /la base no contestó/);
  fallarAlGuardar = false;
  await correr();
  assert.equal(sim.cantidadDeCae(), 1);
  assert.equal(guardados.length, 1);
  assert.equal(guardados[0].cae, sim.comprobantesAutorizados()[0].cae);
});

// ── Vuelta 1 de revisión: la consulta nunca rechaza, y el número de otra factura no se adopta ──

for (const codigo of [1000, 10015, 600]) {
  test(`ENG-021 · FECompConsultar con el error ${codigo}: pasajero, nunca rechazo (no se sabe si el número se usó)`, async () => {
    const sim = new SimuladorArca().fallarProximo('FECompConsultar', { error: codigo, mensaje: 'Error en consulta' });
    await assert.rejects(
      clienteContra(sim).consultarComprobante(1, TipoComprobante.FacturaB, 1),
      (e: unknown) => e instanceof ArcaPasajeroError && !(e instanceof ArcaRechazoError),
    );
  });
}

test('ENG-020 · si la consulta del número anotado lanza un rechazo (cualquier cliente), sale pasajero y no se pide otro número', async () => {
  const llamados: string[] = [];
  const cliente = {
    async ultimoAutorizado() {
      llamados.push('ultimoAutorizado');
      return 0;
    },
    async solicitarCae(): Promise<ResultadoCae> {
      llamados.push('solicitarCae');
      throw new Error('no se debía pedir');
    },
    async consultarComprobante(): Promise<null> {
      throw new ArcaRechazoError('ARCA devolvió errores.', [{ codigo: 1000, mensaje: 'Error en consulta' }]);
    },
  };
  await assert.rejects(
    autorizarSinDuplicar(cliente, comprobante(), { puntoVenta: 1, tipo: TipoComprobante.FacturaB, numero: 1 }, registroEnMemoria()),
    (e: unknown) => e instanceof ArcaPasajeroError && /1000/.test(e.observaciones.map((o) => o.codigo).join()),
  );
  assert.deepEqual(llamados, []);
});

test('ENG-020 · dos ventas iguales a consumidor final: si el número anotado ya está en OTRA factura, no se adopta y se pide el siguiente', async () => {
  const sim = new SimuladorArca();
  const cliente = clienteContra(sim);
  // La venta B, idéntica (mismo día, 99/0, mismo total), se quedó con el número 1 y lo registró.
  await cliente.solicitarCae({ ...comprobante({ invoiceId: 'inv-B' }), numero: 1 });
  const r = await autorizarSinDuplicar(
    cliente,
    comprobante(),
    { puntoVenta: 1, tipo: TipoComprobante.FacturaB, numero: 1 },
    registroEnMemoria([1]),
  );
  assert.equal(r.numero, 2);
  assert.equal(sim.cantidadDeCae(), 2, 'dos ventas, dos CAE');
});

test('ENG-020 · el mismo comprobante idéntico, sin otra factura que lo tenga: se adopta (la respuesta se había perdido)', async () => {
  const sim = new SimuladorArca();
  const cliente = clienteContra(sim);
  await cliente.solicitarCae({ ...comprobante(), numero: 1 });
  const r = await autorizarSinDuplicar(
    cliente,
    comprobante(),
    { puntoVenta: 1, tipo: TipoComprobante.FacturaB, numero: 1 },
    registroEnMemoria([]),
  );
  assert.equal(r.numero, 1);
  assert.equal(sim.cantidadDeCae(), 1);
});

test('ENG-020 · esElMismoComprobante: cada dato que viaja a ARCA, si difiere, hace que NO se adopte', () => {
  const comp = comprobante();
  const igual = {
    puntoVenta: 1,
    tipo: TipoComprobante.FacturaB,
    numero: 1,
    cae: '12345678901234',
    caeVencimiento: '20261004',
    fecha: '20260924',
    docTipo: 99,
    docNro: 0,
    concepto: 1,
    totalCentavos: 121000,
    netoCentavos: 100000,
    ivaCentavos: 21000,
  };
  assert.equal(esElMismoComprobante(igual, comp), true);
  const distintos: [string, Partial<typeof igual>][] = [
    ['punto de venta', { puntoVenta: 2 }],
    ['tipo', { tipo: TipoComprobante.FacturaA }],
    ['fecha', { fecha: '20260925' }],
    ['tipo de documento', { docTipo: 96 }],
    ['número de documento', { docNro: 30111222 }],
    ['concepto', { concepto: 2 }],
    ['total', { totalCentavos: 121001 }],
    ['neto', { netoCentavos: 100100 }],
    ['IVA', { ivaCentavos: 20900 }],
  ];
  for (const [nombre, cambio] of distintos) {
    assert.equal(esElMismoComprobante({ ...igual, ...cambio }, comp), false, `con otro ${nombre} no se adopta`);
  }
});

test('ENG-020 · con número anotado se consulta ANTES de validar: si ARCA ya lo autorizó, se registra aunque la validación de hoy lo objete', async () => {
  const sim = new SimuladorArca();
  // Autorizado en un envío anterior, con datos que la validación local de hoy objeta (sin IVA).
  const objetable = { neto: 1210, iva: [], total: 1210 };
  await clienteContra(sim).solicitarCae({ ...comprobante(objetable), numero: 1 });
  const registrados: RegisterFiscalDocumentInput[] = [];
  await procesarInvoiceCreated(
    { ...evento(objetable), intentoArca: { puntoVenta: 1, tipo: TipoComprobante.FacturaB, numero: 1 } },
    {
      clientePara: () => clienteContra(sim),
      registrar: async (r) => {
        registrados.push(r);
      },
      anotarIntento: async () => {},
      numeroUsadoPorOtraFactura: async () => false,
      fechaDeEnvio: () => fechaFiscalDelDia(),
    },
  );
  assert.equal(registrados.length, 1);
  assert.equal(registrados[0].numero, 1);
  assert.equal(sim.cantidadDeCae(), 1);
});

test('contrato · FECompUltimoAutorizado caído (HTTP 503): pasajero y no se pide el CAE', async () => {
  const sim = new SimuladorArca().fallarProximo('FECompUltimoAutorizado', 'caido');
  const despacho = despachoEnMemoria(sim);
  await assert.rejects(despacho.correr(), ArcaPasajeroError);
  assert.equal(sim.llamados.includes('FECAESolicitar'), false);
  assert.equal(despacho.intento(), undefined, 'no se anotó ningún número');
});

test('contrato · FECAESolicitar sin red: pasajero, 0 CAE, y el reintento autoriza el mismo número', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'sin-red');
  const despacho = despachoEnMemoria(sim);
  await assert.rejects(despacho.correr(), ArcaPasajeroError);
  assert.equal(sim.cantidadDeCae(), 0);
  assert.equal((await despacho.correr()).numero, 1);
  assert.equal(sim.cantidadDeCae(), 1);
});

// ── Vuelta 3 de revisión: ARCA autoriza tarde, y cada falla de las consultas es pasajera ──

test('ENG-020 · ARCA autoriza TARDE (después de la consulta del reintento): no se pide otro número; el reintento siguiente adopta el mismo y queda 1 CAE', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'autoriza-tarde');
  const despacho = despachoEnMemoria(sim);
  await assert.rejects(despacho.correr(), ArcaPasajeroError); // el corte propio a los 15 s
  assert.equal(sim.cantidadDeCae(), 0, 'ARCA todavía no lo confirmó');

  // Reintento: la consulta del 1 da "no existe", pero enseguida ARCA ya tiene el 1 como último.
  await assert.rejects(
    despacho.correr(),
    (e: unknown) => e instanceof ArcaPasajeroError && /1/.test(e.message),
  );
  assert.equal(sim.cantidadDeCae(), 1);
  assert.equal(sim.llamados.filter((m) => m === 'FECAESolicitar').length, 1, 'no se pidió el 2');
  assert.deepEqual(despacho.intento(), { puntoVenta: 1, tipo: TipoComprobante.FacturaB, numero: 1 });
  assert.equal(despacho.registrados.length, 0);

  const r = await despacho.correr();
  assert.equal(r.numero, 1);
  assert.equal(sim.cantidadDeCae(), 1, 'una venta, un CAE');
  assert.equal(despacho.registrados[0].cae, sim.comprobantesAutorizados()[0].cae);
});

test('ENG-020 · autorizarSinDuplicar: número anotado que da 602 pero ya es menor o igual al último autorizado → pasajero, sin pedir otro', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'autoriza-tarde');
  const cliente = clienteContra(sim);
  await assert.rejects(cliente.solicitarCae({ ...comprobante(), numero: 1 }), ArcaPasajeroError);
  await assert.rejects(
    autorizarSinDuplicar(cliente, comprobante(), { puntoVenta: 1, tipo: TipoComprobante.FacturaB, numero: 1 }, registroEnMemoria()),
    ArcaPasajeroError,
  );
  assert.equal(sim.cantidadDeCae(), 1);
  const r = await autorizarSinDuplicar(
    cliente,
    comprobante(),
    { puntoVenta: 1, tipo: TipoComprobante.FacturaB, numero: 1 },
    registroEnMemoria(),
  );
  assert.equal(r.numero, 1);
  assert.equal(sim.cantidadDeCae(), 1);
});

test('ENG-020 · número anotado que da 602 y sigue por encima del último autorizado: el pedido no había llegado, se pide ese mismo número', async () => {
  const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'timeout-antes');
  const despacho = despachoEnMemoria(sim);
  await assert.rejects(despacho.correr(), ArcaPasajeroError);
  const r = await despacho.correr();
  assert.equal(r.numero, 1);
  assert.equal(sim.cantidadDeCae(), 1);
});

for (const falla of ['caido', 'sin-red', 'respuesta-cortada', 'timeout-antes'] as const) {
  test(`contrato · FECompConsultar ${falla}: pasajero; con la respuesta perdida no se pide otro CAE y el reintento adopta`, async () => {
    const sim = new SimuladorArca().fallarProximo('FECAESolicitar', 'timeout-despues');
    const despacho = despachoEnMemoria(sim);
    await assert.rejects(despacho.correr(), ArcaPasajeroError);
    sim.fallarProximo('FECompConsultar', falla);
    await assert.rejects(despacho.correr(), (e: unknown) => e instanceof ArcaPasajeroError && !(e instanceof ArcaRechazoError));
    assert.equal(sim.llamados.filter((m) => m === 'FECAESolicitar').length, 1);
    assert.equal((await despacho.correr()).numero, 1);
    assert.equal(sim.cantidadDeCae(), 1);
  });
}

for (const falla of [
  { error: 600, mensaje: 'ValidacionDeToken' },
  { error: 501, mensaje: 'Error interno de base de datos' },
  'timeout-antes',
  'respuesta-cortada',
  'sin-red',
] as const) {
  const nombre = typeof falla === 'string' ? falla : `<Errors> ${falla.error}`;
  test(`contrato · FECompUltimoAutorizado ${nombre}: pasajero, no se anota ni se pide el CAE`, async () => {
    const sim = new SimuladorArca().fallarProximo('FECompUltimoAutorizado', falla);
    const despacho = despachoEnMemoria(sim);
    await assert.rejects(despacho.correr(), (e: unknown) => e instanceof ArcaPasajeroError && !(e instanceof ArcaRechazoError));
    assert.equal(sim.llamados.includes('FECAESolicitar'), false);
    assert.equal(despacho.intento(), undefined);
    assert.equal(sim.cantidadDeCae(), 0);
  });
}
