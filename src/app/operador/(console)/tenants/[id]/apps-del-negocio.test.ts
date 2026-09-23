// ============================================================================
// APPS DEL NEGOCIO — el plan de activación y la vista previa, ejecutados con datos.
// ============================================================================
//
// Corren contra el catálogo de módulos REAL y el registro de apps REAL: si alguien cambia
// de qué módulo cuelga una app, estos tests dicen qué gana o pierde cada negocio.

import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "@/modules/catalog";
import { defaultModulesForBlueprint } from "@/blueprints/presets-meta";
import type { AppDescriptor } from "@/apps/contract";
import {
  appsPorModulo,
  estadoDeApps,
  mismoConjunto,
  planFijarAsignacion,
  requiereOkDelDuenio,
  validarCambio,
  vistaPreviaDeCambio,
  type FlagsDeApps,
  type NegocioParaActivar,
} from "./apps-del-negocio";

const cat = catalogo();
const SIN_PILOTO: FlagsDeApps = { registroGlobal: false, appsInicio: undefined };
const PILOTO: FlagsDeApps = { registroGlobal: false, appsInicio: "magra,shinevelas,adosmanos" };
const ids = (apps: readonly AppDescriptor[]) => apps.map((a) => a.id);

// magra como está en la base de QA (psql erp_qa_apps, 2026-09-23), con la migración cárnica.
const MAGRA: NegocioParaActivar = {
  id: "t-magra",
  slug: "magra",
  blueprintId: "carniceria",
  modules: ["pos", "catalog", "clients", "reports", "arca"],
  esMostrador: true,
  carniceriaLista: true,
  perfil: null,
};

// Una estética con la asignación de su rubro (agenda + lista de espera activas).
const ESTETICA: NegocioParaActivar = {
  id: "t-estetica",
  slug: "estetica-norte",
  blueprintId: "servicios",
  modules: defaultModulesForBlueprint("servicios"),
  esMostrador: false,
  carniceriaLista: false,
  perfil: null,
};

// Un negocio como CH (sin rubro ni módulos) pero que NO es CH: para medir la asignación mínima
// sin chocar con el candado de beauty-spa.
const COMO_CH: NegocioParaActivar = {
  id: "t-como-ch",
  slug: "estetica-sur",
  blueprintId: null,
  modules: [],
  esMostrador: false,
  carniceriaLista: false,
  perfil: null,
};

// ── Activar inventario en magra: la vista previa muestra las apps de stock ────

test("activar inventario en magra: con el Inicio por apps gana Stock y las apps de stock, sin perder nada", () => {
  const v = vistaPreviaDeCambio(MAGRA, { accion: "activar", modulo: "inventario" }, SIN_PILOTO, cat);
  assert.ok(v.ok);
  assert.deepEqual(ids(v.conInicio.gana), [
    "inventario",
    "mermas",
    "recibir-mercaderia",
    "lotes-y-vencimientos",
    "despiece",
  ]);
  assert.equal(v.conInicio.gana[0].nombre, "Stock");
  assert.deepEqual(v.conInicio.pierde, []);
  // Catálogo ya estaba: no se arrastra nada.
  assert.deepEqual(v.incluidos, []);
  assert.deepEqual(new Set(v.despues), new Set([...MAGRA.modules, "inventario"]));
});

test("fuera del Inicio por apps el cambio no se nota hoy; adentro, se nota apenas se confirma", () => {
  const fuera = vistaPreviaDeCambio(MAGRA, { accion: "activar", modulo: "inventario" }, SIN_PILOTO, cat);
  assert.ok(fuera.ok);
  assert.deepEqual(fuera.alConfirmar, { gana: [], pierde: [] });

  const adentro = vistaPreviaDeCambio(MAGRA, { accion: "activar", modulo: "inventario" }, PILOTO, cat);
  assert.ok(adentro.ok);
  assert.ok(ids(adentro.alConfirmar.gana).includes("inventario"));
});

test("activar inventario sin catálogo arrastra el catálogo (dependencia) y lo avisa", () => {
  const sinCatalogo = { ...MAGRA, modules: ["pos", "clients", "reports", "arca"] };
  const plan = validarCambio(sinCatalogo, { accion: "activar", modulo: "inventario" }, cat);
  assert.ok(plan.ok);
  assert.deepEqual(plan.incluidos, ["catalog"]);
  assert.ok(plan.despues.includes("catalog") && plan.despues.includes("inventario"));
});

test("activar un módulo que ya está no escribe nada", () => {
  const plan = validarCambio(MAGRA, { accion: "activar", modulo: "pos" }, cat);
  assert.ok(plan.ok);
  assert.equal(plan.sinCambios, true);
});

// ── Desactivar: dependencias, núcleo y rubro ─────────────────────────────────

test("apagar agenda con lista de espera activa: queda bloqueado, con el motivo", () => {
  assert.ok(ESTETICA.modules.includes("waitlist"));
  const plan = validarCambio(ESTETICA, { accion: "desactivar", modulo: "agenda" }, cat);
  assert.equal(plan.ok, false);
  assert.match(plan.ok ? "" : plan.motivo, /Lista de espera/);
  // La vista previa dice lo mismo: no ofrece confirmar.
  const v = vistaPreviaDeCambio(ESTETICA, { accion: "desactivar", modulo: "agenda" }, SIN_PILOTO, cat);
  assert.equal(v.ok, false);
});

test("apagar la lista de espera primero sí se puede, y la vista previa dice qué app pierde", () => {
  const v = vistaPreviaDeCambio(ESTETICA, { accion: "desactivar", modulo: "waitlist" }, SIN_PILOTO, cat);
  assert.ok(v.ok);
  assert.deepEqual(ids(v.conInicio.pierde), ["lista-de-espera"]);
  assert.ok(!v.despues.includes("waitlist"));
});

test("en un Comerciante no se apaga un módulo que viene con su plan", () => {
  const comerciante = { slug: "kiosco", blueprintId: "generico", modules: ["arca", "bancos", "clients", "reports"] };
  const plan = validarCambio(comerciante, { accion: "desactivar", modulo: "arca" }, cat);
  assert.equal(plan.ok, false);
  assert.match(plan.ok ? "" : plan.motivo, /viene con tu plan/);
});

test("un módulo de otro rubro no se activa (comisiones en una carnicería)", () => {
  const plan = validarCambio(MAGRA, { accion: "activar", modulo: "commissions" }, cat);
  assert.equal(plan.ok, false);
  assert.match(plan.ok ? "" : plan.motivo, /rubro/);
});

test("un módulo que no existe se rechaza con el motivo", () => {
  const plan = validarCambio(MAGRA, { accion: "activar", modulo: "no-existe" }, cat);
  assert.equal(plan.ok, false);
  assert.match(plan.ok ? "" : plan.motivo, /no existe/);
});

// ── Candados de la consola ───────────────────────────────────────────────────

test("CH (beauty-spa): ni cambios de a uno ni 'fijar' sin el OK del dueño", () => {
  const ch: NegocioParaActivar = { ...COMO_CH, id: "t-ch", slug: "beauty-spa" };
  assert.equal(requiereOkDelDuenio("beauty-spa"), true);
  assert.equal(requiereOkDelDuenio("magra"), false);
  const cambio = validarCambio(ch, { accion: "activar", modulo: "agenda" }, cat);
  assert.equal(cambio.ok, false);
  assert.match(cambio.ok ? "" : cambio.motivo, /requiere OK del dueño/i);
  const fijar = planFijarAsignacion(ch, SIN_PILOTO, cat);
  assert.equal(fijar.ok, false);
  assert.match(fijar.ok ? "" : fijar.motivo, /requiere OK del dueño/i);
});

test("cartera y multilocal no pueden estar juntos, en ningún orden", () => {
  const estudio = { slug: "estudio", blueprintId: "generico", modules: ["cartera", "arca", "bancos", "clients", "reports"] };
  const a = validarCambio(estudio, { accion: "activar", modulo: "multilocal" }, cat);
  assert.equal(a.ok, false);
  assert.match(a.ok ? "" : a.motivo, /no pueden estar juntos/);
  const casa = { slug: "magra", blueprintId: "carniceria", modules: ["multilocal", "pos"] };
  const b = validarCambio(casa, { accion: "activar", modulo: "cartera" }, cat);
  assert.equal(b.ok, false);
  assert.match(b.ok ? "" : b.motivo, /no pueden estar juntos/);
  // Un negocio que ya quedó con los dos puede sacarse uno (la salida del estado prohibido).
  const mezclado = { slug: "viejo", blueprintId: "generico", modules: ["cartera", "multilocal", "arca", "bancos", "clients", "reports"] };
  const c = validarCambio(mezclado, { accion: "desactivar", modulo: "multilocal" }, cat);
  assert.ok(c.ok);
  assert.ok(!c.despues.includes("multilocal"));
});

test("multilocal se puede asignar y todavía no abre ninguna app", () => {
  const v = vistaPreviaDeCambio(MAGRA, { accion: "activar", modulo: "multilocal" }, SIN_PILOTO, cat);
  assert.ok(v.ok);
  assert.deepEqual(v.conInicio, { gana: [], pierde: [] });
  assert.equal(appsPorModulo().get("multilocal") ?? 0, 0);
});

test("activar cartera en un negocio del rubro lo convierte en Contador: la vista previa lo avisa", () => {
  const v = vistaPreviaDeCambio(MAGRA, { accion: "activar", modulo: "cartera" }, SIN_PILOTO, cat);
  assert.ok(v.ok);
  assert.deepEqual(v.producto, { antes: "vertical", despues: "contador" });
});

// ── Frente a hoy y "Fijar asignación actual" ─────────────────────────────────

test("magra hoy: fuera del Inicio por apps, y con su asignación perdería apps frente a hoy", () => {
  const e = estadoDeApps(MAGRA, SIN_PILOTO, cat);
  assert.equal(e.gate, "sin-gate");
  assert.equal(e.enInicioPorApps, false);
  assert.deepEqual(ids(e.conInicioFrenteAlMenu.pierde).sort(), [
    "campanias",
    "despiece",
    "facturacion-automatica",
    "inventario",
    "lotes-y-vencimientos",
    "mermas",
    "recibir-mercaderia",
  ]);
});

test("fijar en magra suma lo mínimo (inventario, campañas, bancos) y deja 0 apps perdidas", () => {
  const f = planFijarAsignacion(MAGRA, SIN_PILOTO, cat);
  assert.ok(f.ok);
  assert.deepEqual([...f.agregados].sort(), ["bancos", "campanias", "inventario"]);
  // Nunca saca: lo de antes sigue.
  for (const m of MAGRA.modules) assert.ok(f.despues.includes(m));
  assert.deepEqual(f.frenteAlMenu.pierde, []);
  assert.deepEqual(f.noSeRecuperan, []);

  // Con la asignación fijada, la tarjeta da 0 apps perdidas antes de prender APPS_INICIO...
  const fijado = { ...MAGRA, modules: f.despues };
  assert.deepEqual(estadoDeApps(fijado, SIN_PILOTO, cat).conInicioFrenteAlMenu.pierde, []);
  // ...y después de prenderlo ve exactamente lo mismo que hoy.
  const hoy = ids(estadoDeApps(MAGRA, SIN_PILOTO, cat).hoy);
  const conPiloto = estadoDeApps(fijado, PILOTO, cat);
  assert.equal(conPiloto.gate, "piloto");
  assert.deepEqual(ids(conPiloto.hoy), hoy);
  // Y volver a fijar no tiene nada que hacer.
  const otra = planFijarAsignacion(fijado, PILOTO, cat);
  assert.ok(otra.ok);
  assert.equal(otra.sinCambios, true);
});

test("ya en el piloto con la asignación incompleta: la tarjeta lo marca y fijar le devuelve lo perdido", () => {
  const e = estadoDeApps(MAGRA, PILOTO, cat);
  assert.equal(e.gate, "piloto");
  assert.equal(e.enInicioPorApps, true);
  // Hoy (ya filtrado) no ve Stock...
  assert.ok(!ids(e.hoy).includes("inventario"));
  // ...y frente al menú de siempre lo marca como perdido.
  assert.ok(ids(e.conInicioFrenteAlMenu.pierde).includes("inventario"));
  const f = planFijarAsignacion(MAGRA, PILOTO, cat);
  assert.ok(f.ok);
  assert.deepEqual([...f.agregados].sort(), ["bancos", "campanias", "inventario"]);
  assert.deepEqual(f.frenteAlMenu.pierde, []);
});

test("sin módulos asignados: el Inicio por apps no filtra, y fijar da la asignación completa de su menú", () => {
  const e = estadoDeApps(COMO_CH, SIN_PILOTO, cat);
  assert.equal(e.sinAsignacion, true);
  assert.deepEqual(e.conInicioFrenteAlMenu.pierde, []);

  const f = planFijarAsignacion(COMO_CH, SIN_PILOTO, cat);
  assert.ok(f.ok);
  assert.deepEqual([...f.agregados].sort(), [
    "agenda",
    "arca",
    "bancos",
    "campanias",
    "catalog",
    "clients",
    "inventario",
    "pos",
    "reminders",
    "reports",
    "reviews",
    "waitlist",
  ]);
  assert.deepEqual(f.frenteAlMenu.pierde, []);
  assert.deepEqual(estadoDeApps({ ...COMO_CH, modules: f.despues }, SIN_PILOTO, cat).conInicioFrenteAlMenu.pierde, []);
});

test("shinevelas y adosmanos con la asignación de su rubro: fijar deja 0 apps perdidas", () => {
  for (const [slug, rubro] of [
    ["shinevelas", "velas"],
    ["adosmanos", "padel"],
  ] as const) {
    const n: NegocioParaActivar = {
      id: `t-${slug}`,
      slug,
      blueprintId: rubro,
      modules: defaultModulesForBlueprint(rubro),
      esMostrador: true,
      carniceriaLista: true,
      perfil: null,
    };
    const f = planFijarAsignacion(n, SIN_PILOTO, cat);
    assert.ok(f.ok, slug);
    // Stock (inventario), Campañas y las dos de facturación las ven hoy sin tener el módulo.
    assert.deepEqual([...f.agregados].sort(), ["arca", "bancos", "campanias", "inventario"], slug);
    assert.deepEqual(f.frenteAlMenu.pierde, [], slug);
  }
});

test("activar un solo módulo en un negocio sin asignación prende el filtro: la vista previa muestra todo lo que perdería", () => {
  const v = vistaPreviaDeCambio(COMO_CH, { accion: "activar", modulo: "agenda" }, SIN_PILOTO, cat);
  assert.ok(v.ok);
  assert.ok(ids(v.conInicio.pierde).includes("clientes"));
  assert.ok(ids(v.frenteAlMenu.pierde).includes("caja-del-dia") === false, "la caja es del núcleo: no se pierde");
  assert.ok(v.frenteAlMenu.pierde.length > 5);
});

test("mismoConjunto: ignora el orden y los repetidos, no los faltantes", () => {
  assert.equal(mismoConjunto(["a", "b"], ["b", "a"]), true);
  assert.equal(mismoConjunto(["a", "a", "b"], ["b", "a"]), true);
  assert.equal(mismoConjunto(["a"], ["a", "b"]), false);
  assert.equal(mismoConjunto([], []), true);
});
