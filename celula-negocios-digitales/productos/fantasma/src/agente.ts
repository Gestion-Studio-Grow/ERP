// Fantasma — EL CORAZÓN: el agente que atiende una conversación de WhatsApp fuera de horario.
//
// Maneja saludo, consulta, cotización, agendado y escala/deja ticket. Aplica dos límites que
// blindan el margen:
//   1. tope de conversaciones del plan (contador mensual) — decide si la conversación cuenta.
//   2. tope de turnos por conversación (kill-switch) — corta charlas eternas antes de quemar tokens.
// Cada turno registra el uso de tokens → COGS real (base del pricing por uso).

import type {
  Cliente,
  Conversacion,
  DecisionTurno,
  Ticket,
  Turno,
} from "./tipos.js";
import type { LLMCliente } from "./llm.js";
import { costoLlamada } from "./cogs.js";

export interface ResultadoTurno {
  respuesta: string;
  conversacion: Conversacion;
  cerrada: boolean;
}

let contadorId = 0;

export class AgenteFantasma {
  constructor(private readonly llm: LLMCliente) {}

  iniciarConversacion(cliente: Cliente, contactoFinal: string, esOffHours: boolean): Conversacion {
    return {
      id: `conv_${++contadorId}`,
      clienteId: cliente.id,
      contactoFinal,
      esOffHours,
      estado: "ABIERTA",
      intencion: "OTRO",
      turnos: [],
      cogsUsd: 0,
    };
  }

  /**
   * Procesa un mensaje entrante del cliente final. Devuelve la respuesta de Fantasma
   * y la conversación actualizada (con COGS acumulado).
   */
  async procesarMensaje(
    cliente: Cliente,
    conv: Conversacion,
    mensaje: string,
  ): Promise<ResultadoTurno> {
    if (conv.estado !== "ABIERTA") {
      return { respuesta: "", conversacion: conv, cerrada: true };
    }

    // Registrar turno del cliente.
    conv.turnos.push({ rol: "cliente", texto: mensaje });

    // ── KILL-SWITCH DE MARGEN ──
    // Si la conversación ya usó demasiados turnos, escalamos y cerramos (cota superior de COGS).
    const turnosCliente = conv.turnos.filter((t) => t.rol === "cliente").length;
    if (turnosCliente > cliente.topeTurnosPorConversacion) {
      return this.cerrarConTicket(cliente, conv, {
        contacto: conv.contactoFinal,
        resumen: "Conversación larga superó el tope de turnos; derivada a humano.",
        intencion: conv.intencion,
        urgencia: "media",
        promesa: "El equipo retoma esta conversación en la mañana.",
      },
      "Esta charla se hizo larga y prefiero que la siga alguien del equipo para no marearte. " +
      "Te dejo todo anotado y mañana te contactan. ¡Gracias!");
    }

    // ── Llamada al LLM (guion cacheado a partir del 2º turno) ──
    const guionYaCacheado = conv.turnos.filter((t) => t.rol === "fantasma").length > 0;
    const { decision, uso } = await this.llm.decidirTurno({
      cliente,
      historia: conv.turnos.map((t) => ({ rol: t.rol, texto: t.texto })),
      mensaje,
      guionYaCacheado,
    });

    // Registrar COGS del turno.
    const costo = costoLlamada(uso);
    const turnoFantasma: Turno = { rol: "fantasma", texto: decision.mensaje, uso, costoUsd: costo };
    conv.turnos.push(turnoFantasma);
    conv.cogsUsd += costo;
    conv.intencion = decision.intencion;

    return this.aplicarDecision(cliente, conv, decision);
  }

  private aplicarDecision(
    cliente: Cliente,
    conv: Conversacion,
    decision: DecisionTurno,
  ): ResultadoTurno {
    // Cotización.
    if (decision.cotizacion) {
      conv.cotizacion = decision.cotizacion;
    }

    // Agenda (+ seña por Mercado Pago si aplica).
    if (decision.agenda) {
      conv.agendado = {
        slot: decision.agenda.slot,
        requiereSeña: decision.agenda.requiereSeña,
        montoSeña: cliente.agenda.montoSeña,
        mpLink: decision.agenda.requiereSeña ? this.generarLinkMP(cliente, conv) : undefined,
        mpEstado: decision.agenda.requiereSeña ? "PENDIENTE" : undefined,
      };
    }

    // Escalar → ticket caliente.
    if (decision.escalar) {
      return this.cerrarConTicket(cliente, conv, {
        contacto: conv.contactoFinal,
        resumen: this.resumir(conv),
        intencion: decision.intencion,
        urgencia: decision.intencion === "RECLAMO" ? "alta" : "media",
        promesa: "Respuesta del equipo en la mañana.",
      }, decision.mensaje);
    }

    // Cierre resuelto.
    if (decision.fin) {
      conv.estado = "RESUELTA";
      return { respuesta: decision.mensaje, conversacion: conv, cerrada: true };
    }

    return { respuesta: decision.mensaje, conversacion: conv, cerrada: false };
  }

  private cerrarConTicket(
    _cliente: Cliente,
    conv: Conversacion,
    ticket: Ticket,
    respuesta: string,
  ): ResultadoTurno {
    conv.ticket = ticket;
    conv.estado = "TICKET";
    return { respuesta, conversacion: conv, cerrada: true };
  }

  private generarLinkMP(cliente: Cliente, conv: Conversacion): string {
    // Placeholder del contrato con Mercado Pago (crear preferencia / link de pago para la seña).
    return `https://mp.fantasma/senia/${cliente.id}/${conv.id}?monto=${cliente.agenda.montoSeña}`;
  }

  private resumir(conv: Conversacion): string {
    const ultimoCliente = [...conv.turnos].reverse().find((t) => t.rol === "cliente");
    return ultimoCliente ? `Consulta: "${ultimoCliente.texto}"` : "Consulta fuera de alcance.";
  }
}
