// «Obtené asistencia»: la red (estudios con consola del contador), la elección, el estado (la última
// fila manda + lo cargado) y los mensajes sin datos fiscales sensibles.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCIONES_CONTADOR,
  ANTES_DE_EMPEZAR,
  BASE_LEGAL_A_VALIDAR,
  TEXTO_CERTIFICADO_PROPIO,
  avisoAlEstudio,
  certificadoProbado,
  contadoresDeLaRed,
  elegirContador,
  finDelCuit,
  linkWhatsapp,
  mensajeASoporte,
  pedidoAlContador,
  textoDelPedidoAlContador,
  type FilaContador,
} from "./contador-arca";

const NEGOCIOS = [
  { id: "propio", name: "Mi kiosco", modules: ["cartera", "arca"] },
  { id: "e2", name: "Zeta Contadores", modules: ["cartera"] },
  { id: "e1", name: "Álvarez & Asoc.", modules: ["cartera"], status: "ACTIVE" },
  { id: "s", name: "Suspendido SA", modules: ["cartera"], status: "SUSPENDED" },
  { id: "n", name: "Peluquería", modules: ["agenda"] },
];
const SIN_AVANCE = {
  pedidoPendiente: false,
  certificado: "ninguno" as const,
  certificadoDesde: null as string | null,
  pruebaOkEn: null as string | null,
};
const CARGADO = "2026-11-05T13:00:00.000Z";
const fila = (action: string, changes: unknown = { estudioTenantId: "e1", estudioNombre: "Álvarez & Asoc." }): FilaContador => ({
  action,
  createdAt: "2026-11-05T12:00:00.000Z",
  changes,
});

test("red: sólo estudios con consola (módulo cartera), sin el propio ni suspendidos, por nombre; sin datos → vacía", () => {
  assert.deepEqual(
    contadoresDeLaRed(NEGOCIOS, "propio").map((c) => c.tenantId),
    ["e1", "e2"],
  );
  assert.deepEqual(contadoresDeLaRed([], "propio"), []);
});

test("elegir: sólo un id de la red leída; un nombre u otro negocio no vale", () => {
  const red = contadoresDeLaRed(NEGOCIOS, "propio");
  assert.equal(elegirContador(red, "e2")?.nombre, "Zeta Contadores");
  assert.equal(elegirContador(red, "Zeta Contadores"), null);
  assert.equal(elegirContador(red, "n"), null);
  assert.equal(elegirContador(red, "propio"), null);
  assert.equal(elegirContador(red, null), null);
});

test("estado: sin fila o cancelado → sin pedido; la fila sin estudio no cuenta", () => {
  assert.equal(pedidoAlContador(null, SIN_AVANCE), null);
  assert.equal(pedidoAlContador(fila(ACCIONES_CONTADOR.cancelado), SIN_AVANCE), null);
  assert.equal(pedidoAlContador(fila(ACCIONES_CONTADOR.pedido, {}), SIN_AVANCE), null);
  assert.equal(pedidoAlContador(fila("otra.accion"), SIN_AVANCE), null);
  assert.equal(pedidoAlContador(fila(ACCIONES_CONTADOR.pedido, { estudioTenantId: "e9" }), SIN_AVANCE)?.estudioNombre, "Tu contador");
});

test("estado: pedido → en curso (pedido de certificado o certificado sin prueba) → listo (certificado + Probar en verde)", () => {
  const p = fila(ACCIONES_CONTADOR.pedido);
  assert.equal(pedidoAlContador(p, SIN_AVANCE)?.estado, "pedido");
  assert.equal(pedidoAlContador(p, { ...SIN_AVANCE, pedidoPendiente: true })?.estado, "en-curso");
  const cargado = { ...SIN_AVANCE, certificado: "produccion" as const, certificadoDesde: CARGADO };
  assert.equal(pedidoAlContador(p, cargado)?.estado, "en-curso");
  assert.equal(pedidoAlContador(p, { ...cargado, pruebaOkEn: "2026-11-05T14:00:00.000Z" })?.estado, "listo");
  // Una prueba verde ANTERIOR a cargar el certificado (la del viejo) no cuenta.
  assert.equal(pedidoAlContador(p, { ...cargado, pruebaOkEn: "2026-11-05T12:30:00.000Z" })?.estado, "en-curso");
  assert.equal(certificadoProbado({ ...cargado, certificado: "con-problema", pruebaOkEn: "2026-11-06T00:00:00.000Z" }), false);
});

test("textos: GSG no entra a tu ARCA, la clave queda con vos, nivel 3 avisado antes; base legal sólo «a validar»", () => {
  assert.match(TEXTO_CERTIFICADO_PROPIO, /no entra a tu ARCA/);
  assert.match(TEXTO_CERTIFICADO_PROPIO, /queda con vos/);
  assert.match(ANTES_DE_EMPEZAR, /nivel 3/);
  assert.match(BASE_LEGAL_A_VALIDAR, /a validar/);
  const p = pedidoAlContador(fila(ACCIONES_CONTADOR.pedido), SIN_AVANCE)!;
  assert.match(textoDelPedidoAlContador(p), /Álvarez/);
  assert.match(textoDelPedidoAlContador(p), /GSG no entra a tu ARCA/);
});

test("mensajes al estudio y a soporte: sin CUIT completo ni clave", () => {
  for (const m of [
    avisoAlEstudio({ negocio: "Mi kiosco", cuit: "20-12345678-6" }),
    mensajeASoporte({ negocio: "Mi kiosco", cuit: "20123456786", paso: "Pedido de certificado" }),
  ]) {
    assert.doesNotMatch(m, /20123456786|12345678/);
    assert.match(m, /terminado en 786/);
    assert.doesNotMatch(m, /BEGIN|contraseña/i);
  }
  assert.match(mensajeASoporte({ negocio: "", cuit: null, paso: "x" }), /lo hago yo/);
  assert.equal(finDelCuit("123"), null);
});

test("wa.me: con número usable; sin número (WHATSAPP_GSG faltante) → null, la pantalla no rompe", () => {
  assert.equal(linkWhatsapp("11 6677-8890", "hola"), "https://wa.me/5491166778890?text=hola");
  assert.equal(linkWhatsapp(undefined, "hola"), null);
  assert.equal(linkWhatsapp("", "hola"), null);
  assert.equal(linkWhatsapp("123", "hola"), null);
});
