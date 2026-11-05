/**
 * RENDÍ (MIA) — contrato del dominio de rendición de gastos de un proyecto (Core, PURO).
 *
 * Portado y recortado de `origin/frente/rendiciones:src/lib/rendiciones/tipos.ts` (plan
 * `docs/tenants/mia-producciones/PLAN-RENDI.md` §1): sin SAP, haberes, lote contable, motor fiscal ni QR.
 * - PURO: sin Prisma, red, React, `Date.now()` ni `new Date()`. La fecha entra por parámetro.
 * - PLATA EN CENTAVOS ENTEROS (`Centavos`). Nunca float de pesos en el dominio.
 * - Una rendición = un gasto (`ProyectoGasto`) que alguien del equipo pagó (de su bolsillo o con un anticipo).
 * - Persona = `ProyectoPersona` de MIA; los ids que viajan acá son los de quien actúa (userId).
 */

/** Plata en centavos enteros. $1.234,56 = 123456. */
export type Centavos = number;

/** Fecha ISO `AAAA-MM-DD` (o ISO completo). El dominio no usa objetos Date. */
export type FechaISO = string;

/**
 * Con qué se pagó el gasto rendido. ÚNICA fuente de los valores: son los mismos que guarda la base
 * ("ProyectoRendicion"."medio", CHECK `ProyectoRendicion_medio_check` de `20261104121000_rendiciones`; un test lo controla).
 * - PROPIO: de su bolsillo, se le reintegra.
 * - ANTICIPO: con un anticipo; se cierra con la cuadratura del anticipo.
 */
export const MEDIOS_PAGO = ["PROPIO", "ANTICIPO"] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

export type EstadoRendicion = "borrador" | "enviada" | "devuelta" | "rechazada" | "aprobada" | "reintegrada";

export type AccionRendicion =
  | "enviar" // borrador|devuelta → enviada
  | "aprobar" // enviada → aprobada (un nivel: DIRECCION o ADMINISTRACION, nunca quien rinde)
  | "devolver" // enviada → devuelta (con comentario)
  | "rechazar" // enviada → rechazada (con motivo)
  | "reintegrar"; // aprobada → reintegrada (sólo lo pagado de su bolsillo)

/** Roles de gestión que el motor necesita conocer (espejo de `RolGestion`, sin importarlo). */
export type RolActor = "DIRECCION" | "ADMINISTRACION" | "COMERCIAL" | "DISENO" | "PRODUCCION" | "SIN_FICHA";

export interface EventoRendicion {
  fecha: FechaISO;
  actorId: string;
  accion: AccionRendicion;
  comentario?: string;
}

export interface Rendicion {
  id: string;
  gastoId: string;
  /** Quien rinde (userId de su `ProyectoPersona`). */
  rindeId: string;
  medio: MedioPago;
  anticipoId?: string;
  montoCentavos: Centavos;
  estado: EstadoRendicion;
  /** Sólo se agrega (bitácora). */
  eventos: EventoRendicion[];
}

export interface Anticipo {
  id: string;
  montoCentavos: Centavos;
  /** Lo que la persona ya devolvió en efectivo. */
  devueltoCentavos: Centavos;
  /** El faltante que la productora ya le reintegró (gastó más que el anticipo). Sin dato: 0. */
  reintegradoCentavos?: Centavos;
}

export interface Cuadratura {
  anticipado: Centavos;
  /** Gastos pagados con el anticipo YA APROBADOS (aprobada o reintegrada). Lo que espera revisión no cuenta. */
  rendido: Centavos;
  /** Pagados con el anticipo que todavía esperan revisión (borrador, enviada, devuelta): informativo. */
  pendiente: Centavos;
  devuelto: Centavos;
  /** Faltante ya reintegrado por la productora. */
  reintegrado: Centavos;
  /** anticipado + reintegrado − rendido − devuelto. > 0: tiene que devolver; < 0: gastó de más (falta reintegrar). */
  diferencia: Centavos;
  /** Sobrante a devolver (INGRESO «devolución de anticipo»). */
  aDevolver: Centavos;
  /** Lo que la productora TODAVÍA le debe: faltante sin reintegrar + lo de su bolsillo aprobado y no reintegrado. */
  aReintegrar: Centavos;
  cuadra: boolean;
  mensaje: string;
}

export interface ContextoTransicion {
  fecha: FechaISO;
  actorId: string;
  rolActor: RolActor;
  comentario?: string;
}

export type ResultadoTransicion = { ok: true; rendicion: Rendicion } | { ok: false; motivo: string };
