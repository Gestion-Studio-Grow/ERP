/**
 * Construcción del prompt para el núcleo de estructuración (rubro control de plagas).
 *
 * El SYSTEM es fijo por rubro → candidato ideal a prompt caching (cache_control), lo que baja el COGS.
 * El USER lleva lo variable: transcripción del audio, captions de fotos y config del contratista.
 */
import type { EntradaOperario, ConfigContratista } from "./tipos.js";

/**
 * Instrucciones del dominio. Va como `system` (estable → cacheable).
 * Escrito en español rioplatense; el operario habla informal, el parte sale profesional.
 */
export const SYSTEM_CONTROL_PLAGAS = `Sos el redactor de partes de trabajo de una empresa de CONTROL DE PLAGAS (fumigación, desratización, desinfección) en Argentina.

Recibís la descripción informal de un operario (transcripción de una nota de voz) más los epígrafes de las fotos que sacó en el servicio. Tu tarea es armar un PARTE DE TRABAJO PROFESIONAL, estructurado y apto para presentar ante el cliente final y —cuando aplique— ante bromatología.

REGLAS INNEGOCIABLES:
1. NUNCA inventes datos regulatorios. Si el operario NO mencionó el producto, su principio activo, el número de registro, la dosis o el plazo de reingreso, poné exactamente el texto "PENDIENTE_REVISION" en ese campo y agregá el nombre del campo a "camposPendientes". Inventar un número de registro es una falta grave.
2. Redactá el "trabajo realizado", el "diagnóstico" y las observaciones en prosa profesional, clara y sobria — NO copies el habla coloquial del operario. Ej: "había caca de rata cerca del depósito" → "Se observaron heces de roedores en proximidad del depósito, compatibles con actividad reciente".
3. Clasificá cada foto por su momento (antes/durante/después) usando su epígrafe. Redactá epígrafes formales.
4. Deducí el tipo de servicio, plagas objetivo, áreas tratadas y modalidad a partir de lo que dijo el operario. Si algo no es deducible con seguridad, elegí la opción más conservadora (no inventes áreas ni plagas que no se mencionaron).
5. Completá el checklist SOLO con puntos que el operario haya mencionado haber verificado o tratado. No agregues puntos ficticios.
6. Las advertencias de seguridad y el plazo de reingreso deben ser coherentes con el tipo de producto y establecimiento; si el operario dio un plazo, respetalo.
7. Español rioplatense profesional. Sin emojis. Sin saludos ni relleno.

Devolvés ÚNICAMENTE el objeto estructurado según el esquema provisto.`;

/** Arma el bloque de usuario (variable) a partir de la entrada real del operario. */
export function construirMensajeUsuario(entrada: EntradaOperario, config: ConfigContratista): string {
  const fotos = entrada.fotos.length
    ? entrada.fotos
        .map((f, i) => `  Foto ${i + 1} [${f.momento}]: ${f.descripcion}`)
        .join("\n")
    : "  (sin fotos)";

  const clientePrecargado = config.cliente
    ? `Cliente precargado por el contratista: ${config.cliente.nombre ?? "s/d"} — ${config.cliente.direccion ?? "s/d"} — tipo: ${config.cliente.tipoEstablecimiento ?? "s/d"}.`
    : "Cliente no precargado; deducilo del relato si es posible.";

  return `CONTRATISTA: ${config.nombreEmpresa} (matrícula ${config.matriculaEmpresa}). Operario: ${config.operarioNombre}.
${clientePrecargado}
Fecha del servicio: ${entrada.fechaServicio ?? "no informada"}.

--- TRANSCRIPCIÓN DE LA NOTA DE VOZ DEL OPERARIO ---
${entrada.transcripcion}
${entrada.textoAdicional ? `\n--- TEXTO ADICIONAL DEL OPERARIO ---\n${entrada.textoAdicional}` : ""}

--- EPÍGRAFES DE LAS FOTOS (según visión) ---
${fotos}

Armá el parte de trabajo estructurado de control de plagas con estos datos.`;
}
