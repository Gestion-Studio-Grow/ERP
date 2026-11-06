/**
 * Segunda vuelta de la matriz de permisos (hallazgos del QA): la lógica pura.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPACIDADES_POR_USUARIO, permisoEfectivo, roleHasCapability } from "@/lib/capabilities";
import { decidirCambioDePermiso } from "@/lib/permisos/cambio-de-permiso";
import { idsFueraDeReservaOnline, sinLasDeFuera } from "@/lib/permisos/reserva-online";
import { contactoOculto, coincideSinVerContacto, enmascararTelefono, ultimosCuatroBuscados } from "@/lib/clientes/telefono";
import { enmascararFichasParaAlta, type FichaParaAlta } from "@/lib/clientes/ficha-por-telefono";
import { camposDelAlta, profesionalesParaDarTurno } from "@/app/admin/(dashboard)/turnos/_agenda/alta-core";
import { textoDelAviso } from "@/app/admin/(dashboard)/usuarios/matriz-core";

test("casilla 1: `booking:online` es por usuario y todos los roles la traen prendida", () => {
  assert.ok(CAPACIDADES_POR_USUARIO.includes("booking:online"));
  for (const rol of ["OWNER", "RECEPTION", "PROFESSIONAL"] as const) assert.equal(roleHasCapability(rol, "booking:online"), true);
  assert.equal(permisoEfectivo({ role: "PROFESSIONAL", overrides: [{ capability: "booking:online", allowed: false }] }, "booking:online"), false);
  // Apagarla graba la excepción; volver a prenderla la borra (igual al rol).
  const objetivo = { id: "u-lu", role: "PROFESSIONAL" as const, professionalId: "p-lu", overrides: [] };
  const apagar = decidirCambioDePermiso({ actorId: "u-caro", objetivo, capability: "booking:online", allowed: false });
  assert.deepEqual(apagar.ok && apagar.plan.grabar, ["booking:online"]);
  const prender = decidirCambioDePermiso({ actorId: "u-caro", objetivo, capability: "booking:online", allowed: true });
  assert.deepEqual(prender.ok && prender.plan.borrar, ["booking:online"]);
});

test("casilla 1: de las filas, las fichas que quedan afuera, y la lista pública sin ellas", () => {
  const fuera = idsFueraDeReservaOnline([{ user: { professionalId: "p-lu" } }, { user: { professionalId: null } }]);
  assert.deepEqual([...fuera], ["p-lu"]);
  const lista = [{ id: "p-caro" }, { id: "p-lu" }];
  assert.deepEqual(sinLasDeFuera(lista, fuera), [{ id: "p-caro" }]);
  assert.deepEqual(sinLasDeFuera(lista, new Set()), lista);
});

test("contacto oculto ≠ celular inválido", () => {
  assert.equal(contactoOculto(enmascararTelefono("11 5555-1234")), true);
  assert.equal(contactoOculto("11 5555-1234"), false);
  assert.equal(contactoOculto("123"), false);
  assert.equal(contactoOculto(null), false);
});

test("buscar sin contacto: sólo los últimos 4 completos", () => {
  assert.equal(ultimosCuatroBuscados("1234"), "1234");
  assert.equal(ultimosCuatroBuscados(" 12-34 "), "1234");
  for (const q of ["5551234", "123", "555-12", "Valeria", "12a4", ""]) assert.equal(ultimosCuatroBuscados(q), null, q);
  assert.equal(coincideSinVerContacto("11 5555-1234", "1234"), true);
  assert.equal(coincideSinVerContacto("11 5555-1234", "5555"), false);
  assert.equal(coincideSinVerContacto("11 5555-1234", "5551234"), false);
});

test("las fichas del alta salen enmascaradas sin clients:contact", () => {
  const f: FichaParaAlta = { id: "c1", nombre: "Vale", telefono: "11 5555-1234", notas: null, vecina: null, turnos: 0, creada: "2026-01-01", ultimaVisita: null, saldo: 0 };
  assert.equal(enmascararFichasParaAlta([f], { role: "PROFESSIONAL", overrides: [] })[0].telefono, "•••• 1234");
  assert.equal(enmascararFichasParaAlta([f], { role: "RECEPTION", overrides: [{ capability: "clients:contact", allowed: false }] })[0].telefono, "•••• 1234");
  assert.equal(enmascararFichasParaAlta([f], { role: "RECEPTION", overrides: [] })[0].telefono, "11 5555-1234");
  assert.equal(enmascararFichasParaAlta([f], null)[0].telefono, "•••• 1234");
});

test("el alta manda el id de la ficha elegida (el servidor la ata aunque el teléfono venga oculto)", () => {
  const base = { profesionalId: "p", servicioId: "s", inicio: "x", nombre: "Vale", telefono: "•••• 1234", deLaZona: false, cupon: "", cobro: null, estado: "PENDING" as const, notas: "" };
  assert.deepEqual(camposDelAlta({ ...base, clienteId: "c1" }).find(([k]) => k === "clientId"), ["clientId", "c1"]);
  assert.equal(camposDelAlta(base).find(([k]) => k === "clientId"), undefined);
});

test("«Dar turno» a una profesional: sólo su ficha (y sin ficha, nadie)", () => {
  const lista = [{ id: "p-caro" }, { id: "p-lu" }];
  assert.deepEqual(profesionalesParaDarTurno(lista, { role: "PROFESSIONAL", professionalId: "p-lu" }), [{ id: "p-lu" }]);
  assert.deepEqual(profesionalesParaDarTurno(lista, { role: "PROFESSIONAL", professionalId: null }), []);
  assert.deepEqual(profesionalesParaDarTurno(lista, { role: "RECEPTION", professionalId: null }), lista);
});

test("el aviso de la matriz está redactado por casilla", () => {
  assert.equal(textoDelAviso("caja", "Rocío", false), "Listo: Rocío ya no puede abrir y cerrar la caja. Rige desde su próxima pantalla.");
  assert.equal(textoDelAviso("contacto", "Lu", true), "Listo: Lu ya puede ver el teléfono y el mail de los clientes. Rige desde su próxima pantalla.");
  assert.equal(textoDelAviso("reserva-online", "Lu", false), "Listo: Lu ya no aparece en la reserva online. Sigue en la agenda y en «Dar turno».");
  assert.equal(textoDelAviso("reserva-online", "Lu", true), "Listo: Lu vuelve a aparecer en la reserva online.");
});
