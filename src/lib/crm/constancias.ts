// ============================================================================
// CONSTANCIAS — qué dicen las filas de auditoría de contacto y de permiso. PURO.
// ============================================================================
//
// Puente sin migrar (reglas.ts): el contacto ("se le escribió por WhatsApp") y el permiso
// ("no quiere mensajes") viven como filas de `AuditLog`. Acá se leen, sin base, para que la
// bandeja, la ficha y la difusión decidan con la MISMA lectura.
//
// EL PERMISO: vale el ÚLTIMO evento de cada ficha. Sin eventos, la clienta NO pidió la baja:
// es clienta del negocio y los mensajes 1 a 1 (el turno, el cumpleaños) son parte de esa
// relación. Lo que la ley exige es respetar el retiro en cuanto se pide (Ley 25.326, art. 27),
// y eso es lo que registra "No quiere mensajes". El consentimiento expreso para difusión
// masiva es otra cosa y llega con las columnas de la 2ª ventana.

import { dateStrInBusinessTz } from "@/lib/datetime";
import {
  ACCION_A_BANDEJA,
  ACCION_BAJA,
  ACCION_CONTACTO,
  ENTIDAD_CONTACTO,
  ENTIDAD_PERMISO,
} from "./reglas";

export type EventoConstancia = {
  entity: string;
  action: string;
  entityId: string | null;
  createdAt: Date;
  actor?: string;
};

export type Constancias = {
  /** Último contacto (fecha del negocio "AAAA-MM-DD") por ficha. */
  ultimoContacto: Map<string, string>;
  /** Fichas cuyo último evento de permiso es una baja. */
  bajas: Set<string>;
  /** Fichas pasadas a la bandeja HOY desde "Por recuperar". */
  pasadasHoy: Set<string>;
  /** Cuántos contactos se hicieron hoy (cuentan para el tope del día). */
  contactadasHoy: number;
};

function ordenados(eventos: readonly EventoConstancia[]): EventoConstancia[] {
  return [...eventos].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export function leerConstancias(eventos: readonly EventoConstancia[], hoy: string): Constancias {
  const ultimoContacto = new Map<string, string>();
  const ultimoPermiso = new Map<string, string>();
  const pasadasHoy = new Set<string>();
  let contactadasHoy = 0;
  for (const e of ordenados(eventos)) {
    if (!e.entityId) continue;
    const dia = dateStrInBusinessTz(e.createdAt);
    if (e.entity === ENTIDAD_CONTACTO && e.action === ACCION_CONTACTO) {
      ultimoContacto.set(e.entityId, dia);
      if (dia === hoy) contactadasHoy++;
    } else if (e.entity === ENTIDAD_CONTACTO && e.action === ACCION_A_BANDEJA) {
      if (dia === hoy) pasadasHoy.add(e.entityId);
    } else if (e.entity === ENTIDAD_PERMISO) {
      ultimoPermiso.set(e.entityId, e.action);
    }
  }
  const bajas = new Set([...ultimoPermiso].filter(([, accion]) => accion === ACCION_BAJA).map(([id]) => id));
  return { ultimoContacto, bajas, pasadasHoy, contactadasHoy };
}

/**
 * Cuántas de estas fichas pueden recibir una novedad: las que NO pidieron la baja. Es el número
 * de "Difundir" en Recordatorios, que antes contaba la base entera.
 */
export function contarConPermiso(clientIds: readonly string[], eventos: readonly EventoConstancia[]): number {
  const ultimo = new Map<string, string>();
  for (const e of ordenados(eventos)) {
    if (e.entity === ENTIDAD_PERMISO && e.entityId) ultimo.set(e.entityId, e.action);
  }
  return clientIds.filter((id) => ultimo.get(id) !== ACCION_BAJA).length;
}

/** El último evento de permiso de UNA ficha, para mostrarlo en ella ("pidió no recibir mensajes el …"). */
export function ultimoPermiso(
  eventos: readonly EventoConstancia[],
  clientId: string,
): EventoConstancia | null {
  const suyos = ordenados(eventos).filter((e) => e.entity === ENTIDAD_PERMISO && e.entityId === clientId);
  return suyos.at(-1) ?? null;
}

/** ¿Esta ficha pidió no recibir mensajes? */
export function pidioBaja(eventos: readonly EventoConstancia[], clientId: string): boolean {
  return ultimoPermiso(eventos, clientId)?.action === ACCION_BAJA;
}

/**
 * Al unificar fichas, el permiso que queda es el ÚLTIMO que expresó la persona en CUALQUIERA de
 * sus fichas: si en la ficha duplicada pidió la baja después de haber aceptado en la otra, la
 * baja manda (y al revés). Devuelve la acción a copiar en la ficha que queda, o `null` si la
 * ficha que queda ya tiene la última palabra (o nadie dijo nada).
 */
export function permisoTrasUnificar(
  eventos: readonly EventoConstancia[],
  conservaId: string,
  eliminaIds: readonly string[],
): string | null {
  const ids = new Set([conservaId, ...eliminaIds]);
  const ultimo = ordenados(eventos)
    .filter((e) => e.entity === ENTIDAD_PERMISO && e.entityId !== null && ids.has(e.entityId))
    .at(-1);
  if (!ultimo || ultimo.entityId === conservaId) return null;
  return ultimo.action;
}
