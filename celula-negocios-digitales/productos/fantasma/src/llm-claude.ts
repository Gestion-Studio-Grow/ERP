// Fantasma — implementación REAL del LLM con Claude Sonnet.
//
// Referencia de producción. Para activarla:
//   npm install @anthropic-ai/sdk
//   export ANTHROPIC_API_KEY=...   (o `ant auth login`)
//   y en demo.ts / runtime: usar `new LLMClaude()` en vez de `new LLMMock()`.
//
// Este archivo está EXCLUIDO del build por defecto (tsconfig) para que el corazón compile sin el SDK.
// Puntos clave de costo/calidad:
//   - Modelo claude-sonnet-5 (relación calidad/COGS correcta para atención).
//   - PROMPT CACHING del guion de marca (bloque estable) → lecturas a 0,1× = COGS bajo.
//   - Salida estructurada con output_config.format (nada de prefill — 400 en Sonnet 5).
//   - Se lee response.usage para el COGS REAL (cache_read vs input vs output).

import Anthropic from "@anthropic-ai/sdk";
import type { Cliente, DecisionTurno, UsoLLM } from "./tipos.ts";
import type { LLMCliente, RespuestaLLM } from "./llm.ts";

const MODELO = "claude-sonnet-5";

const ESQUEMA_DECISION = {
  type: "object",
  additionalProperties: false,
  properties: {
    mensaje: { type: "string" },
    intencion: { type: "string", enum: ["CONSULTA", "COTIZACION", "AGENDA", "RECLAMO", "OTRO"] },
    cotizacion: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  nombre: { type: "string" },
                  cantidad: { type: "integer" },
                  precioUnit: { type: "number" },
                },
                required: ["nombre", "cantidad", "precioUnit"],
              },
            },
            montoTotal: { type: "number" },
          },
          required: ["items", "montoTotal"],
        },
      ],
    },
    agenda: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            slot: { type: "string" },
            requiereSeña: { type: "boolean" },
          },
          required: ["slot", "requiereSeña"],
        },
      ],
    },
    escalar: { type: "boolean" },
    fin: { type: "boolean" },
  },
  required: ["mensaje", "intencion", "cotizacion", "agenda", "escalar", "fin"],
} as const;

export class LLMClaude implements LLMCliente {
  private client = new Anthropic();

  async decidirTurno(args: {
    cliente: Cliente;
    historia: { rol: "cliente" | "fantasma"; texto: string }[];
    mensaje: string;
    guionYaCacheado: boolean;
  }): Promise<RespuestaLLM> {
    const { cliente, historia, mensaje } = args;

    // El guion + catálogo es el bloque grande y estable → se cachea (0,1× en lecturas).
    const systemGuion =
      `${cliente.guion}\n\nCATÁLOGO:\n` +
      cliente.catalogo
        .map((i) => `- ${i.nombre}: $${i.precio}${i.variantes ? ` (${i.variantes.join("/")})` : ""}`)
        .join("\n") +
      `\n\nREGLAS DE COTIZACIÓN: ${cliente.reglasCotizacion}` +
      `\nAGENDA (slots libres): ${cliente.agenda.slotsLibres.join(", ")}` +
      `\nSEÑA: ${cliente.agenda.requiereSeña ? `$${cliente.agenda.montoSeña}` : "no requiere"}` +
      `\n\nDevolvé SIEMPRE la decisión del turno en el formato estructurado pedido.`;

    const messages = historia.map((t) => ({
      role: t.rol === "cliente" ? ("user" as const) : ("assistant" as const),
      content: t.texto,
    }));
    // Aseguramos que el último turno sea el mensaje entrante.
    messages.push({ role: "user", content: mensaje });

    const resp = await this.client.messages.create({
      model: MODELO,
      max_tokens: 1024,
      thinking: { type: "disabled" }, // atención rápida; sin thinking para latencia/costo
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: ESQUEMA_DECISION },
      },
      system: [
        { type: "text", text: systemGuion, cache_control: { type: "ephemeral" } },
      ],
      messages,
    });

    const texto = resp.content.find((b) => b.type === "text");
    const decision = JSON.parse(texto && "text" in texto ? texto.text : "{}") as DecisionTurno;

    // COGS REAL desde usage.
    const uso: UsoLLM = {
      inputUncached: resp.usage.input_tokens ?? 0,
      inputCached: resp.usage.cache_read_input_tokens ?? 0,
      output: resp.usage.output_tokens ?? 0,
    };

    return { decision, uso };
  }
}
