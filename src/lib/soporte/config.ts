// ============================================================================
// CONSOLA DE SOPORTE GSG — la configuración, en UN solo archivo (T1).
// ============================================================================
//
// Tipos de ticket, prioridades con su tiempo objetivo, estados con sus pasos permitidos y canales.
// Todo es TEXTO en la base (SupportTicket.tipo/prioridad/estado/canal), validado contra estas listas:
// sumar un valor es tocar este archivo, no una migración. En T2 esto pasa a ser parametrizable.
//
// Reglas para tocarlo: sólo se AGREGAN códigos (un ticket viejo con un código borrado se mostraría
// como «otro»); el texto sí se puede cambiar. PURO: lo prueban config.test.ts y tickets-core.test.ts.

import { TIPOS_PEDIDO, TEXTO_PEDIDO, type TipoPedido } from "@/app/contador/pedido-soporte";

// ── Prioridades y tiempos objetivo ──────────────────────────────────────────────────────────────

export const PRIORIDADES = ["P1", "P2", "P3"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

/**
 * Tiempos objetivo en HORAS CORRIDAS (no hábiles) desde que entra el ticket.
 * PROVISIONAL A CONFIRMAR con el dueño: son un punto de partida razonable para un equipo chico.
 */
export const PRIORIDAD: Readonly<Record<Prioridad, { nombre: string; cuando: string; primeraRespuestaHoras: number; resolucionHoras: number }>> = {
  P1: { nombre: "Urgente", cuando: "Frena la facturación, la caja o el cobro", primeraRespuestaHoras: 2, resolucionHoras: 8 },
  P2: { nombre: "Importante", cuando: "Molesta, pero el negocio sigue trabajando", primeraRespuestaHoras: 8, resolucionHoras: 48 },
  P3: { nombre: "Cuando se pueda", cuando: "Un pedido o una consulta sin apuro", primeraRespuestaHoras: 24, resolucionHoras: 120 },
};

/** Cuánto antes del vencimiento se avisa «por vencer» (fracción del tiempo objetivo que queda). */
export const AVISO_POR_VENCER = 0.25;

// ── Tipos ───────────────────────────────────────────────────────────────────────────────────────

/** Los seis pedidos de la ficha del cliente (pedido-soporte.ts) + lo que entra por otros canales. */
export const TIPOS_TICKET = [...TIPOS_PEDIDO, "consulta", "problema", "otro"] as const;
export type TipoTicket = (typeof TIPOS_TICKET)[number];

const PRIORIDAD_DE_PEDIDO: Readonly<Record<TipoPedido, Prioridad>> = {
  // Sin CUIT correcto ni certificado no se puede facturar: frena la facturación.
  corregir_cuit: "P1",
  cargar_certificado: "P1",
  condicion_iva: "P2",
  cuadro_monotributo: "P2",
  asignar_plan: "P2",
  direccion_propia: "P3",
};

export const TIPO: Readonly<Record<TipoTicket, { nombre: string; prioridad: Prioridad }>> = {
  ...(Object.fromEntries(TIPOS_PEDIDO.map((t) => [t, { nombre: TEXTO_PEDIDO[t].pedido, prioridad: PRIORIDAD_DE_PEDIDO[t] }])) as Record<
    TipoPedido,
    { nombre: string; prioridad: Prioridad }
  >),
  consulta: { nombre: "Consulta de uso", prioridad: "P3" },
  problema: { nombre: "Algo no anda", prioridad: "P2" },
  otro: { nombre: "Otro pedido", prioridad: "P3" },
};

// ── Estados ─────────────────────────────────────────────────────────────────────────────────────

export const ESTADOS = ["nuevo", "en_curso", "esperando_cliente", "resuelto", "cerrado"] as const;
export type EstadoTicket = (typeof ESTADOS)[number];

/** Abiertos = los que corren contra el tiempo objetivo. */
export const ESTADOS_ABIERTOS: readonly EstadoTicket[] = ["nuevo", "en_curso", "esperando_cliente"];

export const ESTADO: Readonly<Record<EstadoTicket, { nombre: string; marca: "pendiente" | "medias" | "atencion" | "hecho" | "anulado"; pasa: readonly EstadoTicket[] }>> = {
  nuevo: { nombre: "Nuevo", marca: "atencion", pasa: ["en_curso", "esperando_cliente", "resuelto", "cerrado"] },
  en_curso: { nombre: "En curso", marca: "medias", pasa: ["esperando_cliente", "resuelto", "cerrado"] },
  esperando_cliente: { nombre: "Esperando al cliente", marca: "pendiente", pasa: ["en_curso", "resuelto", "cerrado"] },
  // Reabrir: un resuelto o un cerrado vuelve a «en curso».
  resuelto: { nombre: "Resuelto", marca: "hecho", pasa: ["en_curso", "cerrado"] },
  cerrado: { nombre: "Cerrado", marca: "anulado", pasa: ["en_curso"] },
};

// ── Canales ─────────────────────────────────────────────────────────────────────────────────────

export const CANALES = ["pedido_cartera", "consola", "whatsapp", "mail"] as const;
export type Canal = (typeof CANALES)[number];
export const CANAL: Readonly<Record<Canal, string>> = {
  pedido_cartera: "Pedido desde la ficha de un cliente",
  consola: "Cargado en la consola",
  whatsapp: "WhatsApp",
  mail: "Mail",
};

// ── Largos ──────────────────────────────────────────────────────────────────────────────────────

export const NOTA_INTERNA_MAX = 2000;
export const RESPUESTA_MAX = 2000;
