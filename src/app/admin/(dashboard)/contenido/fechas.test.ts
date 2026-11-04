import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDelAlmacen } from "@/lib/contenido/almacen-local";
import { compartirPorWhatsApp, hoyEnArgentina, slugDelAlmacen } from "./fechas";

test("hoy en Argentina: a las 23 h del 4 (02 UTC del 5) sigue siendo el 4", () => {
  assert.equal(hoyEnArgentina(new Date("2026-11-05T02:00:00Z")), "2026-11-04");
  assert.equal(hoyEnArgentina(new Date("2026-11-05T03:30:00Z")), "2026-11-05");
});

test("el slug del almacén demo sirve siempre y separa negocios", () => {
  assert.equal(slugDelAlmacen("ch", "x"), "ch");
  assert.notEqual(claveDelAlmacen(slugDelAlmacen(null, "cmA1")), claveDelAlmacen(slugDelAlmacen(null, "cmB2")));
  assert.doesNotThrow(() => claveDelAlmacen(slugDelAlmacen(null, "CM_raro!")));
});

test("el enlace de WhatsApp lleva el texto codificado", () => {
  assert.equal(compartirPorWhatsApp("2x1 & más"), "https://wa.me/?text=2x1%20%26%20m%C3%A1s");
});
