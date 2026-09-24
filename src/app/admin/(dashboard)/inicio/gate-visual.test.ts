// La lista de rutas del gate visual (scripts/qa/visual-audit.mjs), ejecutada con el registro
// REAL: toda app lista entra sola, en los negocios de su rubro, y nada de lo que ya se medía
// se cae. Si un frente suma una app al registro, este test no se toca: la app ya está medida.

import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRO_APPS } from "@/apps/registro";

type Ruta = { path: string; label: string; group: string; auth?: string; blueprints?: string[]; puedeFaltar?: boolean };
type Gate = {
  VIEWPORTS: { name: string; width: number }[];
  RUTAS_FIJAS: Ruta[];
  rutasDelRegistro: (apps: readonly unknown[]) => Ruta[];
  aterrizoFueraDeLaApp: (pedida: string, aterrizo: string) => boolean;
  clasificarAterrizaje: (route: Ruta, aterrizo: string) => "medir" | "omitida" | "falla";
};

// Import dinámico por URL: es un .mjs de scripts/, fuera del árbol que TypeScript tipa. Relativo
// a este archivo (inicio → raíz del repo son 5 niveles), no al cwd: corre desde cualquier carpeta.
const cargarGate = async () =>
  (await import(new URL("../../../../../scripts/qa/visual-audit.mjs", import.meta.url).href)) as Gate;

test("toda app lista con ruta fija está en el gate; las en preparación y las de [id] no", async () => {
  const { rutasDelRegistro } = await cargarGate();
  const rutas = rutasDelRegistro(REGISTRO_APPS);
  const medidas = new Set(rutas.map((r) => r.path));
  for (const app of REGISTRO_APPS) {
    const debe = app.estado === "lista" && app.enLanzador !== false && !app.ruta.includes("[");
    assert.equal(medidas.has(app.ruta), debe, `${app.id} (${app.ruta})`);
  }
  assert.ok(rutas.length >= 40, `sólo ${rutas.length} rutas del registro`);
  assert.ok(rutas.every((r) => r.auth === "admin" && r.group === "admin"));
  assert.equal(new Set(rutas.map((r) => r.path)).size, rutas.length, "sin rutas repetidas");
});

test("cada app se mide en los negocios de su rubro", async () => {
  const { rutasDelRegistro } = await cargarGate();
  const porRuta = new Map(rutasDelRegistro(REGISTRO_APPS).map((r) => [r.path, r]));
  for (const app of REGISTRO_APPS) {
    const r = porRuta.get(app.ruta);
    if (!r) continue;
    if (app.rubro === "servicios") assert.deepEqual(r.blueprints, ["servicios"], app.id);
    else if (app.rubro === "mostrador") assert.deepEqual(r.blueprints, ["velas", "padel", "carniceria"], app.id);
    else if (app.rubro === "carniceria") assert.deepEqual(r.blueprints, ["carniceria"], app.id);
    else assert.equal(r.blueprints, undefined, `${app.id} va en todos los negocios`);
  }
});

test("lo que el gate ya medía sigue medido (y la pantalla de rechazos también)", async () => {
  const { rutasDelRegistro, RUTAS_FIJAS } = await cargarGate();
  const todas = [...RUTAS_FIJAS, ...rutasDelRegistro(REGISTRO_APPS)].map((r) => r.path.split("?")[0]);
  for (const p of [
    "/",
    "/reserva",
    "/tienda",
    "/admin/login",
    "/admin",
    "/admin/clientes",
    "/admin/catalogo",
    "/admin/reportes",
    "/admin/ajustes",
    "/admin/apariencia",
    "/admin/turnos",
    "/admin/pedidos",
    "/admin/caja",
    "/admin/no-disponible",
  ]) {
    assert.ok(todas.includes(p), `${p} salió del gate`);
  }
});

test("el celular del gate es el de 412 px de la casa", async () => {
  const { VIEWPORTS } = await cargarGate();
  assert.equal(VIEWPORTS.find((v) => v.name === "mobile")?.width, 412);
  assert.ok(VIEWPORTS.some((v) => v.name === "desktop"));
});

test("una app que no está en ese negocio se omite (no se mide la pantalla de rechazo en su lugar)", async () => {
  const { aterrizoFueraDeLaApp } = await cargarGate();
  assert.equal(aterrizoFueraDeLaApp("/admin/locales", "/admin/no-disponible"), true);
  assert.equal(aterrizoFueraDeLaApp("/admin/turnos", "/admin"), true, "el layout de un producto con tienda la devuelve al Inicio");
  assert.equal(aterrizoFueraDeLaApp("/admin/caja", "/admin/caja"), false);
  assert.equal(aterrizoFueraDeLaApp("/admin/caja", "/admin/caja/abrir"), false, "un redirect dentro de la app se mide");
  assert.equal(aterrizoFueraDeLaApp("/admin", "/admin"), false);
  assert.equal(aterrizoFueraDeLaApp("/admin/no-disponible?app=facturacion", "/admin/no-disponible"), false);
});

test("sólo puede faltar una app con módulo, rubro o edición: una del núcleo que rebota FALLA", async () => {
  const { rutasDelRegistro, clasificarAterrizaje } = await cargarGate();
  const porRuta = new Map(rutasDelRegistro(REGISTRO_APPS).map((r) => [r.path, r]));
  const ruta = (id: string) => {
    const app = REGISTRO_APPS.find((a) => a.id === id)!;
    return porRuta.get(app.ruta)!;
  };
  // Del núcleo: están en todos los negocios. Si mandan a "App no disponible" o al Inicio, se rompió algo.
  for (const id of ["caja-del-dia", "cierre-del-dia", "libro-de-caja", "usuarios", "datos-del-negocio", "apariencia"]) {
    assert.equal(ruta(id).puedeFaltar, false, id);
    assert.equal(clasificarAterrizaje(ruta(id), "/admin/no-disponible"), "falla", id);
    assert.equal(clasificarAterrizaje(ruta(id), "/admin"), "falla", id);
    assert.equal(clasificarAterrizaje(ruta(id), ruta(id).path), "medir", id);
  }
  // Con módulo (Mis locales), con rubro (Despiece) o con edición (Libro IVA): pueden no estar.
  for (const id of ["mis-locales", "despiece", "libro-iva", "facturacion"]) {
    assert.equal(ruta(id).puedeFaltar, true, id);
    assert.equal(clasificarAterrizaje(ruta(id), "/admin/no-disponible"), "omitida", id);
  }
  // Toda app del gate sin módulo, rubro ni edición es del núcleo y no puede omitirse.
  for (const app of REGISTRO_APPS) {
    const r = porRuta.get(app.ruta);
    if (!r) continue;
    assert.equal(r.puedeFaltar, app.modulo !== null || !!app.rubro || !!app.perfilMin, app.id);
  }
});
