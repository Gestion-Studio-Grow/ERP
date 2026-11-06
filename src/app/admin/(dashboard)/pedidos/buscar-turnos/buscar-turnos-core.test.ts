import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparHuecosPorProfesional,
  clasificarBusqueda,
  etiquetaDelDia,
  hrefDelHueco,
  horaDePared,
  idDeOpcionDeServicio,
  opcionesDelBuscadorUnico,
  servicioDeLaOpcion,
  textoDelAnuncio,
} from "./buscar-turnos-core";
import { hrefTurnoEnHueco, leerHuecoDelAlta } from "../../turnos/pasos";

const productos = [
  { id: "p-crema", etiqueta: "Crema hidratante", detalle: "$9.000/u" },
  { id: "p-serum", etiqueta: "Sérum peeling suave", detalle: "$12.000/u" },
];
const servicios = [
  { id: "s-peeling", nombre: "Peeling químico", durationMin: 40, precio: 22000 },
  { id: "s-cejas", nombre: "Perfilado de cejas", durationMin: 20, precio: 8000 },
];
const opciones = opcionesDelBuscadorUnico(productos, servicios);

test("opciones: productos primero, tal cual; servicios después con prefijo y detalle", () => {
  assert.deepEqual(opciones.slice(0, 2), productos);
  assert.equal(opciones[2].id, idDeOpcionDeServicio("s-peeling"));
  assert.match(opciones[2].detalle ?? "", /^Servicio · 40 min · \$22\.000$/);
  assert.equal(servicioDeLaOpcion(opciones[2].id), "s-peeling");
  assert.equal(servicioDeLaOpcion("p-crema"), null);
  assert.equal(servicioDeLaOpcion("servicio:"), null);
});

test("clasificar: servicio, producto o nada según la primera opción de la lista", () => {
  assert.deepEqual(clasificarBusqueda("peeling", opciones), { tipo: "servicio", servicioId: "s-peeling" });
  assert.deepEqual(clasificarBusqueda("PERFIL", opciones), { tipo: "servicio", servicioId: "s-cejas" });
  assert.deepEqual(clasificarBusqueda("crema", opciones), { tipo: "producto", productoId: "p-crema" });
  // «sérum peeling» empieza con «ser»: gana el producto.
  assert.deepEqual(clasificarBusqueda("serum", opciones), { tipo: "producto", productoId: "p-serum" });
  assert.deepEqual(clasificarBusqueda("pe", opciones), { tipo: "nada" });
  assert.deepEqual(clasificarBusqueda("zzzz", opciones), { tipo: "nada" });
});

test("agrupar: por profesional, días en orden, sin lo que ya pasó y con tope", () => {
  const dias = ["2026-11-04", "2026-11-05"];
  const iso = (d: string, hhmm: string) => new Date(`${d}T${hhmm}:00-03:00`).toISOString();
  const ahora = new Date(iso("2026-11-04", "12:00")).getTime();
  const grupos = agruparHuecosPorProfesional(
    [
      { id: "laura", nombre: "Laura", huecos: { "2026-11-04": [iso("2026-11-04", "11:00"), iso("2026-11-04", "15:00"), iso("2026-11-04", "15:30")], "2026-11-05": [iso("2026-11-05", "10:00")] } },
      { id: "marina", nombre: "Marina", huecos: { "2026-11-04": [], "2026-11-05": [] } },
    ],
    dias,
    { ahora, max: 2 },
  );
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos[0], { id: "laura", nombre: "Laura", total: 2, dias: [{ dia: "2026-11-04", horarios: [iso("2026-11-04", "15:00"), iso("2026-11-04", "15:30")] }] });
  assert.deepEqual(grupos[1], { id: "marina", nombre: "Marina", total: 0, dias: [] });
  const sinTope = agruparHuecosPorProfesional(
    [{ id: "laura", nombre: "Laura", huecos: { "2026-11-04": [iso("2026-11-04", "15:00")], "2026-11-05": [iso("2026-11-05", "10:00")] } }],
    dias,
    { ahora },
  );
  assert.deepEqual(sinTope[0].dias.map((d) => d.dia), dias);
});

test("href del hueco: alta con servicio, profesional, día y hora; el alta lo lee", () => {
  const inicio = new Date("2026-11-05T15:30:00-03:00").toISOString();
  assert.equal(horaDePared(inicio), "15:30");
  const href = hrefDelHueco("s-peeling", "laura", inicio);
  assert.equal(href, "/admin/turnos/lista?nuevo=1&fecha=2026-11-05&profesional=laura&hora=15:30&servicio=s-peeling");
  const sp = new URL(href, "http://x").searchParams;
  assert.deepEqual(leerHuecoDelAlta({ nuevo: sp.get("nuevo"), profesional: sp.get("profesional"), hora: sp.get("hora"), ahora: sp.get("ahora") }), {
    profesional: "laura",
    hora: "15:30",
    ahora: false,
  });
  assert.equal(sp.get("servicio"), "s-peeling");
  // Sin servicio, el enlace de la grilla queda idéntico; un id raro no viaja.
  assert.equal(hrefTurnoEnHueco("2026-11-05", "laura", "15:30"), "/admin/turnos/lista?nuevo=1&fecha=2026-11-05&profesional=laura&hora=15:30");
  assert.equal(hrefTurnoEnHueco("2026-11-05", "laura", "15:30", "a&b=c"), "/admin/turnos/lista?nuevo=1&fecha=2026-11-05&profesional=laura&hora=15:30");
});

test("anuncio y etiqueta del día", () => {
  const g = (nombre: string, total: number) => ({ id: nombre, nombre, total, dias: [] });
  assert.equal(textoDelAnuncio("Peeling", [g("Laura", 3), g("Marina", 2), g("Sol", 0)]), "Peeling: 3 turnos libres con Laura, 2 con Marina.");
  assert.equal(textoDelAnuncio("Peeling", [g("Laura", 1)]), "Peeling: 1 turno libre con Laura.");
  assert.equal(textoDelAnuncio("Peeling", [g("Sol", 0)]), "Peeling: no hay turnos libres en los próximos días.");
  assert.equal(etiquetaDelDia("2026-11-04", "2026-11-04"), "Hoy");
  assert.equal(etiquetaDelDia("2026-11-05", "2026-11-04"), "Mañana");
  assert.equal(etiquetaDelDia("2026-11-06", "2026-11-04"), "vie 6");
});
