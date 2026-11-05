// ============================================================================
// «DISEÑO NUEVO» — una mejora INCORPORADA: prendida en todos los negocios, fuera de la consola.
// ============================================================================
//
// Corre el recorrido REAL de la action de la consola (`cambiarInterruptorCon`) contra una base en
// memoria con la misma escritura condicional que la real (como interruptores-core.test.ts), y la
// decisión REAL del panel (`leerDisenoNuevoCon`, lo que usa `disenoNuevo()`) sobre esas filas.
// Decisión del dueño (05/11/2026): las mejoras se publican con el pase a `main`; los interruptores
// quedan para lo crítico. Ninguna fila de la consola (vieja o forjada) lo apaga, ni un fallo de lectura.

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
  CANAL_INTERRUPTOR,
  DISENO_NUEVO,
  ENTIDAD_INTERRUPTOR,
  INICIO_POR_APPS,
  esIncorporado,
  esInterruptorId,
  INTERRUPTORES_DE_LA_CONSOLA,
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
  MOTIVO_INCORPORADO,
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

test("«Diseño nuevo» sigue en el catálogo, incorporado: prendido en un negocio que nunca se tocó y fuera de la consola", () => {
  assert.equal(DISENO_NUEVO, "diseno-nuevo");
  assert.ok(esInterruptorId("diseno-nuevo"));
  const i = interruptorPorId(DISENO_NUEVO);
  assert.equal(i.nombre, "Diseño nuevo");
  assert.equal(i.enAuditoria, "el diseño nuevo");
  assert.equal(i.cambiaLasApps, false);
  assert.ok(esIncorporado(DISENO_NUEVO));
  assert.ok(!INTERRUPTORES_DE_LA_CONSOLA.some((x) => x.id === DISENO_NUEVO), "la consola no lo ofrece");
  assert.equal(disenoNuevoPrendido(todosApagados()), true);
  // Lo crítico sigue apagado por defecto.
  assert.equal(trabajaPorApps(todosApagados()), false);
  assert.equal(PIEL_RENGLON, "renglon");
});

// ── La consola no lo toca ────────────────────────────────────────────────────

test("nadie lo prende ni lo apaga desde la consola (ni el dueño en CH): no se escribe ninguna fila", async () => {
  const b = base([CH, CARNICERIA_SIN_FIJAR]);
  for (const accion of ["encender", "apagar"] as const) {
    for (const [op, n, slugTipeado] of [[DUENIO, CH, "beauty-spa"], [FACU, CARNICERIA_SIN_FIJAR, ""]] as const) {
      const r = await cambiarInterruptorCon(b.deps, op, pedido(n, accion, { slugTipeado }));
      assert.deepEqual(r, { tipo: "rechazado", motivo: MOTIVO_INCORPORADO }, `${accion} ${n.slug}`);
    }
  }
  assert.equal(b.filas.length, 0);
  assert.equal(await b.disenoNuevo(CH.id), true);
  assert.equal(await b.disenoNuevo(CARNICERIA_SIN_FIJAR.id), true);
});

test("una fila vieja de la consola que lo apagó (o una forjada) no lo apaga", async () => {
  const b = base([CH]);
  b.forjar({ entity: ENTIDAD_INTERRUPTOR, entityId: DISENO_NUEVO, action: ACCION_APAGAR, actor: "operator:tomas", channel: CANAL_INTERRUPTOR }, CH.id);
  b.forjar({ entity: ENTIDAD_INTERRUPTOR, entityId: DISENO_NUEVO, action: ACCION_APAGAR, actor: "user:recepcion", channel: "admin" }, CH.id);
  assert.equal(await b.disenoNuevo(CH.id), true);
  // La Auditoría sigue nombrando la fila vieja de la consola como antes (es historia).
  assert.equal(textoDeInterruptorEnAuditoria(b.filas[0]), "GSG apagó el diseño nuevo");
  assert.equal(textoDeInterruptorEnAuditoria(b.filas[1]), null, "una forjada no se viste de GSG");
});

// ── Lectura fallida = diseño nuevo ───────────────────────────────────────────

test("si la lectura falla (o viene rota), queda el diseño nuevo, y se avisa", async () => {
  const avisos: unknown[] = [];
  const avisar = (e: unknown) => avisos.push(e);
  assert.equal(await leerDisenoNuevoCon(() => Promise.reject(new Error("se cortó la base")), avisar), true);
  assert.equal(await leerDisenoNuevoCon(() => { throw new Error("sin negocio en el pedido"); }, avisar), true);
  assert.equal(await leerDisenoNuevoCon(async () => ({}) as EstadoInterruptores, avisar), true);
  assert.equal(avisos.length, 3);
  assert.equal(await leerDisenoNuevoCon(() => Promise.reject(new Error("x"))), true);
});

// ── No toca lo crítico ───────────────────────────────────────────────────────

test("«Trabaja por apps» (crítico) se sigue prendiendo y apagando en la consola, sin tocar el diseño", async () => {
  const fijar = planFijarAsignacion(CARNICERIA_SIN_FIJAR, { registroGlobal: false, enInicioPorApps: false }, cat);
  assert.ok(fijar.ok);
  const CARNICERIA = { ...CARNICERIA_SIN_FIJAR, modules: fijar.despues };
  const b = base([CARNICERIA]);
  const r = await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "encender", { interruptor: INICIO_POR_APPS }));
  assert.equal(r.tipo, "hecho");
  assert.equal(trabajaPorApps(estadoDesdeFilas(b.de(CARNICERIA.id))), true);
  assert.equal((await cambiarInterruptorCon(b.deps, FACU, pedido(CARNICERIA, "apagar", { interruptor: INICIO_POR_APPS }))).tipo, "hecho");
  assert.equal(trabajaPorApps(estadoDesdeFilas(b.de(CARNICERIA.id))), false);
  assert.equal(await b.disenoNuevo(CARNICERIA.id), true);
  assert.ok(filtroDeFilasValidas("t").entityId.in.includes(INICIO_POR_APPS));
});
