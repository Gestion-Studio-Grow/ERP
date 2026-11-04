// Aislamiento de la agenda de contenido con dos negocios y un Prisma falso (sin base): toda consulta va filtrada
// por el tenantId de la SESIÓN, un negocio no ve, no cambia ni borra lo del otro, y sin tabla se pasa al modo demo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accionesDeContenido } from "./acciones-core";
import type { DbContenido, FilaPublicacion } from "@/lib/contenido/almacen.server";

function prismaFalso(opciones: { sinTabla?: boolean } = {}) {
  const filas: FilaPublicacion[] = [];
  const wheres: Record<string, unknown>[] = [];
  let n = 0;
  const falla = () => {
    if (opciones.sinTabla) throw Object.assign(new Error("tabla"), { code: "P2021" });
  };
  const coincide = (f: FilaPublicacion, w: Record<string, unknown>) =>
    Object.entries(w).every(([k, v]) =>
      k === "fecha" && v && typeof v === "object"
        ? f.fecha >= (v as { gte: string }).gte && f.fecha <= (v as { lte: string }).lte
        : (f as unknown as Record<string, unknown>)[k] === v,
    );
  const db: DbContenido = {
    publicacionAgendada: {
      async findMany({ where }) {
        falla();
        wheres.push(where);
        return filas.filter((f) => coincide(f, where)).map((f) => ({ ...f }));
      },
      async create({ data }) {
        falla();
        const ahora = new Date("2026-11-04T12:00:00Z");
        const fila = { ...data, id: `pub${++n}`, createdAt: ahora, updatedAt: ahora } as FilaPublicacion;
        filas.push(fila);
        return { ...fila };
      },
      async updateMany({ where, data }) {
        falla();
        wheres.push(where);
        const hits = filas.filter((f) => coincide(f, where));
        for (const f of hits) Object.assign(f, data);
        return { count: hits.length };
      },
      async deleteMany({ where }) {
        falla();
        wheres.push(where);
        const antes = filas.length;
        for (let i = filas.length - 1; i >= 0; i--) if (coincide(filas[i], where)) filas.splice(i, 1);
        return { count: antes - filas.length };
      },
    },
  };
  return { db, filas, wheres };
}

const entrada = (extra: Record<string, unknown> = {}) => ({
  id: "",
  fecha: "2026-11-05",
  hora: "19:00",
  canal: "instagram",
  estado: "programado",
  tipo: "promo",
  plantilla: "promo-bloque",
  formato: "post",
  titulo: "2x1 en turnos",
  texto: "2x1 en turnos de lunes a viernes de 10 a 16",
  campos: { rotulo: "Promo", titulo: "2x1 en turnos", bajada: "De lunes a viernes", cta: "Reservá" },
  caption: { instagram: "IG", whatsapp: "WA" },
  ...extra,
});

function dosNegocios(opciones?: { sinTabla?: boolean }) {
  const p = prismaFalso(opciones);
  const a = accionesDeContenido({ sesion: async () => ({ tenantId: "tenant-a" }), db: p.db });
  const b = accionesDeContenido({ sesion: async () => ({ tenantId: "tenant-b" }), db: p.db });
  return { ...p, a, b };
}

test("el alta queda con el negocio de la sesión aunque el navegador mande otro tenantId", async () => {
  const { a, filas } = dosNegocios();
  const r = await a.guardar(entrada({ tenantId: "tenant-b" }));
  assert.equal(r.ok, true);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].tenantId, "tenant-a");
  assert.ok(r.ok && r.modo === "base" && r.publicaciones.length === 1);
});

test("toda consulta lleva el tenantId de la sesión", async () => {
  const { a, b, wheres } = dosNegocios();
  const ra = await a.guardar(entrada());
  const id = ra.ok && ra.modo === "base" ? ra.publicaciones[0].id : "";
  await b.listar();
  await b.cambiarEstado(id, "publicado");
  await b.borrar(id);
  await a.cambiarEstado(id, "publicado");
  assert.ok(wheres.length >= 5);
  for (const w of wheres) assert.ok(w.tenantId === "tenant-a" || w.tenantId === "tenant-b", JSON.stringify(w));
});

test("un negocio no ve, no cambia ni borra la publicación del otro", async () => {
  const { a, b, filas } = dosNegocios();
  const ra = await a.guardar(entrada());
  assert.ok(ra.ok && ra.modo === "base");
  const id = ra.publicaciones[0].id;

  const vistaB = await b.listar();
  assert.deepEqual(vistaB, { ok: true, modo: "base", publicaciones: [] });

  assert.equal((await b.cambiarEstado(id, "publicado")).ok, false);
  assert.equal(filas[0].estado, "programado");
  assert.equal((await b.guardar(entrada({ id, titulo: "Pisado" }))).ok, false);
  assert.equal(filas[0].titulo, "2x1 en turnos");
  assert.equal((await b.borrar(id)).ok, false);
  assert.equal(filas.length, 1);

  const propia = await a.cambiarEstado(id, "publicado");
  assert.ok(propia.ok && propia.modo === "base" && propia.publicaciones[0].estado === "publicado");
  assert.ok((await a.borrar(id)).ok);
  assert.equal(filas.length, 0);
});

test("valida la entrada: estado, hora, canal e id raros se rechazan sin tocar la base", async () => {
  const { a, filas } = dosNegocios();
  assert.equal((await a.guardar(entrada({ hora: "25:00" }))).ok, false);
  assert.equal((await a.guardar(entrada({ canal: "tiktok" }))).ok, false);
  assert.equal((await a.guardar(entrada({ titulo: "   " }))).ok, false);
  assert.equal((await a.guardar(null)).ok, false);
  assert.equal((await a.cambiarEstado("x", "borrado")).ok, false);
  assert.equal((await a.borrar("'; DROP")).ok, false);
  assert.equal(filas.length, 0);
});

test("sin la tabla (P2021) las acciones responden modo demo, no un error", async () => {
  const { a } = dosNegocios({ sinTabla: true });
  assert.deepEqual(await a.listar(), { ok: true, modo: "demo" });
  assert.deepEqual(await a.guardar(entrada()), { ok: true, modo: "demo" });
});

test("sin permiso o sin la app: devuelve el motivo y no consulta", async () => {
  const p = prismaFalso();
  const x = accionesDeContenido({ sesion: async () => ({ error: "Contenido no está activo en este negocio." }), db: p.db });
  assert.deepEqual(await x.listar(), { ok: false, error: "Contenido no está activo en este negocio." });
  assert.equal(p.wheres.length, 0);
});
