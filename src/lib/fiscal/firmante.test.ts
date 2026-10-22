// Motor de facturación · quién firma el pedido a ARCA (ADR-066 propio / ADR-077 §6 delegación).
import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirFirmante, type DelegacionLeida } from "./firmante";

const EMISOR = "20111111112";
const ESTUDIO = "30712345671";
const delegacion = (cambios: Partial<DelegacionLeida> = {}): DelegacionLeida => ({
  estado: "verificada",
  servicio: "wsfe",
  cuitRepresentado: EMISOR,
  cuitRepresentante: ESTUDIO,
  estudioTenantId: "estudio-1",
  ...cambios,
});

test("con certificado propio firma el propio, aunque haya delegación", () => {
  assert.deepEqual(elegirFirmante({ tieneCredencialPropia: true, cuitEmisor: EMISOR, delegacion: delegacion() }), {
    ok: true,
    firmante: { tipo: "propio" },
  });
});

test("sin certificado propio y con delegación wsfe VERIFICADA del mismo CUIT, firma el estudio", () => {
  assert.deepEqual(elegirFirmante({ tieneCredencialPropia: false, cuitEmisor: "20-11111111-2", delegacion: delegacion() }), {
    ok: true,
    firmante: { tipo: "delegado", estudioTenantId: "estudio-1", cuitRepresentante: ESTUDIO },
  });
});

test("no firma: sin nada, delegación sin verificar, de otro servicio, de otro CUIT o sin CUIT del negocio", () => {
  const casos: [string, Parameters<typeof elegirFirmante>[0], RegExp][] = [
    ["sin nada", { tieneCredencialPropia: false, cuitEmisor: EMISOR, delegacion: null }, /no tiene certificado/],
    ["declarada", { tieneCredencialPropia: false, cuitEmisor: EMISOR, delegacion: delegacion({ estado: "declarada" }) }, /no verificada/],
    ["revocada", { tieneCredencialPropia: false, cuitEmisor: EMISOR, delegacion: delegacion({ estado: "revocada" }) }, /no verificada/],
    ["otro servicio", { tieneCredencialPropia: false, cuitEmisor: EMISOR, delegacion: delegacion({ servicio: "ws_sr_padron_a5" }) }, /wsfe/],
    ["otro CUIT", { tieneCredencialPropia: false, cuitEmisor: "20222222223", delegacion: delegacion() }, /otro CUIT/],
    ["sin CUIT", { tieneCredencialPropia: false, cuitEmisor: null, delegacion: delegacion() }, /CUIT válido/],
    ["representante inválido", { tieneCredencialPropia: false, cuitEmisor: EMISOR, delegacion: delegacion({ cuitRepresentante: "30711111115" }) }, /representante/],
  ];
  for (const [nombre, datos, motivo] of casos) {
    const r = elegirFirmante(datos);
    assert.equal(r.ok, false, nombre);
    if (!r.ok) assert.match(r.motivo, motivo, nombre);
  }
});
