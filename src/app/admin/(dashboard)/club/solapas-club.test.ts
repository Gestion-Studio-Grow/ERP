import { test } from "node:test";
import assert from "node:assert/strict";
import { PIEZAS_GLOBALES_DEL_CLUB, SOLAPAS_DEL_CLUB } from "./solapas-club";

// Las solapas de fábrica de ClubDemo.tsx: una solapa nueva no puede pisar su id. «tienda» está reservada: la suma
// de fábrica la sesión de terminales.
const DE_FABRICA = ["agenda", "fijos", "canchas", "buffet", "caja", "tienda"];

test("las solapas que suma el club tienen id único, apto para el DOM y sin pisar las de fábrica", () => {
  const ids = SOLAPAS_DEL_CLUB.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "ids repetidos");
  for (const s of SOLAPAS_DEL_CLUB) {
    assert.match(s.id, /^[a-z][a-z0-9-]*$/, `id «${s.id}»: minúsculas, dígitos y guiones`);
    assert.ok(!DE_FABRICA.includes(s.id), `«${s.id}» ya es una solapa de fábrica`);
    assert.ok(s.etiqueta.trim().length > 0, `«${s.id}» sin etiqueta`);
    assert.equal(typeof s.cargar, "function");
  }
});

test("Clientes para todos; el Tablero sólo para los dueños", () => {
  const por = Object.fromEntries(SOLAPAS_DEL_CLUB.map((s) => [s.id, s]));
  assert.equal(por.clientes?.soloDuenos ?? false, false);
  assert.equal(por.tablero?.soloDuenos, true);
});

test("Proveedores para todos (recepción carga remitos); Stock sólo para los dueños, con el id al que lleva la bandeja", () => {
  const por = Object.fromEntries(SOLAPAS_DEL_CLUB.map((s) => [s.id, s]));
  assert.equal(por.proveedores?.etiqueta, "Proveedores");
  assert.equal(por.proveedores?.soloDuenos, true, "recepción carga el remito desde la Caja");
  assert.equal(por.stock?.etiqueta, "Stock");
  assert.equal(por.stock?.soloDuenos, true);
});

test("las piezas globales tienen id único y apto para el DOM, y cada una baja en su chunk (`cargar`)", () => {
  const ids = PIEZAS_GLOBALES_DEL_CLUB.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "ids repetidos");
  for (const p of PIEZAS_GLOBALES_DEL_CLUB) {
    assert.match(p.id, /^[a-z][a-z0-9-]*$/, `id «${p.id}»: minúsculas, dígitos y guiones`);
    assert.equal(typeof p.cargar, "function");
  }
});

test("el aviso del dueño está montado como pieza global", () => {
  assert.ok(PIEZAS_GLOBALES_DEL_CLUB.some((p) => p.id === "aviso-del-duenio"));
});
