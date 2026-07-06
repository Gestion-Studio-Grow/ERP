/**
 * Orquestador del pipeline Testigo, extremo a extremo (del input procesado al entregable).
 *
 *   entrada (STT+visión ya hechos)  ->  estructurarParte()  ->  ¿faltan datos? -> repregunta
 *                                                            ->  renderParteHTML()  ->  htmlAPDF()  ->  despacho
 *
 * Las capas de ingesta (webhook WhatsApp), STT y visión son adaptadores externos: acá se asume que
 * `EntradaOperario` ya viene con transcripción y fotos con caption. El foco del kickoff es este core.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { estructurarParte, armarRepregunta } from "./estructurar.js";
import { renderParteHTML } from "./plantilla-pdf.js";
import type { EntradaOperario, ConfigContratista } from "./tipos.js";
import type { TParteEstructurado } from "./esquema-parte.js";

export type ResultadoPipeline =
  | {
      estado: "pendiente_revision";
      parte: TParteEstructurado;
      repregunta: string; // texto a mandar por WhatsApp al operario
    }
  | {
      estado: "emitido";
      parte: TParteEstructurado;
      html: string; // listo para htmlAPDF()
    };

/**
 * Procesa un parte. Si faltan datos regulatorios, NO emite: devuelve la repregunta.
 * Si está completo, devuelve el HTML del parte listo para convertir a PDF y despachar.
 */
export async function procesarParte(
  entrada: EntradaOperario,
  config: ConfigContratista,
  client?: Anthropic,
): Promise<ResultadoPipeline> {
  const { parte, requiereRepregunta } = await estructurarParte(entrada, config, client);

  if (requiereRepregunta) {
    return {
      estado: "pendiente_revision",
      parte,
      repregunta: armarRepregunta(parte) ?? "Faltan datos para emitir el parte.",
    };
  }

  return {
    estado: "emitido",
    parte,
    html: renderParteHTML(parte, config),
  };
}
