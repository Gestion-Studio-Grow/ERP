// La vidriera de MAGRA, en reglas: de dónde sale cada corte del catálogo real, cómo se cocina, cuántos
// kilos para cuántos, qué foto real tiene y qué WhatsApp se muestra. Sin navegador ni base.
//   node --import tsx --test src/app/tienda/magra/magra.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getRetailRubro } from "@/blueprints/retail/rubros";
import {
  MAGRA,
  MAGRA_GOURMET_FOTOS,
  MAGRA_HERO,
  MAGRA_LOGO_PROVEEDOR,
  chatConElNumeroDelLocal,
  coccionesDe,
  esWhatsAppValido,
  packDeCorte,
  partesDelNombre,
  porcionesAKilos,
  propuestasSegunContacto,
  regionDeCorte,
  resolveMagraLocal,
  whatsappInternacionalAR,
} from "@/tenants/magra-content";
import { seccionMagra } from "../vidriera/marcas";
import { ANIMALES, cajaDelRecorte } from "./despiece-datos";

const PUBLIC = fileURLToPath(new URL("../../../../public", import.meta.url));
const existe = (ruta: string) => existsSync(PUBLIC + ruta);

/** El catálogo real de MAGRA (scripts/fix-magra-data-2026-07-07.ts), nombre por nombre. */
const REAL = [
  "Asado Banderita (Estancia Don Ramón)",
  "Asado del Medio (Estancia Don Ramón)",
  "Bife Argentino (Estancia Don Ramón)",
  "Bife de Chorizo (Estancia Don Ramón)",
  "Carne Picada (Estancia Don Ramón)",
  "Churrasquito de Cuadril (Estancia Don Ramón)",
  "Churrasquito Escondido (Estancia Don Ramón)",
  "Colita de Cuadril (Estancia Don Ramón)",
  "Entraña (Estancia Don Ramón)",
  "Hamburguesas Gourmet Premium (Breaders, x4)",
  "Lomo sin Cordón (Estancia Don Ramón)",
  "Matambre (Estancia Don Ramón)",
  "Medio Lomo (Estancia Don Ramón)",
  "Picanha (Estancia Don Ramón)",
  "Rack de Ojo x1 (Estancia Don Ramón)",
  "Rondelle (Estancia Don Ramón)",
  "T-Bone (Estancia Don Ramón)",
  "Tapa de Nalga (Estancia Don Ramón)",
  "Tomahawk (Estancia Don Ramón)",
  "Vacío Fino (Estancia Don Ramón)",
  "Vacío Pulpeta (Estancia Don Ramón)",
  "Ribs de Cerdo Congelado (Lamberti)",
  "Bondiola (Lamberti)",
  "Churrasquito de Cerdo (Lamberti)",
  "Lomito Ahumado (Lamberti)",
  "Matambrito Arrollado (Lamberti)",
  "Matambrito (Lamberti)",
  "Ribs de Cerdo (Lamberti)",
  "Solomillo (Lamberti)",
  "Nuggets de Pollo Rebozados (540g)",
  "Pata y Muslo Deshuesada (Coeco)",
  "Suprema Deshuesada (Coeco)",
];

test("cada corte del catálogo real cae en su animal y en una región del despiece que existe", () => {
  const animales = { vaca: 0, cerdo: 0, pollo: 0, gourmet: 0 };
  for (const n of REAL) {
    const s = seccionMagra(n);
    animales[s]++;
    assert.notEqual(s, "gourmet", `${n} no es gourmet`);
    const region = regionDeCorte(s as "vaca" | "cerdo" | "pollo", n);
    assert.ok(region, `${n} tiene región`);
    assert.ok(ANIMALES[s as "vaca"].regiones.some((r) => r.id === region), `${n} → ${region} existe en el dibujo de ${s}`);
  }
  // Los 21 de vaca, los 8 de Lamberti (cerdo, aunque el nombre no diga «cerdo») y los 3 de pollo.
  assert.deepEqual(animales, { vaca: 21, cerdo: 8, pollo: 3, gourmet: 0 });
});

test("el despiece ubica los cortes donde los ubica la carnicería", () => {
  const r = (n: string) => regionDeCorte(seccionMagra(n) as "vaca", n);
  assert.equal(r("Vacío Fino (Estancia Don Ramón)"), "vacio");
  assert.equal(r("Vacío Pulpeta (Estancia Don Ramón)"), "vacio");
  assert.equal(r("Lomo sin Cordón (Estancia Don Ramón)"), "lomo");
  assert.equal(r("Bife de Chorizo (Estancia Don Ramón)"), "lomo");
  assert.equal(r("Rack de Ojo x1 (Estancia Don Ramón)"), "aguja");
  assert.equal(r("Asado del Medio (Estancia Don Ramón)"), "costillar");
  assert.equal(r("Picanha (Estancia Don Ramón)"), "cuadril");
  assert.equal(r("Tapa de Nalga (Estancia Don Ramón)"), "nalga");
  assert.equal(r("Entraña (Estancia Don Ramón)"), "entrana");
  assert.equal(r("Carne Picada (Estancia Don Ramón)"), "varias");
  assert.equal(r("Lomito Ahumado (Lamberti)"), "pierna");
  assert.equal(r("Solomillo (Lamberti)"), "carre");
  assert.equal(r("Matambrito (Lamberti)"), "panza");
  assert.equal(r("Suprema Deshuesada (Coeco)"), "pechuga");
  assert.equal(r("Nuggets de Pollo Rebozados (540g)"), "elaborados");
  // El catálogo de ejemplo del rubro (la demo) también se ubica.
  for (const it of getRetailRubro("carniceria")?.catalog ?? []) {
    const s = seccionMagra(it.name);
    if (s === "gourmet" || /pollo entero/i.test(it.name)) continue;
    assert.ok(regionDeCorte(s, it.name), `demo: ${it.name}`);
  }
});

test("cada región dibujada tiene su recorte 4:5 (las que no tienen dibujo muestran el animal entero)", () => {
  for (const a of Object.values(ANIMALES)) {
    for (const r of a.regiones.filter((x) => x.puntos)) {
      const [, , w, h] = cajaDelRecorte(a.id, r.id).split(" ").map(Number);
      assert.ok(Math.abs(w / h - 0.8) < 0.01, `${a.id}/${r.id}: ${w}×${h} es 4:5`);
    }
  }
});

test("«¿Para cuántos comen?»: ~350 g por persona, redondeado a 0,25 kg", () => {
  assert.equal(porcionesAKilos(2), 0.75);
  assert.equal(porcionesAKilos(4), 1.5);
  assert.equal(porcionesAKilos(6), 2);
  assert.equal(porcionesAKilos(8), 2.75);
  assert.equal(porcionesAKilos(0), 0.25, "nunca cero: el mínimo de la bolsa");
});

test("cocción: reglas explicables; sin regla, ningún chip (y el corte igual se ve en «Ver todos»)", () => {
  assert.deepEqual(coccionesDe("Vacío Fino (Estancia Don Ramón)"), ["parrilla"]);
  assert.ok(coccionesDe("Tapa de Nalga (Estancia Don Ramón)").includes("milanesas"));
  assert.ok(coccionesDe("Carne Picada (Estancia Don Ramón)").includes("olla"));
  assert.ok(coccionesDe("Suprema Deshuesada (Coeco)").includes("plancha"));
  assert.deepEqual(coccionesDe("Sorrentinos italianos (Lamberti)"), []);
  for (const n of REAL) assert.ok(coccionesDe(n).length > 0, `${n} tiene al menos una cocción`);
});

test("el nombre: proveedor y detalle salen del paréntesis; el nombre completo no se toca", () => {
  assert.deepEqual(partesDelNombre("Tapa de Nalga (Estancia Don Ramón)"), { nombre: "Tapa de Nalga", proveedor: "Estancia Don Ramón", detalle: null });
  assert.deepEqual(partesDelNombre("Hamburguesas Gourmet Premium (Breaders, x4)"), { nombre: "Hamburguesas Gourmet Premium", proveedor: "Breaders", detalle: "x4" });
  assert.deepEqual(partesDelNombre("Nuggets de Pollo Rebozados (540g)"), { nombre: "Nuggets de Pollo Rebozados", proveedor: null, detalle: "540g" });
  assert.deepEqual(partesDelNombre("Suprema Deshuesada (Coeco)"), { nombre: "Suprema Deshuesada", proveedor: "Coeco", detalle: null });
  assert.deepEqual(partesDelNombre("Vacío"), { nombre: "Vacío", proveedor: null, detalle: null });
});

test("fotos: sólo reales y todas existen (hero, 5 packs, gourmet, proveedores); nada de gen/", () => {
  for (const f of [MAGRA_HERO.src, ...MAGRA_HERO.srcSet.split(",").map((x) => x.trim().split(" ")[0])]) assert.ok(existe(f), f);
  const conPack = REAL.filter((n) => packDeCorte(n));
  assert.deepEqual(conPack, [
    "Asado del Medio (Estancia Don Ramón)",
    "Lomo sin Cordón (Estancia Don Ramón)",
    "Medio Lomo (Estancia Don Ramón)",
    "Rack de Ojo x1 (Estancia Don Ramón)",
    "Tapa de Nalga (Estancia Don Ramón)",
  ]);
  for (const n of conPack) assert.ok(existe(packDeCorte(n)!.src), n);
  assert.equal(packDeCorte("Medio Lomo (Estancia Don Ramón)")?.rotulo, "Medio lomo", "«Medio Lomo» no se confunde con «Lomo»");
  for (const g of MAGRA.gourmet) assert.ok(existe(MAGRA_GOURMET_FOTOS[g.name]), g.name);
  for (const p of MAGRA.providers) assert.ok(existe(MAGRA_LOGO_PROVEEDOR[p]), p);
  const todas = [MAGRA_HERO.src, ...Object.values(MAGRA_GOURMET_FOTOS), ...Object.values(MAGRA_LOGO_PROVEEDOR), ...conPack.map((n) => packDeCorte(n)!.src)];
  assert.ok(todas.every((f) => !f.includes("/gen/") && f.endsWith(".webp")), "todo WebP y nada generado por IA");
});

test("WhatsApp: el relleno «0000 0000» o un número incompleto no se muestra ni se ofrece", () => {
  assert.equal(esWhatsAppValido("+54 9 11 0000 0000"), false);
  assert.equal(esWhatsAppValido("5491111111111"), false);
  assert.equal(esWhatsAppValido("12345"), false);
  assert.equal(esWhatsAppValido(""), false);
  assert.equal(esWhatsAppValido(null), false);
  assert.equal(esWhatsAppValido("5491161354042"), true);
  assert.equal(esWhatsAppValido("11-6677-8890"), true);
  const base = { addressLine: null, city: null, hoursLabel: null, instagram: null, email: null };
  const relleno = resolveMagraLocal({ ...base, whatsapp: "+54 9 11 0000 0000" });
  assert.equal(relleno.whatsapp, "");
  assert.equal(relleno.whatsappLabel, null);
  const real = resolveMagraLocal({ ...base, whatsapp: "+54 9 11 6135-4042" });
  assert.equal(real.whatsapp, "5491161354042");
  assert.equal(real.whatsappLabel, "+54 9 11 6135-4042");
  // Lo mismo con el Instagram de relleno del alta: no es una cuenta, no se publica.
  assert.equal(resolveMagraLocal({ ...base, whatsapp: null, instagram: "@instagram-a-confirmar" }).instagram, null);
  assert.equal(resolveMagraLocal({ ...base, whatsapp: null, instagram: "@tiendamagra" }).instagram, "@tiendamagra");
});

test("WhatsApp: se normaliza al formato internacional argentino (549 + área + número)", () => {
  // El caso de la QA: el panel guarda «11-6677-8890» como 1166778890 y la tienda armaba
  // wa.me/1166778890, que WhatsApp lee como +1 (EE. UU.).
  for (const crudo of [
    "11-6677-8890",
    "1166778890",
    "011 6677-8890", // con el 0 de larga distancia
    "11 15 6677-8890", // con el 15 local
    "011 15-6677-8890", // con los dos
    "+54 11 6677-8890", // con 54 y sin el 9: se le pone
    "541166778890",
    "+54 9 11 6677-8890",
    "5491166778890",
    "0054 9 11 6677 8890",
  ]) {
    assert.equal(whatsappInternacionalAR(crudo), "5491166778890", crudo);
  }
  assert.equal(whatsappInternacionalAR("221 456-7890"), "5492214567890", "área de 3 dígitos");
  assert.equal(whatsappInternacionalAR("0221 15 456-7890"), "5492214567890");
  assert.equal(whatsappInternacionalAR("2944 12-3456"), "5492944123456", "área de 4 dígitos");
});

test("WhatsApp: lo que no se puede interpretar con seguridad no se muestra", () => {
  for (const crudo of [
    "+54 9 11 0000 0000", // el relleno
    "5491100000000",
    "6677-8890", // sin área
    "15 6677-8890", // el 15 sin área: no hay área «15»
    "1566778890",
    "+1 415 555 1234", // otro país
    "+44 7911 123456",
    "54911667788", // le faltan dígitos
    "12345",
    "",
    null,
    undefined,
  ]) {
    assert.equal(whatsappInternacionalAR(crudo), "", String(crudo));
    assert.equal(esWhatsAppValido(crudo), false, String(crudo));
  }
});

test("WhatsApp: el pie muestra el número legible y el link abre ese mismo número", () => {
  const base = { addressLine: null, city: null, hoursLabel: null, instagram: null, email: null };
  const local = resolveMagraLocal({ ...base, whatsapp: "1166778890" });
  assert.equal(local.whatsapp, "5491166778890");
  assert.equal(local.whatsappLabel, "+54 9 11 6677-8890");
  assert.equal(local.whatsappLabel!.replace(/\D/g, ""), local.whatsapp);
});

test("WhatsApp: el chat del pedido va al número del local normalizado, con el texto intacto", () => {
  const delServidor = "https://wa.me/1166778890?text=%C2%A1Hola%20MAGRA!%20Pedido%20%2312";
  assert.equal(
    chatConElNumeroDelLocal(delServidor, "5491166778890"),
    "https://wa.me/5491166778890?text=%C2%A1Hola%20MAGRA!%20Pedido%20%2312",
  );
  assert.equal(chatConElNumeroDelLocal(delServidor, ""), null, "sin número del local no hay chat");
  assert.equal(chatConElNumeroDelLocal(null, "5491166778890"), null);
});

test("sin WhatsApp, «Atención personalizada» no promete un chat que no existe", () => {
  const conWa = propuestasSegunContacto(MAGRA.valueProps, { whatsapp: "5491166778890", instagramUrl: null });
  assert.deepEqual(conWa, MAGRA.valueProps, "con WhatsApp, el copy textual queda igual");
  const textoDe = (ps: { title: string; text: string }[]) => ps.find((p) => p.title === "Atención personalizada")!.text;
  const conIg = propuestasSegunContacto(MAGRA.valueProps, { whatsapp: "", instagramUrl: "https://www.instagram.com/tiendamagra" });
  assert.equal(textoDe(conIg), "Dudas, pedidos o antojos: ¡escribinos por Instagram!");
  const sinNada = propuestasSegunContacto(MAGRA.valueProps, { whatsapp: "", instagramUrl: null });
  assert.equal(textoDe(sinNada), "Dudas o antojos: dejalos en la nota de tu pedido.");
  for (const ps of [conIg, sinNada]) {
    assert.equal(ps.length, MAGRA.valueProps.length, "las cuatro propuestas siguen");
    assert.ok(ps.every((p) => !/whatsapp/i.test(p.text)), "ningún texto promete WhatsApp");
  }
});
