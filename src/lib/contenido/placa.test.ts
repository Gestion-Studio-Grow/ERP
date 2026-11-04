import { test } from "node:test";
import assert from "node:assert/strict";
import { brandForSlug, resolveAccent } from "@/lib/branding";
import { dibujarPlaca, medidasDeLaPlaca, type CtxPlaca } from "./placa";
import { marcaDeLaPlaca, textoSobre } from "./marca";
import { proponerPiezas } from "./plantillas";
import type { MarcaDeLaPlaca } from "./tipos";

interface Llamada {
  op: "rect" | "texto" | "arc" | "round";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  texto?: string;
  alinear?: string;
}

/** Contexto falso: registra lo que se pinta; mide 0,55 × tamaño de letra por carácter. */
function ctxFalso() {
  const llamadas: Llamada[] = [];
  const ctx: CtxPlaca & { llamadas: Llamada[] } = {
    llamadas,
    canvas: { width: 300, height: 150 },
    fillStyle: "",
    font: "16px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    fillRect(x, y, w, h) {
      llamadas.push({ op: "rect", x, y, w, h, color: String(this.fillStyle) });
    },
    fillText(texto, x, y, anchoMax) {
      const w = Math.min(this.measureText(texto).width, anchoMax ?? Infinity);
      llamadas.push({ op: "texto", x, y, w, h: 0, color: String(this.fillStyle), texto, alinear: this.textAlign });
    },
    measureText(t) {
      const tam = Number(/(\d+)px/.exec(this.font)?.[1] ?? 16);
      return { width: t.length * tam * 0.55 };
    },
  };
  return ctx;
}

const marcaDe = (slug: string, s: { whatsapp?: string; instagram?: string }) => {
  const b = brandForSlug(slug);
  return marcaDeLaPlaca(b, s, resolveAccent(b.preset, "light"));
};
const magra = marcaDe("magra", { whatsapp: "5491155550101", instagram: "magra.carnes" });
const ch = marcaDe("beauty-spa", { whatsapp: "5491166660202", instagram: "chestetica" });
const TEXTO = "2x1 en turnos de lunes a viernes de 10 a 16\nVálido hasta fin de mes para socios y no socios, reservando por la app o por WhatsApp.";

const coloresPermitidos = (m: MarcaDeLaPlaca) => {
  const base = [m.colorPrimario, m.colorHondo, m.colorAcento, m.colorClaro];
  return new Set([...base, ...base.map(textoSobre)]);
};

for (const formato of ["post", "historia"] as const) {
  test(`placa ${formato}: 3 variantes con los colores de la marca y dentro del lienzo`, () => {
    const m = medidasDeLaPlaca(formato);
    for (const pieza of proponerPiezas(TEXTO, magra, undefined, { formato })) {
      const ctx = ctxFalso();
      dibujarPlaca(ctx, pieza, magra);
      assert.deepEqual(ctx.canvas, { width: m.ancho, height: m.alto });
      const permitidos = coloresPermitidos(magra);
      assert.ok(ctx.llamadas.length > 5);
      for (const l of ctx.llamadas) {
        assert.ok(permitidos.has(l.color), `${pieza.variante}: color ajeno ${l.color}`);
        if (l.op === "rect") {
          assert.ok(l.x >= 0 && l.y >= 0 && l.x + l.w <= m.ancho && l.y + l.h <= m.alto, `${pieza.variante}: rect afuera`);
        } else {
          const izq = l.alinear === "right" ? l.x - l.w : l.alinear === "center" ? l.x - l.w / 2 : l.x;
          assert.ok(izq >= m.margen - 1 && izq + l.w <= m.ancho - m.margen + 1, `${pieza.variante}: «${l.texto}» se sale de costado`);
          assert.ok(l.y >= m.arriba && l.y <= m.abajo, `${pieza.variante}: «${l.texto}» fuera de la zona segura (${l.y})`);
        }
      }
      const textos = ctx.llamadas.filter((l) => l.op === "texto").map((l) => l.texto).join(" | ");
      assert.match(textos, /M/, "monograma");
      assert.match(textos, /Magra/);
      assert.match(textos, /@magra\.carnes/);
      assert.ok(ctx.llamadas[0].op === "rect" && ctx.llamadas[0].w === m.ancho, "arranca con el fondo completo");
    }
  });
}

test("las variantes se ven distintas (fondo diferente)", () => {
  const fondos = proponerPiezas(TEXTO, magra).map((p) => {
    const ctx = ctxFalso();
    dibujarPlaca(ctx, p, magra);
    return ctx.llamadas[0].color;
  });
  assert.equal(new Set(fondos).size, 3);
});

test("AISLAMIENTO: la placa de cada negocio usa SU marca", () => {
  const [pieza] = proponerPiezas(TEXTO, magra);
  const a = ctxFalso();
  const b = ctxFalso();
  dibujarPlaca(a, pieza, magra);
  dibujarPlaca(b, pieza, ch);
  const textosB = b.llamadas.map((l) => l.texto ?? "").join(" ");
  assert.equal(a.llamadas[0].color, magra.colorPrimario);
  assert.equal(b.llamadas[0].color, ch.colorPrimario);
  assert.match(textosB, /CH Estética/);
  assert.doesNotMatch(textosB, /Magra|magra\.carnes/);
  assert.ok(!b.llamadas.some((l) => l.color === magra.colorPrimario));
});

test("texto larguísimo: se recorta y avisa, sin salirse", () => {
  const [pieza] = proponerPiezas("Novedad", magra);
  const ctx = ctxFalso();
  const r = dibujarPlaca(ctx, { ...pieza, campos: { ...pieza.campos, titulo: "palabra ".repeat(80), bajada: "otra ".repeat(200) } }, magra);
  assert.equal(r.recortado, true);
});

// Chequeo de tipos: un contexto real del navegador encaja en CtxPlaca (lo verifica `tsc`).
const encajaElReal: (c: CanvasRenderingContext2D) => CtxPlaca = (c) => c;
void encajaElReal;
