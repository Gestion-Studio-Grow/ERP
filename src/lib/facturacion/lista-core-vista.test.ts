// QA vuelta 1: la pestaña que abre Facturación (CH no cambia), buscar sin tildes y lo facturado
// con signo (el Inicio sumaba las notas de crédito como facturas).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CON_TILDE, SIN_TILDE, facturadoConSigno, patronAmplio, textoComparable, vistaDeFacturacion } from "./lista-core";

test("un negocio sin comprobantes (CH, con ARCA apagado) abre en «Cobrar con link», como antes", () => {
  assert.equal(vistaDeFacturacion({}, false), "cobrar-con-link");
});

test("con comprobantes abre en la lista; la pestaña pedida manda; un filtro o una búsqueda abren la lista", () => {
  assert.equal(vistaDeFacturacion({}, true), "comprobantes");
  assert.equal(vistaDeFacturacion({ vista: "cobrar-con-link" }, true), "cobrar-con-link");
  assert.equal(vistaDeFacturacion({ vista: "comprobantes" }, false), "comprobantes");
  for (const p of ["q", "estado", "tipo", "pv", "desde", "hasta", "pagina"]) {
    assert.equal(vistaDeFacturacion({ [p]: "x" }, false), "comprobantes", `con «${p}» en la URL`);
  }
  assert.equal(vistaDeFacturacion({ vista: "cobrar-con-link", q: "ana" }, true), "cobrar-con-link", "el buscador de links lleva su vista");
});

test("la tabla de tildes de la base saca la tilde igual que el buscador (letra por letra, mayúsculas incluidas)", () => {
  assert.equal(CON_TILDE.length, SIN_TILDE.length);
  for (let i = 0; i < CON_TILDE.length; i++) {
    assert.equal(textoComparable(CON_TILDE[i]), SIN_TILDE[i], `«${CON_TILDE[i]}»`);
  }
  assert.equal(textoComparable("Mónica PÉREZ"), "monica perez");
  assert.equal(textoComparable("ÑANDÚ"), "nandu");
});

test("lo facturado del mes resta las notas de crédito, al centavo", () => {
  const porTipo = [
    { tipoComprobante: 6, total: 351_835_436.28 - 22_176_988.94 + 22_176_988.94 },
    { tipoComprobante: 8, total: 11_088_494.47 },
    { tipoComprobante: 3, total: 11_088_494.47 },
  ];
  assert.equal(facturadoConSigno(porTipo), 329_658_447.34);
  assert.equal(facturadoConSigno([{ tipoComprobante: 6, total: 10_000 }, { tipoComprobante: 8, total: 10_000 }]), 0, "una factura anulada con su nota: $0");
  assert.equal(facturadoConSigno([{ tipoComprobante: 11, total: 0.1 }, { tipoComprobante: 11, total: 0.2 }]), 0.3);
  assert.equal(facturadoConSigno([]), 0);
});

test("el filtro barato deja pasar todo lo que encuentra la comparación sin tildes (cada letra que puede llevar tilde, «_»)", () => {
  assert.equal(patronAmplio("Mónica Pérez"), "m_____ p_r_z");
  assert.equal(patronAmplio("ÑANDÚ"), "___d_");
  assert.equal(patronAmplio("50%_off"), "50\\%\\__ff", "los comodines escritos se escapan, no se amplían");
});
