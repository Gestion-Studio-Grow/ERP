// Las acciones del buscador: cada enlace cae en la app que dice resolver, y el servidor sólo manda
// las que la persona puede usar (su app visible y, si la pide, su capability).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCIONES, accionesParaPersona } from "./acciones";
import { appDeRuta } from "./rutas";
import { REGISTRO_APPS } from "./registro";
import { appsVisibles, resolverContextoApps, type NegocioApps } from "./visibles";
import { catalogo } from "@/modules/catalog";

// La casa de MAGRA en el piloto («Trabaja por apps» prendido con su asignación).
const MAGRA = { id: "t-magra", slug: "magra", blueprintId: "carniceria", modules: ["pos", "catalog", "clients", "reports", "arca", "inventario"] };
const pilotoMagra = resolverContextoApps(MAGRA, { registroGlobal: false, enInicioPorApps: true }, catalogo());

const negocio = (over: Partial<NegocioApps> & { role: NegocioApps["role"] }): NegocioApps => ({
  contexto: null,
  modulosAsignados: [],
  perfil: null,
  esMostrador: false,
  carniceriaLista: false,
  ...over,
});

test("el enlace de cada acción es de la app que declara (appDeRuta), y los ids no se repiten", () => {
  assert.equal(new Set(ACCIONES.map((a) => a.id)).size, ACCIONES.length);
  for (const a of ACCIONES) {
    assert.ok(REGISTRO_APPS.some((x) => x.id === a.app), `${a.id}: la app ${a.app} no está registrada`);
    assert.equal(appDeRuta(a.href)?.id, a.app, `${a.id}: ${a.href}`);
    assert.ok(a.palabras.length > 0, `${a.id}: sin palabras de búsqueda`);
  }
});

test("una acción aparece sólo si la persona ve su app", () => {
  const mostrador = appsVisibles(negocio({ role: "OWNER", esMostrador: true, contexto: pilotoMagra, modulosAsignados: MAGRA.modules }));
  const ids = accionesParaPersona(mostrador, "OWNER").map((a) => a.id);
  assert.ok(ids.includes("vender"));
  assert.ok(!ids.includes("dar-un-turno"), "un mostrador no da turnos");
  const estetica = appsVisibles(negocio({ role: "OWNER", esMostrador: false }));
  const deEstetica = accionesParaPersona(estetica, "OWNER").map((a) => a.id);
  assert.ok(deEstetica.includes("dar-un-turno"));
  assert.ok(!deEstetica.includes("vender"));
});

test("el profesional ve su agenda pero no da turnos: la acción pide agenda:manage", () => {
  const prof = appsVisibles(negocio({ role: "PROFESSIONAL", esMostrador: false }));
  assert.ok(prof.some((a) => a.id === "agenda"));
  assert.ok(!accionesParaPersona(prof, "PROFESSIONAL").some((a) => a.id === "dar-un-turno"));
  // La recepción de un mostrador no cierra el mes ni suma personas (no ve esas apps).
  const rec = accionesParaPersona(
    appsVisibles(negocio({ role: "RECEPTION", esMostrador: true, contexto: pilotoMagra, modulosAsignados: MAGRA.modules })),
    "RECEPTION",
  ).map((a) => a.id);
  assert.ok(rec.includes("vender"));
  assert.ok(!rec.includes("cerrar-el-mes"));
  assert.ok(!rec.includes("sumar-una-persona"));
});

test("con la barra de siempre (CH), sólo las acciones de sus pantallas", () => {
  const visibles = appsVisibles(negocio({ role: "OWNER", esMostrador: false }));
  const soloAgenda = accionesParaPersona(visibles, "OWNER", new Set(["/admin/turnos"])).map((a) => a.id);
  assert.deepEqual(soloAgenda, ["dar-un-turno"]);
});
