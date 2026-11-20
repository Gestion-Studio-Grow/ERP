import { test } from "node:test";
import assert from "node:assert/strict";
import { enlaceAlProyectoDestino } from "./arm";

const base = { subdominio: "mia-producciones", proyectoId: "c0123", hostActual: "arm-mia.gsgapp.com.ar", https: true, dominioPropio: "gsgapp.com.ar", mapaDeHosts: new Map<string, string>() };

test("B2 · el enlace al proyecto en el destino va al subdominio del negocio vinculado", () => {
  assert.equal(enlaceAlProyectoDestino(base), "https://mia-producciones.gsgapp.com.ar/admin/proyectos/c0123");
});

test("B2 · en la prueba local conserva esquema y puerto", () => {
  assert.equal(enlaceAlProyectoDestino({ ...base, hostActual: "arm-mia.localhost:3219", https: false, dominioPropio: "localhost" }), "http://mia-producciones.localhost:3219/admin/proyectos/c0123");
});

test("B2 · mirado desde otro host: la dirección pública; sin dominio propio, el mapa de hosts; sin nada, null", () => {
  assert.equal(enlaceAlProyectoDestino({ ...base, hostActual: "otro.example" }), "https://mia-producciones.gsgapp.com.ar/admin/proyectos/c0123");
  assert.equal(enlaceAlProyectoDestino({ ...base, dominioPropio: null, mapaDeHosts: new Map([["mia-erp.vercel.app", "mia-producciones"]]) }), "https://mia-erp.vercel.app/admin/proyectos/c0123");
  assert.equal(enlaceAlProyectoDestino({ ...base, dominioPropio: null }), null);
  assert.equal(enlaceAlProyectoDestino({ ...base, subdominio: null }), null);
  assert.equal(enlaceAlProyectoDestino({ ...base, proyectoId: null }), null);
  assert.equal(enlaceAlProyectoDestino({ ...base, subdominio: "mal/sub" }), null);
});
