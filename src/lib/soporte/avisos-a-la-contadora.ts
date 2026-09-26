// Lo que Soporte GSG le puede decir a la contadora cuando descarta un pedido de alta: una LISTA
// CERRADA. QA 26/09 (vuelta 4, bloqueante 1): el motivo se escribía a mano y le llegaba tal cual a la
// cartera; con el nombre de un negocio ajeno («QA Kiosco Lab») un estudio se enteró de que ese
// negocio existe. Ahora la contadora lee sólo estos textos, que no nombran ningún negocio ni CUIT, y
// lo que Soporte quiera anotar va en una NOTA INTERNA (ACCION_NOTA_INTERNA_SOPORTE) que ninguna
// pantalla del negocio lee: ni la cartera ni la auditoría del panel (auditoria/filtros.ts).
// PURO: lo usan la consola (componentes de cliente), la cartera y los tests.

export const MOTIVOS_DE_DESCARTE = {
  "faltan-datos": "Faltan datos para darlo de alta.",
  "no-coincide-arca": "Los datos no coinciden con ARCA: revisalos y volvé a pedirlo.",
  "ya-en-cartera": "Ya está en tu cartera: no hacía falta pedir el alta.",
  "cliente-no-sigue": "El cliente decidió no seguir.",
  "soporte-escribe": "Soporte GSG te escribe por WhatsApp.",
} as const;

export type MotivoDeDescarte = keyof typeof MOTIVOS_DE_DESCARTE;
export const MOTIVOS_DE_DESCARTE_EN_ORDEN = Object.keys(MOTIVOS_DE_DESCARTE) as MotivoDeDescarte[];

/** Lo que ve la contadora si el descarte no trae un código de la lista (uno viejo, escrito a mano). */
export const MOTIVO_POR_DEFECTO: MotivoDeDescarte = "soporte-escribe";

export function esMotivoDeDescarte(x: unknown): x is MotivoDeDescarte {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(MOTIVOS_DE_DESCARTE, x);
}

/** El texto que lee la contadora. SIEMPRE uno de la lista: nunca lo que escribió Soporte. PURA. */
export function textoDelDescarte(codigo: unknown): string {
  return MOTIVOS_DE_DESCARTE[esMotivoDeDescarte(codigo) ? codigo : MOTIVO_POR_DEFECTO];
}

export function validarMotivoDeDescarte(x: unknown): { ok: true; motivo: MotivoDeDescarte } | { ok: false; error: string } {
  return esMotivoDeDescarte(x) ? { ok: true, motivo: x } : { ok: false, error: "Elegí qué le decimos a la contadora." };
}

/** La nota interna de Soporte: fila aparte del registro, que ninguna pantalla del negocio lee. */
export const ACCION_NOTA_INTERNA_SOPORTE = "soporte.nota_interna";
/** Las acciones del registro que sólo lee Soporte GSG: la auditoría del panel del negocio las deja afuera. */
export const ACCIONES_SOLO_SOPORTE: readonly string[] = [ACCION_NOTA_INTERNA_SOPORTE];

export const NOTA_INTERNA_MIN = 3;
export const NOTA_INTERNA_MAX = 300;

/** La nota interna es optativa: vacía no hay nota; corta o larga, con su propio error. PURA. */
export function validarNotaInterna(x: unknown): { ok: true; nota: string | null } | { ok: false; error: string } {
  const nota = typeof x === "string" ? x.trim().replace(/\s+/g, " ") : "";
  if (nota === "") return { ok: true, nota: null };
  if (nota.length < NOTA_INTERNA_MIN) {
    return { ok: false, error: `La nota interna es muy corta: escribí al menos ${NOTA_INTERNA_MIN} letras o dejala vacía.` };
  }
  if (nota.length > NOTA_INTERNA_MAX) return { ok: false, error: `La nota interna es muy larga: dejala en ${NOTA_INTERNA_MAX} letras o menos.` };
  return { ok: true, nota };
}
