// Postora — DEMO ejecutable del corazón (offline, LLM mock, cero secretos).
// 1) Genera el plan de contenido del mes en la voz de marca, con CTAs rastreables.
// 2) Muestra el COGS real por plan y el DESGLOSE por modelo (routing Haiku/Sonnet).
// 3) Proyecta la factura mensual y el margen (tope de posteos + excedente + créditos de imagen).
// 4) Arma el "Reporte de Resultados" que retiene al cliente (ata contenido a ventas).
// Corré: `npm run demo`.

import { GeneradorPostora } from "./generador.ts";
import { LLMMock } from "./llm.ts";
import { KIT_LO_DE_ROLO } from "./marca.ts";
import { desglosarCogs } from "./routing.ts";
import { calcularFactura, TIERS } from "./planes.ts";
import { armarReporte, contarImagenesIA, type EventoAtribucion } from "./metricas.ts";
import type { BriefMensual, PlanMensual } from "./tipos.ts";

const PERIODO = "2026-07";
const linea = (c = "─") => console.log(c.repeat(74));

async function generarDelMes(): Promise<PlanMensual> {
  const gen = new GeneradorPostora(new LLMMock());
  const brief: BriefMensual = {
    kit: KIT_LO_DE_ROLO,
    cantidadPosts: TIERS.MARCA.postsIncluidos, // plan Marca: 30 posteos
    temas: ["milanesas", "empanadas del finde", "delivery en el barrio"],
    incluirImagenIA: 6, // 6 posteos con imagen IA (add-on medido)
  };
  return gen.generarPlan(brief, PERIODO);
}

function mostrarPlan(plan: PlanMensual) {
  linea();
  console.log(`🗓️  Plan de contenido — ${plan.kit.negocio} (${plan.periodo})`);
  linea();
  console.log(
    `   Rubro: ${plan.kit.rubro} · Zona: ${plan.kit.zona} · Voz: ${plan.kit.tono}\n`,
  );
  for (const p of plan.posts.slice(0, 4)) {
    console.log(`   ${p.fecha}  [${p.objetivo}]  plantilla: ${p.plantilla.nombre}`);
    console.log(`     ${p.copy}`);
    console.log(`     ${p.hashtags.join(" ")}`);
    console.log(`     CTA (${p.cta.canal}): ${p.cta.texto}  ·  tag=${p.cta.tag}`);
    console.log("");
  }
  console.log(`   … y ${plan.posts.length - 4} posteos más en el plan del mes.\n`);
}

function mostrarCogs(plan: PlanMensual) {
  linea();
  console.log("💸 COGS medido (base del pricing por uso) — routing + prompt caching del Kit");
  linea();
  const d = desglosarCogs(plan.posts.flatMap((p) => p.usos));
  console.log(
    `   ${plan.posts.length} posteos · ${d.llamadas} llamadas LLM  →  COGS US$${d.costoUsd.toFixed(4)}`,
  );
  console.log(
    `   Por modelo:  Haiku US$${d.porModelo.haiku.toFixed(4)}  ·  ` +
      `Sonnet US$${d.porModelo.sonnet.toFixed(4)}  ·  Opus US$${d.porModelo.opus.toFixed(4)}`,
  );
  console.log(
    `   COGS por posteo (texto): US$${(d.costoUsd / plan.posts.length).toFixed(5)} — centavos.\n` +
      "   ⚑ Haiku hace la ideación/hashtags; Sonnet solo el copy final. El Kit de Marca va\n" +
      "     cacheado (0,1×). Por eso el flat NO se come el margen del texto.\n",
  );
}

function proyectarMargen(plan: PlanMensual) {
  linea();
  console.log("📊 Proyección de factura y margen (tope de posteos + excedente + imagen IA)");
  linea();
  const imagenes = contarImagenesIA(plan.posts);
  for (const tier of ["BARRIO", "ACTIVO", "MARCA"] as const) {
    const def = TIERS[tier];
    const f = calcularFactura(tier, plan.posts.length, imagenes, plan.cogsUsd);
    console.log(
      `   ${def.nombre.padEnd(7)} US$${String(def.precioMensualUsd).padStart(3)}/mes ` +
        `(${def.postsIncluidos} posts, ${def.creditosImagenIncluidos} img):  ` +
        `facturado US$${f.totalFacturadoUsd.toFixed(2).padStart(6)}  ·  ` +
        `COGS US$${f.cogsTotalUsd.toFixed(2)}  ·  margen ${(f.margenBrutoPct * 100).toFixed(0)}%`,
    );
    if (f.excedentePosts > 0 || f.imagenesExcedente > 0) {
      console.log(
        `           excedente: ${f.excedentePosts} posts (US$${f.excedentePostsUsd.toFixed(2)}) + ` +
          `${f.imagenesExcedente} img (US$${f.imagenesExcedenteUsd.toFixed(2)})`,
      );
    }
  }
  console.log(
    "\n   ⚑ El excedente por posteo (US$1,00–1,50) supera por mucho el COGS de texto/posteo\n" +
      "     (centavos), y la imagen IA se cobra por crédito por encima de su costo. Cada extra\n" +
      "     es rentable → la trampa del agente sin límite queda desactivada.\n",
  );
}

function reporteDeResultados(plan: PlanMensual) {
  linea();
  console.log('📈 "Reporte de Resultados" del mes — lo que retiene (ata contenido a ventas)');
  linea();
  // Eventos simulados de atribución (en prod vienen del webhook de WhatsApp y del "¿cómo nos
  // conociste?" / código de promo en el mostrador). Determinista para la demo.
  const eventos: EventoAtribucion[] = [];
  plan.posts.forEach((p, i) => {
    const clics = 3 + (i % 5);
    const convs = 1 + (i % 3);
    for (let c = 0; c < clics; c++) eventos.push({ tag: p.cta.tag, tipo: "click" });
    for (let c = 0; c < convs; c++) eventos.push({ tag: p.cta.tag, tipo: "conversacion" });
    if (i % 4 === 0)
      eventos.push({ tag: p.cta.tag, tipo: "venta", montoUsd: 12 + (i % 3) * 4 });
  });

  const r = armarReporte(plan, eventos);
  console.log(`   ${r.negocio} · ${r.periodo}`);
  console.log(`   Posteos publicados:      ${r.postsPublicados}`);
  console.log(`   Clics al WhatsApp:       ${r.clics}`);
  console.log(`   Conversaciones abiertas: ${r.conversaciones}  (${r.conversacionesPorPost.toFixed(1)}/posteo)`);
  console.log(`   Ventas atribuidas:       ${r.ventas}  ·  US$${r.ventasAtribuidasUsd.toFixed(0)} (declaradas)`);
  console.log("   Top posteos del mes:");
  for (const t of r.topPosts) {
    console.log(
      `     ${t.fecha} [${t.objetivo}] → ${t.conversaciones} charlas, ${t.ventas} ventas (${t.tag})`,
    );
  }
  console.log(
    "\n   → Este número es el gancho de retención: el dueño ve conversaciones y ventas\n" +
      '     atribuidas, no "posteos lindos". Misma jugada que Kudos (estrellas→ventas) y\n' +
      "     Fantasma (plata rescatada).\n",
  );
}

async function main() {
  console.log("\n" + "═".repeat(74));
  console.log("  POSTORA — demo del corazón (community manager con IA para el comercio de barrio)");
  console.log("═".repeat(74) + "\n");

  const plan = await generarDelMes();
  mostrarPlan(plan);
  mostrarCogs(plan);
  proyectarMargen(plan);
  reporteDeResultados(plan);

  linea("═");
  console.log(
    "  Break-even objetivo: ~110–170 comercios a ~US$40/mes = US$4.400–6.800/mes. " +
      "Cobro MP en pesos.",
  );
  linea("═");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
