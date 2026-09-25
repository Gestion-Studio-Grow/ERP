// ENG-021 · Qué respuesta de ARCA es un rechazo del comprobante y cuál es un error pasajero.
// Un rechazo deja la factura rechazada; un error pasajero la deja pendiente y se reintenta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODIGOS_PASAJEROS_ARCA, esErrorPasajero } from './errores-arca';

const obs = (...codigos: number[]) => codigos.map((codigo) => ({ codigo, mensaje: `código ${codigo}` }));

for (const codigo of [500, 501, 502]) {
  test(`el error ${codigo} (falla interna de ARCA) es pasajero: no es culpa del comprobante`, () => {
    assert.equal(esErrorPasajero(obs(codigo)), true);
  });
}

test('el error 600 (token inválido) es pasajero: se arregla volviendo a autenticar, no rechaza la venta', () => {
  assert.equal(esErrorPasajero(obs(600)), true);
});

test('el error 601 (CUIT que el token no representa) es pasajero: es la credencial, no el comprobante', () => {
  assert.equal(esErrorPasajero(obs(601)), true);
});

test('el 10016 (el número no es el próximo a autorizar) es pasajero: otro envío tomó el número', () => {
  assert.equal(esErrorPasajero(obs(10016)), true);
});

test('una observación del comprobante (10015, ImpTotal no cierra) es un rechazo definitivo', () => {
  assert.equal(esErrorPasajero(obs(10015)), false);
});

test('un código que la tabla no conoce se toma como rechazo (ARCA evaluó el comprobante)', () => {
  assert.equal(esErrorPasajero(obs(10246)), false);
});

test('si ARCA mezcla un defecto del comprobante con un 10016, es rechazo: reintentar no lo arregla', () => {
  assert.equal(esErrorPasajero(obs(10015, 10016)), false);
});

test('sin ningún código no hay de dónde decir que es pasajero: rechazo', () => {
  assert.equal(esErrorPasajero([]), false);
});

test('cada código pasajero dice por qué, en castellano', () => {
  for (const [codigo, motivo] of CODIGOS_PASAJEROS_ARCA) {
    assert.ok(motivo.length > 10, `el código ${codigo} necesita un motivo`);
  }
});
