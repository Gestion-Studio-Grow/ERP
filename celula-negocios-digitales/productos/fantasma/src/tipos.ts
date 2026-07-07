// Fantasma — tipos del dominio.
// El "turno noche de WhatsApp": atiende fuera de horario, cotiza, agenda y deja tickets calientes.

export type Plan = "BASICA" | "PRO" | "FULL";

export type Intencion = "CONSULTA" | "COTIZACION" | "AGENDA" | "RECLAMO" | "OTRO";

export type EstadoConversacion = "ABIERTA" | "RESUELTA" | "TICKET";

export interface ItemCatalogo {
  sku: string;
  nombre: string;
  precio: number; // ARS
  variantes?: string[];
}

export interface AgendaConfig {
  slotsLibres: string[]; // ISO datetime
  requiereSeña: boolean;
  montoSeña: number; // ARS
}

/** El negocio que contrata Fantasma. */
export interface Cliente {
  id: string;
  nombre: string;
  zonaHoraria: string;
  plan: Plan;
  guion: string; // voz de marca + FAQs (bloque estable → se cachea)
  catalogo: ItemCatalogo[];
  reglasCotizacion: string;
  agenda: AgendaConfig;
  topeTurnosPorConversacion: number; // kill-switch de margen (default 25)
}

/** Uso de tokens de una llamada al LLM (base para el COGS). */
export interface UsoLLM {
  inputUncached: number;
  inputCached: number; // guion/catálogo cacheado (0,1×)
  output: number;
}

export interface Turno {
  rol: "cliente" | "fantasma";
  texto: string;
  uso?: UsoLLM;
  costoUsd?: number;
}

export interface Cotizacion {
  items: { nombre: string; cantidad: number; precioUnit: number }[];
  montoTotal: number;
}

export interface TurnoAgendado {
  slot: string;
  requiereSeña: boolean;
  montoSeña: number;
  mpLink?: string;
  mpEstado?: "PENDIENTE" | "PAGADA";
}

export interface Ticket {
  contacto: string;
  resumen: string;
  intencion: Intencion;
  urgencia: "alta" | "media" | "baja";
  promesa: string; // qué se le prometió al cliente
}

export interface Conversacion {
  id: string;
  clienteId: string;
  contactoFinal: string;
  esOffHours: boolean;
  estado: EstadoConversacion;
  intencion: Intencion;
  turnos: Turno[];
  cotizacion?: Cotizacion;
  agendado?: TurnoAgendado;
  ticket?: Ticket;
  cogsUsd: number;
}

/** Salida estructurada que devuelve el agente por cada turno. */
export interface DecisionTurno {
  mensaje: string;
  intencion: Intencion;
  cotizacion: Cotizacion | null;
  agenda: { slot: string; requiereSeña: boolean } | null;
  escalar: boolean;
  fin: boolean;
}
