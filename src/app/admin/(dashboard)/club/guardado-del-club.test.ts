// El guardado de este equipo: la versión pegada al final del texto (un solo setItem, sin abrir el JSON para leerla),
// lo guardado antes de las versiones (versión 0), el conflicto (nunca pisa una versión más nueva), el error sin lugar
// (lo de antes queda) y la cara de espejo (copia + marca de lo pendiente).
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearGuardadoLocal, esGuardadoLocal, pegarVersion, separarVersion, type AlmacenamientoLocal } from "./guardado-del-club";

function memoria(tope = Infinity): AlmacenamientoLocal & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => {
      if (String(v).length > tope) throw new Error("QuotaExceededError");
      datos.set(k, String(v));
    },
    removeItem: (k) => void datos.delete(k),
  };
}

const SOBRE = JSON.stringify({ v: 1, estado: { log: [] }, secuencia: 3, hoy: "2026-10-17", guardado: 1 });

test("la versión va pegada al final y se separa sin tocar el resto; sin versión es la 0", () => {
  const con = pegarVersion(SOBRE, 7);
  assert.equal(con, `${SOBRE.slice(0, -1)},"version":7}`);
  assert.deepEqual(JSON.parse(con), { ...JSON.parse(SOBRE), version: 7 }, "sigue siendo JSON");
  assert.deepEqual(separarVersion(con), { texto: SOBRE, version: 7 });
  assert.deepEqual(separarVersion(SOBRE), { texto: SOBRE, version: 0 }, "lo guardado antes de las versiones");
  // Un "version" que no está al final (dentro del estado) no confunde.
  const adentro = JSON.stringify({ v: 1, estado: { x: { version: 9 } }, secuencia: 1 });
  assert.equal(separarVersion(adentro).version, 0);
  assert.throws(() => pegarVersion("[1]", 1));
});

test("guardar: sólo si lo guardado sigue en la versión esperada; la versión sube de a una", async () => {
  const m = memoria();
  const g = crearGuardadoLocal(m, "gsg-club:bp:u1:v1");
  assert.equal(esGuardadoLocal(g), true);
  assert.equal(await g.leer(), null);
  assert.deepEqual(await g.guardar(SOBRE, 0), { ok: true, version: 1 });
  assert.deepEqual(await g.leer(), { texto: SOBRE, version: 1 });
  assert.deepEqual(g.guardarYa(SOBRE, 0), { ok: false, motivo: "conflicto", version: 1 }, "otro ya guardó la 1");
  assert.deepEqual(g.guardarYa(SOBRE.replace('"secuencia":3', '"secuencia":4'), 1), { ok: true, version: 2 });
  assert.equal(g.leerYa()!.version, 2);
  assert.match(g.leerYa()!.texto, /"secuencia":4/);
  // Lo guardado antes de las versiones es la 0: el primer guardado lo toma.
  m.datos.set("gsg-club:bp:u2:v1", SOBRE);
  assert.deepEqual(crearGuardadoLocal(m, "gsg-club:bp:u2:v1").guardarYa(SOBRE, 0), { ok: true, version: 1 });
  assert.throws(() => crearGuardadoLocal(m, " "));
});

test("sin lugar: `error` y lo de antes queda como estaba; un navegador que no deja leer da null", () => {
  const m = memoria(SOBRE.length + 20);
  const g = crearGuardadoLocal(m, "k");
  assert.equal(g.guardarYa(SOBRE, 0).ok, true);
  const grande = SOBRE.replace("[]", `["${"x".repeat(100)}"]`);
  assert.deepEqual(g.guardarYa(grande, 1), { ok: false, motivo: "error", version: 1 });
  assert.deepEqual(g.leerYa(), { texto: SOBRE, version: 1 });
  const roto: AlmacenamientoLocal = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
  const r = crearGuardadoLocal(roto, "k");
  assert.equal(r.leerYa(), null);
  assert.equal(r.guardarYa(SOBRE, 0).ok, false);
  assert.equal(r.espejar(SOBRE, { base: 0, hasta: 0 }), false);
  assert.equal(r.marca(), null);
  assert.doesNotThrow(() => r.alDia());
  assert.doesNotThrow(() => r.borrar());
});

test("espejo: la copia queda con la versión de la que viene y una marca aparte; `alDia` la saca; `apartar` no borra", () => {
  const m = memoria();
  const g = crearGuardadoLocal(m, "gsg-club:bp:jornada:v1");
  assert.equal(g.espejar(SOBRE, { base: 4, hasta: 5 }), true);
  assert.deepEqual(g.leerYa(), { texto: SOBRE, version: 4 });
  assert.deepEqual(g.marca(), { base: 4, hasta: 5 });
  g.alDia();
  assert.equal(g.marca(), null);
  assert.ok(m.datos.has("gsg-club:bp:jornada:v1"), "la copia queda");
  m.datos.set("gsg-club:bp:jornada:v1:pendiente", "{roto");
  assert.equal(g.marca(), null);
  assert.equal(g.apartar("{no se lee", 1760000000000), true);
  assert.equal(m.datos.get("gsg-club:bp:jornada:v1:ilegible:1760000000000"), "{no se lee");
  g.borrar();
  assert.equal(g.leerYa(), null);
});
