/**
 * Implementación de referencia del LLM con Claude Sonnet (PRODUCCIÓN).
 *
 * En este prototipo aislado NO está instalado el SDK (no corremos npm install contra el ERP),
 * así que este archivo es la referencia que reemplaza al MockLLM en producción. La demo
 * (src/examples.ts) usa el mock. Para activarlo en el proyecto real:
 *
 *   npm install @anthropic-ai/sdk
 *   const llm = new AnthropicLLM();          // usa ANTHROPIC_API_KEY del entorno
 *   const res = await responderResena(review, voz, llm);
 *
 * Decisiones (ver ARQUITECTURA.md §6):
 *  - Modelo: claude-sonnet-5 (Sonnet actual): calidad de escritura en español a costo bajo.
 *  - Prompt caching: el system prompt (kit de voz de marca, estable) se cachea a 0,1×.
 *  - Adaptive thinking. Sin temperature/top_p (removidos en Sonnet 5). Sin prefill.
 *  - Structured outputs para recibir {respuesta, requiereHumano, motivo} y validarlo.
 *  - Manejo de stop_reason "refusal" antes de leer contenido.
 */
import type { LLM, SalidaLLM } from "./llm.js";
import type { BrandVoice, BucketRating, Review } from "./types.js";

const MODELO = "claude-sonnet-5";

const FORMATO_SALIDA = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      respuesta: { type: "string" },
      requiereHumano: { type: "boolean" },
      motivo: { type: "string" },
    },
    required: ["respuesta", "requiereHumano", "motivo"],
    additionalProperties: false,
  },
};

export class AnthropicLLM implements LLM {
  // El tipo `any` evita depender del paquete en este entorno aislado.
  // En producción: `private client: Anthropic`.
  private client: any;

  constructor(client?: any) {
    this.client = client;
  }

  private async cliente(): Promise<any> {
    if (this.client) return this.client;
    // Import dinámico: solo se resuelve si el SDK está instalado (producción).
    const mod: any = await import("@anthropic-ai/sdk").catch(() => {
      throw new Error(
        "AnthropicLLM requiere @anthropic-ai/sdk instalado. En la demo usá MockLLM.",
      );
    });
    const Anthropic = mod.default ?? mod.Anthropic;
    this.client = new Anthropic(); // resuelve credenciales del entorno
    return this.client;
  }

  async generar(input: {
    systemPrompt: string;
    userPrompt: string;
    review: Review;
    voz: BrandVoice;
    bucket: BucketRating;
  }): Promise<SalidaLLM> {
    const client = await this.cliente();

    const res = await client.messages.create({
      model: MODELO,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      // El kit de voz de marca va como bloque de sistema CACHEADO (prefijo estable).
      system: [
        {
          type: "text",
          text: input.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: { format: FORMATO_SALIDA },
      // La reseña concreta es la parte volátil (no se cachea).
      messages: [{ role: "user", content: input.userPrompt }],
    });

    if (res.stop_reason === "refusal") {
      // El modelo declinó: no publicamos nada, va a revisión humana.
      return {
        respuesta: "",
        requiereHumano: true,
        motivo: "El modelo declinó generar la respuesta (refusal). Escalar a humano.",
        generadoPor: MODELO,
      };
    }

    const bloque = res.content.find((b: any) => b.type === "text");
    const parsed = bloque ? JSON.parse(bloque.text) : null;

    if (!parsed) {
      return {
        respuesta: "",
        requiereHumano: true,
        motivo: "Salida no parseable. Escalar a humano.",
        generadoPor: MODELO,
      };
    }

    return {
      respuesta: String(parsed.respuesta ?? ""),
      requiereHumano: Boolean(parsed.requiereHumano),
      motivo: String(parsed.motivo ?? ""),
      generadoPor: MODELO,
    };
  }
}
