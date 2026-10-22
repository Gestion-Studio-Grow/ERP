// Motor de facturación · interruptor por servicio de ARCA (circuit breaker), con reloj inyectado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InterruptorArca, servicioDeUrl } from './interruptor';
import { FetchSoapTransport } from './soap';
import { ArcaNoDisponibleError, ArcaPasajeroError } from './port';
import { SimuladorArca } from './simulador';

function reloj(inicio = 1_000_000) {
  let t = inicio;
  return { ahora: () => t, avanzar: (ms: number) => (t += ms) };
}

const WSFE = 'wswhomo.afip.gov.ar';

test('se abre con 3 caídas seguidas y no deja pasar nada durante el enfriamiento', () => {
  const r = reloj();
  const i = new InterruptorArca({ ahora: r.ahora });
  i.registrarCaida(WSFE);
  i.registrarCaida(WSFE);
  assert.equal(i.estado(WSFE), 'cerrado');
  i.registrarCaida(WSFE);
  assert.equal(i.estado(WSFE), 'abierto');
  assert.equal(i.permitir(WSFE), false);
  assert.equal(i.reabreEn(WSFE)?.getTime(), r.ahora() + 2 * 60_000);
});

test('un éxito en el medio olvida las caídas: no se abre por fallas sueltas', () => {
  const i = new InterruptorArca({ ahora: reloj().ahora });
  i.registrarCaida(WSFE);
  i.registrarCaida(WSFE);
  i.registrarExito(WSFE);
  i.registrarCaida(WSFE);
  i.registrarCaida(WSFE);
  assert.equal(i.estado(WSFE), 'cerrado');
});

test('medio abierto: deja UNA prueba; si cae, reabre con el doble; si contesta, se cierra', () => {
  const r = reloj();
  const i = new InterruptorArca({ ahora: r.ahora, umbral: 1, enfriamientoMs: 1000, enfriamientoTopeMs: 3000 });
  i.registrarCaida(WSFE);
  r.avanzar(1000);
  assert.equal(i.estado(WSFE), 'medio_abierto');
  assert.equal(i.permitir(WSFE), true, 'la primera prueba pasa');
  assert.equal(i.permitir(WSFE), false, 'la segunda espera el resultado de la primera');
  i.registrarCaida(WSFE);
  assert.equal(i.reabreEn(WSFE)?.getTime(), r.ahora() + 2000);
  r.avanzar(2000);
  assert.equal(i.permitir(WSFE), true);
  i.registrarCaida(WSFE);
  assert.equal(i.reabreEn(WSFE)?.getTime(), r.ahora() + 3000, 'tope del enfriamiento');
  r.avanzar(3000);
  assert.equal(i.permitir(WSFE), true);
  i.registrarExito(WSFE);
  assert.equal(i.estado(WSFE), 'cerrado');
});

test('cada servicio tiene su interruptor: WSAA caído no corta WSFEv1', () => {
  const i = new InterruptorArca({ ahora: reloj().ahora, umbral: 1 });
  i.registrarCaida('wsaahomo.afip.gov.ar');
  assert.equal(i.permitir('wsaahomo.afip.gov.ar'), false);
  assert.equal(i.permitir(WSFE), true);
  assert.equal(servicioDeUrl('https://wswhomo.afip.gov.ar/wsfev1/service.asmx'), WSFE);
});

test('transporte real + simulador: ARCA caído 3 veces abre el interruptor y el 4.º pedido ni sale', async () => {
  const sim = new SimuladorArca();
  for (let k = 0; k < 3; k++) sim.fallarProximo('FECompUltimoAutorizado', 'caido');
  const i = new InterruptorArca({ ahora: reloj().ahora });
  const t = new FetchSoapTransport({ fetch: sim.fetch, interruptor: i, timeoutMs: 50 });
  const url = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';
  for (let k = 0; k < 3; k++) {
    await assert.rejects(t.post(url, 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado', '<x/>'), (e: unknown) => {
      assert.ok(e instanceof ArcaPasajeroError && !(e instanceof ArcaNoDisponibleError));
      assert.equal((e as ArcaPasajeroError).servicioCaido, WSFE);
      return true;
    });
  }
  const llamadosAntes = sim.llamados.length;
  await assert.rejects(t.post(url, 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado', '<x/>'), ArcaNoDisponibleError);
  assert.equal(sim.llamados.length, llamadosAntes, 'con el interruptor abierto no se le manda nada a ARCA');
});

test('un error con respuesta de ARCA (600, 10016) NO cuenta como caída del servicio', async () => {
  const sim = new SimuladorArca();
  const i = new InterruptorArca({ ahora: reloj().ahora, umbral: 1 });
  const t = new FetchSoapTransport({ fetch: sim.fetch, interruptor: i });
  // Sin token vigente el simulador contesta 600 con HTTP 200: ARCA contestó.
  await t.post(
    'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
    '<ar:Token>x</ar:Token><ar:PtoVta>1</ar:PtoVta><ar:CbteTipo>11</ar:CbteTipo>',
  );
  assert.equal(i.estado(WSFE), 'cerrado');
});
