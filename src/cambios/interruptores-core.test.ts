// ============================================================================
// INTERRUPTORES — la decisión y el recorrido de la action, EJECUTADOS.
// ============================================================================
//
// `cambiarInterruptorCon` es lo que corre la action de la consola; acá corre con una base en
// memoria que se comporta como la real (escritura condicional incluida). La vista previa sale del
// catálogo de módulos y del registro de apps REALES, así que "0 apps perdidas" se mide de verdad.
// La misma escritura contra Postgres está en interruptores-escritura.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "@/modules/catalog";
import { appsVisibles, resolverContextoApps } from "@/apps/visibles";
import {
  mismoConjunto,
  planFijarAsignacion,
  type NegocioParaActivar,
} from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import {
  ACCION_ENCENDER,
  CANAL_INTERRUPTOR,
  ENTIDAD_INTERRUPTOR,
  INICIO_POR_APPS,
  entidadReservadaDeLaConsola,
  textoDeInterruptorEnAuditoria,
} from "./interruptores";
import {
  cambiarInterruptorCon,
  estadoDesdeFilas,
  trabajaPorApps,
  CAMBIO_MIENTRAS_MIRABAS,
  type DepsDeCambio,
  type FilaLeida,
  type PedidoDeInterruptor,
} from "./interruptores-core";

import { appPorId } from "@/apps/registro";
import { motivoNoDisponible, type NegocioApps } from "@/apps/visibles";
import { describirAccion } from "@/app/admin/(dashboard)/auditoria/frase";
import { estadoDeApps } from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import {
  ACCION_OCULTAR,
  APPS_OCULTABLES,
  ENTIDAD_APP_OCULTA,
} from "./interruptores";
import {
  cambiarAppOcultaCon,
  filaDeAppOculta,
  ocultasDesdeFilas,
  ocultasParaElPanel,
  MOTIVO_PERDIDAS_EN_CLIENTE_VIVO,
  type DepsDeAppOculta,
  type PedidoDeAppOculta,
} from "./interruptores-core";

const cat = catalogo();

/** Las sesiones, como las arma el token firmado: un operador de OPERADORES y el dueño. */
const FACU = { nombre: "facu", esDuenio: false };
const DUENIO = { nombre: "tomas", esDuenio: true };

// Una carnicería (casa) como las de QA, con la asignación ya fijada: 0 apps perdidas.
const CARNICERIA_SIN_FIJAR: NegocioParaActivar = {
  id: "t-qa-carniceria",
  slug: "qa-carniceria",
  blueprintId: "carniceria",
  modules: ["pos", "catalog", "clients", "reports", "arca"],
  esMostrador: true,
  carniceriaLista: true,
  perfil: null,
};
const fijar = planFijarAsignacion(CARNICERIA_SIN_FIJAR, { registroGlobal: false, enInicioPorApps: false }, cat);
assert.ok(fijar.ok);
const CARNICERIA: NegocioParaActivar = { ...CARNICERIA_SIN_FIJAR, modules: fijar.despues };

// CH como está en la base: sin rubro ni módulos.
const CH: NegocioParaActivar = {
  id: "t-ch",
  slug: "beauty-spa",
  blueprintId: null,
  modules: [],
  esMostrador: false,
  carniceriaLista: false,
  perfil: null,
};

type Fila = FilaLeida & { tenantId: string; changes?: unknown };

/** Una base en memoria con la misma escritura condicional que la real. */
function base(negocios: NegocioParaActivar[]) {
  const porId = new Map(negocios.map((n) => [n.id, n]));
  const filas: Fila[] = [];
  let reloj = Date.parse("2026-09-24T12:00:00Z");
  const de = (tenantId: string) => filas.filter((f) => f.tenantId === tenantId);
  let escrituras = 0;
  const deps: DepsDeCambio = {
    duenio: "tomas",
    registroGlobal: false,
    registry: cat,
    leerNegocio: async (id) => porId.get(id) ?? null,
    leerEstado: async (id) => estadoDesdeFilas(de(id)),
    escribirSiSigueIgual: async (fila, condicion) => {
      const n = porId.get(fila.tenantId);
      if (!n || !mismoConjunto(n.modules, condicion.modules)) return false;
      if (estadoDesdeFilas(de(fila.tenantId))[fila.entityId].encendido !== condicion.encendido) return false;
      reloj += 60_000;
      filas.push({ ...fila, id: `f${filas.length + 1}`, createdAt: new Date(reloj) });
      escrituras++;
      return true;
    },
  };
  return {
    deps,
    filas,
    de,
    escrituras: () => escrituras,
    /** Lo que el panel del negocio lee en la próxima carga (interruptores.server.ts hace lo mismo con la base). */
    trabajaPorApps: (id: string) => trabajaPorApps(estadoDesdeFilas(de(id))),
    forjar: (f: Omit<Fila, "id" | "createdAt">) => {
      reloj += 60_000;
      filas.push({ ...f, id: `forjada${filas.length + 1}`, createdAt: new Date(reloj) });
    },
  };
}

function pedido(n: NegocioParaActivar, accion: "encender" | "apagar", over: Partial<PedidoDeInterruptor> = {}): PedidoDeInterruptor {
  return {
    tenantId: n.id,
    interruptor: INICIO_POR_APPS,
    accion,
    visto: accion === "encender" ? "apagado" : "encendido",
    modulosVistos: [...n.modules],
    slugTipeado: "",
    ...over,
  };
}

// ── Encender y apagar ────────────────────────────────────────────────────────

test("qa-carniceria: prender 'Trabaja por apps' → la próxima carga ve el Inicio por apps; apagar → el menú de siempre", async () => {
  const b = base([CARNICERIA]);
  assert.equal(b.trabajaPorApps(CARNICERIA.id), false);

  const r = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender"));
  assert.deepEqual(r, { tipo: "hecho", interruptor: INICIO_POR_APPS, accion: "encender" });
  // Lo que decide el Inicio (page.tsx: `if (await enInicioPorApps()) return <InicioApps />`) y el
  // gate por módulo de la barra y la guardia.
  assert.equal(b.trabajaPorApps(CARNICERIA.id), true);
  const conGate = resolverContextoApps(CARNICERIA, { registroGlobal: false, enInicioPorApps: true }, cat);
  assert.equal(conGate?.origen, "piloto");

  const r2 = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "apagar"));
  assert.equal(r2.tipo, "hecho");
  assert.equal(b.trabajaPorApps(CARNICERIA.id), false);
  assert.equal(resolverContextoApps(CARNICERIA, { registroGlobal: false, enInicioPorApps: false }, cat), null);
});

test("el historial dice el nombre del operador y la hora; la fila es de la consola", async () => {
  const b = base([CARNICERIA]);
  await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender"));
  const [fila] = b.filas;
  assert.equal(fila.actor, "operator:facu");
  assert.equal(fila.channel, CANAL_INTERRUPTOR);
  assert.equal(fila.entity, ENTIDAD_INTERRUPTOR);
  assert.equal(fila.entityId, INICIO_POR_APPS);
  assert.equal(fila.action, ACCION_ENCENDER);
  const e = estadoDesdeFilas(b.de(CARNICERIA.id))[INICIO_POR_APPS];
  assert.equal(e.quien, "facu");
  assert.ok(e.cuando instanceof Date);
});

test("volver a prender lo que ya está prendido no escribe nada", async () => {
  const b = base([CARNICERIA]);
  await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender"));
  // Otra pestaña que vio "encendido" y manda encender (formulario viejo): sin cambios, sin fila.
  const r = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender", { visto: "encendido" }));
  assert.equal(r.tipo, "sin-cambios");
  assert.equal(b.escrituras(), 1);
});

// ── CH ───────────────────────────────────────────────────────────────────────

test("beauty-spa: un operador que no es el dueño es rechazado, aunque escriba el slug", async () => {
  const b = base([CH]);
  const r = await cambiarInterruptorCon(b.deps, FACU, pedido(CH, "encender", { slugTipeado: "beauty-spa" }));
  assert.equal(r.tipo, "rechazado");
  assert.match((r as { motivo: string }).motivo, /sólo el dueño de GSG \(tomas\)/);
  assert.equal(b.escrituras(), 0);
});

test("beauty-spa: el dueño sin tipear el slug (o con otro) es rechazado; con el slug, pasa", async () => {
  const b = base([CH]);
  for (const slugTipeado of ["", "beauty", "magra"]) {
    const r = await cambiarInterruptorCon(b.deps, DUENIO, pedido(CH, "encender", { slugTipeado }));
    assert.equal(r.tipo, "rechazado", slugTipeado);
    assert.match((r as { motivo: string }).motivo, /escribí exactamente el slug/);
  }
  assert.equal(b.escrituras(), 0);
  const ok = await cambiarInterruptorCon(b.deps, DUENIO, pedido(CH, "encender", { slugTipeado: " Beauty-Spa " }));
  assert.equal(ok.tipo, "hecho");
  // Y apagarlo también es sólo del dueño.
  const ajeno = await cambiarInterruptorCon(b.deps, FACU, pedido(CH, "apagar", { slugTipeado: "beauty-spa" }));
  assert.equal(ajeno.tipo, "rechazado");
});

test("beauty-spa: una sesión de OPERADORES con el nombre del dueño NO es el dueño (manda el rol firmado)", async () => {
  const b = base([CH]);
  const r = await cambiarInterruptorCon(b.deps, { nombre: "tomas", esDuenio: false }, pedido(CH, "encender", { slugTipeado: "beauty-spa" }));
  assert.equal(r.tipo, "rechazado");
  assert.equal(b.escrituras(), 0);
});

test("CH sin interruptor: sin gate por módulo, ve lo de hoy (la barra la fija paridad-menu.test.ts)", () => {
  const b = base([CH]);
  assert.equal(b.trabajaPorApps(CH.id), false);
  assert.equal(resolverContextoApps(CH, { registroGlobal: false, enInicioPorApps: false }, cat), null);
});

// ── 0 apps perdidas, en el servidor ───────────────────────────────────────────

test("con apps perdidas > 0 el servidor rechaza, aunque el formulario llegue armado a mano", async () => {
  // La carnicería SIN fijar la asignación: con el Inicio por apps perdería Stock y compras.
  const b = base([CARNICERIA_SIN_FIJAR]);
  const r = await cambiarInterruptorCon(b.deps, DUENIO, pedido(CARNICERIA_SIN_FIJAR, "encender"));
  assert.equal(r.tipo, "rechazado");
  assert.match((r as { motivo: string }).motivo, /perdería \d+ apps? de su menú de siempre: .*Stock/);
  assert.equal(b.escrituras(), 0);
  assert.equal(b.trabajaPorApps(CARNICERIA_SIN_FIJAR.id), false);
  // Apagar nunca se frena por apps: es la vuelta atrás.
});

test("cambió mientras miraba: otro estado, otros módulos o la escritura condicional que no pasa", async () => {
  const b = base([CARNICERIA]);
  // Vio "encendido" pero está apagado.
  const r1 = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "apagar"));
  assert.deepEqual(r1, { tipo: "rechazado", motivo: CAMBIO_MIENTRAS_MIRABAS });
  // Vio otros módulos.
  const r2 = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender", { modulosVistos: ["pos"] }));
  assert.deepEqual(r2, { tipo: "rechazado", motivo: CAMBIO_MIENTRAS_MIRABAS });
  // Entre la lectura y la escritura, otra pestaña lo prendió: la escritura condicional no escribe.
  const deps: DepsDeCambio = { ...b.deps, escribirSiSigueIgual: async () => false };
  const r3 = await cambiarInterruptorCon(deps, FACU, pedido(CARNICERIA, "encender"));
  assert.deepEqual(r3, { tipo: "rechazado", motivo: CAMBIO_MIENTRAS_MIRABAS });
  assert.equal(b.escrituras(), 0);
});

test("pedidos rotos y negocios que no existen no escriben", async () => {
  const b = base([CARNICERIA]);
  for (const over of [{ interruptor: "otro" }, { accion: "borrar" }, { visto: "quizas" }, { modulosVistos: null }]) {
    const r = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender", over));
    assert.equal(r.tipo, "rechazado", JSON.stringify(over));
  }
  assert.deepEqual(await cambiarInterruptorCon(b.deps, FACU, { ...pedido(CARNICERIA, "encender"), tenantId: "no" }), {
    tipo: "no-existe",
  });
  const sinLectura: DepsDeCambio = { ...b.deps, leerEstado: async () => null };
  assert.equal((await cambiarInterruptorCon(sinLectura, FACU, pedido(CARNICERIA, "encender"))).tipo, "rechazado");
  assert.equal(b.escrituras(), 0);
});

// ── Filas forjadas ───────────────────────────────────────────────────────────

test("una fila forjada con audit() (canal admin, actor de un usuario) se ignora, aunque sea más nueva", async () => {
  const b = base([CARNICERIA]);
  b.forjar({ tenantId: CARNICERIA.id, entity: ENTIDAD_INTERRUPTOR, entityId: INICIO_POR_APPS, action: ACCION_ENCENDER, actor: "user:recepcion", channel: "admin" });
  // Ni con actor de operador por el canal equivocado, ni por el canal correcto con otro actor.
  b.forjar({ tenantId: CARNICERIA.id, entity: ENTIDAD_INTERRUPTOR, entityId: INICIO_POR_APPS, action: ACCION_ENCENDER, actor: "operator:x", channel: "admin" });
  b.forjar({ tenantId: CARNICERIA.id, entity: ENTIDAD_INTERRUPTOR, entityId: INICIO_POR_APPS, action: ACCION_ENCENDER, actor: "user:x", channel: CANAL_INTERRUPTOR });
  b.forjar({ tenantId: CARNICERIA.id, entity: ENTIDAD_INTERRUPTOR, entityId: INICIO_POR_APPS, action: ACCION_ENCENDER, actor: "operator:", channel: CANAL_INTERRUPTOR });
  assert.equal(b.trabajaPorApps(CARNICERIA.id), false);

  // Prendido de verdad y después una forjada que "apaga": manda la de la consola.
  await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender"));
  b.forjar({ tenantId: CARNICERIA.id, entity: ENTIDAD_INTERRUPTOR, entityId: INICIO_POR_APPS, action: "interruptor.apagar", actor: "user:recepcion", channel: "admin" });
  assert.equal(b.trabajaPorApps(CARNICERIA.id), true);
});

test("audit() tiene vedada la entidad (también con otra capitalización)", () => {
  assert.equal(entidadReservadaDeLaConsola("Interruptor"), true);
  assert.equal(entidadReservadaDeLaConsola(" interruptor "), true);
  assert.equal(entidadReservadaDeLaConsola("CierreDiario"), false);
});

// ── La Auditoría del negocio ─────────────────────────────────────────────────

test("la Auditoría del negocio dice 'GSG activó el Inicio por apps', sin JSON ni nombre del operador", async () => {
  const b = base([CARNICERIA]);
  await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender"));
  await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "apagar"));
  const textos = b.filas.map(textoDeInterruptorEnAuditoria);
  assert.deepEqual(textos, ["GSG activó el Inicio por apps", "GSG apagó el Inicio por apps"]);
  for (const t of textos) assert.ok(!/facu|\{/.test(t ?? ""), t ?? "");
  // Una forjada no se viste de GSG.
  assert.equal(
    textoDeInterruptorEnAuditoria({ entity: ENTIDAD_INTERRUPTOR, entityId: INICIO_POR_APPS, action: ACCION_ENCENDER, actor: "user:x", channel: "admin" }),
    null,
  );
});

// ── La vista previa de la ficha y la del servidor son la misma cuenta ───────

test("prendido en la carnicería fijada: ve las mismas apps que en su menú de siempre", () => {
  const n = (enInicioPorApps: boolean) => ({
    role: "OWNER" as const,
    contexto: resolverContextoApps(CARNICERIA, { registroGlobal: false, enInicioPorApps }, cat),
    modulosAsignados: CARNICERIA.modules,
    perfil: null,
    esMostrador: true,
    carniceriaLista: true,
  });
  const antes = new Set(appsVisibles(n(false)).map((a) => a.id));
  const despues = new Set(appsVisibles(n(true)).map((a) => a.id));
  assert.deepEqual([...antes].filter((id) => !despues.has(id)), []);
});

// ── Aceptar a mano las apps que pierde (fuera de CH) ─────────────────────────

/** Las apps que la carnicería sin fijar (Magra hoy) perdería con el Inicio por apps: 13. */
const PERDIDAS = estadoDeApps(CARNICERIA_SIN_FIJAR, { registroGlobal: false, enInicioPorApps: false }, cat)
  .conInicioFrenteAlMenu.pierde;

test("A1 · 13 perdidas: sin lista, el rechazo de siempre; con la lista exacta, la fila guarda pierdeAceptadas", async () => {
  assert.equal(PERDIDAS.length, 13);
  const b = base([CARNICERIA_SIN_FIJAR]);
  for (const perdidasAceptadas of [undefined, null, []]) {
    const r = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA_SIN_FIJAR, "encender", { perdidasAceptadas }));
    assert.equal(r.tipo, "rechazado");
    assert.match((r as { motivo: string }).motivo, /perdería 13 apps de su menú de siempre: .*Primero fijá la asignación actual\.$/);
  }
  assert.equal(b.escrituras(), 0);
  // La lista exacta, en otro orden que la vista previa (las casillas no tienen por qué llegar igual).
  const exacta = PERDIDAS.map((a) => a.id).reverse();
  const r = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA_SIN_FIJAR, "encender", { perdidasAceptadas: exacta }));
  assert.deepEqual(r, { tipo: "hecho", interruptor: INICIO_POR_APPS, accion: "encender" });
  assert.equal(b.escrituras(), 1);
  const changes = b.filas[0].changes as { pierdeAceptadas?: string[] };
  assert.equal(changes.pierdeAceptadas?.length, 13);
  assert.deepEqual(changes.pierdeAceptadas, [...exacta].sort());
  assert.equal(b.trabajaPorApps(CARNICERIA_SIN_FIJAR.id), true);
});

test("A1 · una fila sin pérdidas queda como siempre (sin pierdeAceptadas)", async () => {
  const b = base([CARNICERIA]);
  await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender"));
  assert.equal("pierdeAceptadas" in (b.filas[0].changes as object), false);
});

test("A2 · lista incompleta, de más, por nombre o repetida → rechazo y 0 filas", async () => {
  const ids = PERDIDAS.map((a) => a.id);
  const b = base([CARNICERIA_SIN_FIJAR]);
  const malas: (readonly string[])[] = [
    ids.slice(1),
    [...ids, "agenda"],
    PERDIDAS.map((a) => a.nombre),
    [...ids, ids[0]],
  ];
  for (const perdidasAceptadas of malas) {
    const r = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA_SIN_FIJAR, "encender", { perdidasAceptadas }));
    assert.equal(r.tipo, "rechazado", perdidasAceptadas.join(","));
    assert.match((r as { motivo: string }).motivo, /no coincide con las 13 apps/);
  }
  assert.equal(b.escrituras(), 0);
  // Una lista cuando no pierde nada también es "de más" (la carnicería fijada tiene el mismo id: otra base).
  const fijada = base([CARNICERIA]);
  const r = await cambiarInterruptorCon(fijada.deps, FACU, pedido(CARNICERIA, "encender", { perdidasAceptadas: ["inventario"] }));
  assert.equal(r.tipo, "rechazado");
  assert.equal(fijada.escrituras(), 0);
});

test("A3 · beauty-spa: el dueño con el slug y una lista → rechazo «cliente vivo», 0 filas", async () => {
  const b = base([CH]);
  for (const perdidasAceptadas of [["inventario"], PERDIDAS.map((a) => a.id)]) {
    const r = await cambiarInterruptorCon(b.deps, DUENIO, pedido(CH, "encender", { slugTipeado: "beauty-spa", perdidasAceptadas }));
    assert.deepEqual(r, { tipo: "rechazado", motivo: MOTIVO_PERDIDAS_EN_CLIENTE_VIVO });
    assert.match(MOTIVO_PERDIDAS_EN_CLIENTE_VIVO, /cliente vivo/);
  }
  assert.equal(b.escrituras(), 0);
});

// ── Apps ocultas ─────────────────────────────────────────────────────────────

let reloj = Date.parse("2026-10-28T12:00:00Z");
function filaOculta(over: Partial<FilaLeida> = {}): FilaLeida {
  reloj += 60_000;
  return {
    id: `o${reloj}`,
    createdAt: new Date(reloj),
    entity: ENTIDAD_APP_OCULTA,
    entityId: "apariencia",
    action: ACCION_OCULTAR,
    actor: "operator:facu",
    channel: CANAL_INTERRUPTOR,
    ...over,
  };
}

const QA_MOSTRADOR: NegocioApps = {
  role: "OWNER",
  contexto: null,
  modulosAsignados: [],
  perfil: null,
  esMostrador: true,
  carniceriaLista: true,
};

test("APPS_OCULTABLES: ids reales del registro y el mismo nombre", () => {
  assert.deepEqual(APPS_OCULTABLES.map((a) => a.id), ["clientas-por-recuperar", "apariencia", "promociones"]);
  for (const a of APPS_OCULTABLES) assert.equal(appPorId(a.id as never).nombre, a.nombre, a.id);
});

test("A4 · ocultar Apariencia en QA: fuera de appsVisibles, motivo «oculta» y la Auditoría dice «GSG ocultó Apariencia»", () => {
  const ocultas = ocultasParaElPanel("qa-carniceria", ocultasDesdeFilas([filaOculta()]));
  assert.deepEqual([...ocultas], ["apariencia"]);
  const n = { ...QA_MOSTRADOR, ocultas };
  assert.ok(appsVisibles(QA_MOSTRADOR).some((a) => a.id === "apariencia"), "sin ocultar, la ve");
  assert.ok(!appsVisibles(n).some((a) => a.id === "apariencia"));
  // Es la regla de `requireApp` (src/lib/require-app.ts:52): motivo no nulo → /admin/no-disponible.
  assert.equal(motivoNoDisponible(appPorId("apariencia"), n), "oculta");
  // Lo demás, igual.
  assert.deepEqual(
    appsVisibles(n).map((a) => a.id),
    appsVisibles(QA_MOSTRADOR).map((a) => a.id).filter((id) => id !== "apariencia"),
  );
  const fila = { ...filaOculta(), changes: { antes: "visible", despues: "oculta" } };
  assert.deepEqual(describirAccion(fila as never), { frase: "GSG ocultó Apariencia", detalle: [], tecnico: false });
  assert.equal(textoDeInterruptorEnAuditoria(filaOculta({ action: "app.mostrar" })), "GSG volvió a mostrar Apariencia");
  // Mostrarla de nuevo: manda la última fila.
  assert.equal(ocultasDesdeFilas([filaOculta(), filaOculta({ action: "app.mostrar" })]).size, 0);
});

test("A5 · un id fuera de la lista, una fila forjada por audit() o por el canal admin no ocultan nada", () => {
  const forjadas = [
    filaOculta({ entityId: "inventario" }),
    filaOculta({ channel: "admin", actor: "user:recepcion" }),
    filaOculta({ channel: "admin" }),
    filaOculta({ actor: "user:recepcion" }),
    filaOculta({ actor: "operator:" }),
    filaOculta({ action: "app.borrar" }),
    filaOculta({ entity: "appoculta" }),
  ];
  assert.equal(ocultasDesdeFilas(forjadas).size, 0);
  // Una forjada MÁS NUEVA que una válida de "mostrar" no la vuelve a ocultar.
  assert.equal(ocultasDesdeFilas([filaOculta({ action: "app.mostrar" }), filaOculta({ channel: "admin" })]).size, 0);
  // Un Set armado con otra app (fuera de APPS_OCULTABLES) no tapa nada.
  const n = { ...QA_MOSTRADOR, ocultas: new Set(["inventario", "vender"]) };
  assert.deepEqual(appsVisibles(n).map((a) => a.id), appsVisibles(QA_MOSTRADOR).map((a) => a.id));
  // audit() tiene vedada la entidad, con cualquier capitalización.
  for (const e of ["AppOculta", " appoculta ", "APPOCULTA"]) assert.equal(entidadReservadaDeLaConsola(e), true, e);
  assert.equal(textoDeInterruptorEnAuditoria(filaOculta({ channel: "admin" })), null);
});

test("CH: aunque haya una fila válida de la consola, el panel no oculta nada", () => {
  const valida = ocultasDesdeFilas([filaOculta()]);
  assert.equal(valida.size, 1);
  for (const slug of ["beauty-spa", " Beauty-Spa ", null, undefined, ""]) assert.equal(ocultasParaElPanel(slug, valida).size, 0, String(slug));
});

/** La consola de apps ocultas, con una base en memoria y la misma escritura condicional. */
function baseOcultas(negocios: NegocioParaActivar[]) {
  const porId = new Map(negocios.map((n) => [n.id, n]));
  const filas: (FilaLeida & { tenantId: string })[] = [];
  const de = (id: string) => filas.filter((f) => f.tenantId === id);
  const deps: DepsDeAppOculta = {
    leerNegocio: async (id) => (porId.has(id) ? { slug: porId.get(id)!.slug } : null),
    leerOcultas: async (id) => ocultasDesdeFilas(de(id)),
    escribirSiSigueIgual: async (fila, condicion) => {
      if (ocultasDesdeFilas(de(fila.tenantId)).has(fila.entityId) !== condicion.oculta) return false;
      reloj += 60_000;
      filas.push({ ...fila, id: `w${filas.length}`, createdAt: new Date(reloj) });
      return true;
    },
  };
  return { deps, filas, de };
}

const pedidoOculta = (n: NegocioParaActivar, over: Partial<PedidoDeAppOculta> = {}): PedidoDeAppOculta => ({
  tenantId: n.id,
  app: "apariencia",
  accion: "ocultar",
  visto: "visible",
  ...over,
});

test("ocultar y mostrar desde la consola: fila del operador, sin cambios, vista vieja y CH", async () => {
  const b = baseOcultas([CARNICERIA, CH]);
  assert.deepEqual(await cambiarAppOcultaCon(b.deps, FACU, pedidoOculta(CARNICERIA)), { tipo: "hecho", app: "apariencia", accion: "ocultar" });
  assert.deepEqual(b.filas[0], { ...filaDeAppOculta({ tenantId: CARNICERIA.id, app: "apariencia", accion: "ocultar", operador: "facu" }), id: "w0", createdAt: b.filas[0].createdAt });
  assert.deepEqual([...ocultasDesdeFilas(b.de(CARNICERIA.id))], ["apariencia"]);
  // Otra pestaña que vio «visible» manda ocultar: cambió mientras miraba.
  assert.deepEqual(await cambiarAppOcultaCon(b.deps, FACU, pedidoOculta(CARNICERIA)), { tipo: "rechazado", motivo: CAMBIO_MIENTRAS_MIRABAS });
  assert.equal((await cambiarAppOcultaCon(b.deps, FACU, pedidoOculta(CARNICERIA, { visto: "oculta" }))).tipo, "sin-cambios");
  // Pedidos rotos: una app fuera de la lista no se escribe.
  for (const over of [{ app: "inventario" }, { accion: "borrar" }, { visto: "" }]) {
    assert.equal((await cambiarAppOcultaCon(b.deps, FACU, pedidoOculta(CARNICERIA, over))).tipo, "rechazado");
  }
  assert.deepEqual(await cambiarAppOcultaCon(b.deps, FACU, { ...pedidoOculta(CARNICERIA), tenantId: "nadie" }), { tipo: "no-existe" });
  // CH: ni el dueño.
  for (const op of [FACU, DUENIO]) {
    const r = await cambiarAppOcultaCon(b.deps, op, pedidoOculta(CH));
    assert.equal(r.tipo, "rechazado");
    assert.match((r as { motivo: string }).motivo, /cliente vivo/);
  }
  assert.equal(b.de(CH.id).length, 0);
  assert.equal(b.filas.length, 1);
  // Y mostrarla de nuevo.
  assert.equal((await cambiarAppOcultaCon(b.deps, FACU, pedidoOculta(CARNICERIA, { accion: "mostrar", visto: "oculta" }))).tipo, "hecho");
  assert.equal(ocultasDesdeFilas(b.de(CARNICERIA.id)).size, 0);
});
