// Tests del banco de pruebas de Cobros MP: armado de la solicitud de prueba +
// mapeo de resultado (éxito / inválida / error). Sin red (usa StubPasarelaCobros
// y una pasarela falsa para forzar los caminos de error).
import test from "node:test";
import assert from "node:assert/strict";
import { solicitudDePrueba, generarCobroDePrueba } from "./prueba";
import { StubPasarelaCobros } from "./stub";
import { SolicitudCobroInvalidaError, type LinkDePago, type PasarelaCobros } from "./port";
import { MercadoPagoApiError } from "../http";

test("solicitudDePrueba: concepto identificable, referencia con prefijo PRUEBA-", () => {
  const s = solicitudDePrueba();
  assert.equal(s.monto, 100);
  assert.match(s.concepto, /prueba/i);
  assert.match(s.referenciaExterna ?? "", /^PRUEBA-/);
});

test("solicitudDePrueba: respeta el monto pasado", () => {
  assert.equal(solicitudDePrueba(250).monto, 250);
});

test("generarCobroDePrueba: con StubPasarelaCobros devuelve un link de sandbox", async () => {
  const r = await generarCobroDePrueba(new StubPasarelaCobros());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.link.estado, "activa");
    assert.match(r.link.initPoint, /sandbox/);
  }
});

test("generarCobroDePrueba: mapea SolicitudCobroInvalidaError a motivo 'invalida'", async () => {
  const pasarelaInvalida: PasarelaCobros = {
    async crearLinkDePago(): Promise<LinkDePago> {
      throw new SolicitudCobroInvalidaError([{ campo: "monto", mensaje: "no puede ser 0" }]);
    },
  };
  const r = await generarCobroDePrueba(pasarelaInvalida);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "invalida");
});

test("generarCobroDePrueba: mapea MercadoPagoApiError a motivo 'error'", async () => {
  const pasarelaQueFalla: PasarelaCobros = {
    async crearLinkDePago(): Promise<LinkDePago> {
      throw new MercadoPagoApiError("no autorizado", 401, "invalid_token");
    },
  };
  const r = await generarCobroDePrueba(pasarelaQueFalla);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.motivo, "error");
    assert.match(r.mensaje, /401/);
  }
});
