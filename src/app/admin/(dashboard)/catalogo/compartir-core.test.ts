import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparOrigenes,
  campana,
  linkPara,
  listaActiva,
  mensajeWhatsApp,
  motivoProfesional,
  motivoServicio,
  pesos,
  urlWhatsApp,
  vistaPrevia,
  type DatosCompartir,
} from "./compartir-core";

const facial = { id: "s1", name: "Limpieza Facial", durationMin: 45, price: 18000 };
const masaje = { id: "s2", name: "Masaje", durationMin: 60, price: 25000 };
const datos: DatosCompartir = {
  base: "https://spa.ejemplo.com",
  negocio: "Spa Sol",
  lista: [
    { id: "p1", name: "Ana", services: [facial, masaje] },
    { id: "p2", name: "Beto", services: [masaje] },
  ],
};

test("listaActiva: deja afuera inactivos, borrados y servicios inactivos", () => {
  const l = listaActiva([
    { id: "p1", name: "Ana", active: true, services: [{ ...facial, active: true }, { ...masaje, active: false }] },
    { id: "p2", name: "Beto", active: false, services: [{ ...masaje, active: true }] },
    { id: "p3", name: "Caro", active: true, deletedAt: new Date(), services: [] },
  ]);
  assert.deepEqual(l, [{ id: "p1", name: "Ana", services: [facial] }]);
});

test("campaña: slug del servicio, o del profesional si no hay servicio", () => {
  assert.equal(campana(datos.lista, { serviceId: "s1", professionalId: "p1" }), "limpieza-facial");
  assert.equal(campana(datos.lista, { professionalId: "p2" }), "beto");
});

test("linkPara: utm por canal", () => {
  const ig = new URL(linkPara(datos, { serviceId: "s1" }, "instagram"));
  assert.equal(ig.pathname, "/reserva");
  assert.equal(ig.searchParams.get("servicio"), "limpieza-facial");
  assert.equal(ig.searchParams.get("utm_source"), "instagram");
  assert.equal(ig.searchParams.get("utm_medium"), "bio");
  assert.equal(ig.searchParams.get("utm_campaign"), "limpieza-facial");
  const directo = new URL(linkPara(datos, { professionalId: "p1" }, "directo"));
  assert.equal(directo.searchParams.get("utm_source"), null);
  assert.equal(directo.searchParams.get("profesional"), "ana");
});

test("mensaje de WhatsApp con servicio y profesional, y su URL codificada", () => {
  const m = mensajeWhatsApp(datos, { serviceId: "s1", professionalId: "p1" });
  assert.match(m, /^Reservá tu Limpieza Facial con Ana acá: https:\/\/spa\.ejemplo\.com\/reserva\?/);
  assert.match(m, /utm_source=whatsapp&utm_medium=mensaje&utm_campaign=limpieza-facial$/);
  assert.equal(mensajeWhatsApp(datos, { professionalId: "p2" }).startsWith("Reservá con Beto acá: "), true);
  const u = urlWhatsApp("Hola & chau");
  assert.equal(u, "https://wa.me/?text=Hola%20%26%20chau");
});

test("pesos: separador de miles argentino", () => {
  assert.equal(pesos(18000), "$ 18.000");
  assert.equal(pesos(1234567), "$ 1.234.567");
  assert.equal(pesos(500), "$ 500");
});

test("vista previa: título, descripción e imagen OG", () => {
  const v = vistaPrevia(datos, { serviceId: "s1", professionalId: "p1" });
  assert.equal(v.titulo, "Limpieza Facial con Ana — Spa Sol");
  assert.equal(v.descripcion, "45 min · $ 18.000");
  assert.equal(v.imagen, "/reserva/og?servicio=limpieza-facial&profesional=ana");
  const p = vistaPrevia(datos, { professionalId: "p2" });
  assert.equal(p.titulo, "Beto — Spa Sol");
  assert.equal(p.descripcion, "1 servicio para reservar");
});

test("motivos para no compartir", () => {
  assert.match(motivoServicio(datos.lista, { id: "s1", active: false }) ?? "", /inactivo/);
  assert.match(motivoServicio(datos.lista, { id: "s9", active: true }) ?? "", /Nadie lo hace/);
  assert.equal(motivoServicio(datos.lista, { id: "s1", active: true }), undefined);
  assert.match(motivoProfesional(datos.lista, { id: "p1", active: false }) ?? "", /inactivo/);
  assert.equal(motivoProfesional(datos.lista, { id: "p2", active: true }), undefined);
});

test("agruparOrigenes: cuenta por origen, ignora notas sin marca, ordena de mayor a menor", () => {
  const g = agruparOrigenes([
    "[via:instagram/bio/limpieza-facial] trae toalla",
    "[via:whatsapp/mensaje/masaje]",
    "[via:instagram/bio/limpieza-facial]",
    "sin marca",
    null,
  ]);
  assert.deepEqual(g, [
    { origen: "instagram/bio/limpieza-facial", red: "Instagram", detalle: "bio · limpieza facial", cantidad: 2 },
    { origen: "whatsapp/mensaje/masaje", red: "WhatsApp", detalle: "mensaje · masaje", cantidad: 1 },
  ]);
  assert.deepEqual(agruparOrigenes([]), []);
});
