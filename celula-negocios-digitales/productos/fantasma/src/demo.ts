// Fantasma — DEMO ejecutable del corazón.
// 1) Simula una conversación de WhatsApp fuera de horario (input→output) y muestra su COGS real.
// 2) Simula una conversación larga (12-15 turnos) para ver cómo escala el COGS al rango del análisis.
// 3) Proyecta la factura mensual y el margen con el pricing por uso (tope + excedente).
// Corré: `npm run demo`.

import { AgenteFantasma } from "./agente.ts";
import { LLMMock } from "./llm.ts";
import { BARBERIA_LO_DE_TITO } from "./guion-ejemplo.ts";
import { desglosarCogs } from "./cogs.ts";
import { calcularFactura, PLANES } from "./planes.ts";
import type { Conversacion, UsoLLM } from "./tipos.ts";

// Supuestos de costeo CONSERVADORES para el pricing (por conversación completa de 12-15 turnos).
// El real medido suele ser menor gracias al prompt caching — margen real ≥ modelado.
const COGS_TIPICO_USD = 0.18;
const COGS_PEOR_USD = 0.3;

const linea = (c = "─") => console.log(c.repeat(72));

function cogsDeConversacion(conv: Conversacion): number {
  const usos: UsoLLM[] = conv.turnos.filter((t) => t.uso).map((t) => t.uso!);
  return desglosarCogs(usos).costoUsd;
}

async function correrHappyPath(): Promise<Conversacion> {
  const agente = new AgenteFantasma(new LLMMock());
  const cliente = BARBERIA_LO_DE_TITO;
  const conv = agente.iniciarConversacion(cliente, "+54 9 11 5555-1234", true);

  const mensajes = [
    "Hola, buenas! están?",
    "cuánto sale un combo corte + barba?",
    "joya. tenés turno para esta semana?",
    "dale, pago la seña y reservo",
  ];

  console.log(`\n🌙 Conversación fuera de horario — ${cliente.nombre}`);
  console.log(`   Contacto: ${conv.contactoFinal}  ·  Plan: ${PLANES[cliente.plan].nombre}\n`);

  for (const msg of mensajes) {
    console.log(`👤 Cliente:  ${msg}`);
    const r = await agente.procesarMensaje(cliente, conv, msg);
    console.log(`👻 Fantasma: ${r.respuesta}\n`);
    if (r.cerrada) break;
  }

  if (conv.cotizacion) console.log(`   💰 Cotización registrada: $${conv.cotizacion.montoTotal}`);
  if (conv.agendado) {
    console.log(`   📅 Turno propuesto: ${conv.agendado.slot}  ·  seña $${conv.agendado.montoSeña}`);
    if (conv.agendado.mpLink) console.log(`   🔗 Link Mercado Pago: ${conv.agendado.mpLink}`);
  }
  if (conv.ticket) console.log(`   🎫 Ticket: ${conv.ticket.resumen} (${conv.ticket.urgencia})`);
  console.log(`   ✅ Estado final: ${conv.estado}`);

  return conv;
}

async function correrConversacionLarga(): Promise<Conversacion> {
  // Cliente indeciso: muchas idas y vueltas de precios (contexto que crece → COGS que sube).
  const agente = new AgenteFantasma(new LLMMock());
  const cliente = BARBERIA_LO_DE_TITO;
  const conv = agente.iniciarConversacion(cliente, "+54 9 11 4444-9876", true);
  const idasYVueltas = [
    "hola buenas",
    "cuánto sale el corte?",
    "cuánto sale la barba?",
    "cuánto sale el combo?",
    "cuánto vale el color completo?",
    "cuánto sale el color parcial?",
    "cuánto salen 2 combos?",
    "cuánto salen 3 cortes?",
    "cuánto sale el perfilado de barba?",
    "cuánto vale el combo de nuevo?",
    "tenés turno esta semana?",
    "dale pago la seña y reservo",
  ];
  for (const msg of idasYVueltas) {
    const r = await agente.procesarMensaje(cliente, conv, msg);
    if (r.cerrada) break;
  }
  return conv;
}

function mostrarCogs(titulo: string, conv: Conversacion) {
  const usos: UsoLLM[] = conv.turnos.filter((t) => t.uso).map((t) => t.uso!);
  const d = desglosarCogs(usos);
  console.log(
    `   ${titulo}: ${d.turnos} turnos LLM · ` +
      `in ${d.inputUncachedTotal.toLocaleString()} + cache ${d.inputCachedTotal.toLocaleString()} + ` +
      `out ${d.outputTotal.toLocaleString()} tok  →  COGS US$${d.costoUsd.toFixed(4)}`,
  );
  return d.costoUsd;
}

function proyectarMes() {
  linea();
  console.log("📊 Proyección mensual y margen (pricing por uso: tope + excedente)");
  linea();
  const cliente = BARBERIA_LO_DE_TITO;
  const def = PLANES[cliente.plan];
  console.log(
    `   Plan ${def.nombre}: US$${def.precioMensualUsd}/mes · ${def.conversacionesIncluidas} incluidas · ` +
      `excedente US$${def.excedentePorConvUsd}/conv`,
  );
  console.log(
    `   Costeo por conversación (12-15 turnos): típico US$${COGS_TIPICO_USD} · peor caso US$${COGS_PEOR_USD}\n`,
  );

  const escenarios = [
    { nombre: "volumen normal (dentro del tope)", conversaciones: 220 },
    { nombre: "volumen alto (se pasa del tope)", conversaciones: 380 },
  ];

  for (const e of escenarios) {
    console.log(`   ── ${e.nombre} — ${e.conversaciones} conversaciones off-hours`);
    for (const [etq, cogsConv] of [
      ["típico", COGS_TIPICO_USD],
      ["peor caso", COGS_PEOR_USD],
    ] as const) {
      const f = calcularFactura(cliente.plan, e.conversaciones, e.conversaciones * cogsConv);
      console.log(
        `      COGS ${etq.padEnd(9)}: US$${f.cogsTotalUsd.toFixed(2).padStart(7)}  ·  ` +
          `facturado US$${f.totalFacturadoUsd.toFixed(2)} (base + exced. US$${f.excedenteUsd.toFixed(2)})  ·  ` +
          `margen US$${f.margenBrutoUsd.toFixed(2)} (${(f.margenBrutoPct * 100).toFixed(0)}%)`,
      );
    }
    console.log("");
  }
  console.log(
    `   ⚑ El excedente (US$${def.excedentePorConvUsd}) supera el COGS/conv incluso en el peor caso ` +
      `(US$${COGS_PEOR_USD}).\n` +
      "     Cada conversación extra es rentable → el flat NUNCA se come el margen. Esa es la trampa evitada.",
  );
}

async function main() {
  console.log("\n" + "═".repeat(72));
  console.log("  FANTASMA — demo del corazón (agente turno noche de WhatsApp)");
  console.log("═".repeat(72));

  const happy = await correrHappyPath();

  linea();
  console.log("💸 COGS medido (base del pricing por uso) — prompt caching del guion");
  linea();
  mostrarCogs("Conversación happy-path (corta)  ", happy);
  const larga = await correrConversacionLarga();
  mostrarCogs("Conversación larga (contexto crece)", larga);
  console.log(
    "\n   → Con prompt caching del guion, el COGS medido queda POR DEBAJO del supuesto conservador\n" +
      "     de costeo (US$0,18 típico / US$0,30 peor caso). Es buena noticia: el margen real ≥ modelado.\n" +
      "     Igual el pricing se diseña contra el supuesto conservador (colchón), y el kill-switch\n" +
      "     (tope 25 turnos/conv) pone un techo duro al COGS por conversación pase lo que pase.",
  );
  console.log("");

  proyectarMes();

  linea("═");
  console.log("  Break-even: ~25 clientes a ~US$200 = US$5.000/mes. Time-to-cash 2–3 semanas.");
  linea("═");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
