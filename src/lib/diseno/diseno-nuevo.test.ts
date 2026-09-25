// ============================================================================
// EL INTERRUPTOR «DISEÑO NUEVO» — quién lo prende, qué lo prende y qué pasa si falla, EJECUTADO.
// ============================================================================
//
// Corre el recorrido REAL de la action de la consola (`cambiarInterruptorCon`) contra una base en
// memoria con la misma escritura condicional que la real (como interruptores-core.test.ts), y la
// decisión REAL del panel (`leerDisenoNuevoCon`, lo que usa `disenoNuevo()`) sobre esas filas.
// Que las raíces de los layouts rindan lo de siempre con esto apagado: raices-ch.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "@/modules/catalog";
import {
  mismoConjunto,
  planFijarAsignacion,
  type NegocioParaActivar,
} from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import {
  ACCION_APAGAR,
  ACCION_ENCENDER,
  CANAL_INTERRUPTOR,
  DISENO_NUEVO,
  ENTIDAD_INTERRUPTOR,
  INICIO_POR_APPS,
  esInterruptorId,
  interruptorPorId,
  textoDeInterruptorEnAuditoria,
} from "@/cambios/interruptores";
import {
  cambiarInterruptorCon,
  disenoNuevoPrendido,
  estadoDesdeFilas,
  filtroDeFilasValidas,
  todosApagados,
  trabajaPorApps,
  CAMBIO_MIENTRAS_MIRABAS,
  type DepsDeCambio,
  type EstadoInterruptores,
  type FilaLeida,
  type PedidoDeInterruptor,
} from "@/cambios/interruptores-core";
import { leerDisenoNuevoCon } from "./diseno-core";
import { PIEL_RENGLON } from "./diseno";

const cat = catalogo();
const FACU = { nombre: "facu", esDuenio: false };
const DUENIO = { nombre: "tomas", esDuenio: true };

const CH: NegocioParaActivar = {
  id: "t-ch",
  slug: "beauty-spa",
  blueprintId: null,
  modules: [],
  esMostrador: false,
  carniceriaLista: false,
  perfil: null,
};

// Una carnicería SIN fijar la asignación: con el Inicio por apps perdería apps (Stock y compras).
const CARNICERIA_SIN_FIJAR: NegocioParaActivar = {
  id: "t-carniceria",
  slug: "qa-carniceria",
  blueprintId: "carniceria",
  modules: ["pos", "catalog", "clients", "reports", "arca"],
  esMostrador: true,
  carniceriaLista: true,
  perfil: null,
};

type Fila = FilaLeida & { tenantId: string; changes?: unknown };

function base(negocios: NegocioParaActivar[]) {
  const porId = new Map(negocios.map((n) => [n.id, n]));
  const filas: Fila[] = [];
  let reloj = Date.parse("2026-09-24T12:00:00Z");
  const de = (tenantId: string) => filas.filter((f) => f.tenantId === tenantId);
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
      return true;
    },
  };
  return {
    deps,
    filas,
    de,
    /** Lo que el panel del negocio decide en la próxima carga: la función de `disenoNuevo()`. */
    disenoNuevo: (id: string) => leerDisenoNuevoCon(async () => estadoDesdeFilas(de(id))),
    forjar: (f: Omit<Fila, "id" | "createdAt" | "tenantId">, tenantId: string) => {
      reloj += 60_000;
      filas.push({ ...f, tenantId, id: `forjada${filas.length + 1}`, createdAt: new Date(reloj) });
    },
  };
}

function pedido(
  n: NegocioParaActivar,
  accion: "encender" | "apagar",
  over: Partial<PedidoDeInterruptor> = {},
): PedidoDeInterruptor {
  return {
    tenantId: n.id,
    interruptor: DISENO_NUEVO,
    accion,
    visto: accion === "encender" ? "apagado" : "encendido",
    modulosVistos: [...n.modules],
    slugTipeado: "",
    ...over,
  };
}

// ── El catálogo ──────────────────────────────────────────────────────────────

test("«Diseño nuevo» está en el catálogo: nombre, qué cambia, cómo figura en la Auditoría, y no toca las apps", () => {
  assert.equal(DISENO_NUEVO, "diseno-nuevo");
  assert.ok(esInterruptorId("diseno-nuevo"));
  const i = interruptorPorId(DISENO_NUEVO);
  assert.equal(i.nombre, "Diseño nuevo");
  assert.equal(i.enAuditoria, "el diseño nuevo");
  assert.equal(i.cambiaLasApps, false);
  assert.ok(i.queCambia.length > 0 && !i.queCambia.includes("\n"), "qué cambia: una línea");
  // La lectura del panel y la de la consola lo traen (mismo filtro).
  assert.ok(filtroDeFilasValidas("t").entityId.in.includes("diseno-nuevo"));
  // Un negocio que nunca se tocó lo tiene apagado.
  assert.equal(disenoNuevoPrendido(todosApagados()), false);
  assert.equal(PIEL_RENGLON, "renglon");
});

// ── CH: sólo el dueño ────────────────────────────────────────────────────────

test("beauty-spa: «Diseño nuevo» sólo lo prende el dueño, escribiendo el slug; nadie más lo apaga", async () => {
  const b = base([CH]);
  // Un operador que no es el dueño: rechazado, aunque escriba el slug.
  const r1 = await cambiarInterruptorCon(b.deps, FACU, pedido(CH, "encender", { slugTipeado: "beauty-spa" }));
  assert.equal(r1.tipo, "rechazado");
  assert.match((r1 as { motivo: string }).motivo, /sólo el dueño de GSG \(tomas\)/);
  // Una sesión de OPERADORES con el nombre del dueño no es el dueño (manda el rol firmado).
  const r2 = await cambiarInterruptorCon(b.deps, { nombre: "tomas", esDuenio: false }, pedido(CH, "encender", { slugTipeado: "beauty-spa" }));
  assert.equal(r2.tipo, "rechazado");
  // El dueño sin el slug (o con otro): rechazado.
  for (const slugTipeado of ["", "magra", "beauty"]) {
    const r = await cambiarInterruptorCon(b.deps, DUENIO, pedido(CH, "encender", { slugTipeado }));
    assert.equal(r.tipo, "rechazado", slugTipeado);
  }
  assert.equal(b.filas.length, 0);
  assert.equal(await b.disenoNuevo(CH.id), false, "CH sigue con el diseño de siempre");

  // El dueño con el slug: prendido, y la próxima carga del panel lo ve.
  const ok = await cambiarInterruptorCon(b.deps, DUENIO, pedido(CH, "encender", { slugTipeado: "beauty-spa" }));
  assert.deepEqual(ok, { tipo: "hecho", interruptor: DISENO_NUEVO, accion: "encender" });
  assert.equal(await b.disenoNuevo(CH.id), true);
  // Prenderlo no toca "Trabaja por apps".
  assert.equal(trabajaPorApps(estadoDesdeFilas(b.de(CH.id))), false);

  // Apagarlo también es sólo del dueño.
  const ajeno = await cambiarInterruptorCon(b.deps, FACU, pedido(CH, "apagar", { slugTipeado: "beauty-spa" }));
  assert.equal(ajeno.tipo, "rechazado");
  assert.equal(await b.disenoNuevo(CH.id), true);
  const apagado = await cambiarInterruptorCon(b.deps, DUENIO, pedido(CH, "apagar", { slugTipeado: "beauty-spa" }));
  assert.equal(apagado.tipo, "hecho");
  assert.equal(await b.disenoNuevo(CH.id), false);
});

// ── Filas forjadas ───────────────────────────────────────────────────────────

test("una fila forjada desde la app del negocio no prende el diseño nuevo, ni apaga el que prendió la consola", async () => {
  const b = base([CH, CARNICERIA_SIN_FIJAR]);
  const forjadas = [
    { actor: "user:recepcion", channel: "admin" },
    { actor: "operator:x", channel: "admin" },
    { actor: "user:x", channel: CANAL_INTERRUPTOR },
    { actor: "operator:", channel: CANAL_INTERRUPTOR },
    { actor: "operator:x", channel: null },
  ];
  for (const f of forjadas) {
    b.forjar({ entity: ENTIDAD_INTERRUPTOR, entityId: DISENO_NUEVO, action: ACCION_ENCENDER, ...f }, CH.id);
  }
  // Con otra capitalización de la entidad o un id que no está en el catálogo, tampoco.
  b.forjar({ entity: "interruptor", entityId: DISENO_NUEVO, action: ACCION_ENCENDER, actor: "operator:x", channel: CANAL_INTERRUPTOR }, CH.id);
  b.forjar({ entity: ENTIDAD_INTERRUPTOR, entityId: "diseno-nuevo ", action: ACCION_ENCENDER, actor: "operator:x", channel: CANAL_INTERRUPTOR }, CH.id);
  assert.equal(await b.disenoNuevo(CH.id), false);
  assert.equal(textoDeInterruptorEnAuditoria(b.filas[0]), null, "una forjada no se viste de GSG en la Auditoría");

  // La consola lo prende en la carnicería; después una forjada que "apaga": manda la de la consola.
  const r = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA_SIN_FIJAR, "encender"));
  assert.equal(r.tipo, "hecho");
  b.forjar({ entity: ENTIDAD_INTERRUPTOR, entityId: DISENO_NUEVO, action: ACCION_APAGAR, actor: "user:duenia", channel: "admin" }, CARNICERIA_SIN_FIJAR.id);
  assert.equal(await b.disenoNuevo(CARNICERIA_SIN_FIJAR.id), true);
  // Y lo de un negocio no se filtra a otro.
  assert.equal(await b.disenoNuevo(CH.id), false);
});

// ── Lectura fallida = apagado ────────────────────────────────────────────────

test("si la lectura falla (o viene rota), el diseño es el de siempre, y se avisa", async () => {
  const avisos: unknown[] = [];
  const avisar = (e: unknown) => avisos.push(e);
  assert.equal(await leerDisenoNuevoCon(() => Promise.reject(new Error("se cortó la base")), avisar), false);
  assert.equal(await leerDisenoNuevoCon(() => { throw new Error("sin negocio en el pedido"); }, avisar), false);
  // Un estado sin la clave (una versión vieja del catálogo) no prende nada.
  assert.equal(await leerDisenoNuevoCon(async () => ({}) as EstadoInterruptores, avisar), false);
  // Un valor raro en la clave tampoco: tiene que ser `true`.
  const raro = { ...todosApagados(), [DISENO_NUEVO]: { encendido: "sí", quien: null, cuando: null } };
  assert.equal(await leerDisenoNuevoCon(async () => raro as unknown as EstadoInterruptores, avisar), false);
  assert.equal(avisos.length, 3);
  // Sin quién avise, igual apagado (y no revienta).
  assert.equal(await leerDisenoNuevoCon(() => Promise.reject(new Error("x"))), false);
});

// ── No se frena por apps, no toca apps ───────────────────────────────────────

test("el diseño nuevo se prende aunque 'Trabaja por apps' perdería apps: no quita ninguna, y su fila no promete apps", async () => {
  const b = base([CARNICERIA_SIN_FIJAR]);
  // "Trabaja por apps" en este negocio se frena (perdería apps)...
  const apps = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA_SIN_FIJAR, "encender", { interruptor: INICIO_POR_APPS }));
  assert.equal(apps.tipo, "rechazado");
  assert.match((apps as { motivo: string }).motivo, /perdería/);
  // ...el diseño nuevo no.
  const r = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA_SIN_FIJAR, "encender"));
  assert.deepEqual(r, { tipo: "hecho", interruptor: DISENO_NUEVO, accion: "encender" });
  const [fila] = b.filas as Array<Fila & { changes: { gana: string[] } }>;
  assert.equal(fila.entityId, DISENO_NUEVO);
  assert.equal(fila.actor, "operator:facu");
  assert.equal(fila.channel, CANAL_INTERRUPTOR);
  assert.deepEqual(fila.changes.gana, []);
  assert.equal(trabajaPorApps(estadoDesdeFilas(b.de(CARNICERIA_SIN_FIJAR.id))), false);
  assert.equal(textoDeInterruptorEnAuditoria(fila), "GSG activó el diseño nuevo");
});

test("cada interruptor con su estado: prender uno no prende el otro, y 'lo que viste' se compara con el suyo", async () => {
  const fijar = planFijarAsignacion(CARNICERIA_SIN_FIJAR, { registroGlobal: false, enInicioPorApps: false }, cat);
  assert.ok(fijar.ok);
  const CARNICERIA = { ...CARNICERIA_SIN_FIJAR, modules: fijar.despues };
  const b = base([CARNICERIA]);
  const r = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender", { interruptor: INICIO_POR_APPS }));
  assert.equal(r.tipo, "hecho");
  assert.equal(await b.disenoNuevo(CARNICERIA.id), false, "prender 'Trabaja por apps' no prende el diseño");
  // Vio el diseño "encendido" (confundido con el otro): cambió mientras miraba, no se escribe.
  const r2 = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "apagar"));
  assert.deepEqual(r2, { tipo: "rechazado", motivo: CAMBIO_MIENTRAS_MIRABAS });
  // Prendido el diseño, apagar "Trabaja por apps" no lo apaga.
  assert.equal((await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender"))).tipo, "hecho");
  assert.equal((await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "apagar", { interruptor: INICIO_POR_APPS }))).tipo, "hecho");
  assert.equal(await b.disenoNuevo(CARNICERIA.id), true);
  // Volver a prender lo prendido no escribe otra fila.
  const antes = b.filas.length;
  assert.equal((await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender", { visto: "encendido" }))).tipo, "sin-cambios");
  assert.equal(b.filas.length, antes);
});
