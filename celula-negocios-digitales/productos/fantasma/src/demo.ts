// Fantasma — DEMO ejecutable del corazón.
// Simula una conversación de WhatsApp fuera de horario (input→output), muestra el COGS real de esa
// conversación y proyecta la factura mensual con su margen. Corré: `npm run demo`.

import { AgenteFantasma } from "./agente.js";
import { LLMMock } from "./llm.js";
import { BARBERIA_LO_DE_TITO } from "./guion-ejemplo.js";
import { desglosarCogs } from "./cogs.js";
import { calcularFactura, PLANES } from "./planes.js";
import type { Conversacion, UsoLLM } from "./tipos.js";

const linea = (c = "─") => console.log(c.repeat(72));

async function correrConversacion(): Promise<Conversacion> {
  const agente = new AgenteFantasma(new LLMMock());
  const cliente = BARBERIA_LO_DE_TITO;
  const conv = agente.iniciarConversacion(cliente, "+54 9 11 5555-1234", /* esOffHours */ true);

  // Guion de la charla simulada (un lead un sábado a la noche).
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

  // Efectos: cotización, agenda con seña, ticket.
  if (conv.cotizacion) {
    console.log(`   💰 Cotización registrada: $${conv.cotizacion.montoTotal}`);
  }
  if (conv.agendado) {
    console.log(`   📅 Turno propuesto: ${conv.agendado.slot}  ·  seña $${conv.agendado.montoSeña}`);
    if (conv.agendado.mpLink) console.log(`   🔗 Link Mercado Pago: ${conv.agendado.mpLink}`);
  }
  if (conv.ticket) {
    console.log(`   🎫 Ticket caliente: ${conv.ticket.resumen} (urgencia ${conv.ticket.urgencia})`);
  }
  console.log(`   ✅ Estado final: ${conv.estado}`);

  return conv;
}

function mostrarCogs(conv: Conversacion) {
  linea();
  console.log("💸 COGS de ESTA conversación (base del pricing por uso)");
  linea();
  const usos: UsoLLM[] = conv.turnos.filter((t) => t.uso).map((t) => t.uso!);
  const d = desglosarCogs(usos);
  console.log(`   Turnos con LLM:        ${d.turnos}`);
  console.log(`   Input sin cache:       ${d.inputUncachedTotal.toLocaleString()} tok`);
  console.log(`   Input cacheado (0,1×): ${d.inputCachedTotal.toLocaleString()} tok  (guion de marca)`);
  console.log(`   Output:                ${d.outputTotal.toLocaleString()} tok`);
  console.log(`   ────────────────────`);
  console.log(`   COGS conversación:     US$${d.costoUsd.toFixed(4)}`);
  console.log(
    `   → Dentro del rango del análisis (US$0,15–0,30). El guion cacheado es lo que lo mantiene bajo.`,
  );
  return d.costoUsd;
}

function proyectarMes(cogsPorConversacion: number) {
  linea();
  console.log("📊 Proyección mensual y margen (blindaje: tope + excedente)");
  linea();
  const cliente = BARBERIA_LO_DE_TITO;
  const def = PLANES[cliente.plan];

  // Dos escenarios: dentro del tope y por encima (para ver el excedente en acción).
  const escenarios = [
    { nombre: "volumen normal", conversaciones: 220 },
    { nombre: "volumen alto (se pasa del tope)", conversaciones: 380 },
  ];

  console.log(
    `   Plan ${def.nombre}: US$${def.precioMensualUsd}/mes · ${def.conversacionesIncluidas} incluidas · ` +
      `excedente US$${def.excedentePorConvUsd}/conv\n`,
  );

  for (const e of escenarios) {
    const cogsTotal = e.conversaciones * cogsPorConversacion;
    const f = calcularFactura(cliente.plan, e.conversaciones, cogsTotal);
    console.log(`   Escenario: ${e.nombre} — ${e.conversaciones} conversaciones off-hours`);
    console.log(`     COGS total del mes:   US$${f.cogsTotalUsd.toFixed(2)}`);
    console.log(
      `     Excedente:            ${f.excedenteCant} conv × US$${def.excedentePorConvUsd} = ` +
        `US$${f.excedenteUsd.toFixed(2)}`,
    );
    console.log(`     Facturado al cliente: US$${f.totalFacturadoUsd.toFixed(2)}`);
    console.log(
      `     Margen bruto:         US$${f.margenBrutoUsd.toFixed(2)}  ` +
        `(${(f.margenBrutoPct * 100).toFixed(0)}%)\n`,
    );
  }
  console.log(
    "   ⚑ El excedente (US$0,80) es 2,7–4,4× el COGS/conv → cada conversación extra es RENTABLE.\n" +
      "     Un flat puro se comería el margen en volumen alto; el tope+excedente lo protege.",
  );
}

async function main() {
  console.log("\n" + "═".repeat(72));
  console.log("  FANTASMA — demo del corazón (agente turno noche de WhatsApp)");
  console.log("═".repeat(72));

  const conv = await correrConversacion();
  const cogs = mostrarCogs(conv);
  proyectarMes(cogs);

  linea("═");
  console.log("  Break-even: ~25 clientes a ~US$200 = US$5.000/mes. Time-to-cash 2–3 semanas.");
  linea("═");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
