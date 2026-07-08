import { test } from "node:test";
import assert from "node:assert/strict";
import { GeneradorPostora } from "./generador.ts";
import { LLMMock } from "./llm.ts";
import { KIT_LO_DE_ROLO } from "./marca.ts";
import { armarReporte, contarImagenesIA, type EventoAtribucion } from "./metricas.ts";
import type { BriefMensual, PlanMensual } from "./tipos.ts";

async function planDemo(cantidad = 6, imagenes = 0): Promise<PlanMensual> {
  const brief: BriefMensual = {
    kit: KIT_LO_DE_ROLO,
    cantidadPosts: cantidad,
    temas: ["milanesas"],
    incluirImagenIA: imagenes,
  };
  return new GeneradorPostora(new LLMMock()).generarPlan(brief, "2026-07");
}

test("el reporte cruza eventos con los posteos por tag y agrega los totales", async () => {
  const plan = await planDemo(4);
  const eventos: EventoAtribucion[] = [
    { tag: plan.posts[0].cta.tag, tipo: "click" },
    { tag: plan.posts[0].cta.tag, tipo: "conversacion" },
    { tag: plan.posts[1].cta.tag, tipo: "conversacion" },
    { tag: plan.posts[1].cta.tag, tipo: "venta", montoUsd: 15 },
  ];
  const r = armarReporte(plan, eventos);
  assert.equal(r.postsPublicados, 4);
  assert.equal(r.clics, 1);
  assert.equal(r.conversaciones, 2);
  assert.equal(r.ventas, 1);
  assert.equal(r.ventasAtribuidasUsd, 15);
});

test("eventos con un tag ajeno al plan se ignoran (no rompen la atribución)", async () => {
  const plan = await planDemo(3);
  const eventos: EventoAtribucion[] = [
    { tag: "tag-de-otro-plan", tipo: "venta", montoUsd: 999 },
    { tag: plan.posts[0].cta.tag, tipo: "conversacion" },
  ];
  const r = armarReporte(plan, eventos);
  assert.equal(r.ventasAtribuidasUsd, 0);
  assert.equal(r.conversaciones, 1);
});

test("conversacionesPorPost es la métrica de valor que ve el dueño", async () => {
  const plan = await planDemo(2);
  const eventos: EventoAtribucion[] = [
    { tag: plan.posts[0].cta.tag, tipo: "conversacion" },
    { tag: plan.posts[0].cta.tag, tipo: "conversacion" },
    { tag: plan.posts[1].cta.tag, tipo: "conversacion" },
  ];
  const r = armarReporte(plan, eventos);
  assert.equal(r.conversacionesPorPost, 1.5);
});

test("topPosts ordena por conversaciones + ventas (para repetir la fórmula)", async () => {
  const plan = await planDemo(3);
  const eventos: EventoAtribucion[] = [
    { tag: plan.posts[2].cta.tag, tipo: "conversacion" },
    { tag: plan.posts[2].cta.tag, tipo: "venta", montoUsd: 10 },
    { tag: plan.posts[0].cta.tag, tipo: "conversacion" },
  ];
  const r = armarReporte(plan, eventos);
  assert.equal(r.topPosts[0].tag, plan.posts[2].cta.tag);
});

test("contarImagenesIA cuenta solo los posteos con imagen (para el billing de créditos)", async () => {
  const plan = await planDemo(10, 3);
  assert.equal(contarImagenesIA(plan.posts), 3);
});

test("reporte sin eventos no rompe (mes recién arrancado)", async () => {
  const plan = await planDemo(5);
  const r = armarReporte(plan, []);
  assert.equal(r.conversaciones, 0);
  assert.equal(r.conversacionesPorPost, 0);
  assert.equal(r.topPosts.length, 3);
});
