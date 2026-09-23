// ============================================================================
// REGLAS DEL MOTOR COMERCIAL — los umbrales, en UN solo lugar. PROVISIONALES.
// ============================================================================
//
// Todo número de esta tabla es PROVISIONAL A CONFIRMAR con la dueña: el ciclo de 45 días, el
// tope de 15 por día, los cortes de 1,5 y 3 ciclos. Están juntos para que confirmarlos sea
// cambiar un renglón, no buscar constantes sueltas por cinco archivos, y para que las
// pantallas expliquen la regla con los MISMOS números que usa la cuenta (nada de puntajes
// opacos: "hace 80 días que no viene y suele volver cada 40").
//
// Dato puro: lo importan el servidor, los componentes cliente y los tests.

export const CRM_REGLAS = {
  /** Ciclo que se usa cuando no hay ni visitas propias ni del servicio para calcularlo. */
  cicloPorDefectoDias: 45,
  /**
   * Bordes del ciclo. Dos visitas el mismo fin de semana (depilación y uñas) darían un ciclo de
   * 2 días y la clienta estaría "en riesgo" al cuarto día; una sola vuelta al año daría un ciclo
   * que nunca vence dentro de la ventana de historial.
   */
  cicloMinimoDias: 7,
  cicloMaximoDias: 365,
  /** Cuántos intervalos de un servicio hacen falta para confiar en su ciclo. */
  intervalosMinimosPorServicio: 3,
  /** "En riesgo": entre 1,5 y 3 ciclos sin volver (los dos bordes adentro). */
  riesgoDesdeCiclos: 1.5,
  /** "Perdida": más de 3 ciclos sin volver. */
  perdidaDespuesDeCiclos: 3,
  /** Cuánta historia mira el motor. Lo de antes no cambia ningún segmento de hoy. */
  ventanaHistorialDias: 548,
  /** Una clienta contactada hace menos de esto no vuelve a la bandeja. */
  contactoRecienteDias: 14,
  /** Cuántos contactos por día propone la bandeja (incluye los ya hechos hoy). */
  topeBandejaPorDia: 15,
  /** Cumpleaños que entran a la bandeja: de hoy a dentro de estos días. */
  cumpleAvisoDias: 7,
  /** Pedir reseña de los turnos completados hace estos días (1 = ayer). */
  resenaDiasAtras: 1,
  /** Cancelaciones que cuentan como "hueco liberado" en la lista de espera. */
  huecoVentanaHoras: 48,
  /** Desde cuántos faltazos se avisa al dar un turno. */
  faltazosParaAviso: 2,
} as const;

export type ReglasCrm = typeof CRM_REGLAS;

/** Por qué una clienta está en la bandeja de hoy. El orden de este arreglo es la prioridad. */
export const MOTIVOS_CONTACTO = ["pasada", "resena", "cumpleanios", "recuperar"] as const;
export type MotivoContacto = (typeof MOTIVOS_CONTACTO)[number];

export function esMotivoContacto(v: unknown): v is MotivoContacto {
  return typeof v === "string" && (MOTIVOS_CONTACTO as readonly string[]).includes(v);
}

/** Cómo se llama cada motivo en pantalla. */
export const MOTIVO_ETIQUETA: Record<MotivoContacto, string> = {
  pasada: "La pasaste desde Por recuperar",
  resena: "Pedir reseña",
  cumpleanios: "Cumpleaños",
  recuperar: "Por recuperar",
};

// ── Constancias en la auditoría (puente sin migrar) ─────────────────────────
//
// Sin columnas en `Client` (eso es migración, 2ª ventana), el contacto y el permiso se
// guardan como filas de `AuditLog` con estas entidades. El permiso es PRUEBA de una baja
// (Ley 25.326): por eso `ConsentimientoCliente` está exenta de la purga de 18 meses
// (audit-retention.ts). El contacto sólo se necesita 14 a 30 días y se purga como todo.

export const ENTIDAD_CONTACTO = "ContactoCliente";
export const ENTIDAD_PERMISO = "ConsentimientoCliente";

/** Acciones de `ContactoCliente`. */
export const ACCION_CONTACTO = "contacto";
export const ACCION_A_BANDEJA = "a_bandeja";
/** Acciones de `ConsentimientoCliente`. */
export const ACCION_BAJA = "baja";
export const ACCION_ALTA = "alta";
