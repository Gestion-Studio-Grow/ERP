import { test } from "node:test";
import assert from "node:assert/strict";
import { permisoEfectivo } from "@/lib/capabilities";
import { resumenDelRol, tablaDePermisos } from "./permisos-core";

test("en un mostrador hay dos columnas: Dueño/a y Mostrador, sin filas de agenda", () => {
  const t = tablaDePermisos(true);
  assert.deepEqual(t.roles.map((r) => r.nombre), ["Dueño/a", "Mostrador"]);
  assert.ok(t.filas.every((f) => !/agenda|turnos|espera|comisiones/i.test(f.texto)));
});

test("en un negocio de servicios aparecen Recepción y Profesional, y la agenda", () => {
  const t = tablaDePermisos(false);
  assert.deepEqual(t.roles.map((r) => r.nombre), ["Dueño/a", "Recepción", "Profesional"]);
  assert.ok(t.filas.some((f) => f.texto === "Dar turnos"));
  assert.ok(t.filas.some((f) => f.texto === "Mover, reprogramar y cancelar turnos"));
});

test("el dueño puede todo lo de la tabla, sin matices", () => {
  for (const esMostrador of [true, false]) {
    const t = tablaDePermisos(esMostrador);
    assert.ok(t.filas.every((f) => f.celdas[0].puede && !f.celdas[0].matiz));
  }
});

test("el mostrador anula sólo lo de hoy, con motivo y el código de la dueña, y no ve costos ni reportes", () => {
  const t = tablaDePermisos(true);
  const fila = (texto: string) => t.filas.find((f) => f.texto === texto)!;
  assert.deepEqual(fila("Anular una venta").celdas[1], { puede: true, matiz: "Sólo lo de hoy, con motivo y el código de la dueña" });
  assert.equal(fila("Ver costos, compras y proveedores").celdas[1].puede, false);
  assert.equal(fila("Ver reportes y el resultado del mes").celdas[1].puede, false);
  assert.equal(fila("Recibir mercadería, contar y cargar mermas").celdas[1].puede, true);
});

test("el profesional ve y cobra sólo lo suyo y no da turnos", () => {
  const t = tablaDePermisos(false);
  const fila = (texto: string) => t.filas.find((f) => f.texto === texto)!;
  assert.deepEqual(fila("Cerrar y cobrar turnos").celdas[2], { puede: true, matiz: "Sólo lo suyo" });
  assert.equal(fila("Dar turnos").celdas[2].puede, false);
  assert.equal(fila("Mover, reprogramar y cancelar turnos").celdas[2].puede, false);
  assert.equal(fila("Ver el teléfono y el mail de los clientes").celdas[2].puede, false);
  assert.equal(fila("Abrir y cerrar la caja").celdas[2].puede, false);
  assert.equal(fila("Vender y cobrar en el mostrador").celdas[2].puede, false);
});

test("cada celda dice lo mismo que el sistema de permisos", () => {
  for (const esMostrador of [true, false]) {
    const t = tablaDePermisos(esMostrador);
    for (const f of t.filas) {
      t.roles.forEach((r, i) => assert.equal(f.celdas[i].puede, permisoEfectivo({ role: r.valor, overrides: [] }, f.capacidad), `${r.nombre} · ${f.texto}`));
    }
  }
});

test("el resumen del rol para el alta sale de la misma tabla", () => {
  assert.equal(resumenDelRol("OWNER", true), "Todo, incluso precios, reportes y usuarios.");
  const mostrador = resumenDelRol("RECEPTION", true);
  assert.match(mostrador, /^vender y cobrar en el mostrador · anular una venta \(sólo lo de hoy, con motivo y el código de la dueña\)/);
  assert.doesNotMatch(mostrador, /costos|reportes/);
  assert.equal(resumenDelRol("PROFESSIONAL", true), "");
});

test("las capacidades nuevas de la matriz: recepción da turnos, ve el contacto y abre la caja", () => {
  const t = tablaDePermisos(false);
  const fila = (texto: string) => t.filas.find((f) => f.texto === texto)!;
  for (const texto of ["Dar turnos", "Ver el teléfono y el mail de los clientes", "Abrir y cerrar la caja"]) {
    assert.deepEqual(fila(texto).celdas.map((c) => c.puede), [true, true, false], texto);
  }
});

// UAT Magra 07-08/11 (callejón C4): la tabla prometía al Mostrador «Recibir mercadería, contar y cargar
// mermas», pero Stock, Recibir y Mermas sólo le abren en un mostrador que trabaja por apps (el piloto,
// `capabilityEnMostrador`). Fuera del piloto la tabla dice lo que rige.
test("fuera del piloto el Mostrador no recibe ni carga mermas (la tabla dice lo que rige)", () => {
  const t = tablaDePermisos(true, { stockDelEncargado: false });
  const fila = t.filas.find((f) => f.texto === "Recibir mercadería, contar y cargar mermas")!;
  assert.equal(fila.celdas[0].puede, true, "la dueña sí");
  assert.equal(fila.celdas[1].puede, false, "el Mostrador no");
  assert.doesNotMatch(resumenDelRol("RECEPTION", true, { stockDelEncargado: false }), /recibir mercadería/i);
  assert.match(resumenDelRol("RECEPTION", true, { stockDelEncargado: true }), /recibir mercadería/i);
});

test("la regla de la tabla es la misma que abre la app Recibir mercadería", async () => {
  const { appPorId } = await import("@/apps/registro");
  const { rolPuedeEntrar } = await import("@/apps/visibles");
  const recibir = appPorId("recibir-mercaderia");
  for (const piloto of [true, false]) {
    const n = { contexto: piloto ? ({ origen: "piloto" } as never) : null, esMostrador: true };
    const t = tablaDePermisos(true, { stockDelEncargado: piloto });
    const celda = t.filas.find((f) => f.capacidad === "stock:receive")!.celdas[1];
    assert.equal(celda.puede, rolPuedeEntrar(recibir, "RECEPTION", n), `piloto=${piloto}`);
  }
});
