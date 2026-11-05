import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugDe, slugUnico, resolverPreeleccion, armarLinkReserva, marcaOrigen, leerMarcaOrigen,
  metaDelLink, pesosDelLink, leerQueryDelLink,
  AVISO_SERVICIO, AVISO_PROFESIONAL, type ProfesionalDelLink,
} from "./link-reserva";

const s = (id: string, name: string) => ({ id, name, durationMin: 45, price: 18000 });
// Negocio A y negocio B: cada lista es lo que devuelve getProfessionalsWithServices() con el scope de su tenant.
const facialA = s("svcA1aaaa", "Limpieza Facial");
const laserA = s("svcA2bbbb", "Depilación Láser");
const negocioA: ProfesionalDelLink[] = [
  { id: "proA1", name: "Ana Pérez", services: [facialA, laserA] },
  { id: "proA2", name: "Beto Gómez", services: [laserA] },
];
const masajeB = s("svcB1cccc", "Masaje Descontracturante");
const negocioB: ProfesionalDelLink[] = [{ id: "proB1", name: "Carla Ruiz", services: [masajeB] }];

test("slugDe saca acentos y espacios", () => {
  assert.equal(slugDe("Depilación Láser"), "depilacion-laser");
  assert.equal(slugDe("  Ña ñu!! "), "na-nu");
});

test("choque de nombres dentro del negocio: sufijo con el id, estable", () => {
  const m = slugUnico([{ id: "x1AB12", name: "Facial" }, { id: "x2CD34", name: "facial" }, { id: "x3", name: "Otro" }]);
  assert.equal(m.get("x1AB12"), "facial-ab12");
  assert.equal(m.get("x2CD34"), "facial-cd34");
  assert.equal(m.get("x3"), "otro");
});

test("los dos preelegidos: directo a fecha", () => {
  assert.deepEqual(resolverPreeleccion(negocioA, { servicio: "limpieza-facial", profesional: "ana-perez" }), {
    serviceId: facialA.id, professionalId: "proA1",
  });
});

test("sólo servicio que hace una sola persona: queda elegida", () => {
  assert.deepEqual(resolverPreeleccion(negocioA, { servicio: "limpieza-facial" }), { serviceId: facialA.id, professionalId: "proA1" });
});

test("sólo servicio que hacen varias: la persona queda por elegir", () => {
  assert.deepEqual(resolverPreeleccion(negocioA, { servicio: "depilacion-laser" }), { serviceId: laserA.id, professionalId: undefined });
});

test("sólo profesional", () => {
  assert.deepEqual(resolverPreeleccion(negocioA, { profesional: "beto-gomez" }), { serviceId: undefined, professionalId: "proA2" });
});

test("el id crudo también resuelve", () => {
  assert.equal(resolverPreeleccion(negocioA, { servicio: laserA.id }).serviceId, laserA.id);
});

test("aislamiento: un slug o id de otro negocio no resuelve", () => {
  assert.deepEqual(resolverPreeleccion(negocioA, { servicio: "masaje-descontracturante" }), { professionalId: undefined, aviso: AVISO_SERVICIO });
  assert.deepEqual(resolverPreeleccion(negocioA, { profesional: "proB1" }), { serviceId: undefined, aviso: AVISO_PROFESIONAL });
  assert.equal(resolverPreeleccion(negocioB, { servicio: "limpieza-facial" }).serviceId, undefined);
});

test("servicio inactivo (no viene en la lista): aviso, nunca error", () => {
  const r = resolverPreeleccion(negocioA, { servicio: "peeling", profesional: "ana-perez" });
  assert.deepEqual(r, { professionalId: "proA1", aviso: AVISO_SERVICIO });
});

test("profesional que no hace ese servicio: conserva el servicio y suelta a la persona", () => {
  const r = resolverPreeleccion(negocioA, { servicio: "limpieza-facial", profesional: "beto-gomez" });
  assert.deepEqual(r, { serviceId: facialA.id, aviso: "Beto Gómez no hace Limpieza Facial. Te mostramos quiénes sí." });
});

test("armarLinkReserva arma el link legible con utm", () => {
  const url = armarLinkReserva("https://ch.example", negocioA, {
    serviceId: laserA.id, professionalId: "proA2", utm: { source: "instagram", medium: "bio", campaign: "depilacion-laser" },
  });
  assert.equal(url, "https://ch.example/reserva?servicio=depilacion-laser&profesional=beto-gomez&utm_source=instagram&utm_medium=bio&utm_campaign=depilacion-laser");
  assert.deepEqual(resolverPreeleccion(negocioA, Object.fromEntries(new URL(url).searchParams)), { serviceId: laserA.id, professionalId: "proA2" });
});

test("marcaOrigen sanea y se relee", () => {
  assert.equal(marcaOrigen({ source: "Instagram", medium: "bio", campaign: "<script>x" }), "[via:instagram/bio/script-x]");
  assert.equal(marcaOrigen({ medium: "bio" }), undefined);
  assert.equal(marcaOrigen({ source: "whatsapp" }), "[via:whatsapp]");
  assert.ok(marcaOrigen({ source: "a".repeat(200) })!.length <= 80);
  assert.deepEqual(leerMarcaOrigen("[via:instagram/bio] traigo toalla"), { origen: "instagram/bio", resto: "traigo toalla" });
  assert.deepEqual(leerMarcaOrigen("sin marca"), { resto: "sin marca" });
});

test("metaDelLink: los tres títulos, descripción con duración y precio, imagen con slugs", () => {
  const ambos = metaDelLink(negocioA, { serviceId: facialA.id, professionalId: "proA1" }, "CH Estética")!;
  assert.equal(ambos.titulo, "Limpieza Facial con Ana Pérez — CH Estética");
  assert.equal(ambos.descripcion, "45 min · $ 18.000 · Reservás online en un minuto.");
  assert.equal(ambos.imagen, "/reserva/og?servicio=limpieza-facial&profesional=ana-perez");
  const serv = metaDelLink(negocioA, { serviceId: laserA.id }, "CH Estética")!;
  assert.equal(serv.titulo, "Depilación Láser — CH Estética");
  assert.equal(serv.imagen, "/reserva/og?servicio=depilacion-laser");
  const prof = metaDelLink(negocioA, { professionalId: "proA2" }, "CH Estética")!;
  assert.equal(prof.titulo, "Reservá con Beto Gómez — CH Estética");
  assert.equal(prof.descripcion, "Elegí servicio y horario. Reservás online en un minuto.");
  assert.equal(metaDelLink(negocioA, { aviso: AVISO_SERVICIO }, "CH Estética"), null);
  // Un id de otro negocio no está en la lista: nada.
  assert.equal(metaDelLink(negocioA, { serviceId: masajeB.id }, "CH Estética"), null);
});

test("pesosDelLink y leerQueryDelLink", () => {
  assert.equal(pesosDelLink(18000), "$ 18.000");
  assert.equal(pesosDelLink(1234567.4), "$ 1.234.567");
  assert.equal(pesosDelLink(900), "$ 900");
  assert.deepEqual(leerQueryDelLink({ servicio: ["a", "b"], profesional: "", utm_source: "instagram" }), {
    servicio: "a", profesional: undefined, utm: { source: "instagram", medium: undefined, campaign: undefined },
  });
});
