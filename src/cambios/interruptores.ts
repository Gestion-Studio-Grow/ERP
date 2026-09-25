// ============================================================================
// INTERRUPTORES POR NEGOCIO — el catálogo (código) y las constantes de su fila.
// ============================================================================
//
// Un interruptor prende algo NUEVO en un negocio que ya lo tiene instalado: cambia cómo se ve
// o se trabaja, sin deploy. Nunca da acceso a datos de otro negocio ni instala funcionalidad:
// eso sigue siendo un módulo (`Tenant.modules`), que es lo que se vende.
//
// El estado vive en AuditLog, sin tabla nueva: una fila por cambio, con
//   entity "Interruptor", entityId = id del interruptor,
//   action "interruptor.encender" | "interruptor.apagar",
//   actor "operator:<nombre>", channel "operador".
// Manda la última fila válida (mismo patrón que el cierre del mes, cierre-mes.ts:98-99).
//
// Quién puede escribirla: SÓLO la consola del operador (src/lib/operador/interruptores-escritura.server.ts,
// que llama únicamente la action interruptores-actions.ts después de `requireOperator()`) y, cuando
// exista el alta integrada, scripts/provision-tenant.ts. Lo cierra el trinquete de
// src/cambios/interruptores-escritura.test.ts. `audit()` la rechaza (audit-core.ts) y la lectura
// ignora toda fila que no sea de un operador por el canal del operador: una fila forjada desde la
// app de un negocio no prende nada (ya pasó con CierreDiario, audit-core.ts:13-17).
//
// Client-safe: sin Prisma ni nada de servidor. Lo importan el panel, la consola y audit-core.

/** La entidad de AuditLog que guarda el estado de los interruptores. */
export const ENTIDAD_INTERRUPTOR = "Interruptor";
/** El único canal que cuenta: el de la consola del operador. */
export const CANAL_INTERRUPTOR = "operador";
/** El prefijo de actor que cuenta: un operador con nombre (`operator:<nombre>`). */
export const PREFIJO_ACTOR_OPERADOR = "operator:";

export const ACCION_ENCENDER = "interruptor.encender";
export const ACCION_APAGAR = "interruptor.apagar";

export type AccionInterruptor = "encender" | "apagar";

export const ACCION_DE: Record<AccionInterruptor, string> = {
  encender: ACCION_ENCENDER,
  apagar: ACCION_APAGAR,
};

export interface Interruptor {
  id: string;
  /** Cómo se llama en la consola. */
  nombre: string;
  /** Qué cambia en el negocio, en una línea para la ficha. */
  queCambia: string;
  /** Qué se nombra en la Auditoría del negocio: "GSG activó <esto>". */
  enAuditoria: string;
  /**
   * ¿Prenderlo cambia QUÉ APPS ve cada persona? Sólo esos muestran la vista previa de apps en la
   * ficha y exigen 0 apps perdidas para prenderse (`decidirCambioDeInterruptor`). Uno que sólo
   * cambia cómo se ve no le quita nada a nadie: no se frena por apps.
   */
  cambiaLasApps: boolean;
}

/** El catálogo. El primero reemplaza a la variable de deploy APPS_INICIO (retirada). */
export const INTERRUPTORES = [
  {
    id: "inicio-por-apps",
    nombre: "Trabaja por apps",
    queCambia:
      "El Inicio por apps y la barra por módulos: sus módulos deciden qué apps ve cada persona. Apagado, ve el menú de siempre.",
    enAuditoria: "el Inicio por apps",
    cambiaLasApps: true,
  },
  {
    // La piel «Renglón» (src/lib/diseno/): `data-diseno="renglon"` en la raíz del panel,
    // del ingreso, del panel del contador y de Facturita de ESTE negocio. Apagado, esas raíces
    // rinden el HTML de siempre (src/lib/diseno/raices-ch.test.ts).
    id: "diseno-nuevo",
    nombre: "Diseño nuevo",
    queCambia:
      "El diseño nuevo en su panel: botones, cifras y pantallas renovados, con las mismas apps y los mismos datos. Apagado, se ve como siempre.",
    enAuditoria: "el diseño nuevo",
    cambiaLasApps: false,
  },
] as const satisfies readonly Interruptor[];

export type InterruptorId = (typeof INTERRUPTORES)[number]["id"];

export const INICIO_POR_APPS: InterruptorId = "inicio-por-apps";

/** La piel «Renglón», por negocio (src/lib/diseno/diseno.server.ts la lee en cada pedido). */
export const DISENO_NUEVO: InterruptorId = "diseno-nuevo";

export function esInterruptorId(id: unknown): id is InterruptorId {
  return typeof id === "string" && INTERRUPTORES.some((i) => i.id === id);
}

export function interruptorPorId(id: InterruptorId): Interruptor {
  return INTERRUPTORES.find((i) => i.id === id) as Interruptor;
}

/**
 * Entidades de AuditLog que `audit()` (la escritura de la app de un negocio) no puede escribir.
 * Normaliza mayúsculas y espacios: "interruptor " tampoco pasa.
 */
export function entidadReservadaDeLaConsola(entity: string): boolean {
  return entity.trim().toLowerCase() === ENTIDAD_INTERRUPTOR.toLowerCase();
}

// ── Qué fila cuenta ─────────────────────────────────────────────────────────────────────────

/** Lo que hace falta de una fila de AuditLog para decidir si es un interruptor válido. */
export interface FilaDeAuditoria {
  entity: string;
  entityId: string | null;
  action: string;
  actor: string;
  channel: string | null;
}

/**
 * ¿Esta fila es un cambio de interruptor escrito por la consola? Entidad, id del catálogo, acción
 * conocida, actor `operator:<nombre>` con nombre, y canal "operador". Una fila de `audit()` (canal
 * admin o public) nunca cumple, aunque diga entity "Interruptor".
 */
export function esFilaDeInterruptorValida(f: FilaDeAuditoria): boolean {
  return (
    f.entity === ENTIDAD_INTERRUPTOR &&
    esInterruptorId(f.entityId) &&
    (f.action === ACCION_ENCENDER || f.action === ACCION_APAGAR) &&
    f.channel === CANAL_INTERRUPTOR &&
    f.actor.startsWith(PREFIJO_ACTOR_OPERADOR) &&
    f.actor.length > PREFIJO_ACTOR_OPERADOR.length
  );
}

/** "operator:facu" → "facu"; cualquier otro actor → null. */
export function operadorDeActor(actor: string): string | null {
  return actor.startsWith(PREFIJO_ACTOR_OPERADOR) && actor.length > PREFIJO_ACTOR_OPERADOR.length
    ? actor.slice(PREFIJO_ACTOR_OPERADOR.length)
    : null;
}

/**
 * Lo que la Auditoría del NEGOCIO muestra de una fila de interruptor: un texto fijo, sin el nombre
 * del operador, sin motivo y sin nada de otros negocios ("GSG activó el Inicio por apps"). `null`
 * si la fila no es un interruptor válido (se muestra como cualquier otra).
 */
export function textoDeInterruptorEnAuditoria(f: FilaDeAuditoria): string | null {
  if (!esFilaDeInterruptorValida(f)) return null;
  const i = interruptorPorId(f.entityId as InterruptorId);
  return `GSG ${f.action === ACCION_ENCENDER ? "activó" : "apagó"} ${i.enAuditoria}`;
}
