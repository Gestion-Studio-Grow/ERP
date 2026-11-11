/** Tests de la guía en ARCA: subpasos, progreso, ayuda por WhatsApp y rechazos en criollo. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALIAS_ARCA,
  SUBPASOS_ARCA,
  TOTAL_SUBPASOS,
  URL_LOGIN_ARCA,
  botonesEnTexto,
  diagnosticarArca,
  mensajeDeAyuda,
  mensajeDeAyudaArca,
  errorParaAyuda,
  TEXTO_BOTON_AYUDA,
  NUNCA_TE_PEDIMOS_LA_CLAVE,
  primeroSinTildar,
  progresoGuia,
  resultadoAlSubir,
  subpaso,
  tildadosValidos,
} from "./guia-arca";
import { INSTRUCCIONES_DEL_PEDIDO, errorDeCargaEnCriollo } from "./asistente-arca";
import { queHacer } from "./verificar-con-arca";

test("cinco subpasos numerados, cada uno con el botón exacto que va a ver", () => {
  assert.equal(TOTAL_SUBPASOS, 5);
  SUBPASOS_ARCA.forEach((s, i) => {
    assert.equal(s.numero, i + 1);
    assert.ok(s.botones.length > 0, `el subpaso ${s.numero} dice qué botón tocar`);
    for (const b of s.botones) assert.ok(s.texto.includes(`«${b}»`), `«${b}» figura en el texto del subpaso ${s.numero}`);
  });
  assert.match(subpaso(4).texto, /Administrador de Relaciones de Clave Fiscal/);
  assert.match(subpaso(4).texto, /Facturación Electrónica/);
  assert.equal(subpaso(2).conAlias, true);
  assert.match(subpaso(2).texto, new RegExp(ALIAS_ARCA));
  assert.equal(botonesEnTexto(["Ver", "Descargar"]), "«Ver» → «Descargar»");
});

test("el login es el oficial de ARCA, por https", () => {
  const u = new URL(URL_LOGIN_ARCA);
  assert.equal(u.protocol, "https:");
  assert.equal(u.hostname, "auth.afip.gob.ar");
  assert.equal(ALIAS_ARCA, "gsg-erp");
});

test("progreso «Paso 2 de 5», acotado", () => {
  assert.equal(progresoGuia(2), "Paso 2 de 5");
  assert.equal(progresoGuia(0), "Paso 1 de 5");
  assert.equal(progresoGuia(9), "Paso 5 de 5");
  assert.equal(subpaso(99).numero, 5);
});

test("tildes: el primero sin tildar y lo recordado se limpia", () => {
  assert.equal(primeroSinTildar([]), 1);
  assert.equal(primeroSinTildar([1, 2]), 3);
  assert.equal(primeroSinTildar([1, 3]), 2);
  assert.equal(primeroSinTildar([1, 2, 3, 4, 5]), null);
  assert.deepEqual(tildadosValidos([3, 1, 1, 7, "2", 2.5, 0]), [1, 3]);
  assert.deepEqual(tildadosValidos("basura"), []);
});

test("ayuda por WhatsApp: dice dónde está y el error; nunca el CUIT completo ni la clave", () => {
  const m = mensajeDeAyudaArca(4, { cuit: "20111111112" });
  assert.match(m, /paso 4 de 5/);
  assert.match(m, /Asocialo a Facturación Electrónica/);
  assert.match(m, /termina en 112/);
  assert.doesNotMatch(m, /20-?11111111-?2/);
  assert.doesNotMatch(m, /error/);
  assert.doesNotMatch(m, /contraseña|clave fiscal:/i);
  assert.doesNotMatch(mensajeDeAyudaArca(1), /CUIT/);
  const conError = mensajeDeAyuda({
    donde: "Paso 3 de 4 · Certificado de ARCA",
    error: "Falló la conexión: (ARCA: 600: ValidacionDeToken: CUIT 20-11111111-2 y 20111111112) -----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----",
    cuit: "20-11111111-2",
  });
  assert.match(conError, /Estoy en: Paso 3 de 4/);
  assert.match(conError, /Me salió este error: Falló la conexión/);
  assert.doesNotMatch(conError, /11111111/);
  assert.doesNotMatch(conError, /abc|BEGIN/);
  assert.ok(errorParaAyuda("x".repeat(900)).length <= 300);
  assert.equal(TEXTO_BOTON_AYUDA, "Te ayudamos en 10 minutos");
  assert.equal(NUNCA_TE_PEDIMOS_LA_CLAVE, "Nunca te vamos a pedir tu clave fiscal");
});

test("rechazos en criollo con qué hacer: los cuatro del alta", () => {
  const noAut = diagnosticarArca("ns1:coe.notAuthorized: Computador no autorizado a acceder al servicio");
  assert.equal(noAut?.id, "computador-no-autorizado");
  assert.equal(noAut?.subpaso, 4);
  assert.match(noAut!.hacer, /paso 4/);

  const pv = diagnosticarArca("10004: El punto de venta no se encuentra habilitado a usar el presente WS");
  assert.equal(pv?.id, "punto-de-venta-tipo");
  assert.match(pv!.que, /Comprobantes en línea/);
  assert.match(pv!.hacer, /Web Services/);

  assert.equal(diagnosticarArca("El certificado no corresponde al CUIT del negocio")?.id, "cuit-distinto");
  assert.equal(diagnosticarArca("Clave fiscal con nivel de seguridad insuficiente")?.id, "nivel-clave");
  assert.match(diagnosticarArca("nivel de seguridad de la clave")!.hacer, /Mi ARCA/);
  assert.equal(diagnosticarArca("algo raro"), null);
});

test("la verificación existente usa los textos en criollo", () => {
  const noAut = queHacer("ns1:coe.notAuthorized: Computador no autorizado a acceder al servicio");
  assert.match(noAut, /Computador no autorizado/);
  assert.match(noAut, /Administrador de Relaciones/);
  assert.match(queHacer("ptoVta no habilitado"), /Comprobantes en línea/);
  const e = Object.assign(new Error("El certificado no corresponde al CUIT"), { name: "CredencialCuitMismatchError" });
  assert.match(errorDeCargaEnCriollo(e), /otro CUIT/);
  assert.match(errorDeCargaEnCriollo(e), /Qué hacer/);
});

test("las instrucciones de producción salen de la guía (una sola fuente)", () => {
  assert.deepEqual(INSTRUCCIONES_DEL_PEDIDO.produccion.pasos, SUBPASOS_ARCA.map((s) => s.texto));
});

test("subir el .crt: guardado + verificación en el momento", () => {
  const guardado = { ok: true as const, mensaje: "Certificado guardado." };
  assert.deepEqual(resultadoAlSubir({ ok: false, motivo: "no" }, null), { ok: false, motivo: "no" });
  assert.deepEqual(resultadoAlSubir(guardado, null), guardado);
  const ok = resultadoAlSubir(guardado, { ok: true, mensaje: "ARCA reconoce el certificado." });
  assert.equal(ok.ok, true);
  assert.match(ok.ok ? ok.mensaje : "", /verificamos con ARCA/);
  const mal = resultadoAlSubir(guardado, { ok: false, motivo: "Falló la conexión: falta el paso 4." });
  assert.equal(mal.ok, false);
  assert.match(!mal.ok ? mal.motivo : "", /Guardamos tu certificado, pero/);
  assert.match(!mal.ok ? mal.motivo : "", /paso 4/);
});
