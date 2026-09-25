// ============================================================================
// INTERRUPTORES — la decisión, pura y testeable sin base.
// ============================================================================
//
// Tres cosas, las tres sin Prisma:
//   · `estadoDesdeFilas`: de las filas de AuditLog de un negocio, qué interruptores están
//     prendidos. Manda la última fila VÁLIDA de cada uno (esFilaDeInterruptorValida): una fila
//     forjada desde la app de un negocio no cuenta, aunque sea más nueva.
//   · `decidirCambioDeInterruptor`: si un operador puede prender o apagar, con la base fresca.
//     El botón de la pantalla no protege nada: esto vuelve a decidir todo en el servidor.
//   · `cambiarInterruptorCon`: el recorrido completo de la action, con la lectura y la escritura
//     inyectadas. La action real (src/lib/operador/interruptores-actions.ts) le pasa la base
//     (interruptores-escritura.server.ts); los tests, dobles en memoria y también la base real.

import type { ModuleRegistry } from "@/modules/registry";
import {
  estadoDeApps,
  mismoConjunto,
  requiereOkDelDuenio,
  type NegocioParaActivar,
} from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import {
  ACCION_DE,
  CANAL_INTERRUPTOR,
  DISENO_NUEVO,
  ENTIDAD_INTERRUPTOR,
  esFilaDeInterruptorValida,
  esInterruptorId,
  INICIO_POR_APPS,
  INTERRUPTORES,
  interruptorPorId,
  operadorDeActor,
  PREFIJO_ACTOR_OPERADOR,
  ACCION_APAGAR,
  ACCION_ENCENDER,
  type AccionInterruptor,
  type FilaDeAuditoria,
  type InterruptorId,
} from "./interruptores";

// ── El estado ────────────────────────────────────────────────────────────────

export interface FilaLeida extends FilaDeAuditoria {
  id: string;
  createdAt: Date;
}

export interface EstadoInterruptor {
  encendido: boolean;
  /** Nombre del operador de la última fila válida, o null si nunca se tocó. */
  quien: string | null;
  cuando: Date | null;
}

export type EstadoInterruptores = Record<InterruptorId, EstadoInterruptor>;

/** Todo apagado: el estado de un negocio que nunca se tocó, o si la lectura falla. */
export function todosApagados(): EstadoInterruptores {
  return Object.fromEntries(
    INTERRUPTORES.map((i) => [i.id, { encendido: false, quien: null, cuando: null }]),
  ) as EstadoInterruptores;
}

/**
 * El estado de cada interruptor: la última fila válida manda (por `createdAt`, y a igual hora por
 * id). Las filas inválidas se descartan ANTES de elegir la última.
 */
export function estadoDesdeFilas(filas: readonly FilaLeida[]): EstadoInterruptores {
  const estado = todosApagados();
  const validas = filas
    .filter(esFilaDeInterruptorValida)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const vistos = new Set<string>();
  for (const f of validas) {
    const id = f.entityId as InterruptorId;
    if (vistos.has(id)) continue;
    vistos.add(id);
    estado[id] = { encendido: f.action === ACCION_ENCENDER, quien: operadorDeActor(f.actor), cuando: f.createdAt };
  }
  return estado;
}

/**
 * El filtro de las filas que cuentan, para la consulta (el panel y la consola usan el mismo). Se
 * vuelve a aplicar en `estadoDesdeFilas`: la consulta acota, la decisión no confía en ella.
 */
export function filtroDeFilasValidas(tenantId: string) {
  return {
    tenantId,
    entity: ENTIDAD_INTERRUPTOR,
    entityId: { in: INTERRUPTORES.map((i) => i.id) as string[] },
    action: { in: [ACCION_ENCENDER, ACCION_APAGAR] },
    channel: CANAL_INTERRUPTOR,
    actor: { startsWith: PREFIJO_ACTOR_OPERADOR },
  };
}

/** ¿El negocio trabaja por apps? Atajo del interruptor más usado. */
export function trabajaPorApps(estado: EstadoInterruptores): boolean {
  return estado[INICIO_POR_APPS].encendido;
}

/** ¿El negocio tiene el diseño nuevo (la piel «Renglón»)? Lo lee src/lib/diseno/diseno.server.ts. */
export function disenoNuevoPrendido(estado: EstadoInterruptores): boolean {
  return estado[DISENO_NUEVO].encendido;
}

// ── La fila que se escribe ───────────────────────────────────────────────────

export interface NuevaFilaDeInterruptor {
  tenantId: string;
  actor: string;
  action: string;
  entity: string;
  entityId: InterruptorId;
  channel: string;
  changes: { antes: "encendido" | "apagado"; despues: "encendido" | "apagado"; gana: string[] };
}

/**
 * La fila de AuditLog de un cambio de interruptor. La escribe SÓLO la action de la consola (y el
 * alta, cuando exista la integrada): lo cierra el trinquete de interruptores-escritura.test.ts.
 * `changes` no lleva motivo ni datos de otros negocios: la Auditoría del negocio muestra un texto
 * fijo de todos modos.
 */
export function filaDeInterruptor(p: {
  tenantId: string;
  interruptor: InterruptorId;
  accion: AccionInterruptor;
  operador: string;
  gana?: readonly string[];
}): NuevaFilaDeInterruptor {
  return {
    tenantId: p.tenantId,
    actor: `${PREFIJO_ACTOR_OPERADOR}${p.operador}`,
    action: ACCION_DE[p.accion],
    entity: ENTIDAD_INTERRUPTOR,
    entityId: p.interruptor,
    channel: CANAL_INTERRUPTOR,
    changes: {
      antes: p.accion === "encender" ? "apagado" : "encendido",
      despues: p.accion === "encender" ? "encendido" : "apagado",
      gana: [...(p.gana ?? [])],
    },
  };
}

// ── La decisión ──────────────────────────────────────────────────────────────

export const CAMBIO_MIENTRAS_MIRABAS =
  "El negocio cambió mientras mirabas: otra pestaña u otra persona le cambió los módulos o este interruptor. " +
  "No se guardó nada. Revisá la vista previa con los datos de ahora y confirmá de nuevo.";

export const PEDIDO_INCOMPLETO = "El pedido llegó incompleto. Recargá la ficha y probá de nuevo.";

/** Lo que llega del formulario de la ficha (todo texto: se valida acá). */
export interface PedidoDeInterruptor {
  tenantId: string;
  interruptor: string;
  accion: string;
  /** Lo que el operador vio: "encendido" | "apagado". */
  visto: string;
  /** Los módulos que el operador vio en la vista previa, o null si no llegaron bien. */
  modulosVistos: readonly string[] | null;
  /** El slug tipeado para confirmar (sólo lo exige un negocio con candado del dueño, CH). */
  slugTipeado: string;
}

/** Quién pide el cambio: lo arma la sesión firmada (src/lib/operator-auth.ts), nunca el formulario. */
export interface OperadorDelCambio {
  nombre: string;
  /** Rol "d" firmado en el token y su nombre igual a OPERADOR_DUENIO hoy. */
  esDuenio: boolean;
}

export interface ContextoFresco {
  operador: OperadorDelCambio;
  /** El nombre del dueño, sólo para el mensaje. */
  duenio: string;
  slug: string | null;
  modulosActuales: readonly string[];
  /** ¿Está prendido hoy, leído de la base recién? */
  encendido: boolean;
  /**
   * Apps del menú de siempre que perdería con el Inicio por apps (vista previa con la base fresca).
   * Sólo frena a un interruptor que cambia las apps (`cambiaLasApps`): el diseño nuevo no quita ninguna.
   */
  appsPerdidas: readonly string[];
}

export type DecisionDeInterruptor =
  | { ok: true; interruptor: InterruptorId; accion: AccionInterruptor; sinCambios: boolean }
  | { ok: false; motivo: string };

export function decidirCambioDeInterruptor(pedido: PedidoDeInterruptor, ctx: ContextoFresco): DecisionDeInterruptor {
  const { interruptor, accion, visto, modulosVistos } = pedido;
  if (
    !esInterruptorId(interruptor) ||
    (accion !== "encender" && accion !== "apagar") ||
    (visto !== "encendido" && visto !== "apagado") ||
    modulosVistos === null
  ) {
    return { ok: false, motivo: PEDIDO_INCOMPLETO };
  }

  // El candado de CH va primero: ni siquiera se le cuenta a otro operador si hay algo que cambiar.
  if (requiereOkDelDuenio(ctx.slug)) {
    // Por el ROL firmado de la sesión, no por el nombre: un operador de OPERADORES nunca es el dueño.
    if (!ctx.operador.esDuenio) {
      return {
        ok: false,
        motivo: `Este negocio es un cliente vivo en producción: sólo el dueño de GSG (${ctx.duenio}) puede prender o apagar sus interruptores.`,
      };
    }
    if (pedido.slugTipeado.trim().toLowerCase() !== (ctx.slug ?? "").trim().toLowerCase()) {
      return { ok: false, motivo: `Para confirmar, escribí exactamente el slug del negocio ("${ctx.slug}").` };
    }
  }

  if ((visto === "encendido") !== ctx.encendido || !mismoConjunto(modulosVistos, ctx.modulosActuales)) {
    return { ok: false, motivo: CAMBIO_MIENTRAS_MIRABAS };
  }

  if ((accion === "encender") === ctx.encendido) {
    return { ok: true, interruptor, accion, sinCambios: true };
  }

  if (accion === "encender" && interruptorPorId(interruptor).cambiaLasApps && ctx.appsPerdidas.length > 0) {
    const n = ctx.appsPerdidas.length;
    return {
      ok: false,
      motivo:
        `Con “${interruptorPorId(interruptor).nombre}” perdería ${n} ${n === 1 ? "app" : "apps"} de su menú de siempre: ` +
        `${ctx.appsPerdidas.join(", ")}. Primero fijá la asignación actual.`,
    };
  }

  return { ok: true, interruptor, accion, sinCambios: false };
}

// ── El recorrido de la action ────────────────────────────────────────────────

export interface DepsDeCambio {
  /** El nombre del operador dueño (OPERADOR_DUENIO). */
  duenio: string;
  /** MODULE_REGISTRY_ENABLED (el gate global). */
  registroGlobal: boolean;
  registry: ModuleRegistry;
  leerNegocio(tenantId: string): Promise<NegocioParaActivar | null>;
  /** El estado de sus interruptores, o null si no se pudo leer (entonces no se escribe nada). */
  leerEstado(tenantId: string): Promise<EstadoInterruptores | null>;
  /**
   * Escribe la fila SÓLO si el negocio sigue como se leyó: los mismos módulos y el interruptor en
   * el mismo estado. `false` = cambió en el medio y no se escribió; `{ motivo }` = no se pudo tomar
   * el candado del negocio a tiempo (no se escribió).
   */
  escribirSiSigueIgual(
    fila: NuevaFilaDeInterruptor,
    condicion: { modules: readonly string[]; encendido: boolean },
  ): Promise<boolean | { motivo: string }>;
}

export type ResultadoDeCambio =
  | { tipo: "hecho"; interruptor: InterruptorId; accion: AccionInterruptor }
  | { tipo: "sin-cambios"; interruptor: InterruptorId; accion: AccionInterruptor }
  | { tipo: "rechazado"; motivo: string }
  | { tipo: "no-existe" };

/**
 * Prender o apagar un interruptor en un negocio, como operador `operador` (lo devuelve
 * `requireOperator()`, nunca el formulario). Relee todo, recalcula la vista previa con la base
 * fresca, decide, y escribe una fila condicional.
 */
export async function cambiarInterruptorCon(
  deps: DepsDeCambio,
  operador: OperadorDelCambio,
  pedido: PedidoDeInterruptor,
): Promise<ResultadoDeCambio> {
  const negocio = await deps.leerNegocio(pedido.tenantId);
  if (!negocio) return { tipo: "no-existe" };
  const estado = await deps.leerEstado(pedido.tenantId);
  if (!estado) {
    return { tipo: "rechazado", motivo: "No se pudo leer el estado de los interruptores de este negocio. No se cambió nada." };
  }
  const id = esInterruptorId(pedido.interruptor) ? pedido.interruptor : INICIO_POR_APPS;
  const encendido = estado[id].encendido;
  const cambiaLasApps = interruptorPorId(id).cambiaLasApps;
  // La vista previa, recalculada acá con la base fresca: la misma función que pinta la ficha. Con
  // el Inicio por apps DE ESTE NEGOCIO como está hoy (para "Trabaja por apps" es `encendido`).
  const apps = estadoDeApps(
    negocio,
    { registroGlobal: deps.registroGlobal, enInicioPorApps: estado[INICIO_POR_APPS].encendido },
    deps.registry,
  );
  const decision = decidirCambioDeInterruptor(pedido, {
    operador,
    duenio: deps.duenio,
    slug: negocio.slug,
    modulosActuales: negocio.modules,
    encendido,
    appsPerdidas: apps.conInicioFrenteAlMenu.pierde.map((a) => a.nombre),
  });
  if (!decision.ok) return { tipo: "rechazado", motivo: decision.motivo };
  if (decision.sinCambios) return { tipo: "sin-cambios", interruptor: decision.interruptor, accion: decision.accion };

  const fila = filaDeInterruptor({
    tenantId: pedido.tenantId,
    interruptor: decision.interruptor,
    accion: decision.accion,
    operador: operador.nombre,
    gana: cambiaLasApps && decision.accion === "encender" ? apps.conInicioFrenteAlMenu.gana.map((a) => a.id) : [],
  });
  const escrito = await deps.escribirSiSigueIgual(fila, { modules: negocio.modules, encendido });
  if (escrito !== true) return { tipo: "rechazado", motivo: escrito === false ? CAMBIO_MIENTRAS_MIRABAS : escrito.motivo };
  return { tipo: "hecho", interruptor: decision.interruptor, accion: decision.accion };
}
