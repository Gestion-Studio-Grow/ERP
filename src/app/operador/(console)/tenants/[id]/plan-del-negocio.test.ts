import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "@/modules/catalog";
import { modulosDelPlan, planPorId } from "@/planes/catalogo";
import { ACCION_AJUSTAR, ACCION_QUITAR_AJUSTE, ENTIDAD_LIMITE, limitesDelNegocio, type FilaDeLimite } from "@/planes/limites";
import { CANAL_INTERRUPTOR } from "@/cambios/interruptores";
import { estadoDeApps, type FlagsDeApps } from "./apps-del-negocio";
import {
  excepcionesVigentes,
  filasQueCierranExcepciones,
  motivoSiFaltaConfirmar,
  MOTIVO_PLAN_INEXISTENTE,
  MOTIVO_PLAN_OK_DEL_DUENIO,
  vistaPreviaDePlan,
  type NegocioParaPlan,
} from "./plan-del-negocio";

const registry = catalogo();
const CON_APPS: FlagsDeApps = { registroGlobal: false, enInicioPorApps: true };
const SIN_APPS: FlagsDeApps = { registroGlobal: false, enInicioPorApps: false };

/** magra en el laboratorio: carnicería de mostrador con el plan Micro. */
function magra(plan: "micro" | "pyme" = "micro", extra: Partial<NegocioParaPlan> = {}): NegocioParaPlan {
  return {
    id: "t-magra",
    slug: "magra",
    blueprintId: "carniceria",
    esMostrador: true,
    carniceriaLista: true,
    perfil: null,
    vinculosActivos: 0,
    plan,
    profile: planPorId(plan).perfil,
    modules: modulosDelPlan(plan, "carniceria").modulos,
    ...extra,
  };
}

/** El negocio como queda después de escribir la vista previa. */
function aplicar(n: NegocioParaPlan, plan: string, flags: FlagsDeApps): NegocioParaPlan {
  const v = vistaPreviaDePlan(n, plan, flags, registry);
  assert.ok(v.ok, v.ok ? "" : v.motivo);
  return { ...n, plan: v.despues.plan, modules: v.despues.modules, profile: v.despues.profile };
}

const ids = (apps: readonly { id: string }[]) => apps.map((a) => a.id).sort();

for (const [nombre, flags] of [["trabajando por apps", CON_APPS], ["sin «Trabaja por apps»", SIN_APPS]] as const) {
  test(`magra Micro → PyME → Micro ${nombre}: la vista previa coincide con el Inicio posterior y vuelve igual`, () => {
    const inicial = magra("micro");
    const hoy = ids(estadoDeApps(inicial, flags, registry).hoy);

    const ida = vistaPreviaDePlan(inicial, "pyme", flags, registry);
    assert.ok(ida.ok);
    assert.equal(ida.sinCambios, false);
    const enPyme = aplicar(inicial, "pyme", flags);
    const inicioPyme = estadoDeApps(enPyme, flags, registry).hoy;
    assert.deepEqual(ids(ida.appsDespues), ids(inicioPyme), "la vista previa es el Inicio de después");
    assert.deepEqual(
      ids([...inicioPyme]),
      [...new Set([...hoy.filter((id) => !ida.alAplicar.pierde.some((a) => a.id === id)), ...ids(ida.alAplicar.gana)])].sort(),
      "hoy − pierde + gana = después",
    );
    assert.equal(ida.despues.profile, "enterprise");

    const vuelta = vistaPreviaDePlan(enPyme, "micro", flags, registry);
    assert.ok(vuelta.ok);
    const deVuelta = aplicar(enPyme, "micro", flags);
    assert.deepEqual(ids(vuelta.appsDespues), hoy, "vuelve a las mismas pantallas");
    assert.deepEqual([...deVuelta.modules].sort(), [...inicial.modules].sort(), "vuelve a la misma asignación");
    assert.deepEqual(ids(vuelta.alAplicar.gana), ids(ida.alAplicar.pierde));
    assert.deepEqual(ids(vuelta.alAplicar.pierde), ids(ida.alAplicar.gana));
  });
}

test("PyME suma apps a magra trabajando por apps, y bajar a Micro pide confirmar lo que pierde", () => {
  const ida = vistaPreviaDePlan(magra("micro"), "pyme", CON_APPS, registry);
  assert.ok(ida.ok);
  assert.ok(ida.alAplicar.gana.length > 0, "PyME trae más pantallas que Micro");
  assert.equal(ida.alAplicar.pierde.length, 0);
  assert.equal(motivoSiFaltaConfirmar(ida, false), null, "sumar no necesita confirmación");

  const baja = vistaPreviaDePlan(magra("pyme"), "micro", CON_APPS, registry);
  assert.ok(baja.ok);
  assert.ok(baja.alAplicar.pierde.length > 0);
  assert.match(motivoSiFaltaConfirmar(baja, false) ?? "", /Marcá «Entiendo»/);
  assert.equal(motivoSiFaltaConfirmar(baja, true), null);
  assert.ok(baja.datosQueQuedan.every((l) => /queda guardado/.test(l)));
  assert.equal(baja.datosQueQuedan.length, baja.modulosQueSeApagan.length);
});

test("CH (beauty-spa) queda bloqueado con el motivo del OK del dueño, con cualquier plan", () => {
  for (const plan of ["facturacion", "micro", "comerciante", "pyme", "estudio"]) {
    const v = vistaPreviaDePlan(magra("micro", { slug: "beauty-spa", blueprintId: "estetica" }), plan, SIN_APPS, registry);
    assert.deepEqual(v, { ok: false, motivo: MOTIVO_PLAN_OK_DEL_DUENIO });
  }
  assert.match(MOTIVO_PLAN_OK_DEL_DUENIO, /Requiere OK del dueño/);
});

test("un plan que no existe se rechaza con cómo seguir", () => {
  assert.deepEqual(vistaPreviaDePlan(magra(), "premium", CON_APPS, registry), { ok: false, motivo: MOTIVO_PLAN_INEXISTENTE });
});

test("con locales vinculados no baja a un plan sin «Mis locales»; sin vínculos sí; sin poder leerlos, no", () => {
  const pyme = magra("pyme");
  assert.ok(pyme.modules.includes("multilocal"), "PyME trae la red de locales");
  const con2 = vistaPreviaDePlan({ ...pyme, vinculosActivos: 2 }, "micro", CON_APPS, registry);
  assert.equal(con2.ok, false);
  assert.match(con2.ok ? "" : con2.motivo, /Tiene 2 locales vinculados a su red.*Red de locales/);
  assert.equal(vistaPreviaDePlan({ ...pyme, vinculosActivos: null }, "micro", CON_APPS, registry).ok, false);
  assert.equal(vistaPreviaDePlan({ ...pyme, vinculosActivos: 0 }, "micro", CON_APPS, registry).ok, true);
});

test("mismo plan, módulos y perfil: sin cambios y sin excepciones que cerrar", () => {
  const v = vistaPreviaDePlan(magra("micro"), "micro", CON_APPS, registry);
  assert.ok(v.ok);
  assert.equal(v.sinCambios, true);
  assert.deepEqual(v.excepcionesQueSeCierran, []);
});

test("el agregado sumado por fuera del plan se conserva si el plan nuevo lo acepta; si no, se apaga con sus datos guardados", () => {
  const baseFact = modulosDelPlan("facturacion", "carniceria").modulos;
  const n = magra("micro", { plan: "facturacion", profile: "lite", modules: [...new Set([...baseFact, "libros"])] });
  const aMicro = vistaPreviaDePlan(n, "micro", CON_APPS, registry);
  assert.ok(aMicro.ok && aMicro.despues.modules.includes("libros"), "libros es agregable de Micro: se conserva");
  const aPyme = vistaPreviaDePlan(n, "pyme", CON_APPS, registry);
  assert.ok(aPyme.ok);
  const pymeLoTrae = modulosDelPlan("pyme", "carniceria").modulos.includes("libros");
  assert.equal(aPyme.despues.modules.includes("libros"), pymeLoTrae);
  if (!pymeLoTrae) assert.ok(aPyme.datosQueQuedan.some((l) => /queda guardado/.test(l)));
});

function fila(p: Partial<FilaDeLimite> & { changes: unknown }): FilaDeLimite {
  return {
    id: p.id ?? "f1",
    entity: p.entity ?? ENTIDAD_LIMITE,
    entityId: p.entityId ?? "usuarios",
    action: p.action ?? ACCION_AJUSTAR,
    actor: p.actor ?? "operator:ana",
    channel: p.channel ?? CANAL_INTERRUPTOR,
    changes: p.changes,
    createdAt: p.createdAt ?? new Date("2026-09-20T12:00:00Z"),
  };
}

test("al cambiar de plan se cierran las excepciones vigentes de todos los planes; una fila forjada desde /admin no cuenta", () => {
  const filas = [
    fila({ id: "a", changes: { plan: "micro", valor: 4 } }),
    fila({ id: "b", entityId: "locales", changes: { plan: "pyme", valor: 8 } }),
    // Forjada desde el panel del negocio: ni actor ni canal del operador.
    fila({ id: "c", entityId: "locales", actor: "admin:duena", channel: "admin", changes: { plan: "micro", valor: 50 } }),
    // Ya cerrada: la última de (comprobantesMes, micro) es quitar.
    fila({ id: "d", entityId: "comprobantesMes", changes: { plan: "micro", valor: 900 }, createdAt: new Date("2026-09-01T00:00:00Z") }),
    fila({ id: "e", entityId: "comprobantesMes", action: ACCION_QUITAR_AJUSTE, changes: { plan: "micro" } }),
  ];
  assert.equal(limitesDelNegocio({ slug: "magra", plan: "micro" }, filas).topes.locales.valor, 1, "la forjada no sube el tope");
  const vigentes = excepcionesVigentes("magra", filas);
  assert.deepEqual(
    vigentes.map((e) => `${e.limite}|${e.plan}|${e.valor}`).sort(),
    ["locales|pyme|8", "usuarios|micro|4"],
  );
  const v = vistaPreviaDePlan(magra("micro"), "pyme", CON_APPS, registry, filas);
  assert.ok(v.ok);
  assert.equal(v.excepcionesQueSeCierran.length, 2);
  const cierres = filasQueCierranExcepciones("t-magra", "ana", v.excepcionesQueSeCierran);
  assert.ok(cierres.every((c) => c.action === ACCION_QUITAR_AJUSTE && c.channel === CANAL_INTERRUPTOR && c.actor === "operator:ana"));
  // Con los cierres escritos, ninguna excepción vuelve a valer en ningún plan.
  const despues = [
    ...filas,
    ...cierres.map((c, i) => fila({ id: `z${i}`, entityId: c.entityId, action: c.action, changes: c.changes, createdAt: new Date("2026-09-25T00:00:00Z") })),
  ];
  assert.deepEqual(excepcionesVigentes("magra", despues), []);
});

test("la escritura sólo lleva plan, modules y profile", () => {
  const v = vistaPreviaDePlan(magra("micro"), "comerciante", CON_APPS, registry);
  assert.ok(v.ok);
  assert.deepEqual(Object.keys(v.despues).sort(), ["modules", "plan", "profile"]);
});
