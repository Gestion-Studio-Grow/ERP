import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarOpciones, normalizarBusqueda, type OpcionBuscador } from "./buscador-filtro";

const OPS = [
  { id: "1", etiqueta: "Ojo de bife", detalle: "$21.000/kg" },
  { id: "2", etiqueta: "Lomo al vacío", detalle: "$25.900/kg" },
  { id: "3", etiqueta: "Vacío", detalle: "$15.000/kg" },
  { id: "4", etiqueta: "Bondiola", detalle: "$12.000/kg" },
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

test("sin tildes ni mayúsculas", () => {
  assert.deepEqual(ids(filtrarOpciones(OPS, "VACIO")), ["3", "2"]);
});

test("el que empieza con lo tipeado va primero", () => {
  assert.deepEqual(ids(filtrarOpciones(OPS, "vac")), ["3", "2"]);
});

test("palabras en cualquier orden", () => {
  assert.deepEqual(ids(filtrarOpciones(OPS, "vacio lomo")), ["2"]);
});

test("también busca en el detalle", () => {
  assert.deepEqual(ids(filtrarOpciones(OPS, "12.000")), ["4"]);
});

test("vacío muestra las primeras, con tope", () => {
  assert.equal(filtrarOpciones(OPS, "", 2).length, 2);
  assert.deepEqual(filtrarOpciones(OPS, "zzz"), []);
});

// ── EQUIVALENCIA con el filtro de antes (PERFORMANCE-TERMINALES.md, ronda 2) ───────────────────
// El filtro ahora arma lo normalizado una vez por lista y filtra sobre el resultado anterior
// cuando se sigue tipeando. El resultado y el orden tienen que ser EXACTAMENTE los de antes: se
// compara contra la versión anterior, tal cual era, en miles de búsquedas tecleadas.
function filtrarDeAntes(opciones: OpcionBuscador[], texto: string, max = 8): OpcionBuscador[] {
  const q = normalizarBusqueda(texto);
  if (q === "") return opciones.slice(0, max);
  const palabras = q.split(/\s+/).filter(Boolean);
  const conPuntaje: { o: OpcionBuscador; p: number; i: number }[] = [];
  opciones.forEach((o, i) => {
    const etiqueta = normalizarBusqueda(o.etiqueta);
    const todo = `${etiqueta} ${normalizarBusqueda(o.detalle ?? "")}`;
    if (!palabras.every((w) => todo.includes(w))) return;
    conPuntaje.push({ o, p: etiqueta.startsWith(q) ? 0 : etiqueta.includes(q) ? 1 : 2, i });
  });
  return conPuntaje.sort((a, b) => a.p - b.p || a.i - b.i).slice(0, max).map((x) => x.o);
}
function azar(semilla: number) {
  let s = semilla >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const PALABRAS = ["Vacío", "lomo", "COCA", "Cola", "señorío", "Jamón", "cafe", "café", "1,5", "kg", "x", "Ñandú", "  ", "12.000", "$9.900,00", "Ojo de bife"];
function catalogo(n: number, r: () => number): OpcionBuscador[] {
  return Array.from({ length: n }, (_, i) => {
    const k = 1 + Math.floor(r() * 4);
    const etiqueta = Array.from({ length: k }, () => PALABRAS[Math.floor(r() * PALABRAS.length)]).join(r() < 0.1 ? "  " : " ");
    return { id: `o${i}`, etiqueta: r() < 0.05 ? ` ${etiqueta} ` : etiqueta, ...(r() < 0.8 ? { detalle: `$${Math.floor(r() * 30000)}/kg · quedan ${i % 7}` } : {}) };
  });
}

test("equivalencia: tipeando letra por letra, borrando y saltando de búsqueda, mismo resultado y orden que antes", () => {
  const r = azar(20261017);
  const frases = ["coca cola", "vacio lomo", "CAFÉ", "senorio 1,5", "jamon  kg", "ojo de", "12.000", "9.900", "x", "ñandu", "zzz", "lomo vac"];
  let comparadas = 0;
  for (const n of [0, 1, 7, 300, 2000]) {
    const ops = catalogo(n, r);
    for (const max of [8, 1, 0, 3, 50, 2.5, -1]) {
      for (const frase of frases) {
        // Se tipea…
        for (let k = 0; k <= frase.length; k++) {
          assert.deepEqual(filtrarOpciones(ops, frase.slice(0, k), max), filtrarDeAntes(ops, frase.slice(0, k), max), `«${frase.slice(0, k)}» n=${n} max=${max}`);
          comparadas++;
        }
        // …y se borra.
        for (let k = frase.length; k >= 0; k--) {
          assert.deepEqual(filtrarOpciones(ops, frase.slice(0, k), max), filtrarDeAntes(ops, frase.slice(0, k), max));
          comparadas++;
        }
      }
    }
  }
  assert.ok(comparadas > 6000, `comparadas ${comparadas}`);
});

test("equivalencia: dos listas alternadas y una lista cambiada en el lugar (se vuelve a armar)", () => {
  const r = azar(7);
  const a = catalogo(500, r);
  const b = catalogo(500, r);
  for (const q of ["c", "co", "coc", "coca"]) {
    assert.deepEqual(filtrarOpciones(a, q), filtrarDeAntes(a, q));
    assert.deepEqual(filtrarOpciones(b, q), filtrarDeAntes(b, q));
  }
  // La misma lista, con otra opción en una posición y una de más: el índice viejo no sirve.
  a[3] = { id: "nueva", etiqueta: "Coca Cola Zero" };
  a.push({ id: "otra", etiqueta: "Cocada" });
  for (const q of ["coca", "coca c", "coc"]) assert.deepEqual(filtrarOpciones(a, q), filtrarDeAntes(a, q));
});
