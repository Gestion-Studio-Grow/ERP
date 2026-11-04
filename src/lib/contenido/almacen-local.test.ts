import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDelAlmacen, crearAlmacenLocal, deserializar, serializar, validarPublicacion, type AlmacenTipoStorage } from "./almacen-local";
import type { Publicacion } from "./tipos";

const memoria = (): AlmacenTipoStorage & { datos: Map<string, string> } => {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v) };
};

const pub = (id: string, extra: Partial<Publicacion> = {}): Publicacion => ({
  id,
  fecha: "2026-11-05",
  hora: "19:00",
  canal: "instagram",
  estado: "programado",
  tipo: "promo",
  plantilla: "promo-bloque",
  formato: "post",
  titulo: "2x1",
  texto: "2x1 en turnos",
  campos: { rotulo: "Promo", titulo: "2x1", bajada: "", cta: "Aprovechala" },
  caption: { instagram: "ig", whatsapp: "wa" },
  ...extra,
});

test("clave por slug y slug inválido", () => {
  assert.equal(claveDelAlmacen("magra"), "gsg:contenido:magra");
  assert.throws(() => claveDelAlmacen(""));
  assert.throws(() => claveDelAlmacen("../otro"));
});

test("AISLAMIENTO: dos negocios en el mismo equipo no se ven", () => {
  const s = memoria();
  const a = crearAlmacenLocal(s, "magra", () => "t");
  const b = crearAlmacenLocal(s, "beauty-spa", () => "t");
  a.guardar(pub("1"));
  b.guardar(pub("2", { titulo: "Turnos" }));
  assert.deepEqual(a.listar().map((p) => p.id), ["1"]);
  assert.deepEqual(b.listar().map((p) => p.id), ["2"]);
  b.borrar("1");
  assert.equal(a.listar().length, 1, "borrar en B no toca A");
  assert.deepEqual([...s.datos.keys()].sort(), ["gsg:contenido:beauty-spa", "gsg:contenido:magra"]);
});

test("guardar reemplaza por id, cambia estado y borra", () => {
  const al = crearAlmacenLocal(memoria(), "magra", () => "2026-11-04T10:00:00Z");
  al.guardar(pub("1"));
  al.guardar(pub("1", { titulo: "Nuevo título" }));
  assert.equal(al.listar().length, 1);
  assert.equal(al.listar()[0].titulo, "Nuevo título");
  assert.equal(al.cambiarEstado("1", "publicado")[0].estado, "publicado");
  assert.equal(al.borrar("1").length, 0);
  assert.throws(() => al.guardar(pub("2", { hora: "25:00" })));
});

test("tolera JSON roto y descarta lo inválido", () => {
  const s = memoria();
  s.setItem("gsg:contenido:magra", "{roto");
  assert.deepEqual(crearAlmacenLocal(s, "magra").listar(), []);
  const mezcla = JSON.stringify({ publicaciones: [pub("ok"), { id: "x" }, pub("mal", { fecha: "2026-02-30" }), pub("ok")] });
  assert.deepEqual(deserializar(mezcla).map((p) => p.id), ["ok"]);
  assert.deepEqual(deserializar(serializar([pub("a")])), [pub("a")]);
  assert.equal(validarPublicacion(null), null);
});

test("storage que falla no rompe", () => {
  const roto: AlmacenTipoStorage = {
    getItem: () => {
      throw new Error("bloqueado");
    },
    setItem: () => {
      throw new Error("cupo");
    },
  };
  const al = crearAlmacenLocal(roto, "magra");
  assert.deepEqual(al.listar(), []);
  assert.equal(al.guardar(pub("1")).length, 1);
});
