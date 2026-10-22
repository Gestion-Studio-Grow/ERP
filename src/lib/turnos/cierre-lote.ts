// STUB 1-B: lo reemplaza 1-A
// ============================================================================
// CERRAR LO PENDIENTE EN LOTE — los tipos y el formato del lote (client-safe).
// ============================================================================
//
// Subconjunto EXACTO de `src/lib/turnos/cierre-lote.ts` de la rama `reing-ch-t1a` (agente 1-A):
// mismos nombres, mismas formas, para que la bandeja (1-B) compile en su rama y, al integrar, el
// archivo de 1-A (que además trae `planCierreEnLote`, `decidirLinea`, `leerLote`…) lo pise sin
// tocar una línea de la pantalla. Acá no hay regla de plata: la decide el servidor de 1-A.

import { roleHasCapability, type Role } from "@/lib/capabilities";

/** Hasta cuántos turnos se cierran de una vez (un sábado entero entra holgado). */
export const TOPE_DEL_LOTE = 50;

/** Qué puede hacer quien mira, calculado en el servidor con sus capacidades. */
export type Permisos = {
  /** agenda:manage — confirmar, cancelar, reprogramar. */
  gestionar: boolean;
  /** agenda:collect — cobrar (además, el veredicto de cada turno). */
  cobrar: boolean;
  /** agenda:complete — terminar y marcar que no vino. */
  terminar: boolean;
  /** agenda:forgive — dar de baja el saldo de un turno (sólo la dueña, D5). */
  perdonar: boolean;
};

export function permisosDeRol(role: Role): Permisos {
  return {
    gestionar: roleHasCapability(role, "agenda:manage"),
    cobrar: roleHasCapability(role, "agenda:collect"),
    terminar: roleHasCapability(role, "agenda:complete"),
    // `agenda:forgive` lo suma 1-A a capabilities.ts; mientras, la dueña.
    perdonar: role === "OWNER",
  };
}

/** ¿Quien mira puede cobrar ESTE turno? (`puedeCobrarEsteTurno`, src/lib/turnos/cobro-mostrador.ts). */
export type Veredicto = { ok: true } | { ok: false; motivo: string };

export type AccionDeCierre = "vino" | "debe" | "no-vino";

/** Una línea del lote tal como la manda la bandeja. */
export type PedidoDeCierre = {
  id: string;
  accion: AccionDeCierre;
  /** Medio del cobro del saldo («vino» con saldo y quien mira cobra). */
  method?: string | null;
  /** Qué pasa con la seña en un «no vino» con plata: «retener» | «devolver». */
  senia?: string | null;
};

/** El nombre del campo de la FormData que lleva el lote (JSON de `PedidoDeCierre[]`). */
export const CAMPO_DEL_LOTE = "items";

/** Arma la FormData de `cerrarTurnosEnLote` (la usa la bandeja; así el formato vive en un solo lugar). */
export function formDataDelLote(pedidos: readonly PedidoDeCierre[]): FormData {
  const fd = new FormData();
  fd.set(CAMPO_DEL_LOTE, JSON.stringify(pedidos));
  return fd;
}

/** Un turno pasado sin cerrar, tal como cruza al navegador (la bandeja «Cerrar lo pendiente»). */
export type TurnoSinCerrar = {
  id: string;
  clienteId: string;
  /** ISO del inicio y del fin. */
  inicio: string;
  fin: string;
  /** Día del turno en la zona del negocio (YYYY-MM-DD), para agrupar. */
  dia: string;
  estado: "PENDING" | "CONFIRMED";
  clienta: string;
  telefono: string;
  servicio: string;
  profesional: string;
  profesionalId: string;
  box: string;
  precio: number;
  /** Plata que entró de verdad (seña y parciales; sin condonaciones). */
  cobrado: number;
  saldo: number;
  /** La seña del catálogo (0 = el servicio no pide seña). */
  senia: number;
  cobros: { amount: number; method: string; note: string | null }[];
  /** ¿Quien mira puede cobrar ESTE turno? Si no, sólo «Terminar y dejar el saldo» (Vero). */
  veredicto: Veredicto;
};

/** Lo que devuelve `turnosSinCerrar()`. */
export type BandejaSinCerrar = {
  /** Del más reciente al más viejo; sin tope de días (un pasado de hace 4 meses también aparece). */
  turnos: TurnoSinCerrar[];
  permisos: Permisos;
  /** Quedaron más de los que se trajeron (tope de la pantalla): cerrá estos y volvé a cargar. */
  hayMas: boolean;
  /** La caja de HOY ya se cerró: un cobro no se puede asentar (las líneas con saldo, a «Debe»). */
  cajaDeHoyCerrada: boolean;
};

/** Lo que devuelve `cerrarTurnosEnLote`: una línea por turno, en el orden del lote. */
export type ResultadoDeLinea = { id: string; ok: boolean; error?: string; aviso?: string };
export type ResultadoDelLote = { resultados: ResultadoDeLinea[]; error?: string };
