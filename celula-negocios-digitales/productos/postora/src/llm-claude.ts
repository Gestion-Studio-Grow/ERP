// Postora — implementación REAL del LLM con Claude (Haiku + Sonnet, prompt caching, routing).
//
// ⚠️ EXCLUIDA DEL BUILD por defecto (ver tsconfig.json) para que el corazón compile y la demo
// corra SIN @anthropic-ai/sdk instalado y SIN gastar tokens de producción. Cablear esto y correrlo
// contra la API real es trabajo §C (gasto de tokens en prod) — se eleva, no se hace en la demo.
//
// Para producción:  npm install @anthropic-ai/sdk  y quitar llm-claude.ts del `exclude`.
//
// Claves de unit economics que este archivo IMPLEMENTA (no solo documenta):
//   - ROUTING: idear() → Haiku (claude-haiku-4-5); redactar() → Sonnet (claude-sonnet-5).
//   - PROMPT CACHING: el Kit de Marca va en un bloque de system con cache_control ephemeral
//     (bloque grande y estable → lecturas a 0,1×). Es lo que baja el COGS por posteo.
//   - STRUCTURED OUTPUTS: output_config.format con json_schema para ideas y copy (parseo seguro).
//   - Adaptive thinking apagado (no hace falta para generación de copy): pesa el COGS.

// @ts-nocheck — depende de @anthropic-ai/sdk, que no se instala para el corazón/demo.
import Anthropic from "@anthropic-ai/sdk";
import type {
  BriefMensual,
  IdeaPost,
  KitDeMarca,
  ModeloClaude,
  UsoLLM,
} from "./tipos.ts";
import type { LLMCliente, RespuestaCopy, RespuestaIdeas } from "./llm.ts";
import { ROUTING } from "./routing.ts";

const MODELO_ID: Record<ModeloClaude, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-4-8",
};

/** Arma el bloque de system con el Kit de Marca cacheado (prompt caching → 0,1×). */
function systemConKit(kit: KitDeMarca) {
  const texto = [
    `Sos el community manager de "${kit.negocio}", un comercio de ${kit.rubro} en ${kit.zona}.`,
    `Voz de marca: ${kit.tono}.`,
    `Hacé: ${kit.hacer.join("; ")}.`,
    `Evitá: ${kit.evitar.join("; ")}.`,
    `Hashtags base: ${kit.hashtagsBase.join(" ")}.`,
    kit.ofertaVigente ? `Oferta vigente: ${kit.ofertaVigente}.` : "",
    "Escribí en español rioplatense, cálido y de barrio. Nada de jerga corporativa ni inglés innecesario.",
  ].join("\n");
  // El bloque estable se cachea; el pedido puntual va después, sin cache_control.
  return [{ type: "text", text: texto, cache_control: { type: "ephemeral" } }];
}

function usoDesde(modelo: ModeloClaude, usage: any): UsoLLM {
  return {
    modelo,
    inputUncached: usage?.input_tokens ?? 0,
    inputCached: usage?.cache_read_input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
  };
}

export class LLMClaude implements LLMCliente {
  private client = new Anthropic();

  async idear(args: { brief: BriefMensual; kitCacheado: boolean }): Promise<RespuestaIdeas> {
    const { brief } = args;
    const resp = await this.client.messages.create({
      model: MODELO_ID[ROUTING.ideacion], // Haiku
      max_tokens: 600,
      system: systemConKit(brief.kit),
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["ideas"],
            properties: {
              ideas: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["objetivo", "angulo"],
                  properties: {
                    objetivo: {
                      type: "string",
                      enum: ["promo", "novedad", "reserva", "recordatorio", "comunidad"],
                    },
                    angulo: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      messages: [
        {
          role: "user",
          content:
            `Proponé ${brief.cantidadPosts} ideas de posteo para el mes. ` +
            `Temas del dueño: ${brief.temas.join(", ") || "(ninguno, usá tu criterio del rubro)"}.`,
        },
      ],
    });
    const parsed = JSON.parse(resp.content.find((b: any) => b.type === "text")?.text ?? "{}");
    return {
      ideas: (parsed.ideas ?? []) as IdeaPost[],
      uso: usoDesde(ROUTING.ideacion, resp.usage),
    };
  }

  async redactar(args: {
    kit: KitDeMarca;
    idea: IdeaPost;
    kitCacheado: boolean;
  }): Promise<RespuestaCopy> {
    const { kit, idea } = args;
    const resp = await this.client.messages.create({
      model: MODELO_ID[ROUTING.copyFinal], // Sonnet
      max_tokens: 600,
      system: systemConKit(kit),
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["copy", "hashtags"],
            properties: {
              copy: { type: "string" },
              hashtags: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      messages: [
        {
          role: "user",
          content: `Escribí el caption para este posteo (${idea.objetivo}): ${idea.angulo}. Cerrá con una invitación a escribir por WhatsApp.`,
        },
      ],
    });
    const parsed = JSON.parse(resp.content.find((b: any) => b.type === "text")?.text ?? "{}");
    return {
      copy: parsed.copy ?? "",
      hashtags: parsed.hashtags ?? [],
      uso: usoDesde(ROUTING.copyFinal, resp.usage),
    };
  }
}
