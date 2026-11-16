// CRM COMERCIAL · permisos por rol y por puesto (GSG-CRM-010, diseño CRM-REINGENIERIA.md §3).
//
// PURO: no toca la base. La acción del servidor arma el `Miembro` desde `MiembroCrmComercial` (por
// tenantId + userId de la sesión) y el `Contexto` desde la oportunidad, y pregunta acá ANTES de escribir
// (E12: el rechazo vive en el servidor, no sólo en pantalla).
//
// Reglas:
// - El permiso del CRM sale de la membresía, NO de `clients:manage` (E16). Sin membresía activa: nada.
// - DIRECCION: ve todo, aprueba pases y borradores, asigna al comercial y confirma el destino (E14).
// - COMERCIAL: sólo las oportunidades donde es el dueño (E12) y sus borradores.
// - PUESTO (usuario propio de un agente): sólo lo de su puesto, y sólo sobre oportunidades que creó o
//   donde tiene una tarea EN_CURSO tomada por él. Lo de la columna «con aprobación» sólo lo PROPONE;
//   lo aplica Dirección. Nunca: crear contactos, marcar enviado, enviar, plata ni configuración (E16).
// - GANADA no la pone nadie a mano: la pone el cierre del proyecto (desafío punto 4, «A4»).
// - El sistema no le manda nada a terceros: los mensajes los manda una persona fuera del sistema.

export const ROLES = ["DIRECCION", "COMERCIAL", "PUESTO"] as const;
export type Rol = (typeof ROLES)[number];

export const PUESTOS = [
  "descubridor",
  "identificador",
  "verificador",
  "contactos", // Buscador de contactos: APAGADO en esta versión
  "redactor",
  "seguidor",
  "calificador",
  "armador_brief",
] as const;
export type Puesto = (typeof PUESTOS)[number];

export const ETAPAS = [
  "DETECTADA",
  "VERIFICADA",
  "SIN_CONTACTO",
  "CONTACTADA",
  "RECIBIDA",
  "EN_CONVERSACION",
  "FALTAN_DATOS",
  "CALIFICADA",
  "ASIGNADA",
  "DORMIDA",
  "GANADA",
  "PERDIDA",
  "DESCARTADA",
  "DERIVADA_AL_TALLER",
] as const;
export type Etapa = (typeof ETAPAS)[number];

export const OPERACIONES = [
  "ver_oportunidad",
  "proponer_oportunidad", // proponer evento, marca u oportunidad nueva (o cargar una consulta entrante)
  "verificar",
  "puntuar",
  "marcar_faltantes",
  "editar_brief",
  "escribir_borrador",
  "crear_tarea_seguimiento",
  "tomar_tarea",
  "proponer_pase",
  "aplicar_pase",
  "aprobar_borrador",
  "rechazar_borrador",
  "marcar_enviado",
  "registrar_respuesta", // actividad «respondió el cliente»: evidencia de EN_CONVERSACION
  "comprobar_identidad", // consulta entrante: una persona confirma quién escribe
  "crear_contacto", // crear o importar
  "suprimir_contacto", // E8: «no me escriban más»
  "asignar_comercial",
  "confirmar_destino",
  "configurar", // miembros, puestos, topes, vara: lo que toca plata o configuración
  "ver_registro", // registro por puesto (quién hizo qué y cuánto costó)
  "enviar_a_terceros",
] as const;
export type Operacion = (typeof OPERACIONES)[number];

/** La fila de `MiembroCrmComercial` (o null si el usuario no tiene). */
export type Miembro = {
  userId: string;
  rol: Rol;
  puesto: Puesto | null;
  activo: boolean;
  topeAccionesDia?: number | null;
  topeCostoDiaUsd?: number | null;
};

export type ContextoOportunidad = {
  duenoUserId: string | null;
  creadaPor: string;
  /** PROSPECTO · CONSULTA. Sin él, el comercial sólo ve lo asignado (falla cerrada). */
  tipo?: string;
  /** userIds que tienen una TareaComercial EN_CURSO sobre esta oportunidad. */
  tomadoresEnCurso: readonly string[];
};

export type Contexto = {
  oportunidad?: ContextoOportunidad;
  /** Para proponer_pase / aplicar_pase. */
  etapaDestino?: Etapa;
  /** Para tomar_tarea: el `para` de la tarea (un puesto, PERSONA o DIRECCION). */
  tareaPara?: string;
};

export type Resultado = { ok: true } | { ok: false; motivo: string };

const SI: Resultado = { ok: true };
const no = (motivo: string): Resultado => ({ ok: false, motivo });

/** Pases que un puesto aplica solo (verificar, marcar faltantes). */
const PASES_AGENTE_SOLO: readonly Etapa[] = ["VERIFICADA", "SIN_CONTACTO", "FALTAN_DATOS"];
/** Pases que el puesto sólo PROPONE y aplica Dirección (§3, columna «con aprobación»). */
export const PASES_CON_APROBACION: readonly Etapa[] = ["CALIFICADA", "ASIGNADA", "DORMIDA", "DESCARTADA", "PERDIDA", "DERIVADA_AL_TALLER"];
/** Pases que una persona aplica sola sobre una oportunidad que le toca. */
const PASES_DE_PERSONA: readonly Etapa[] = ["VERIFICADA", "SIN_CONTACTO", "CONTACTADA", "EN_CONVERSACION", "FALTAN_DATOS"];

/** Qué hace cada puesto (base: EQUIPO-AGENTES-EVENTOS.md + los dos nuevos del §3). */
const CAPACIDADES: Record<Puesto, { ops: readonly Operacion[]; aplica: readonly Etapa[]; propone: readonly Etapa[] }> = {
  descubridor: { ops: ["proponer_oportunidad"], aplica: [], propone: [] },
  identificador: { ops: ["proponer_oportunidad"], aplica: [], propone: [] },
  verificador: { ops: ["verificar"], aplica: ["VERIFICADA", "SIN_CONTACTO"], propone: ["DESCARTADA"] },
  contactos: { ops: [], aplica: [], propone: [] },
  redactor: { ops: ["escribir_borrador"], aplica: [], propone: [] },
  seguidor: { ops: ["escribir_borrador", "crear_tarea_seguimiento"], aplica: [], propone: ["DORMIDA", "PERDIDA"] },
  calificador: { ops: ["puntuar", "marcar_faltantes"], aplica: ["FALTAN_DATOS"], propone: ["CALIFICADA", "DERIVADA_AL_TALLER", "DESCARTADA"] },
  armador_brief: { ops: ["marcar_faltantes", "editar_brief", "escribir_borrador"], aplica: ["FALTAN_DATOS"], propone: ["DESCARTADA"] },
};

/** Operaciones que se hacen SOBRE una oportunidad: sin el contexto, se rechaza (falla cerrada). */
const SOBRE_OPORTUNIDAD: ReadonlySet<Operacion> = new Set<Operacion>([
  "ver_oportunidad",
  "verificar",
  "puntuar",
  "marcar_faltantes",
  "editar_brief",
  "escribir_borrador",
  "crear_tarea_seguimiento",
  "tomar_tarea",
  "proponer_pase",
  "aplicar_pase",
  "aprobar_borrador",
  "rechazar_borrador",
  "marcar_enviado",
  "registrar_respuesta",
  "comprobar_identidad",
]);

const SOLO_DIRECCION: ReadonlySet<Operacion> = new Set<Operacion>(["asignar_comercial", "confirmar_destino", "configurar", "ver_registro"]);

/** Lo que ningún puesto hace nunca (§3, columna «Nunca»; E16). */
const NUNCA_PUESTO: Partial<Record<Operacion, string>> = {
  crear_contacto: "Un puesto del equipo no carga contactos: los carga una persona (Dirección o un comercial).",
  suprimir_contacto: "La baja de un contacto la registra una persona, no un puesto del equipo.",
  marcar_enviado: "«Enviado» lo marca la persona que mandó el mensaje, no un puesto del equipo.",
  aprobar_borrador: "Los borradores los aprueba una persona; el puesto sólo los escribe.",
  rechazar_borrador: "Los borradores los revisa una persona; el puesto sólo los escribe.",
  registrar_respuesta: "La respuesta del cliente la registra la persona que la recibió.",
  comprobar_identidad: "Quién escribe lo comprueba una persona, no un puesto del equipo.",
};

function esEtapa(x: unknown): x is Etapa {
  return typeof x === "string" && (ETAPAS as readonly string[]).includes(x);
}

function verOportunidad(m: Miembro, o: ContextoOportunidad): Resultado {
  if (m.rol === "DIRECCION") return SI;
  if (m.rol === "COMERCIAL") {
    if (o.duenoUserId === m.userId) return SI;
    // GSG-CRM-011 (B7): la consulta entrante que cargó él, mientras nadie más la tenga asignada.
    // Lo mismo dice `filtroVisible` en repo.ts: si cambia uno, cambia el otro.
    if (o.duenoUserId == null && o.tipo === "CONSULTA" && o.creadaPor === m.userId) return SI;
    return no("Esa oportunidad no es tuya: la tiene asignada otro comercial o todavía no se asignó.");
  }
  return o.creadaPor === m.userId || o.tomadoresEnCurso.includes(m.userId)
    ? SI
    : no("Ese puesto no tiene esa oportunidad: sólo ve las que creó o donde tiene una tarea en curso.");
}

function pase(m: Miembro, op: "proponer_pase" | "aplicar_pase", destino: Etapa | undefined): Resultado {
  if (!esEtapa(destino)) return no("Falta decir a qué etapa pasa la oportunidad.");
  if (destino === "GANADA") return no("GANADA no se pone a mano: la pone el cierre del proyecto cuando llega a «Confirmado».");
  if (m.rol === "DIRECCION") return SI;
  if (m.rol === "COMERCIAL") {
    if (op === "proponer_pase") {
      if (PASES_CON_APROBACION.includes(destino)) return SI;
      return no(PASES_DE_PERSONA.includes(destino) ? `El pase a ${destino} no se propone: lo hacés directamente.` : `A ${destino} no se pasa a mano.`);
    }
    if (PASES_DE_PERSONA.includes(destino)) return SI;
    if (PASES_CON_APROBACION.includes(destino)) return no(`El pase a ${destino} lo aprueba Dirección: proponelo y queda en su bandeja.`);
    return no(`A ${destino} no se pasa a mano.`);
  }
  const cap = CAPACIDADES[m.puesto as Puesto];
  if (op === "proponer_pase") {
    return cap.propone.includes(destino) ? SI : no(`El puesto ${m.puesto} no puede proponer el pase a ${destino}.`);
  }
  if (cap.aplica.includes(destino) && PASES_AGENTE_SOLO.includes(destino)) return SI;
  if (cap.propone.includes(destino)) return no(`El puesto ${m.puesto} sólo puede PROPONER el pase a ${destino}; lo aplica Dirección.`);
  return no(`El puesto ${m.puesto} no puede pasar una oportunidad a ${destino}.`);
}

function tomarTarea(m: Miembro, para: string | undefined): Resultado {
  if (!para) return no("Falta decir de qué cola es la tarea.");
  if (m.rol === "PUESTO") return para === m.puesto ? SI : no(`Esa tarea es para ${para}, no para el puesto ${m.puesto}.`);
  if (para === "DIRECCION") return m.rol === "DIRECCION" ? SI : no("Esa tarea es de Dirección.");
  if (para === "PERSONA") return SI;
  return no(`Esa tarea es para el puesto ${para}: la toma ese puesto, no una persona.`);
}

/**
 * ¿Puede este miembro hacer esta operación en este contexto? Devuelve el motivo en criollo si no.
 * `miembro` null o inactivo = no está en el CRM: no puede nada, tenga los permisos que tenga en el resto.
 */
export function puede(miembro: Miembro | null | undefined, operacion: Operacion, contexto: Contexto = {}): Resultado {
  if (!miembro || !miembro.activo) return no("No estás dado de alta en el CRM comercial. Pedíselo a Dirección.");
  if (!(ROLES as readonly string[]).includes(miembro.rol)) return no("Tu rol en el CRM no es válido. Pedile a Dirección que lo revise.");
  if (miembro.rol === "PUESTO" && !(PUESTOS as readonly string[]).includes(miembro.puesto ?? "")) {
    return no("Ese usuario de puesto no tiene un puesto válido. Pedile a Dirección que lo revise.");
  }
  if (!(OPERACIONES as readonly string[]).includes(operacion)) return no("Esa acción no existe en el CRM.");

  if (operacion === "enviar_a_terceros") {
    return no("El sistema no le manda nada a nadie: el mensaje lo manda una persona y después lo marca como enviado.");
  }
  if (SOLO_DIRECCION.has(operacion) && miembro.rol !== "DIRECCION") {
    return no(
      operacion === "asignar_comercial"
        ? "Al comercial lo asigna Dirección."
        : operacion === "confirmar_destino"
          ? "El destino (Agencia o Taller) lo confirma Dirección."
          : "Eso lo hace sólo Dirección.",
    );
  }
  if (miembro.rol === "PUESTO") {
    const nunca = NUNCA_PUESTO[operacion];
    if (nunca) return no(nunca);
    if (miembro.puesto === "contactos") return no("El Buscador de contactos está apagado en esta versión.");
  }

  // Alcance: ¿le toca esta oportunidad? (tomar_tarea es justamente cómo el puesto la consigue).
  const o = contexto.oportunidad;
  if (SOBRE_OPORTUNIDAD.has(operacion)) {
    if (!o) return no("Falta indicar sobre qué oportunidad es la acción.");
    if (!(operacion === "tomar_tarea" && miembro.rol === "PUESTO")) {
      const v = verOportunidad(miembro, o);
      if (!v.ok) return v;
    }
  } else if (o && miembro.rol !== "DIRECCION") {
    const v = verOportunidad(miembro, o);
    if (!v.ok) return v;
  }

  if (operacion === "proponer_pase" || operacion === "aplicar_pase") return pase(miembro, operacion, contexto.etapaDestino);
  if (operacion === "tomar_tarea") return tomarTarea(miembro, contexto.tareaPara);

  if (miembro.rol === "DIRECCION" || miembro.rol === "COMERCIAL") return SI;
  if (operacion === "ver_oportunidad") return SI;
  return CAPACIDADES[miembro.puesto as Puesto].ops.includes(operacion)
    ? SI
    : no(`Eso no es tarea del puesto ${miembro.puesto}.`);
}

export type UsoDelDia = { accionesHoy: number; costoHoyUsd: number };

/**
 * E11: ¿el puesto sigue dentro de sus topes del día? Se pregunta ANTES de la acción, con lo que la acción
 * va a costar. Las personas no tienen tope. Tope null = sin tope. Pasado el tope se frena y avisa.
 */
export function dentroDeTopes(miembro: Miembro, uso: UsoDelDia, costoEstimadoUsd = 0): Resultado {
  if (miembro.rol !== "PUESTO") return SI;
  const ta = miembro.topeAccionesDia;
  if (ta != null && uso.accionesHoy + 1 > ta) {
    return no(`El puesto ${miembro.puesto} llegó a su tope de ${ta} acciones por hoy. Se frena hasta mañana o hasta que Dirección suba el tope.`);
  }
  const tc = miembro.topeCostoDiaUsd;
  if (tc != null && uso.costoHoyUsd + Math.max(0, costoEstimadoUsd) > tc) {
    return no(`El puesto ${miembro.puesto} pasaría su tope de gasto de US$ ${tc} por hoy (lleva US$ ${uso.costoHoyUsd}). Se frena y queda avisado.`);
  }
  return SI;
}
