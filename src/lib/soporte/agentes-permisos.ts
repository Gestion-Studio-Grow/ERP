// ============================================================================
// MANTENIMIENTO GSG — qué puede hacer cada nivel de agente (GSG-MANT-001, T-A).
// ============================================================================
//
// Los agentes de soporte trabajan por niveles: n1 lee y redacta borradores, n2 además ordena el
// ticket, n3 además abre issues y PR. Todo lo que toca plata, ARCA, secretos, permisos, la marca,
// la base o producción ESCALA AL DUEÑO, sea cual sea el nivel. Lo mismo cualquier cosa sobre el
// negocio de CH («beauty-spa»), salvo el borrador del n1 que aprueba el dueño (D5). Una acción que esta lista no conoce está PROHIBIDA (fail-closed).
// PURO: lo prueba agentes-permisos.test.ts.

export const NIVELES_DE_AGENTE = ["n1", "n2", "n3"] as const;
export type NivelDeAgente = (typeof NIVELES_DE_AGENTE)[number];

/** Las etiquetas con las que se marca un ticket según quién lo puede tomar. */
export const ETIQUETAS_MANT = { n1: "mant:n1", n2: "mant:n2", n3: "mant:n3", duenio: "mant:duenio" } as const;
export type EtiquetaMant = (typeof ETIQUETAS_MANT)[keyof typeof ETIQUETAS_MANT];

const ACCIONES_N1 = ["leer_ticket", "leer_base_conocimiento", "borrador_respuesta"] as const;
const ACCIONES_N2 = ["nota_interna", "cambiar_estado", "cambiar_config_no_sensible"] as const;
const ACCIONES_N3 = ["abrir_issue", "abrir_pr"] as const;

/** Siempre las decide el dueño, sea cual sea el nivel. */
export const ACCIONES_DEL_DUENIO = [
  "arca",
  "plata",
  "precio",
  "caja",
  "secreto",
  "contrasena",
  "permisos",
  "marca",
  "migracion",
  "deploy",
  "borrar",
] as const;

export const ACCIONES_DE_AGENTE = [...ACCIONES_N1, ...ACCIONES_N2, ...ACCIONES_N3, ...ACCIONES_DEL_DUENIO] as const;
export type AccionDeAgente = (typeof ACCIONES_DE_AGENTE)[number];

/** Lo que cada nivel hace solo. n3 NO hereda lo de n2: abre issues/PR, no ordena tickets. */
export const PERMITIDAS: Readonly<Record<NivelDeAgente, readonly AccionDeAgente[]>> = {
  n1: ACCIONES_N1,
  n2: [...ACCIONES_N1, ...ACCIONES_N2],
  n3: [...ACCIONES_N1, ...ACCIONES_N3],
};

/** El negocio de CH: cualquier acción sobre él la decide el dueño. */
export const SLUG_CH = "beauty-spa";

/**
 * «borrador_al_duenio» (D5, 14/11): en CH el n1 puede leer el ticket y la base de conocimiento y
 * dejar UN borrador, que aprueba sólo el dueño. No es «permitido» a propósito: quien sólo mira
 * «permitido» lo trata como no permitido (falla cerrado) y el despacho lo maneja aparte.
 */
export type Decision = "permitido" | "borrador_al_duenio" | "escala_duenio" | "prohibido";

/** Lo que el n1 hace en CH (D5): leer el texto del ticket y la base, y redactar. Nada más. */
const ACCIONES_N1_EN_CH: readonly AccionDeAgente[] = ACCIONES_N1;

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const esNivel = (x: unknown): x is NivelDeAgente => typeof x === "string" && (NIVELES_DE_AGENTE as readonly string[]).includes(x);
const esAccion = (x: string): x is AccionDeAgente => (ACCIONES_DE_AGENTE as readonly string[]).includes(x);
/** El slug reducido a letras y números: «Beauty_Spa», «beauty spa» o «beauty‐spa» son el mismo negocio. */
const nucleoDeSlug = (s: string) => sinTildes(s.normalize("NFKC")).replace(/[^a-z0-9]/g, "");
const NUCLEO_CH = nucleoDeSlug(SLUG_CH);

/**
 * ¿Puede este nivel hacer esta acción sobre este negocio? Orden: nivel desconocido → prohibido;
 * acción desconocida → prohibido (fail-closed); sin negocio (null, vacío, espacios) o negocio de CH →
 * escala al dueño (si no se sabe de quién es, puede ser CH); acción del dueño → escala; en la lista
 * del nivel → permitido; si no → prohibido. La acción se compara sin mayúsculas, tildes ni espacios a
 * los costados («Contraseña» = «contrasena»); el slug, además, sin separadores ni invisibles
 * («beauty_spa» = «beauty-spa»). PURA.
 */
export function decidirAccionDeAgente(
  nivel: unknown,
  accion: unknown,
  negocioSlug: string | null | undefined,
): { decision: Decision; motivo: string } {
  if (!esNivel(nivel)) return { decision: "prohibido", motivo: "Nivel de agente desconocido." };
  const a = typeof accion === "string" ? sinTildes(accion) : "";
  if (!esAccion(a)) return { decision: "prohibido", motivo: "Acción desconocida: lo que no está en la lista no se hace." };
  const slug = typeof negocioSlug === "string" ? sinTildes(negocioSlug) : "";
  // Un slug que se reduce a nada («-», «​», «_ -») tampoco dice de qué negocio es.
  const nucleo = slug ? nucleoDeSlug(slug) : "";
  if (!nucleo) return { decision: "escala_duenio", motivo: "No se sabe de qué negocio es: lo decide el dueño." };
  if (slug === SLUG_CH || nucleo === NUCLEO_CH) {
    // D5: sólo el n1, sólo leer y redactar; el borrador lo aprueba el dueño. n2 y n3, nunca.
    if (nivel === "n1" && ACCIONES_N1_EN_CH.includes(a)) {
      return { decision: "borrador_al_duenio", motivo: "Es CH: sólo un borrador, que aprueba el dueño (D5)." };
    }
    return { decision: "escala_duenio", motivo: "Es el negocio de CH: cualquier otra acción la decide el dueño." };
  }
  if ((ACCIONES_DEL_DUENIO as readonly string[]).includes(a)) {
    return { decision: "escala_duenio", motivo: `«${a}» la decide siempre el dueño.` };
  }
  if (PERMITIDAS[nivel].includes(a)) return { decision: "permitido", motivo: `Permitido para ${nivel}.` };
  return { decision: "prohibido", motivo: `«${a}» no está permitido para ${nivel}.` };
}

/** La etiqueta del ticket para una decisión: lo que escala, y el borrador de CH, van a «mant:duenio». PURA. */
export function etiquetaDeDecision(nivel: NivelDeAgente, decision: Decision): EtiquetaMant {
  return decision === "escala_duenio" || decision === "borrador_al_duenio" ? ETIQUETAS_MANT.duenio : ETIQUETAS_MANT[nivel];
}

/** Quién aprueba un borrador de este negocio (D5 y D6): en CH sólo el dueño; si no se sabe el negocio, también. PURA. */
export function quienApruebaElBorrador(negocioSlug: string | null | undefined): "duenio" | "persona_gsg" {
  const nucleo = typeof negocioSlug === "string" ? nucleoDeSlug(negocioSlug) : "";
  return !nucleo || nucleo === NUCLEO_CH ? "duenio" : "persona_gsg";
}
