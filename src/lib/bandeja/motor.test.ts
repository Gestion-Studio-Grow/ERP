// Tests del motor de Bandeja (public/previews/bandeja/motor.mjs): distancia, ranking con reseñas
// verificadas, filtros del jugador, la reseña que sólo deja quien tomó la clase y los horarios libres.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as motor from "../../../public/previews/bandeja/motor.mjs";
import { PROFES, HOY, PUNTOS } from "../../../public/previews/bandeja/datos.mjs";

// El motor es JS plano (el navegador lo carga tal cual): los escenarios se arman a mano, sin tipar.
/* eslint-disable @typescript-eslint/no-explicit-any -- ver la nota de arriba */
const M: any = motor;

const EZEIZA = { lat: -34.8537, lng: -58.5228 };
const ADROGUE = { lat: -34.8007, lng: -58.3903 };
const cinco = { ensena: 5, progreso: 5, puntualidad: 5, trato: 5 };
const tres = { ensena: 3, progreso: 3, puntualidad: 3, trato: 3 };

function profe(id: string, sede: { lat: number; lng: number; localidad?: string }, resenas: any[] = [], extra: any = {}) {
  return {
    id,
    nombre: `Profe ${id}`,
    sedes: [{ club: "Club", localidad: "Zona", ...sede }],
    niveles: ["inicio", "intermedio"],
    menores: false,
    precios: { individual: 25000, grupal: 12000 },
    reservaOnline: true,
    resenas,
    ...extra,
  };
}
const resena = (alumnoId: string, fecha: string, puntos = cinco, verificada = true) => ({ alumnoId, fecha, puntos, verificada });

test("distancia: Ezeiza–Adrogué ronda los 13 km y es simétrica", () => {
  const d = M.distanciaKm(EZEIZA, ADROGUE);
  assert.ok(d > 12 && d < 15, `dio ${d}`);
  assert.equal(M.distanciaKm(ADROGUE, EZEIZA).toFixed(6), d.toFixed(6));
  assert.equal(M.distanciaKm(EZEIZA, EZEIZA), 0);
});

test("sede más cercana: el profe que da en dos clubes se mide desde el más cerca", () => {
  const p = profe("a", EZEIZA);
  p.sedes.push({ club: "Otro", localidad: "Adrogué", ...ADROGUE });
  const r = M.sedeMasCercana(p, { lat: -34.8, lng: -58.39 });
  assert.equal(r.sede.localidad, "Adrogué");
  assert.ok(r.km < 1);
});

test("puntaje: sin reseñas vale el previo; un solo 5 no le gana a veinte 4,8", () => {
  assert.equal(M.resumen([]).puntaje, M.REGLAS.previo);
  assert.equal(M.resumen([]).promedio, null);
  const uno = M.resumen([resena("x", "2026-10-01")]);
  const muchos = M.resumen(
    Array.from({ length: 20 }, (_, i) =>
      resena(`a${i}`, "2026-10-01", i % 5 === 0 ? { ensena: 4, progreso: 4, puntualidad: 5, trato: 5 } : cinco),
    ),
  );
  assert.equal(uno.promedio, 5);
  assert.ok(muchos.puntaje > uno.puntaje, `${muchos.puntaje} vs ${uno.puntaje}`);
});

test("una voz por alumno: cuenta sólo su última reseña, y las no verificadas no cuentan", () => {
  const r = M.resumen([
    resena("juan", "2026-08-01", tres),
    resena("juan", "2026-10-01", cinco),
    resena("ana", "2026-09-01", cinco, false),
  ]);
  assert.equal(r.cantidad, 1);
  assert.equal(r.promedio, 5);
  assert.equal(r.porCriterio.ensena, 5);
});

test("buscar: radio, nivel, menores, precio y reserva online filtran", () => {
  const lista = [
    profe("cerca", EZEIZA),
    profe("lejos", { ...ADROGUE, localidad: "Adrogué" }),
    profe("chicos", EZEIZA, [], { menores: true, niveles: ["inicio"] }),
    profe("caro", EZEIZA, [], { precios: { individual: 60000, grupal: 0 }, niveles: ["competencia"] }),
    profe("sin-app", EZEIZA, [], { reservaOnline: false }),
  ];
  const ids = (f: any) => M.buscar(lista, EZEIZA, f).map((x: any) => x.profe.id).sort();
  assert.deepEqual(ids({ radioKm: 5 }), ["caro", "cerca", "chicos", "sin-app"]);
  assert.deepEqual(ids({ nivel: "competencia" }), ["caro"]);
  assert.deepEqual(ids({ menores: true }), ["chicos"]);
  assert.deepEqual(ids({ precioMax: 20000 }), ["cerca", "chicos", "lejos", "sin-app"]);
  assert.deepEqual(ids({ modalidad: "grupal", nivel: "competencia" }), []);
  assert.ok(!ids({ soloReservaOnline: true }).includes("sin-app"));
  assert.deepEqual(ids({ texto: "adrogue" }), ["lejos"]);
});

test("orden recomendados: a igual puntaje gana el más cerca; un profe mucho mejor puede estar más lejos", () => {
  const buenas = Array.from({ length: 30 }, (_, i) => resena(`a${i}`, "2026-10-01"));
  const lista = [profe("cerca", EZEIZA), profe("lejos-bueno", ADROGUE, buenas), profe("lejos", ADROGUE)];
  const orden = M.buscar(lista, EZEIZA, {}, "recomendados").map((x: any) => x.profe.id);
  assert.equal(orden.at(-1), "lejos");
  assert.ok(orden.indexOf("cerca") < orden.indexOf("lejos"));
  assert.equal(M.buscar(lista, EZEIZA, {}, "cerca")[0].profe.id, "cerca");
  assert.equal(M.buscar(lista, EZEIZA, {}, "puntaje")[0].profe.id, "lejos-bueno");
  assert.throws(() => M.buscar(lista, EZEIZA, {}, "cualquiera"));
});

const CLASE = {
  id: "c1",
  estado: "DADA",
  alumnoToken: "tok-1",
  alumnoId: "alu-1",
  alumnoNombre: "Juan Pérez",
  fecha: "2026-10-15",
  resenada: false,
};
const AHORA = "2026-10-17T10:00:00Z";

test("reseña: sólo con clase dada, del mismo alumno, una vez y dentro del plazo", () => {
  const base = { clase: CLASE, token: "tok-1", puntos: cinco, texto: "Muy clara", ahora: AHORA };
  const ok = M.validarResena(base);
  assert.equal(ok.ok, true);
  assert.equal(ok.resena.verificada, true);
  assert.equal(ok.resena.alumnoId, "alu-1");
  assert.equal(ok.resena.fechaClase, "2026-10-15");

  assert.match(M.validarResena({ ...base, clase: null }).error, /No encontramos/);
  assert.match(M.validarResena({ ...base, token: "otro" }).error, /no es de esta clase/);
  assert.match(M.validarResena({ ...base, clase: { ...CLASE, estado: "CONFIRMADA" } }).error, /ya se dio/);
  assert.match(M.validarResena({ ...base, clase: { ...CLASE, estado: "AUSENTE" } }).error, /ya se dio/);
  assert.match(M.validarResena({ ...base, clase: { ...CLASE, resenada: true } }).error, /ya tiene/);
  assert.match(M.validarResena({ ...base, ahora: "2026-11-20T10:00:00Z" }).error, /vence/);
  assert.match(M.validarResena({ ...base, ahora: "2026-10-14T10:00:00Z" }).error, /ya se dio/);
});

test("reseña: los cuatro criterios de 1 a 5, enteros", () => {
  const base = { clase: CLASE, token: "tok-1", texto: "", ahora: AHORA };
  assert.match(M.validarResena({ ...base, puntos: { ...cinco, trato: undefined } }).error, /Buena onda/);
  assert.match(M.validarResena({ ...base, puntos: { ...cinco, ensena: 6 } }).error, /Cómo explica/);
  assert.match(M.validarResena({ ...base, puntos: { ...cinco, progreso: 4.5 } }).error, /Cuánto mejoré/);
  assert.equal(M.validarResena({ ...base, puntos: { ensena: 1, progreso: 1, puntualidad: 1, trato: 1 } }).ok, true);
});

test("reseña: sin teléfonos, links ni arrobas, y con tope de largo", () => {
  const base = { clase: CLASE, token: "tok-1", puntos: cinco, ahora: AHORA };
  for (const texto of ["llamame al 11 6187 0066", "+5491161870066", "mirá www.otra.com", "seguime en @profe_x", "https://x.y"]) {
    assert.equal(M.validarResena({ ...base, texto }).ok, false, texto);
  }
  assert.equal(M.validarResena({ ...base, texto: "Clase de 60 minutos, 3 ejercicios de bandeja" }).ok, true);
  assert.match(M.validarResena({ ...base, texto: "a".repeat(401) }).error, /hasta 400/);
  assert.equal(M.validarResena({ ...base, texto: "  muy   buena  " }).resena.texto, "muy buena");
});

test("horarios libres: franjas − tomadas − anticipación, por día", () => {
  // 2026-10-17 es sábado (6); 2026-10-19 lunes (1).
  const franjas = [
    { dia: 6, desde: "09:00", hasta: "13:00" },
    { dia: 1, desde: "18:00", hasta: "20:00" },
  ];
  const libres = M.proximosLibres({
    franjas,
    ahora: { fecha: "2026-10-17", min: 9 * 60 + 30 },
    tomadas: new Set(["2026-10-19 18:00"]),
    dias: 7,
  });
  assert.deepEqual(libres, [
    { fecha: "2026-10-17", horas: ["12:00"] }, // 10 y 11 caen dentro de las 2 h de anticipación
    { fecha: "2026-10-19", horas: ["19:00"] },
  ]);
  assert.equal(M.diaSemana("2026-10-17"), 6);
  assert.equal(M.sumarDias("2026-10-31", 1), "2026-11-01");
});

test("formatos: plata sin centavos, km y nombre público del alumno", () => {
  assert.equal(M.plata(25000), "$ 25.000");
  assert.equal(M.km(0.84), "0,8 km");
  assert.equal(M.km(12.4), "12 km");
  assert.equal(M.nombrePublico("Juan Pérez Gómez"), "Juan P.");
  assert.equal(M.nombrePublico("Majo"), "Majo");
});

test("datos de ejemplo: coherentes con el motor", () => {
  assert.ok(PROFES.length >= 10);
  const ids = new Set();
  for (const p of PROFES) {
    assert.ok(!ids.has(p.id), `id repetido ${p.id}`);
    ids.add(p.id);
    assert.ok(p.sedes.length >= 1);
    assert.ok(M.precioDesde(p) > 0, p.id);
    for (const r of p.resenas) {
      const puntos: Record<string, number> = r.puntos;
      for (const c of M.CRITERIOS) assert.ok(Number.isInteger(puntos[c.id]) && puntos[c.id] >= 1 && puntos[c.id] <= 5);
      assert.ok(r.fecha <= HOY, `reseña del futuro en ${p.id}`);
    }
  }
  assert.ok(PUNTOS.length >= 5);
});
