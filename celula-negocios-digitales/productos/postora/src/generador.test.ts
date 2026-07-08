import { test } from "node:test";
import assert from "node:assert/strict";
import { GeneradorPostora } from "./generador.ts";
import { LLMMock } from "./llm.ts";
import { KIT_LO_DE_ROLO } from "./marca.ts";
import type { BriefMensual } from "./tipos.ts";

function brief(cantidad: number, imagenes = 0): BriefMensual {
  return {
    kit: KIT_LO_DE_ROLO,
    cantidadPosts: cantidad,
    temas: ["milanesas", "empanadas"],
    incluirImagenIA: imagenes,
  };
}

test("genera exactamente la cantidad de posteos pedida", async () => {
  const gen = new GeneradorPostora(new LLMMock());
  const plan = await gen.generarPlan(brief(12), "2026-07");
  assert.equal(plan.posts.length, 12);
});

test("cada posteo tiene copy, hashtags, plantilla y CTA rastreable con tag único", async () => {
  const gen = new GeneradorPostora(new LLMMock());
  const plan = await gen.generarPlan(brief(8), "2026-07");
  const tags = new Set<string>();
  for (const p of plan.posts) {
    assert.ok(p.copy.length > 0);
    assert.ok(p.hashtags.length > 0);
    assert.ok(p.plantilla.id.length > 0);
    assert.ok(p.cta.tag.startsWith("postora-2026-07-"));
    assert.ok(p.cta.destino.length > 0);
    tags.add(p.cta.tag);
  }
  assert.equal(tags.size, plan.posts.length, "los tags deben ser únicos para atribuir");
});

test("el copy sale en la voz de marca (menciona el negocio)", async () => {
  const gen = new GeneradorPostora(new LLMMock());
  const plan = await gen.generarPlan(brief(5), "2026-07");
  assert.ok(plan.posts.every((p) => p.copy.includes(KIT_LO_DE_ROLO.negocio)));
});

test("la ideación es UNA sola llamada para todo el mes (se prorratea)", async () => {
  const gen = new GeneradorPostora(new LLMMock());
  const plan = await gen.generarPlan(brief(10), "2026-07");
  const ideacion = plan.posts.flatMap((p) => p.usos).filter((u) => u.modelo === "haiku");
  // 1 ideación (haiku) + 0 más; el copy es sonnet. Total haiku = 1.
  assert.equal(ideacion.length, 1);
  const copys = plan.posts.flatMap((p) => p.usos).filter((u) => u.modelo === "sonnet");
  assert.equal(copys.length, 10, "un copy por posteo");
});

test("el Kit de Marca viaja cacheado en el copy (0,1x) salvo la ideación inicial", async () => {
  const gen = new GeneradorPostora(new LLMMock());
  const plan = await gen.generarPlan(brief(6), "2026-07");
  const copys = plan.posts.flatMap((p) => p.usos).filter((u) => u.modelo === "sonnet");
  assert.ok(copys.every((u) => u.inputCached > 0), "el copy debe leer el Kit cacheado");
});

test("las imágenes IA se marcan solo en la cantidad pedida (add-on medido)", async () => {
  const gen = new GeneradorPostora(new LLMMock());
  const plan = await gen.generarPlan(brief(20, 5), "2026-07");
  assert.equal(plan.posts.filter((p) => p.usaImagenIA).length, 5);
});

test("el COGS del plan es positivo y en el orden de centavos por posteo", async () => {
  const gen = new GeneradorPostora(new LLMMock());
  const plan = await gen.generarPlan(brief(30), "2026-07");
  assert.ok(plan.cogsUsd > 0);
  assert.ok(plan.cogsUsd / plan.posts.length < 0.02, "COGS/post debe ser < US$0,02");
});

test("las fechas sugeridas caen dentro del período", async () => {
  const gen = new GeneradorPostora(new LLMMock());
  const plan = await gen.generarPlan(brief(15), "2026-07");
  assert.ok(plan.posts.every((p) => p.fecha.startsWith("2026-07-")));
});
