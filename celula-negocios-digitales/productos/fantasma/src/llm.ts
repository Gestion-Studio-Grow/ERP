// Fantasma — interfaz del LLM y un mock determinista.
//
// El agente (agente.ts) depende de esta interfaz, NO de Claude directamente. Así el corazón se
// desarrolla y demuestra offline. La implementación real vive en llm-claude.ts (Claude Sonnet).

import type { Cliente, DecisionTurno, UsoLLM } from "./tipos.js";

export interface RespuestaLLM {
  decision: DecisionTurno;
  uso: UsoLLM;
}

export interface LLMCliente {
  /**
   * Dado el cliente (guion/catálogo), la historia y el mensaje entrante, decide el turno.
   * `guionYaCacheado` indica si el bloque estable ya se envió antes en esta conversación
   * (entonces se cobra a 0,1× → afecta el UsoLLM devuelto).
   */
  decidirTurno(args: {
    cliente: Cliente;
    historia: { rol: "cliente" | "fantasma"; texto: string }[];
    mensaje: string;
    guionYaCacheado: boolean;
  }): Promise<RespuestaLLM>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock determinista. Simula a Claude Sonnet con reglas por palabra clave y
// genera un uso de tokens realista (para que el COGS de la demo caiga en rango).
// ─────────────────────────────────────────────────────────────────────────────

const TOKENS_GUION = 2600; // guion + catálogo (bloque grande y estable)

function tokensAprox(texto: string): number {
  // ~1 token cada 4 chars (aprox. español)
  return Math.max(1, Math.round(texto.length / 4));
}

export class LLMMock implements LLMCliente {
  async decidirTurno(args: {
    cliente: Cliente;
    historia: { rol: "cliente" | "fantasma"; texto: string }[];
    mensaje: string;
    guionYaCacheado: boolean;
  }): Promise<RespuestaLLM> {
    const { cliente, historia, mensaje, guionYaCacheado } = args;
    const m = mensaje.toLowerCase();

    const decision = this.decidir(cliente, historia, m);

    // ── Uso de tokens ──
    // El guion (bloque estable) se cachea: primer turno se escribe, luego se lee a 0,1×.
    // Aquí lo modelamos como inputCached una vez cacheado, inputUncached la primera vez.
    const tokensHistoria = historia.reduce((s, t) => s + tokensAprox(t.texto), 0);
    const tokensMensaje = tokensAprox(mensaje);
    const output = tokensAprox(decision.mensaje) + 40; // + overhead del JSON estructurado

    const uso: UsoLLM = guionYaCacheado
      ? {
          inputCached: TOKENS_GUION,
          inputUncached: tokensHistoria + tokensMensaje,
          output,
        }
      : {
          inputCached: 0,
          inputUncached: TOKENS_GUION + tokensHistoria + tokensMensaje,
          output,
        };

    return { decision, uso };
  }

  private decidir(
    cliente: Cliente,
    historia: { rol: "cliente" | "fantasma"; texto: string }[],
    m: string,
  ): DecisionTurno {
    const base: DecisionTurno = {
      mensaje: "",
      intencion: "OTRO",
      cotizacion: null,
      agenda: null,
      escalar: false,
      fin: false,
    };

    // Escalar: pedido de humano, reclamo o algo sensible.
    if (/(humano|reclamo|queja|denuncia|estafa|abogado|urgente en serio)/.test(m)) {
      return {
        ...base,
        intencion: "RECLAMO",
        escalar: true,
        mensaje:
          "Uf, entiendo. Esto lo quiero que lo vea alguien del equipo bien. Te dejo anotado como " +
          "prioritario y mañana a primera hora te contactan, ¿te parece?",
      };
    }

    // Confirmación de seña → cierra con seña.
    if (/(pago la seña|pago la seÑa|mando la seña|dale la seña|sí, reservo|si reservo)/.test(m)) {
      const slot = cliente.agenda.slotsLibres[0];
      return {
        ...base,
        intencion: "AGENDA",
        agenda: { slot, requiereSeña: cliente.agenda.requiereSeña },
        fin: true,
        mensaje:
          "¡Genial! Te paso el link para la seña y con eso te dejo el turno reservado. " +
          "Mañana el equipo te confirma todo. ¡Gracias por escribir!",
      };
    }

    // Agenda / turno.
    if (/(turno|reservar|agendar|cita|cuándo|cuando pued|disponibilidad)/.test(m)) {
      const slot = cliente.agenda.slotsLibres[0];
      return {
        ...base,
        intencion: "AGENDA",
        agenda: { slot, requiereSeña: cliente.agenda.requiereSeña },
        mensaje:
          `Tengo un turno el ${slot.replace("T", " a las ")}. Para reservarlo pedimos una seña de ` +
          `$${cliente.agenda.montoSeña}. ¿Te lo reservo y te paso el link de pago?`,
      };
    }

    // Cotización / precio.
    if (/(precio|cuánto|cuanto sale|cotiz|presupuesto|vale)/.test(m)) {
      const item = this.matchItem(cliente, m) ?? cliente.catalogo[0];
      const cantidad = this.matchCantidad(m);
      const montoTotal = item.precio * cantidad;
      return {
        ...base,
        intencion: "COTIZACION",
        cotizacion: {
          items: [{ nombre: item.nombre, cantidad, precioUnit: item.precio }],
          montoTotal,
        },
        mensaje:
          `${item.nombre}${cantidad > 1 ? ` x${cantidad}` : ""} sale $${montoTotal}. ` +
          `¿Querés que te reserve un turno para retirarlo o coordinamos envío?`,
      };
    }

    // Saludo / primera interacción.
    if (historia.length === 0 || /(hola|buenas|buen día|información|info|consulta)/.test(m)) {
      return {
        ...base,
        intencion: "CONSULTA",
        mensaje:
          `¡Hola! Soy la atención de ${cliente.nombre} 🌙 Estamos fuera de horario, pero te ayudo ` +
          `igual: puedo pasarte precios, reservarte un turno o dejar tu consulta para la mañana. ` +
          `¿Qué estás buscando?`,
      };
    }

    // Fallback: consulta que no sabemos responder → deja ticket (no inventa).
    return {
      ...base,
      intencion: "CONSULTA",
      escalar: true,
      mensaje:
        "Buena pregunta. Prefiero que te lo confirme el equipo con seguridad así no te paso un dato " +
        "equivocado. Te dejo anotado y mañana te responden. ¿Algo más en lo que te pueda ayudar ahora?",
    };
  }

  private matchItem(cliente: Cliente, m: string) {
    return cliente.catalogo.find((i) => m.includes(i.nombre.toLowerCase().split(" ")[0]));
  }

  private matchCantidad(m: string): number {
    const match = m.match(/(\d+)/);
    return match ? Math.max(1, parseInt(match[1], 10)) : 1;
  }
}
