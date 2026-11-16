// El panel de casa (`casa` en el registro): un negocio con el club asignado ve SÓLO el club (más Usuarios y
// «Salir»), sin el menú general del ERP. CH y el resto, sin cambios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRO_APPS, appPorId } from "./registro";
import { appCasa, appsDeLaCasa, appsVisibles, rutaDeLaCasa, type NegocioApps } from "./visibles";

const negocio = (over: Partial<NegocioApps>): NegocioApps => ({
  role: "OWNER",
  contexto: null,
  modulosAsignados: [],
  perfil: null,
  esMostrador: false,
  carniceriaLista: false,
  ...over,
});

test("sólo el club es casa, y va con módulo duro", () => {
  const casas = REGISTRO_APPS.filter((a) => a.casa);
  assert.deepEqual(casas.map((a) => a.id), ["club"]);
  for (const a of casas) assert.equal(a.moduloDuro, true, `${a.id}: casa sin moduloDuro`);
});

test("Break Point con el club asignado: su casa es el club; sin el módulo (CH), no hay casa", () => {
  assert.equal(appCasa(negocio({ modulosAsignados: ["agenda", "clients", "club"] }))?.id, "club");
  assert.equal(appCasa(negocio({ modulosAsignados: [] })), null, "CH: modules vacío");
  assert.equal(appCasa(negocio({ modulosAsignados: ["agenda", "catalog", "clients", "pos"] })), null);
  // Recepción también cae en la casa (si no la puede abrir, la guardia la manda a «no disponible», no al menú).
  assert.equal(appCasa(negocio({ role: "RECEPTION", modulosAsignados: ["club"] }))?.id, "club");
});

test("con casa se ve el club y Usuarios; nada del menú general", () => {
  const n = negocio({ modulosAsignados: ["agenda", "catalog", "clients", "waitlist", "club"] });
  const casa = appCasa(n)!;
  const ids = appsDeLaCasa(casa, appsVisibles(n)).map((a) => a.id);
  assert.ok(ids.includes("club"));
  assert.ok(ids.every((id) => id === "club" || id === "usuarios"), ids.join(", "));
  assert.ok(appsVisibles(n).length > ids.length, "el negocio tiene más apps, pero no se muestran");
});

test("rutas: el club y Usuarios pasan; el Inicio y lo demás rebotan a la casa", () => {
  const casa = appPorId("club");
  for (const ok of ["/admin/club", "/admin/club?demo=1", "/admin/usuarios"]) assert.equal(rutaDeLaCasa(ok, casa), true, ok);
  for (const no of ["/admin", "/admin/turnos", "/admin/caja", "/admin/pedidos", "/admin/clientes", "/admin/lo-que-sea"]) assert.equal(rutaDeLaCasa(no, casa), false, no);
});

test("conLaCasa (GSG-PLAT-016): sólo el torneo; con su módulo se ve y se abre junto al club; sin él, nada cambia", () => {
  assert.deepEqual(REGISTRO_APPS.filter((a) => a.conLaCasa).map((a) => a.id), ["torneo"]);
  for (const a of REGISTRO_APPS.filter((x) => x.conLaCasa)) assert.equal(a.moduloDuro, true, `${a.id}: conLaCasa sin moduloDuro`);
  const casa = appPorId("club");
  // Break Point (club sin torneo): ni el torneo se ve.
  const bp = negocio({ modulosAsignados: ["agenda", "clients", "pos", "club"] });
  assert.ok(!appsDeLaCasa(casa, appsVisibles(bp)).some((a) => a.id === "torneo"));
  // El ambiente de pruebas de WPE (club + torneo): el torneo se ve al lado del club y su ruta no rebota.
  const wpe = negocio({ modulosAsignados: ["clients", "pos", "club", "torneo"] });
  assert.equal(appCasa(wpe)?.id, "club");
  const ids = appsDeLaCasa(casa, appsVisibles(wpe)).map((a) => a.id);
  assert.ok(ids.includes("club") && ids.includes("torneo"), ids.join(", "));
  assert.equal(rutaDeLaCasa("/admin/torneo", casa), true);
  // Lo demás sigue rebotando.
  assert.equal(rutaDeLaCasa("/admin/turnos", casa), false);
});
