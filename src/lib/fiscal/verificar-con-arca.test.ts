import { test } from "node:test";
import assert from "node:assert/strict";
import { ArcaRechazoError, TipoComprobante, type AfipClient, type ComprobanteArca } from "@/plugins/arca";
import {
  comprobanteDeVerificacion,
  mensajeDeVerificacion,
  queHacer,
  textoDelError,
  tipoDeVerificacion,
  verificarConArca,
} from "./verificar-con-arca";

function cliente(opts: { ultimo?: number; falloUltimo?: unknown; falloCae?: unknown } = {}) {
  const emitidos: ComprobanteArca[] = [];
  const c: AfipClient = {
    async ultimoAutorizado() {
      if (opts.falloUltimo) throw opts.falloUltimo;
      return opts.ultimo ?? 7;
    },
    async solicitarCae(comp) {
      emitidos.push(comp);
      if (opts.falloCae) throw opts.falloCae;
      return { cae: "71234567890123", caeVencimiento: "20261115", numero: 8, puntoVenta: comp.puntoVenta, tipo: comp.tipo };
    },
    async consultarComprobante() {
      return null;
    },
  };
  return { c, emitidos };
}

test("letra de prueba: C para monotributo y exento, B para inscripto, nada si falta", () => {
  assert.equal(tipoDeVerificacion("MONOTRIBUTO"), TipoComprobante.FacturaC);
  assert.equal(tipoDeVerificacion("EXENTO"), TipoComprobante.FacturaC);
  assert.equal(tipoDeVerificacion("RESPONSABLE_INSCRIPTO"), TipoComprobante.FacturaB);
  assert.equal(tipoDeVerificacion(null), null);
  assert.equal(tipoDeVerificacion("CONSUMIDOR_FINAL"), null);
});

test("la B de prueba discrimina 21 % y cierra en 121", () => {
  const b = comprobanteDeVerificacion(TipoComprobante.FacturaB, 3, new Date(2026, 10, 5));
  assert.equal(b.total, 121);
  assert.equal(b.iva[0].importe, 21);
  assert.equal(b.fecha, "20261105");
  const c = comprobanteDeVerificacion(TipoComprobante.FacturaC, 3, new Date(2026, 10, 5));
  assert.equal(c.total, 100);
});

test("homologación: lee el último y emite UNA de prueba", async () => {
  const { c, emitidos } = cliente();
  const r = await verificarConArca({ entorno: "homologacion", puntoVenta: 2, condicionIva: "MONOTRIBUTO", cliente: c });
  assert.equal(r.ok, true);
  assert.equal(emitidos.length, 1);
  assert.equal(emitidos[0].puntoVenta, 2);
  assert.match(mensajeDeVerificacion(r), /CAE 71234567890123/);
});

test("producción: sólo lee, NUNCA emite", async () => {
  const { c, emitidos } = cliente({ ultimo: 0 });
  const r = await verificarConArca({ entorno: "produccion", puntoVenta: 5, condicionIva: "RESPONSABLE_INSCRIPTO", cliente: c });
  assert.equal(r.ok, true);
  assert.equal(emitidos.length, 0);
  assert.match(mensajeDeVerificacion(r), /no se emite nada/);
});

test("certificado de ambiente desconocido: no llama a ARCA", async () => {
  const { c, emitidos } = cliente({ falloUltimo: new Error("no debería llamarse") });
  const r = await verificarConArca({ entorno: "desconocido", puntoVenta: 1, condicionIva: "MONOTRIBUTO", cliente: c });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.paso, "certificado");
  assert.equal(emitidos.length, 0);
});

test("sin punto de venta o sin condición de IVA: no llama a ARCA", async () => {
  const { c } = cliente({ falloUltimo: new Error("no debería llamarse") });
  const sinPv = await verificarConArca({ entorno: "homologacion", puntoVenta: null, condicionIva: "MONOTRIBUTO", cliente: c });
  assert.match(!sinPv.ok ? sinPv.mensaje : "", /punto de venta/);
  const sinIva = await verificarConArca({ entorno: "homologacion", puntoVenta: 1, condicionIva: null, cliente: c });
  assert.match(!sinIva.ok ? sinIva.mensaje : "", /condición/);
});

test("rechazo al leer: dice qué hacer y muestra el texto de ARCA", async () => {
  const { c, emitidos } = cliente({ falloUltimo: new Error("ns1:coe.notAuthorized: Computador no autorizado a acceder al servicio") });
  const r = await verificarConArca({ entorno: "homologacion", puntoVenta: 1, condicionIva: "MONOTRIBUTO", cliente: c });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.mensaje : "", /Administrador de Relaciones/);
  assert.equal(emitidos.length, 0);
});

test("rechazo al emitir la prueba: paso emisión con los códigos", async () => {
  const { c } = cliente({ falloCae: new ArcaRechazoError("rechazo", [{ codigo: 10016, mensaje: "numero no corresponde" }]) });
  const r = await verificarConArca({ entorno: "homologacion", puntoVenta: 1, condicionIva: "MONOTRIBUTO", cliente: c });
  assert.equal(!r.ok && r.paso, "emision");
  assert.match(!r.ok ? r.mensaje : "", /10016/);
});

test("el texto del error nunca arrastra un PEM", () => {
  const t = textoDelError(new Error("x -----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY----- y"));
  assert.doesNotMatch(t, /abc/);
});

test("qué hacer: certificado de otro ambiente y ticket repetido", () => {
  assert.match(queHacer("ns1:cms.cert.untrusted"), /ambiente/);
  assert.match(queHacer("coe.alreadyAuthenticated"), /10 minutos/);
  assert.match(queHacer("algo raro"), /runbook/);
});
