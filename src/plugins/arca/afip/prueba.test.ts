// Tests del banco de pruebas ARCA: armado del comprobante de prueba + mapeo de
// resultado (éxito / rechazo / error). Sin red ni certificado (usa StubAfipClient
// y un cliente falso para forzar los caminos de error).
import test from 'node:test';
import assert from 'node:assert/strict';
import { comprobanteDePrueba, emitirFacturaDePrueba, fechaDePrueba } from './prueba';
import { StubAfipClient } from './stub';
import { ArcaRechazoError, type AfipClient, type ResultadoCae } from './port';
import type { ComprobanteArca } from '../domain/comprobante';
import { validarComprobante } from '../domain/validacion';

test('fechaDePrueba: formatea AAAAMMDD desde un reloj inyectado', () => {
  assert.equal(fechaDePrueba(new Date(2026, 6, 7)), '20260707');
});

test('comprobanteDePrueba: pasa la validación local (Factura C, consumidor final)', () => {
  const comp = comprobanteDePrueba({ ahora: new Date(2026, 6, 7) });
  const r = validarComprobante(comp);
  assert.deepEqual(r.errores, []);
  assert.equal(r.ok, true);
  assert.equal(comp.fecha, '20260707');
  assert.equal(comp.puntoVenta, 1);
});

test('comprobanteDePrueba: respeta overrides de puntoVenta y monto', () => {
  const comp = comprobanteDePrueba({ puntoVenta: 3, monto: 250 });
  assert.equal(comp.puntoVenta, 3);
  assert.equal(comp.total, 250);
  assert.equal(comp.neto, 250);
});

test('emitirFacturaDePrueba: con StubAfipClient devuelve CAE simulado', async () => {
  const client = new StubAfipClient({ cuit: 20111111112, homologacion: true });
  const r = await emitirFacturaDePrueba(client, { ahora: new Date(2026, 6, 7) });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(r.cae.startsWith('STUB'));
    assert.equal(r.numero, 1);
    assert.equal(r.puntoVenta, 1);
  }
});

test('emitirFacturaDePrueba: mapea ArcaRechazoError a motivo "rechazo"', async () => {
  const clienteQueRechaza: AfipClient = {
    async ultimoAutorizado() {
      return 0;
    },
    async solicitarCae(): Promise<ResultadoCae> {
      throw new ArcaRechazoError('rechazado', [{ codigo: 10016, mensaje: 'numeración' }]);
    },
  };
  const r = await emitirFacturaDePrueba(clienteQueRechaza);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.motivo, 'rechazo');
    if (r.motivo === 'rechazo') {
      assert.equal(r.observaciones[0].codigo, 10016);
    }
  }
});

test('emitirFacturaDePrueba: mapea un error genérico (red/parseo) a motivo "error"', async () => {
  const clienteQueFalla: AfipClient = {
    async ultimoAutorizado() {
      return 0;
    },
    async solicitarCae(_comp: ComprobanteArca) {
      throw new Error('timeout de red');
    },
  };
  const r = await emitirFacturaDePrueba(clienteQueFalla);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.motivo, 'error');
    if (r.motivo === 'error') {
      assert.equal(r.mensaje, 'timeout de red');
    }
  }
});
