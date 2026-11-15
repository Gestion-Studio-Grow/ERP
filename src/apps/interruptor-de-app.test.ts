// Soporte GSG detrás de su interruptor (decisión del dueño 14/11/2026, TANDA3-SOPORTE · B): apagado, el
// titular no ve el botón (menú, Inicio, buscador) y la guardia de la ruta lo trata como inexistente.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@/lib/capabilities";
import { appPorId } from "./registro";
import { appsVisibles, buscarApps, explicarNoDisponible, motivoNoDisponible, type NegocioApps } from "./visibles";

const app = appPorId("permiso-soporte")!;

const negocio = (role: Role, interruptores?: NegocioApps["interruptores"]): NegocioApps => ({
  role,
  contexto: null,
  modulosAsignados: [],
  perfil: null,
  esMostrador: false,
  carniceriaLista: false,
  ...(interruptores !== undefined && { interruptores }),
});

const PRENDIDO = { "soporte-gsg": { encendido: true } } as const;
const APAGADO = { "soporte-gsg": { encendido: false } } as const;

test("apagado (o sin estado de interruptores): el titular no ve Soporte GSG ni lo encuentra", () => {
  for (const estado of [undefined, {}, APAGADO]) {
    const n = negocio("OWNER", estado);
    assert.equal(motivoNoDisponible(app, n), "apagada");
    assert.ok(!appsVisibles(n).some((a) => a.id === "permiso-soporte"), "no está en el menú");
    assert.ok(!buscarApps(appsVisibles(n), "soporte").some((a) => a.id === "permiso-soporte"), "el buscador no lo encuentra");
  }
});

test("prendido: el titular lo ve; recepción sigue sin verlo (rol)", () => {
  assert.equal(motivoNoDisponible(app, negocio("OWNER", PRENDIDO)), null);
  assert.ok(appsVisibles(negocio("OWNER", PRENDIDO)).some((a) => a.id === "permiso-soporte"));
  assert.equal(motivoNoDisponible(app, negocio("RECEPTION", PRENDIDO)), "rol");
});

test("apagado se decide ANTES que el rol: a nadie se le dice que la app existe", () => {
  assert.equal(motivoNoDisponible(app, negocio("RECEPTION", APAGADO)), "apagada");
  const e = explicarNoDisponible(app, "apagada", { role: "OWNER", esMostrador: false });
  assert.equal(e.titulo, "Esta pantalla no está disponible");
  assert.ok(!/Soporte/.test(`${e.titulo} ${e.porque} ${e.aQuien}`), "no nombra la app");
});

test("el estado de un negocio no se cruza: el de A prendido no prende el de B", () => {
  const a = negocio("OWNER", PRENDIDO);
  const b = negocio("OWNER", APAGADO);
  assert.equal(motivoNoDisponible(app, a), null);
  assert.equal(motivoNoDisponible(app, b), "apagada");
});

test("las demás apps no dependen del interruptor de Soporte GSG", () => {
  const sin = appsVisibles(negocio("OWNER")).map((a) => a.id);
  const con = appsVisibles(negocio("OWNER", PRENDIDO)).map((a) => a.id);
  assert.deepEqual(con.filter((id) => id !== "permiso-soporte"), sin);
});
