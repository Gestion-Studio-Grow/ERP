// Directorio público de profes: opt-in, aislamiento entre negocios, filtros, topes y caché corta.
// Con datos de mentira (las lecturas entran por `DepsDirectorio`): sin base.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Directorio } from "@/lib/padel/directorio";
import {
  DIRECTORIO_TTL_MS,
  TOPE_NEGOCIOS,
  TOPE_PROFES,
  TOPE_RESULTADOS,
  armarDirectorio,
  filtrarDirectorio,
  linkReservar,
  memoriaCorta,
  proximosHorarios,
  turneroDe,
  zonasDe,
  type Candidato,
  type DepsDirectorio,
  type ProfePublico,
} from "./directorio-core";

type Negocio = { c: Candidato; dir: Directorio; abierto?: boolean; romper?: boolean };

const h = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-03:00`).toISOString();

function fake(negocios: Negocio[]) {
  const llamadas: { dep: string; tenantId: string }[] = [];
  const por = (id: string) => negocios.find((n) => n.c.tenantId === id)!;
  const deps: DepsDirectorio = {
    async candidatos(tope) {
      return negocios.map((n) => n.c).slice(0, tope);
    },
    async ajuste(id) {
      llamadas.push({ dep: "ajuste", tenantId: id });
      if (por(id).romper) throw new Error("se cayó");
      return { directorio: por(id).dir, precioIndividual: 25000, precioGrupal: 12000 };
    },
    async abierto(id) {
      llamadas.push({ dep: "abierto", tenantId: id });
      return por(id).abierto ?? true;
    },
    async agenda(id) {
      llamadas.push({ dep: "agenda", tenantId: id });
      return [
        { fecha: "2026-11-14", etiqueta: "Hoy", horas: [h("2026-11-14", "18:00"), h("2026-11-14", "19:00")], clubes: { [h("2026-11-14", "18:00")]: `Club de ${id}` } },
        { fecha: "2026-11-15", etiqueta: "Mañana", horas: [h("2026-11-15", "09:00"), h("2026-11-15", "10:00")] },
      ];
    },
    async clubes(id) {
      llamadas.push({ dep: "clubes", tenantId: id });
      return [`Club de ${id}`];
    },
  };
  return { deps, llamadas };
}

const dir = (visible: boolean, zona = "Canning"): Directorio => ({ visible, zona });
const neg = (id: string, d: Directorio, extra: Partial<Negocio> = {}): Negocio => ({ c: { tenantId: id, nombre: `Profe ${id}`, subdomain: id }, dir: d, ...extra });

test("opt-in: un negocio con visible=false NO aparece y no se le lee nada más que el ajuste", async () => {
  const { deps, llamadas } = fake([neg("ana", dir(true)), neg("beto", dir(false)), neg("caro", dir(true, ""))]);
  const out = await armarDirectorio(deps, "gsgapp.com.ar");
  assert.deepEqual(out.map((p) => p.clave), ["ana"]);
  for (const id of ["beto", "caro"]) {
    assert.deepEqual(llamadas.filter((l) => l.tenantId === id).map((l) => l.dep), ["ajuste"], `a ${id} sólo se le lee el ajuste`);
  }
});

test("aislamiento: cada lectura va con el tenantId de ESE negocio y la tarjeta trae sólo sus datos", async () => {
  const { deps, llamadas } = fake([neg("ana", dir(true)), neg("dani", dir(true, "Adrogué"))]);
  const out = await armarDirectorio(deps, "gsgapp.com.ar");
  assert.equal(out.length, 2);
  for (const p of out) {
    assert.deepEqual(p.clubes, [`Club de ${p.clave}`]);
    assert.ok(p.dias[0]!.clubes![h("2026-11-14", "18:00")] === `Club de ${p.clave}`);
    assert.equal(p.turnero, `https://${p.clave}.gsgapp.com.ar/clases`);
  }
  assert.ok(llamadas.every((l) => ["ana", "dani"].includes(l.tenantId)));
  // Lo público, nada más: sin tenantId ni teléfonos.
  const claves = new Set(out.flatMap((p) => Object.keys(p)));
  assert.deepEqual([...claves].sort(), ["clave", "clubes", "dias", "nombre", "precioGrupal", "precioIndividual", "turnero", "zona"]);
  assert.doesNotMatch(JSON.stringify(out), /tenantId|whatsapp|telefono/i);
});

test("turnero cerrado (sin verificar), subdominio inválido o negocio que falla: no aparecen, los demás sí", async () => {
  const malo: Negocio = { c: { tenantId: "x", nombre: "X", subdomain: "../evil" }, dir: dir(true) };
  const sinSub: Negocio = { c: { tenantId: "y", nombre: "Y", subdomain: null }, dir: dir(true) };
  const { deps, llamadas } = fake([neg("ana", dir(true)), neg("ceci", dir(true), { abierto: false }), neg("rota", dir(true), { romper: true }), malo, sinSub]);
  const out = await armarDirectorio(deps, "https://gsgapp.com.ar/");
  assert.deepEqual(out.map((p) => p.clave), ["ana"]);
  assert.equal(llamadas.some((l) => l.tenantId === "x" || l.tenantId === "y"), false);
  assert.equal(llamadas.some((l) => l.tenantId === "ceci" && l.dep === "agenda"), false);
});

test("tope de negocios: nunca se miran más de TOPE_NEGOCIOS (sólo su ajuste si no se anotaron)", async () => {
  const muchos = Array.from({ length: TOPE_NEGOCIOS + 20 }, (_, i) => neg(`p${i}`, dir(false)));
  const { deps, llamadas } = fake(muchos);
  deps.candidatos = async () => muchos.map((n) => n.c); // aunque la fuente ignore el tope
  await armarDirectorio(deps, "gsgapp.com.ar");
  assert.equal(llamadas.length, TOPE_NEGOCIOS);
  assert.ok(llamadas.every((l) => l.dep === "ajuste"));
});

test("tope de profes: nunca se arman más de TOPE_PROFES anotados", async () => {
  const muchos = Array.from({ length: TOPE_PROFES + 5 }, (_, i) => neg(`p${i}`, dir(true)));
  const { deps } = fake(muchos);
  assert.equal((await armarDirectorio(deps, "gsgapp.com.ar")).length, TOPE_PROFES);
});

const profe = (clave: string, zona: string, dias: ProfePublico["dias"]): ProfePublico => ({
  clave, nombre: clave, zona, clubes: [], precioIndividual: 0, precioGrupal: 0, dias, turnero: `https://${clave}.gsgapp.com.ar/clases`,
});

test("filtros: zona sin importar tildes ni mayúsculas, día con horario libre, y tope de resultados", () => {
  const a = profe("a", "Cañuelas", [{ fecha: "2026-11-14", etiqueta: "Hoy", horas: ["2026-11-14T21:00:00.000Z"] }]);
  const b = profe("b", "Canning", [{ fecha: "2026-11-15", etiqueta: "Mañana", horas: ["2026-11-15T12:00:00.000Z"] }]);
  assert.deepEqual(filtrarDirectorio([a, b], { zona: "  CANUELAS " }).map((p) => p.clave), ["a"]);
  assert.deepEqual(filtrarDirectorio([a, b], { dia: "2026-11-15" }).map((p) => p.clave), ["b"]);
  assert.deepEqual(filtrarDirectorio([a, b], { dia: "basura" }).map((p) => p.clave), ["a", "b"]);
  assert.deepEqual(filtrarDirectorio([a, b], { zona: "Adrogué" }), []);
  const muchos = Array.from({ length: TOPE_RESULTADOS + 5 }, (_, i) => profe(`p${i}`, "Canning", []));
  assert.equal(filtrarDirectorio(muchos, {}).length, TOPE_RESULTADOS);
  assert.deepEqual(zonasDe([a, b, profe("c", "canning", [])]), ["Canning", "Cañuelas"]);
});

test("próximos horarios: 3 como mucho, del día pedido si se filtró, con el club", () => {
  const p = profe("a", "Canning", [
    { fecha: "2026-11-14", etiqueta: "Hoy", horas: ["2026-11-14T21:00:00.000Z", "2026-11-14T22:00:00.000Z"], clubes: { "2026-11-14T21:00:00.000Z": "Nordelta" } },
    { fecha: "2026-11-15", etiqueta: "Mañana", horas: ["2026-11-15T12:00:00.000Z", "2026-11-15T13:00:00.000Z"] },
  ]);
  const todos = proximosHorarios(p);
  assert.equal(todos.length, 3);
  assert.equal(todos[0]!.club, "Nordelta");
  assert.deepEqual(proximosHorarios(p, "2026-11-15").map((x) => x.iso), ["2026-11-15T12:00:00.000Z", "2026-11-15T13:00:00.000Z"]);
});

test("links: el turnero del profe con la marca de origen (?desde=directorio) y la hora preseleccionada (?hora=)", () => {
  assert.equal(turneroDe("matias", "gsgapp.com.ar"), "https://matias.gsgapp.com.ar/clases");
  assert.equal(turneroDe("Ma tias", "gsgapp.com.ar"), null);
  assert.equal(turneroDe("evil.com/x", "gsgapp.com.ar"), null);
  assert.equal(linkReservar("https://m.gsgapp.com.ar/clases", "2026-11-14T21:00:00.000Z"), "https://m.gsgapp.com.ar/clases?desde=directorio&hora=2026-11-14T21%3A00%3A00.000Z");
  assert.equal(linkReservar("https://m.gsgapp.com.ar/clases", null), "https://m.gsgapp.com.ar/clases?desde=directorio");
  assert.equal(linkReservar("https://m.gsgapp.com.ar/clases", "no"), "https://m.gsgapp.com.ar/clases?desde=directorio");
});

test("caché corta: reusa dentro del plazo, vuelve a armar después y no guarda un error", async () => {
  let ahora = 0;
  let cargas = 0;
  const memo = memoriaCorta<number>(60_000, () => ahora);
  const cargar = async () => ++cargas;
  assert.equal(await memo(cargar), 1);
  ahora = 59_999;
  assert.equal(await memo(cargar), 1);
  ahora = 60_000;
  assert.equal(await memo(cargar), 2);
  ahora = 200_000;
  await assert.rejects(memo(async () => { throw new Error("x"); }));
  assert.equal(await memo(cargar), 3);
});

test("PROFE-005 · costo con RLS: la fuente trae negocios (no anotados); 1 lectura por negocio y 4 por anotado", async () => {
  // 50 negocios con el módulo; 3 anotados al FINAL (los más nuevos). Con RLS la fuente (`Tenant`) no
  // puede saber quién se anotó: trae todos y el ajuste, leído en cada negocio, decide.
  const negocios = [
    ...Array.from({ length: 47 }, (_, i) => neg(`n${i}`, dir(false))),
    neg("ana", dir(true, "Canning")),
    neg("beto", dir(true, "Adrogué")),
    neg("ceci", dir(true, "Lanús")),
  ];
  const { deps, llamadas } = fake(negocios);
  let topePedido = -1;
  deps.candidatos = async (tope) => {
    topePedido = tope;
    return negocios.map((n) => n.c).slice(0, tope);
  };
  const out = await armarDirectorio(deps, "gsgapp.com.ar");
  assert.equal(topePedido, TOPE_NEGOCIOS);
  assert.deepEqual(out.map((p) => p.clave).sort(), ["ana", "beto", "ceci"], "los anotados nuevos aparecen aunque haya negocios antes");
  assert.equal(llamadas.length, 50 + 3 * 3, "ajuste de todos + abierto, agenda y clubes sólo de los anotados");
  assert.ok(TOPE_PROFES >= 100 && TOPE_NEGOCIOS >= TOPE_PROFES, "el tope de negocios no es menor que el de profes");
});

test("CERT 13/11 · el pre-filtro no alcanza: si el ajuste leído en su negocio no es visible, no aparece", async () => {
  const { deps, llamadas } = fake([neg("ana", dir(true)), neg("raro", dir(false)), neg("sinzona", dir(true, ""))]);
  // La fuente (un índice) los trae a los tres; el ajuste de cada negocio decide.
  const out = await armarDirectorio(deps, "gsgapp.com.ar");
  assert.deepEqual(out.map((p) => p.clave), ["ana"]);
  assert.equal(llamadas.some((l) => l.tenantId !== "ana" && l.dep !== "ajuste"), false);
  assert.ok(!JSON.stringify(out).includes("tenantId"));
});

test("CERT 13/11 · caché de 10 minutos", async () => {
  assert.equal(DIRECTORIO_TTL_MS, 10 * 60_000);
  let ahora = 0;
  let cargas = 0;
  const memo = memoriaCorta<number>(DIRECTORIO_TTL_MS, () => ahora);
  await memo(async () => ++cargas);
  ahora = DIRECTORIO_TTL_MS - 1;
  assert.equal(await memo(async () => ++cargas), 1);
  ahora = DIRECTORIO_TTL_MS;
  assert.equal(await memo(async () => ++cargas), 2);
});
