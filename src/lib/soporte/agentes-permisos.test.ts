// Permisos de los agentes de mantenimiento: todas las acciones × niveles, CH y fail-closed. PURO.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCIONES_DE_AGENTE,
  ACCIONES_DEL_DUENIO,
  ETIQUETAS_MANT,
  NIVELES_DE_AGENTE,
  SLUG_CH,
  quienApruebaElBorrador,
  decidirAccionDeAgente,
  etiquetaDeDecision,
  type Decision,
} from "./agentes-permisos";

const N1 = ["leer_ticket", "leer_base_conocimiento", "borrador_respuesta"];
const N2 = [...N1, "nota_interna", "cambiar_estado", "cambiar_config_no_sensible"];
const N3 = [...N1, "abrir_issue", "abrir_pr"];
const ESPERADO: Record<string, string[]> = { n1: N1, n2: N2, n3: N3 };
const DUENIO = ["arca", "plata", "precio", "caja", "secreto", "contrasena", "permisos", "marca", "migracion", "deploy", "borrar"];

test("la lista de acciones es exactamente la del brief", () => {
  assert.deepEqual([...ACCIONES_DEL_DUENIO].sort(), [...DUENIO].sort());
  assert.deepEqual([...ACCIONES_DE_AGENTE].sort(), [...new Set([...N2, ...N3, ...DUENIO])].sort());
  assert.deepEqual(ETIQUETAS_MANT, { n1: "mant:n1", n2: "mant:n2", n3: "mant:n3", duenio: "mant:duenio" });
});

test("todas las acciones × todos los niveles, en un negocio cualquiera", () => {
  for (const nivel of NIVELES_DE_AGENTE) {
    for (const accion of ACCIONES_DE_AGENTE) {
      const esperado: Decision = DUENIO.includes(accion) ? "escala_duenio" : ESPERADO[nivel].includes(accion) ? "permitido" : "prohibido";
      const r = decidirAccionDeAgente(nivel, accion, "kiosco-b");
      assert.equal(r.decision, esperado, `${nivel} ${accion}`);
      assert.ok(r.motivo.length > 0);
    }
  }
});

test("CH (beauty-spa, D5): el n1 sólo lee y redacta un borrador para el dueño; todo lo demás escala, en todo nivel", () => {
  const N1_EN_CH = ["leer_ticket", "leer_base_conocimiento", "borrador_respuesta"];
  for (const slug of [SLUG_CH, " Beauty-Spa ", "BEAUTY-SPA"]) {
    for (const nivel of NIVELES_DE_AGENTE) {
      for (const accion of ACCIONES_DE_AGENTE) {
        const esperado = nivel === "n1" && N1_EN_CH.includes(accion) ? "borrador_al_duenio" : "escala_duenio";
        assert.equal(decidirAccionDeAgente(nivel, accion, slug).decision, esperado, `${slug} ${nivel} ${accion}`);
      }
    }
  }
  // n2 y n3 heredan las acciones del n1, pero en CH nunca: D5 «N2 y N3 nunca».
  assert.equal(decidirAccionDeAgente("n2", "borrador_respuesta", SLUG_CH).decision, "escala_duenio");
  assert.equal(decidirAccionDeAgente("n3", "leer_ticket", SLUG_CH).decision, "escala_duenio");
  assert.equal(decidirAccionDeAgente("n1", "cambiar_estado", SLUG_CH).decision, "escala_duenio");
  assert.equal(etiquetaDeDecision("n1", "borrador_al_duenio"), "mant:duenio");
  assert.equal(quienApruebaElBorrador(SLUG_CH), "duenio");
  assert.equal(quienApruebaElBorrador("beauty_spa"), "duenio");
  assert.equal(quienApruebaElBorrador(null), "duenio", "sin negocio: el dueño (puede ser CH)");
  assert.equal(quienApruebaElBorrador("magra"), "persona_gsg");
  assert.equal(decidirAccionDeAgente("n1", "leer_ticket", "beauty-spa-2").decision, "permitido", "otro slug parecido no es CH");
});

test("fail-closed: acción o nivel desconocidos → prohibido (también en CH)", () => {
  for (const accion of ["", "  ", "ejecutar_sql", "LEER_TICKET_TODO", "abrir_pr ", null, undefined, 3, {}, "leer-ticket"]) {
    for (const nivel of NIVELES_DE_AGENTE) {
      const r = decidirAccionDeAgente(nivel, accion, "kiosco");
      // «abrir_pr » con espacio al final se normaliza y es conocida.
      if (accion === "abrir_pr ") continue;
      assert.equal(r.decision, "prohibido", `${nivel} ${String(accion)}`);
      assert.equal(decidirAccionDeAgente(nivel, accion, SLUG_CH).decision, "prohibido");
    }
  }
  for (const nivel of ["n0", "n4", "N1", "", null, "duenio"]) {
    assert.equal(decidirAccionDeAgente(nivel, "leer_ticket", "kiosco").decision, "prohibido", String(nivel));
  }
});

test("mayúsculas, tildes y espacios no esquivan la regla", () => {
  assert.equal(decidirAccionDeAgente("n3", "Contraseña", "k").decision, "escala_duenio");
  assert.equal(decidirAccionDeAgente("n2", "MIGRACIÓN", "k").decision, "escala_duenio");
  assert.equal(decidirAccionDeAgente("n2", " Cambiar_Estado ", "k").decision, "permitido");
  assert.equal(decidirAccionDeAgente("n1", "Cambiar_Estado", "k").decision, "prohibido");
  assert.equal(decidirAccionDeAgente("n3", "abrir_pr ", "k").decision, "permitido");
});

test("sin negocio (null, vacío, espacios): escala al dueño (fail-closed: no se sabe si es CH)", () => {
  for (const slug of [null, undefined, "", "   ", "\t"]) {
    assert.equal(decidirAccionDeAgente("n1", "leer_ticket", slug).decision, "escala_duenio", JSON.stringify(slug));
    assert.equal(decidirAccionDeAgente("n2", "nota_interna", slug).decision, "escala_duenio", JSON.stringify(slug));
    assert.equal(decidirAccionDeAgente("n3", "deploy", slug).decision, "escala_duenio", JSON.stringify(slug));
  }
  // Acción o nivel desconocidos siguen prohibidos aunque falte el negocio.
  assert.equal(decidirAccionDeAgente("n1", "ejecutar_sql", null).decision, "prohibido");
  assert.equal(decidirAccionDeAgente("n9", "leer_ticket", null).decision, "prohibido");
});

test("variantes del slug de CH (guion bajo, espacio, otro guion, invisibles) son CH igual", () => {
  for (const slug of ["beauty_spa", "beauty spa", "beauty\u2010spa", "beauty-spa\u200b", "beautyspa", "BEAUTY–SPA", "Beauty-Spa\n"]) {
    assert.equal(decidirAccionDeAgente("n1", "leer_ticket", slug).decision, "borrador_al_duenio", JSON.stringify(slug));
    assert.equal(decidirAccionDeAgente("n2", "nota_interna", slug).decision, "escala_duenio", JSON.stringify(slug));
  }
});

test("etiqueta de la decisión", () => {
  assert.equal(etiquetaDeDecision("n2", "permitido"), "mant:n2");
  assert.equal(etiquetaDeDecision("n1", "prohibido"), "mant:n1");
  for (const n of NIVELES_DE_AGENTE) assert.equal(etiquetaDeDecision(n, "escala_duenio"), "mant:duenio");
});

test("slug que se reduce a nada («-», invisibles): escala al dueño (no se sabe si es CH)", () => {
  for (const s of ["-", "\u200b", "_ -", "‐"]) {
    assert.equal(decidirAccionDeAgente("n1", "leer_ticket", s).decision, "escala_duenio", JSON.stringify(s));
  }
});
