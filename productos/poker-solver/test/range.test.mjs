import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRange, pesoTotal, comboIndex } from '../src/range.mjs';
import { parseCards, cardToString } from '../src/cards.mjs';

const n = (texto, muertas = []) => parseRange(texto, muertas).combos.length;

test('cuenta de combos de las formas básicas', () => {
  assert.equal(n('AA'), 6, 'un par son 6 combos');
  assert.equal(n('AKs'), 4, 'suited son 4');
  assert.equal(n('AKo'), 12, 'offsuit son 12');
  assert.equal(n('AK'), 16, 'sin sufijo son los 16');
  assert.equal(n('AsKh'), 1, 'un combo explícito es 1');
});

test('el "+" abre hacia arriba y respeta el eje', () => {
  assert.equal(n('QQ+'), 18, 'QQ+ = QQ KK AA');
  assert.equal(n('A2s+'), 48, 'A2s..AKs = 12 manos x 4');
  assert.equal(n('KTs+'), 12, 'KTs KJs KQs');
});

test('los rangos con guion recorren pares, misma alta y mismo gap', () => {
  assert.equal(n('99-QQ'), 24, '99 TT JJ QQ');
  assert.equal(n('A5s-A2s'), 16, 'A2s A3s A4s A5s');
  assert.equal(n('T9s-76s'), 16, 'T9s 98s 87s 76s');
  assert.throws(() => parseRange('T9s-76o'), /mezcla/);
});

test('el rango total no se pisa a sí mismo y suma bien', () => {
  const r = parseRange('AA, AKs, AKo');
  assert.equal(r.combos.length, 22);
  assert.equal(pesoTotal(r), 22);
  // solapamiento: AK ya incluye AKs, no debe duplicar
  assert.equal(n('AK, AKs'), 16);
});

test('los pesos parciales entran y el último token pisa', () => {
  const r = parseRange('AA:0.5');
  assert.equal(r.combos.length, 6);
  assert.equal(pesoTotal(r), 3);
  const pisado = parseRange('AA, AA:0.25');
  assert.equal(pesoTotal(pisado), 1.5, 'el segundo token debe pisar el peso');
  assert.equal(pesoTotal(parseRange('QQ:50%')), 3, 'acepta porcentaje');
  assert.throws(() => parseRange('AA:2'), /peso inválido/);
});

test('las cartas muertas del board sacan combos del rango (card removal)', () => {
  const board = parseCards('AsKd7h');
  // AA pierde los 3 combos que usan As
  assert.equal(n('AA', board), 3);
  // AKs pierde AsKs (As muerto) y AdKd (Kd muerto) → quedan 2
  assert.equal(n('AKs', board), 2);
  assert.equal(n('QQ', board), 6, 'las reinas no están bloqueadas');
});

test('el índice de combo es canónico e inyectivo', () => {
  const [a, b] = parseCards('AsKh');
  assert.equal(comboIndex(a, b), comboIndex(b, a));
  const vistos = new Set();
  for (let x = 0; x < 52; x++) {
    for (let y = x + 1; y < 52; y++) vistos.add(comboIndex(x, y));
  }
  assert.equal(vistos.size, 1326, 'las 1326 combinaciones deben tener índice único');
  assert.equal(Math.max(...vistos), 1325);
});

test('un rango amplio realista se parsea completo', () => {
  const r = parseRange('22+, A2s+, A9o+, KTs+, KQo, QTs+, JTs, T9s, 98s');
  assert.ok(r.combos.length > 200, `esperaba un rango ancho, dio ${r.combos.length}`);
  assert.ok(r.combos.every(([a, b]) => a !== b), 'ningún combo repite naipe');
  const claves = new Set(r.combos.map(([a, b]) => cardToString(a) + cardToString(b)));
  assert.equal(claves.size, r.combos.length, 'no puede haber combos duplicados');
});
