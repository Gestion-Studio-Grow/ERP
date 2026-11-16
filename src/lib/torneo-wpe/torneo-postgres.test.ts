// EL TORNEO WPE CONTRA POSTGRES — con el rol de la app (app_rls, sin BYPASSRLS), RLS encendido y las acciones
// REALES con la sesión de cada usuario (GSG-PLAT-016, criterios C1–C4).
//
// Base efímera propia (src/test/base-efimera.ts) con los negocios A y B del arnés. En A se suman un jugador
// (PROFESSIONAL) y un agente (PROFESSIONAL con la excepción `torneo:resultados`). Se prueba:
//   · C2 persistencia compartida: lo que carga el organizador lo lee la dueña desde otra sesión;
//   · C2 carrera: dos cambios a la vez con la misma versión → uno pasa y el otro recibe el aviso; una sola foto nueva;
//   · C3 permisos contra la ACCIÓN: el jugador no muta; el agente carga resultado y W.O. pero no borra ni reprograma;
//   · C4 auditoría: cada mutación deja su fila con quién y qué (antes → después);
//   · C1 aislamiento: B (con el módulo) no ve el torneo de A, ni leyendo con el tenantId de A, ni puede escribirle;
//     sin el módulo, B no entra.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";
import { ENTIDAD_TORNEO_ESTADO, ENTIDAD_TORNEO_MUTACION } from "./marcas";
import { EXCEPCION_RESULTADOS } from "./permisos";
import { FOTOS_ANTERIORES } from "./estado-repo";

const laBase = baseEfimeraDelArchivo();

type Acciones = typeof import("@/app/admin/(dashboard)/torneo/actions");

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  await duenio.tenant.update({ where: { id: base.a.id }, data: { modules: ["torneo"] } });
  const usuario = (nombre: string, email: string) =>
    duenio.user.upsert({
      where: { tenantId_email: { tenantId: base.a.id, email } },
      update: {},
      create: { tenantId: base.a.id, name: nombre, email, passwordHash: "sin-clave", role: "PROFESSIONAL" },
    });
  const jugador = await usuario("Jugador A", "jugador@negocio-a.erp.test");
  const agente = await usuario("Agente A", "agente@negocio-a.erp.test");
  await duenio.userPermissionOverride.deleteMany({ where: { userId: agente.id } });
  await duenio.userPermissionOverride.create({ data: { tenantId: base.a.id, userId: agente.id, capability: EXCEPCION_RESULTADOS, allowed: true } });
  // Cada test arranca sin torneo (la base es una por archivo).
  await duenio.auditLog.deleteMany({ where: { entity: { in: [ENTIDAD_TORNEO_ESTADO, ENTIDAD_TORNEO_MUTACION] } } });
  await duenio.tenant.update({ where: { id: base.b.id }, data: { modules: [] } });
  const acciones: Acciones = await import("@/app/admin/(dashboard)/torneo/actions");
  return { base, duenio, jugador, agente, acciones };
}

function valor<R>(s: SalidaDeAccion<R>): R {
  assert.equal(s.tipo, "respuesta", JSON.stringify(s));
  return (s as { valor: R }).valor;
}

/** Un partido de la categoría vista con las dos parejas definidas y sin resultado. */
function libres(v: { partidos: { id: string; definido: boolean; resultado: string | null; sede: string | null }[] }) {
  return v.partidos.filter((p) => p.definido && p.resultado === null);
}

async function filas(base: BaseEfimera, entity: string, tenantId: string) {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    return (await c.query(`SELECT id, actor, action, "entityId", changes FROM "AuditLog" WHERE "tenantId" = $1 AND entity = $2 ORDER BY "createdAt"`, [tenantId, entity])).rows as {
      id: string; actor: string; action: string; entityId: string; changes: Record<string, unknown>;
    }[];
  } finally {
    await c.end();
  }
}

test("torneo en la base: compartido entre sesiones, permisos por rol contra la acción, auditoría y carrera", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, jugador, agente, acciones: A } = p;
  const organizador = { negocio: base.a, usuario: base.a.recepcion };
  const duenia = { negocio: base.a, usuario: base.a.duenia };
  const elJugador = { negocio: base.a, usuario: jugador };
  const elAgente = { negocio: base.a, usuario: agente };

  // Sin torneo: el jugador no lo puede generar (C3), el organizador sí.
  const vacio = valor(await ejecutarAccion(elJugador, () => A.leerTorneo(null)));
  assert.ok(vacio.ok && vacio.version === 0 && vacio.vista === null && vacio.nivel === "ver");
  const genJugador = valor(await ejecutarAccion(elJugador, () => A.generarTorneo(0)));
  assert.ok(!genJugador.ok && genJugador.motivo === "permiso");
  const gen = valor(await ejecutarAccion(organizador, () => A.generarTorneo(0)));
  assert.deepEqual(gen, { ok: true, version: 1, advertencias: [] });
  const genOtraVez = valor(await ejecutarAccion(organizador, () => A.generarTorneo(1)));
  assert.equal(genOtraVez.ok, false);

  // C2: el organizador carga un resultado y la dueña, desde otra sesión, lo ve.
  const vista = valor(await ejecutarAccion(organizador, () => A.leerTorneo("Damas 4ta")));
  assert.ok(vista.ok && vista.vista);
  const [p1, p2, p3, p4] = libres(vista.vista);
  assert.ok(p4, "hay partidos libres para probar");
  const carga = valor(await ejecutarAccion(organizador, () => A.cambiarTorneo({ comando: { tipo: "resultado", partidoId: p1.id, sets: [[6, 3], [6, 4]] }, version: 1 })));
  assert.deepEqual(carga, { ok: true, version: 2, advertencias: [] });
  const laVe = valor(await ejecutarAccion(duenia, () => A.leerTorneo("Damas 4ta")));
  assert.ok(laVe.ok && laVe.version === 2);
  assert.equal(laVe.vista!.partidos.find((x) => x.id === p1.id)!.resultado, "6/3 6/4");

  // C3: el jugador no muta ni llamando a la acción directo; tampoco cambia la versión.
  for (const comando of [
    { tipo: "resultado", partidoId: p2.id, sets: [[6, 0], [6, 0]] },
    { tipo: "wo", partidoId: p2.id, perdedor: "A" },
    { tipo: "borrar", partidoId: p1.id },
    { tipo: "reprogramar", partidoId: p2.id, destino: { sede: "kuro", cancha: 1, dia: "2026-08-01", hora: "08:00" } },
  ]) {
    const r = valor(await ejecutarAccion(elJugador, () => A.cambiarTorneo({ comando, version: 2 })));
    assert.ok(!r.ok && r.motivo === "permiso", `el jugador pudo ${comando.tipo}`);
  }
  // C3: el agente carga resultado y W.O., pero no borra ni reprograma.
  const rAgente = valor(await ejecutarAccion(elAgente, () => A.cambiarTorneo({ comando: { tipo: "resultado", partidoId: p2.id, sets: [[4, 6], [6, 2], [6, 3]] }, version: 2 })));
  assert.deepEqual(rAgente, { ok: true, version: 3, advertencias: [] });
  const woAgente = valor(await ejecutarAccion(elAgente, () => A.cambiarTorneo({ comando: { tipo: "wo", partidoId: p3.id, perdedor: "B" }, version: 3 })));
  assert.deepEqual(woAgente, { ok: true, version: 4, advertencias: [] });
  for (const comando of [
    { tipo: "borrar", partidoId: p1.id },
    { tipo: "reprogramar", partidoId: p4.id, destino: { sede: "kuro", cancha: 1, dia: "2026-08-01", hora: "08:00" } },
  ]) {
    const r = valor(await ejecutarAccion(elAgente, () => A.cambiarTorneo({ comando, version: 4 })));
    assert.ok(!r.ok && r.motivo === "permiso", `el agente pudo ${comando.tipo}`);
  }
  // El organizador borra (gestión).
  const borra = valor(await ejecutarAccion(organizador, () => A.cambiarTorneo({ comando: { tipo: "borrar", partidoId: p1.id }, version: 4 })));
  assert.deepEqual(borra, { ok: true, version: 5, advertencias: [] });

  // C2: versión vieja → aviso, no pisa.
  const vieja = valor(await ejecutarAccion(duenia, () => A.cambiarTorneo({ comando: { tipo: "resultado", partidoId: p4.id, sets: [[6, 1], [6, 1]] }, version: 2 })));
  assert.ok(!vieja.ok && vieja.motivo === "conflicto" && vieja.version === 5, JSON.stringify(vieja));

  // C4: cada mutación dejó su fila con quién y qué.
  const rastro = await filas(base, ENTIDAD_TORNEO_MUTACION, base.a.id);
  assert.deepEqual(rastro.map((f) => f.action), ["torneo.generar", "torneo.resultado", "torneo.resultado", "torneo.wo", "torneo.borrar"]);
  assert.deepEqual(rastro.map((f) => f.actor), [base.a.recepcion, base.a.recepcion, agente, agente, base.a.recepcion].map((u) => `user:${u.id}`));
  const fila = rastro[1];
  assert.equal(fila.entityId, p1.id);
  assert.deepEqual(fila.changes.antes, null);
  assert.deepEqual(fila.changes.despues, { sets: [[6, 3], [6, 4]], ganador: "A" });
  assert.equal(fila.changes.categoria, "Damas 4ta");
  assert.equal(rastro[4].changes.despues, null);
  assert.deepEqual(rastro[4].changes.antes, { sets: [[6, 3], [6, 4]], ganador: "A" });

  // C2 carrera: dos cambios A LA VEZ con la misma versión → uno pasa, el otro recibe el aviso; una sola foto nueva.
  const fotosAntes = (await filas(base, ENTIDAD_TORNEO_ESTADO, base.a.id)).length;
  const [x, y] = await Promise.all([
    ejecutarAccion(organizador, () => A.cambiarTorneo({ comando: { tipo: "resultado", partidoId: p4.id, sets: [[6, 2], [6, 2]] }, version: 5 })),
    ejecutarAccion(duenia, () => A.cambiarTorneo({ comando: { tipo: "wo", partidoId: p4.id, perdedor: "A" }, version: 5 })),
  ]);
  const rs = [valor(x), valor(y)];
  assert.equal(rs.filter((r) => r.ok).length, 1, JSON.stringify(rs));
  const perdio = rs.find((r) => !r.ok)!;
  assert.ok(!perdio.ok && perdio.motivo === "conflicto" && perdio.version === 6, JSON.stringify(perdio));
  assert.equal((await filas(base, ENTIDAD_TORNEO_ESTADO, base.a.id)).length, fotosAntes + 1);
  assert.equal((await filas(base, ENTIDAD_TORNEO_MUTACION, base.a.id)).length, 6);
});

test("aislamiento por negocio (C1): B no ve ni escribe el torneo de A; sin el módulo no entra", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio, acciones: A } = p;
  assert.ok(valor(await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => A.generarTorneo(0))).ok);

  // Sin el módulo `torneo`, B ni lee.
  const sinModulo = valor(await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => A.leerTorneo(null)));
  assert.equal(sinModulo.ok, false);
  const sinModuloCambia = valor(await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => A.generarTorneo(0)));
  assert.ok(!sinModuloCambia.ok && sinModuloCambia.motivo === "permiso");

  // Con el módulo, B ve SU torneo (ninguno), no el de A. Un usuario de A con el host de B no entra.
  await duenio.tenant.update({ where: { id: base.b.id }, data: { modules: ["torneo"] } });
  const deB = valor(await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => A.leerTorneo(null)));
  assert.ok(deB.ok && deB.version === 0 && deB.vista === null);
  const cruzado = await ejecutarAccion({ negocio: base.b, usuario: base.a.duenia }, () => A.leerTorneo(null));
  assert.ok(cruzado.tipo !== "respuesta" || !cruzado.valor.ok || cruzado.valor.vista === null, JSON.stringify(cruzado).slice(0, 200));

  // RLS con el rol de la app y el GUC de B: la foto de A no se lee aunque se pida por su tenantId, ni se escribe.
  const c = new pg.Client({ connectionString: base.urlApp });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [base.b.id]);
    const leidas = await c.query(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1 AND entity = $2`, [base.a.id, ENTIDAD_TORNEO_ESTADO]);
    assert.equal(leidas.rows[0].n, 0);
    await assert.rejects(
      c.query(`INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", "createdAt") VALUES ('x-torneo', $1, 'b', 'resultado:99', $2, $1, now())`, [base.a.id, ENTIDAD_TORNEO_ESTADO]),
      /row-level security|violates/,
    );
    await c.query("ROLLBACK");
  } finally {
    await c.end();
  }
  // Con el GUC de A, la misma consulta sí ve la foto: la prueba de arriba no pasa por accidente.
  const c2 = new pg.Client({ connectionString: base.urlApp });
  await c2.connect();
  try {
    await c2.query("BEGIN");
    await c2.query("SELECT set_config('app.current_tenant_id', $1, true)", [base.a.id]);
    const n = await c2.query(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1 AND entity = $2`, [base.a.id, ENTIDAD_TORNEO_ESTADO]);
    assert.equal(n.rows[0].n, 1);
    await c2.query("ROLLBACK");
  } finally {
    await c2.end();
  }
});

test("poda: con muchas mutaciones quedan la vigente, las anteriores del tope y la de generación", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, acciones: A } = p;
  const org = { negocio: base.a, usuario: base.a.recepcion };
  assert.ok(valor(await ejecutarAccion(org, () => A.generarTorneo(0))).ok);
  const v = valor(await ejecutarAccion(org, () => A.leerTorneo("Caballeros 6ta")));
  assert.ok(v.ok && v.vista);
  const conLugar = libres(v.vista).find((x) => x.sede)!;
  let version = 1;
  for (let i = 0; i < FOTOS_ANTERIORES + 4; i++) {
    const comando = i % 2 === 0 ? { tipo: "wo", partidoId: conLugar.id, perdedor: "A" } : { tipo: "borrar", partidoId: conLugar.id };
    const r = valor(await ejecutarAccion(org, () => A.cambiarTorneo({ comando, version })));
    assert.ok(r.ok, JSON.stringify(r));
    version = r.version;
  }
  const fotos = await filas(base, ENTIDAD_TORNEO_ESTADO, base.a.id);
  const versiones = fotos.map((f) => Number(f.action.split(":")[1])).sort((a, b) => a - b);
  assert.equal(versiones[0], 1);
  assert.equal(versiones.length, FOTOS_ANTERIORES + 2);
  assert.equal(versiones[versiones.length - 1], version);
  // El rastro no se poda.
  assert.equal((await filas(base, ENTIDAD_TORNEO_MUTACION, base.a.id)).length, FOTOS_ANTERIORES + 5);
});
