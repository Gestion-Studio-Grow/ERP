// «Abrí la caja» desde Vender (Magra, tanda 2 · 2D; MG-057): qué dice la tarjeta y cómo viaja el fondo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cuandoFueElCierre, esperadoVistoAlAbrir, fondoParaElFormulario, tarjetaDeApertura } from "./apertura-sugerida";
import { leerImporte } from "@/lib/pos-peso";

test("la tarjeta dice cuánto quedó y cuándo: ayer, el día de la semana o la fecha", () => {
  const t = tarjetaDeApertura({ esperado: 48000, ultimoCierre: "2026-10-21", hoy: "2026-10-22" });
  assert.match(t.titulo, /^Abrí la caja: ayer quedaron \$\s?48\.000 en el cajón$/);
  assert.deepEqual([t.conSugerido, t.sugerido], [true, 48000]);
  assert.equal(cuandoFueElCierre("2026-10-17", "2026-10-22"), "el sábado");
  assert.equal(cuandoFueElCierre("2026-10-01", "2026-10-22"), "el 01/10");
  assert.match(tarjetaDeApertura({ esperado: 12500, ultimoCierre: null, hoy: "2026-10-22" }).titulo, /según el libro hay \$\s?12\.500/);
  assert.equal(tarjetaDeApertura({ esperado: 0, ultimoCierre: null, hoy: "2026-10-22" }).titulo, "Abrí la caja: contá lo que hay en el cajón");
});

test("con el libro en rojo no se sugiere un fondo: se cuenta", () => {
  const t = tarjetaDeApertura({ esperado: -1500, ultimoCierre: "2026-10-21", hoy: "2026-10-22" });
  assert.equal(t.conSugerido, false);
  assert.match(t.titulo, /en rojo/);
});

test("el fondo viaja como lo lee el servidor (`leerImporte`: la coma es el decimal)", () => {
  for (const n of [48000, 48000.5, 0, 1234.56]) {
    const l = leerImporte(fondoParaElFormulario(n));
    assert.equal(l.estado, "ok");
    assert.equal(l.estado === "ok" ? l.valor : NaN, n);
  }
});

test("cert F6 · a ciegas la pantalla Caja no manda esperado hasta que el servidor lo reveló", () => {
  assert.equal(esperadoVistoAlAbrir({ aCiegas: true, esperado: null, revelado: null }), null);
  assert.equal(esperadoVistoAlAbrir({ aCiegas: true, esperado: 12_000, revelado: null }), null, "a ciegas, aunque llegue un número, no se manda");
  assert.equal(esperadoVistoAlAbrir({ aCiegas: true, esperado: null, revelado: 12_000 }), 12_000);
  assert.equal(esperadoVistoAlAbrir({ aCiegas: false, esperado: 12_000, revelado: null }), 12_000);
  assert.equal(esperadoVistoAlAbrir({ aCiegas: false, esperado: null, revelado: null }), 0, "la demo, sin libro");
});
