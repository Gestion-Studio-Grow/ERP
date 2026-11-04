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

/** Con qué se pagó el gasto rendido. */
export type MedioPago = "propio_a_reintegrar" | "efectivo_anticipo";

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
}

export interface Cuadratura {
  anticipado: Centavos;
  /** Gastos pagados con el anticipo (no rechazados). */
  rendido: Centavos;
  devuelto: Centavos;
  /** anticipado − rendido − devuelto. > 0: tiene que devolver; < 0: gastó de más. */
  diferencia: Centavos;
  /** Sobrante a devolver (INGRESO «devolución de anticipo»). */
  aDevolver: Centavos;
  /** Faltante + lo pagado de su bolsillo: lo que la productora le reintegra. */
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
