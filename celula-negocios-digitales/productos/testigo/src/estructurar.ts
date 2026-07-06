/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  EL CORAZÓN DE TESTIGO                                                     ║
 * ║  (transcripción + descripciones de fotos)  ->  PARTE ESTRUCTURADO         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Toma lo que el operario mandó por WhatsApp (ya pasado por STT y visión) y produce el parte de
 * trabajo estructurado y validado, usando Claude Sonnet con structured outputs (JSON garantizado
 * contra el esquema). Después, la validación local marca los campos regulatorios pendientes.
 *
 * Este archivo es el "pipeline core funcionando" que pide el kickoff. `pipeline.ts` lo orquesta
 * con el render a PDF; `ejemplo/demo.ts` lo corre end-to-end (real o mock).
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ParteEstructurado, PENDIENTE, type TParteEstructurado } from "./esquema-parte.js";
import { SYSTEM_CONTROL_PLAGAS, construirMensajeUsuario } from "./prompt.js";
import type { EntradaOperario, ConfigContratista } from "./tipos.js";

/** Modelo de producto: Claude Sonnet (el COGS objetivo ~US$2/operario/mes se calcula con Sonnet). */
export const MODELO = "claude-sonnet-5";

export interface ResultadoEstructuracion {
  parte: TParteEstructurado;
  /** true si quedaron campos regulatorios en PENDIENTE_REVISION (hay que repreguntar por WhatsApp). */
  requiereRepregunta: boolean;
  /** Uso de tokens, para telemetría de costo. */
  uso?: { input?: number; output?: number; cacheRead?: number };
}

/**
 * NÚCLEO. Convierte la entrada del operario en un parte estructurado válido.
 *
 * @param entrada  transcripción + fotos ya procesadas por STT/visión
 * @param config   plantilla/datos del contratista
 * @param client   cliente Anthropic (inyectable para tests). Por defecto usa credenciales del entorno.
 */
export async function estructurarParte(
  entrada: EntradaOperario,
  config: ConfigContratista,
  client: Anthropic = new Anthropic(),
): Promise<ResultadoEstructuracion> {
  const respuesta = await client.messages.parse({
    model: MODELO,
    max_tokens: 4096,
    // system como bloque cacheable: es fijo por rubro -> lecturas a 0.1x, baja el COGS.
    system: [
      { type: "text", text: SYSTEM_CONTROL_PLAGAS, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: construirMensajeUsuario(entrada, config) }],
    // Structured outputs: la respuesta se valida contra el esquema del parte.
    output_config: { format: zodOutputFormat(ParteEstructurado, "parte_control_plagas") },
  });

  const parte = respuesta.parsed_output;
  if (!parte) {
    throw new Error(
      `El modelo no devolvió un parte válido (stop_reason=${respuesta.stop_reason}).`,
    );
  }

  return {
    parte: normalizarPendientes(parte),
    requiereRepregunta: parte.camposPendientes.length > 0,
    uso: {
      input: respuesta.usage?.input_tokens,
      output: respuesta.usage?.output_tokens,
      cacheRead: respuesta.usage?.cache_read_input_tokens,
    },
  };
}

/**
 * Red de seguridad: recorre los campos regulatorios y asegura que cualquier "PENDIENTE_REVISION"
 * quede reflejado en `camposPendientes`, aunque el modelo se lo haya olvidado. Determinístico:
 * la política "nunca inventar datos regulatorios" no puede depender sólo del modelo.
 */
export function normalizarPendientes(parte: TParteEstructurado): TParteEstructurado {
  const pendientes = new Set(parte.camposPendientes);

  parte.productosAplicados.forEach((p, i) => {
    if (p.nombreComercial === PENDIENTE) pendientes.add(`productosAplicados[${i}].nombreComercial`);
    if (p.principioActivo === PENDIENTE) pendientes.add(`productosAplicados[${i}].principioActivo`);
    if (p.numeroRegistro === PENDIENTE) pendientes.add(`productosAplicados[${i}].numeroRegistro`);
    if (p.dosis === PENDIENTE) pendientes.add(`productosAplicados[${i}].dosis`);
  });
  if (parte.plazoReingreso === PENDIENTE) pendientes.add("plazoReingreso");

  return { ...parte, camposPendientes: [...pendientes] };
}

/**
 * Genera el texto de la repregunta que Testigo manda por WhatsApp cuando faltan datos regulatorios.
 * Traduce los nombres técnicos de campo a preguntas que el operario entiende.
 */
export function armarRepregunta(parte: TParteEstructurado): string | null {
  if (parte.camposPendientes.length === 0) return null;
  const preguntas: string[] = [];
  const has = (frag: string) => parte.camposPendientes.some((c) => c.includes(frag));

  if (has("nombreComercial")) preguntas.push("¿Qué producto usaste (nombre comercial)?");
  if (has("principioActivo")) preguntas.push("¿Cuál es el principio activo?");
  if (has("numeroRegistro")) preguntas.push("¿Número de registro del producto?");
  if (has("dosis")) preguntas.push("¿Qué dosis aplicaste?");
  if (has("plazoReingreso")) preguntas.push("¿Cuántas horas de reingreso indicaste?");

  return `Casi listo el parte. Me falta un dato para poder emitirlo:\n- ${preguntas.join("\n- ")}`;
}
