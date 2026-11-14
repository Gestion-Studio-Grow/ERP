// ProfeTurnos — ALTA ASISTIDA: ¿el profe que se dio de alta solo ya fue verificado por GSG? Lo PURO.
//
// Un negocio creado por el alta web (fila de auditoría `profeturnos.alta`, alta.server.ts) queda
// PENDIENTE DE VERIFICAR hasta que un operador de GSG confirma su WhatsApp desde la consola (fila
// `profeturnos.verificado`). La última fila de verificación manda: `profeturnos.verificacion.revocada`
// la anula. Sin migración: el estado se deriva del AuditLog, como el plan y los interruptores.
//
// Negocios SIN fila `profeturnos.alta` (el profe de referencia, los negocios viejos, los que dio de
// alta GSG) = "no-aplica": nunca se bloquean.
//
// Las filas de verificación sólo cuentan si las escribió la consola (actor `operator:<nombre>`, canal
// "operador"): una fila con otra firma no abre ni cierra nada.
//
// Lectura que falla (null): el turnero público NO toma pedidos (fail-closed: un profe sin verificar
// no recibe pedidos ni comprobantes de alumnos que no conocemos); el panel del profe NO muestra el
// aviso (no se ensucia el panel de un negocio viejo por una caída de la base).
//
// Lo usan: verificacion.server.ts (lectura del plano del negocio), src/lib/operador/
// verificacion-profe.server.ts (escritura de la consola). Sin base, sin red: verificacion-core.test.ts.

export const ACCION_ALTA = "profeturnos.alta";
export const ACCION_VERIFICADO = "profeturnos.verificado";
export const ACCION_REVOCADA = "profeturnos.verificacion.revocada";
export const ENTIDAD_VERIFICACION = "Tenant";
export const PREFIJO_ACTOR_OPERADOR = "operator:";
export const CANAL_OPERADOR = "operador";

export type EstadoVerificacion = "no-aplica" | "pendiente" | "verificado";

/** Lo que el turnero público le dice al alumno mientras el profe no está verificado. */
export const MENSAJE_TURNERO_EN_VERIFICACION = "Este turnero se está verificando, volvé pronto.";
/** El aviso del panel del profe (/admin/clases) mientras está pendiente. */
export const AVISO_PANEL_EN_VERIFICACION = "Estamos verificando tu WhatsApp: te escribimos desde GSG.";

export interface FilaDeVerificacion {
  id: string;
  action: string;
  actor: string;
  channel: string | null;
  createdAt: Date;
}

/**
 * El `where` de las filas que deciden el estado: del negocio, sobre el propio negocio; el alta, venga
 * de donde venga (cierra), y las decisiones sólo si las firmó la consola. Con `distinct: ["action"]` y
 * orden descendente quedan a lo sumo 3 filas (la última de cada acción): el alta nunca se pierde
 * detrás de muchas decisiones.
 */
export function filtroDeVerificacion(tenantId: string) {
  return {
    tenantId,
    entity: ENTIDAD_VERIFICACION,
    entityId: tenantId,
    OR: [
      { action: ACCION_ALTA },
      { action: { in: [ACCION_VERIFICADO, ACCION_REVOCADA] }, actor: { startsWith: PREFIJO_ACTOR_OPERADOR }, channel: CANAL_OPERADOR },
    ],
  };
}

function esDeLaConsola(f: FilaDeVerificacion): boolean {
  return f.actor.startsWith(PREFIJO_ACTOR_OPERADOR) && f.actor.length > PREFIJO_ACTOR_OPERADOR.length && f.channel === CANAL_OPERADOR;
}

/** El estado, de las filas leídas (en cualquier orden). */
export function estadoDeVerificacion(filas: readonly FilaDeVerificacion[]): EstadoVerificacion {
  if (!filas.some((f) => f.action === ACCION_ALTA)) return "no-aplica";
  const decisiones = filas
    .filter((f) => (f.action === ACCION_VERIFICADO || f.action === ACCION_REVOCADA) && esDeLaConsola(f))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return decisiones[0]?.action === ACCION_VERIFICADO ? "verificado" : "pendiente";
}

/** ¿El turnero público toma pedidos? `null` = la lectura falló → no (fail-closed, ver cabecera). */
export function turneroTomaPedidos(estado: EstadoVerificacion | null): boolean {
  return estado === "no-aplica" || estado === "verificado";
}

/** ¿El panel del profe muestra el aviso? `null` = la lectura falló → no (no se bloquea el panel). */
export function panelMuestraAviso(estado: EstadoVerificacion | null): boolean {
  return estado === "pendiente";
}

export type DecisionDeVerificar = { ok: true } | { ok: false; motivo: string; yaEstaba?: true };

/** ¿La consola puede verificar este negocio ahora? */
export function decidirVerificar(estado: EstadoVerificacion): DecisionDeVerificar {
  if (estado === "no-aplica") return { ok: false, motivo: "Este negocio no se dio de alta desde la web de ProfeTurnos: no hay nada que verificar. No se hizo nada." };
  if (estado === "verificado") return { ok: false, motivo: "Este profe ya estaba verificado. No se hizo nada.", yaEstaba: true };
  return { ok: true };
}

/** La fila que escribe la consola: quién (actor) y cuándo (createdAt + changes.verificadoEl). */
export function filaDeVerificado(tenantId: string, operador: string, ahora: Date) {
  return {
    tenantId,
    actor: `${PREFIJO_ACTOR_OPERADOR}${operador}`,
    action: ACCION_VERIFICADO,
    entity: ENTIDAD_VERIFICACION,
    entityId: tenantId,
    channel: CANAL_OPERADOR,
    changes: { via: "whatsapp", verificadoPor: operador, verificadoEl: ahora.toISOString() },
  };
}
