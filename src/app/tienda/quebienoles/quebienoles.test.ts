import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { FAMILIAS, PERFUMES, fotoDe, nombreEnCatalogo, nombreSinCasa, perfumeDe, aQueHuele } from "./perfumes";
import { recomendar, type Candidato, type Respuestas } from "./recomendador";

// ── EL CATÁLOGO CONTRA LA FUENTE (carrusel de @quebienoles del 15/09/2026) ────────────────────
// Transcripto placa por placa. Si alguien cambia un precio de la semilla "a mano", esto lo frena:
// el precio vivo se cambia en el panel, no acá.
const PLACAS: Record<string, [string, number][]> = {
  dulces: [["9PM Night Out", 47000], ["Khamrah", 45000], ["Liquid Brun", 49000], ["Yara Candy", 32000], ["Give Me Gourmand", 45000], ["Asad Bourbon", 32000], ["Cocoa Morado", 38000]],
  frescos: [["Odyssey Limoni", 37000], ["Club de Nuit Iconic", 46000], ["Hawas Ice", 34000], ["9AM Dive", 35000], ["Odyssey Mandarin Sky", 37000], ["Hawas Tropical", 34000]],
  versatiles: [["9PM", 35000], ["Club de Nuit Intense Man", 40000], ["Supremacy Collector's Edition", 44000], ["Bharara Bleu", 59000], ["Bharara King Gold Edition", 59000], ["Amber Oud Aqua Dubai", 54000]],
  femeninos: [["Yara Pink", 32000], ["La Vida es Bella", 20000], ["Eclaire", 39000], ["Kayali Vanilla Candy", 25000], ["Sakeena", 38000], ["Afeef", 59000]],
};

test("catálogo: los 25 perfumes de las placas, cada uno en su familia y con su precio", () => {
  assert.equal(PERFUMES.length, 25);
  assert.deepEqual(FAMILIAS.map((f) => f.id), ["dulces", "frescos", "versatiles", "femeninos"]);
  for (const [familia, filas] of Object.entries(PLACAS)) {
    const deLaFamilia = PERFUMES.filter((p) => p.familia === familia);
    assert.deepEqual(
      deLaFamilia.map((p) => [p.nombre, p.precio]),
      filas,
      `la placa "${familia}" no coincide con el catálogo`,
    );
  }
});

test("catálogo: cada perfume tiene su foto en public/ (la ruta que pide la vidriera)", () => {
  for (const p of PERFUMES) {
    const archivo = join(process.cwd(), "public", fotoDe(p));
    assert.ok(existsSync(archivo), `falta la foto de ${p.nombre}: ${archivo}`);
  }
});

test("catálogo: claves y nombres de carga únicos (dos perfumes no pueden caer en la misma fila)", () => {
  assert.equal(new Set(PERFUMES.map((p) => p.clave)).size, PERFUMES.length);
  assert.equal(new Set(PERFUMES.map(nombreEnCatalogo)).size, PERFUMES.length);
});

test("honestidad: sin fuente no hay pirámide, y lo que no se afirma avisa", () => {
  for (const p of PERFUMES) {
    if (p.notas) assert.ok(p.fuente?.startsWith("https://"), `${p.nombre} tiene pirámide sin fuente`);
    if (p.casa === null) {
      assert.equal(p.notas, null, `${p.nombre}: sin casa confirmada no se publica pirámide`);
      assert.ok(p.aviso, `${p.nombre}: sin casa confirmada tiene que avisar antes de pedir`);
    }
  }
  // Bharara Bleu: las dos fuentes se contradicen → no se publica ninguna de las dos pirámides.
  assert.equal(perfumeDe("Bharara Bleu")?.notas, null);
});

test("perfumeDe: encuentra la ficha por el nombre de la base, con o sin la casa", () => {
  assert.equal(perfumeDe("Khamrah · Lattafa")?.clave, "dul-khamrah");
  assert.equal(perfumeDe("khamrah")?.clave, "dul-khamrah");
  assert.equal(perfumeDe("KHAMRAH - Lattafa")?.clave, "dul-khamrah");
  assert.equal(perfumeDe("Yara Candy · Lattafa")?.clave, "dul-yara-candy");
  assert.equal(perfumeDe("Yara · Lattafa")?.clave, "fem-yara");
  assert.equal(perfumeDe("9PM · Afnan")?.clave, "ver-9pm");
  assert.equal(perfumeDe("9PM Night Out · Afnan")?.clave, "dul-9pm-night-out");
  assert.equal(perfumeDe("La vie est belle")?.clave, "fem-la-vie-est-belle");
  assert.equal(perfumeDe("Supremacy Collector's Edition · Afnan")?.clave, "ver-supremacy-collector");
  assert.equal(perfumeDe("Perfume que no está en la placa"), null);
  assert.equal(nombreSinCasa("Club de Nuit Intense Man · Armaf"), "Club de Nuit Intense Man");
});

test("aQueHuele: primeras notas en minúscula y con 'y' al final", () => {
  assert.equal(aQueHuele(perfumeDe("Khamrah")!), "canela, nuez moscada y dátiles");
  assert.equal(aQueHuele({ notas: null }), null);
});

// ── EL RECOMENDADOR ─────────────────────────────────────────────────────────
const candidatos: Candidato[] = PERFUMES.map((p) => ({
  id: p.clave,
  name: nombreEnCatalogo(p),
  price: p.precio,
  disponibilidad: null,
  perfume: p,
}));

const TODAS: Respuestas[] = [];
for (const ocasion of ["todos-los-dias", "salida", "regalo", "gustito"] as const)
  for (const estilo of ["dulce", "fresco", "versatil", "floral"] as const)
    for (const para of ["para-mi", "el", "ella"] as const) TODAS.push({ ocasion, estilo, para });

test("recomendar: tres por respuesta, nunca uno del otro público y siempre con porqué", () => {
  for (const r of TODAS) {
    const recs = recomendar(candidatos, r);
    assert.equal(recs.length, 3, JSON.stringify(r));
    for (const x of recs) {
      if (r.para === "el") assert.notEqual(x.perfume.genero, "femenino", `${x.perfume.nombre} para él`);
      if (r.para === "ella") assert.notEqual(x.perfume.genero, "masculino", `${x.perfume.nombre} para ella`);
      assert.ok(x.perfume.notas, `${x.perfume.nombre} se recomendó sin pirámide`);
      assert.ok(x.porque.length > 20);
    }
  }
});

test("recomendar: la familia elegida manda y el resultado es estable", () => {
  const r: Respuestas = { ocasion: "salida", estilo: "dulce", para: "para-mi" };
  const a = recomendar(candidatos, r);
  assert.ok(a.every((x) => x.perfume.familia === "dulces"));
  assert.deepEqual(recomendar(candidatos, r), a);
  const fresco = recomendar(candidatos, { ocasion: "todos-los-dias", estilo: "fresco", para: "el" });
  assert.ok(fresco.every((x) => x.perfume.familia === "frescos"));
});

test("recomendar: no recomienda lo que no se puede pedir ni lo que no tiene ficha", () => {
  const r: Respuestas = { ocasion: "salida", estilo: "dulce", para: "para-mi" };
  const primero = recomendar(candidatos, r)[0];
  const sinStock = candidatos.map((c) => (c.id === primero.id ? { ...c, disponibilidad: "sin-stock" as const } : c));
  assert.ok(!recomendar(sinStock, r).some((x) => x.id === primero.id));
  const sinFicha = [{ id: "x", name: "Algo nuevo", price: 1000, perfume: null }, ...candidatos];
  assert.ok(!recomendar(sinFicha, r).some((x) => x.id === "x"));
  assert.ok(!TODAS.some((q) => recomendar(candidatos, q).some((x) => x.id === "ver-bharara-bleu")));
});
