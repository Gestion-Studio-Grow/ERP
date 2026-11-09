import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoConexionArca } from "./facturita-arca";
import type { FichaFiscalDelPase } from "@/lib/operador/pase-a-real";

function ficha(p: Partial<FichaFiscalDelPase> = {}): FichaFiscalDelPase {
  return {
    slug: "kiosco-ana",
    arcaCuit: "20111111112",
    arcaPuntoVenta: 2,
    arcaHomologacion: true,
    arcaCondicionIva: "MONOTRIBUTO",
    credencial: null,
    delegacion: null,
    modoArca: "real",
    enListaReal: false,
    comprobantesDePrueba: { cantidad: 0 } as unknown as FichaFiscalDelPase["comprobantesDePrueba"],
    ...p,
  };
}
const cert = (entorno: "produccion" | "homologacion") => ({ certCuit: "20111111112", entorno, emisor: null, error: null, actualizada: "2026-11-01T00:00:00Z" });

test("sin ficha: sin datos, igual lleva a la conexión", () => {
  const e = estadoConexionArca(null);
  assert.equal(e.tono, "neutral");
});

test("sin certificado: sin conectar, explica los 4 pasos y no pide clave fiscal", () => {
  const e = estadoConexionArca(ficha());
  assert.equal(e.etiqueta, "Sin conectar");
  assert.equal(e.accion, "Conectar con ARCA");
  assert.match(e.detalle, /Nunca te pedimos tu clave fiscal/);
});

test("certificado de pruebas: en pruebas, sin validez fiscal", () => {
  const e = estadoConexionArca(ficha({ credencial: cert("homologacion") }));
  assert.equal(e.etiqueta, "En pruebas");
  assert.match(e.detalle, /no tienen validez fiscal/);
});

test("real con todo: conectada", () => {
  const e = estadoConexionArca(ficha({ arcaHomologacion: false, enListaReal: true, credencial: cert("produccion") }));
  assert.equal(e.etiqueta, "Conectada");
  assert.equal(e.tono, "success");
});

test("marcado real pero falta algo: falta terminar, sin jerga del operador", () => {
  const e = estadoConexionArca(ficha({ arcaHomologacion: false, enListaReal: false, credencial: cert("produccion") }));
  assert.equal(e.etiqueta, "Falta terminar");
  assert.doesNotMatch(e.detalle, /ARCA_REAL_TENANTS|ARCA_MODO/);
});

test("plataforma simulada: sin conectar aunque haya certificado", () => {
  const e = estadoConexionArca(ficha({ modoArca: "stub", credencial: cert("produccion") }));
  assert.equal(e.etiqueta, "Sin conectar");
  assert.match(e.detalle, /simulado/);
});
