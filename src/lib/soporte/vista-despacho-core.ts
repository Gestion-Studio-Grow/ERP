// ============================================================================
// MANTENIMIENTO GSG — cómo se ve el despacho a la IA en la ficha del ticket (MANT-004, diseño §15.2).
// ============================================================================
//
// La ficha del operador muestra el estado del despacho n1 en criollo claro y, si corresponde, el botón
// «Preparar con IA». La acción devuelve un mensaje armado con el resultado de `despacharTicket`; el
// segundo clic no abre otra sesión (lo garantiza el despacho, idempotente por ticket y nivel), sólo
// cambia el mensaje. Lo de acá es PURO: lo prueba vista-despacho-core.test.ts.
// (design-lint: lógica sin interfaz; los textos visibles se arman acá para poder probarlos.)

import { ESTADOS_ABIERTOS } from "./config";
import { quienApruebaElBorrador } from "./agentes-permisos";
import { ESTADOS_ABIERTOS_DE_DESPACHO, type Despacho, type EstadoDeDespacho, type ModoDelMotor } from "./despacho-core";

export const TEXTO_SIN_PREPARAR = "Sin preparar";
export const TEXTO_ESPERANDO = "Esperando a la IA";
export const TEXTO_LISTO = "Borrador listo";
export const TEXTO_NO_RESPONDIO = "La IA no respondió: respondé a mano";
export const TEXTO_APAGADA = "La IA está apagada: respondé a mano";
export const TEXTO_CH = "En este negocio responde una persona: respondé a mano";

/** Lo que la ficha necesita para pintar el despacho. Sólo datos planos (va al componente de cliente). */
export interface VistaDelDespacho {
  /** ¿Se muestra el botón «Preparar con IA»? */
  boton: boolean;
  /** El texto del botón: «Preparar con IA», o «Volver a preparar con IA» si el anterior ya terminó. */
  etiqueta: string;
  /** El estado, en criollo claro. */
  estado: string;
  /** Tipo de la <Marca> del kit: info (sin preparar), pendiente (en curso), hecho (listo), atencion (respondé a mano). */
  tono: "info" | "pendiente" | "hecho" | "atencion";
  /** Enlace a la sesión de Claude, si hay (https, lo valida el despacho al anotarlo). */
  sesionUrl: string | null;
}

const TEXTO_DEL_ESTADO: Record<EstadoDeDespacho, { estado: string; tono: VistaDelDespacho["tono"] }> = {
  pendiente: { estado: TEXTO_ESPERANDO, tono: "pendiente" },
  disparado: { estado: TEXTO_ESPERANDO, tono: "pendiente" },
  listo: { estado: TEXTO_LISTO, tono: "hecho" },
  vencido: { estado: TEXTO_NO_RESPONDIO, tono: "atencion" },
  fallido: { estado: TEXTO_NO_RESPONDIO, tono: "atencion" },
};

/**
 * La vista del despacho n1 de un ticket. Motor apagado o sin la tarea n1 cargada → «apagada», sin botón
 * (no rompe: se responde a mano). CH o negocio sin slug → lo atiende una persona, sin botón. El botón
 * aparece con el motor en manual|automatico, la tarea cargada y el ticket abierto. PURA.
 */
export function vistaDelDespacho(p: {
  modo: ModoDelMotor;
  rutinaCargada: boolean;
  slug: string | null;
  estadoTicket: string;
  despacho: Despacho | null;
}): VistaDelDespacho {
  const sesionUrl = p.despacho?.sesionUrl ?? null;
  const terminado = !!p.despacho && !(ESTADOS_ABIERTOS_DE_DESPACHO as readonly string[]).includes(p.despacho.estado);
  const etiqueta = terminado ? "Volver a preparar con IA" : "Preparar con IA";
  if (p.modo === "apagado" || !p.rutinaCargada) return { boton: false, etiqueta, estado: TEXTO_APAGADA, tono: "atencion", sesionUrl };
  if (quienApruebaElBorrador(p.slug) === "duenio") return { boton: false, etiqueta, estado: TEXTO_CH, tono: "atencion", sesionUrl };
  const abierto = (ESTADOS_ABIERTOS as readonly string[]).includes(p.estadoTicket);
  const base = p.despacho ? TEXTO_DEL_ESTADO[p.despacho.estado] : { estado: TEXTO_SIN_PREPARAR, tono: "info" as const };
  return { boton: abierto, etiqueta, ...base, sesionUrl };
}

/** Lo que devuelve `despacharTicket`, en la forma que lee el mensaje (sin importar el módulo de servidor). */
export type ResultadoParaElMensaje =
  | { ok: false; motivo: string }
  | {
      ok: true;
      creado: boolean;
      despacho: { estado: EstadoDeDespacho };
      disparo:
        | { ok: true; disparado: true; sesionUrl: string | null }
        | { ok: true; disparado: false; motivo: string; estado?: EstadoDeDespacho }
        | { ok: false; apagado: true; motivo: string };
    };

/**
 * El mensaje de «Preparar con IA», en criollo. `ok:false` → el motivo del despacho (permiso, ticket
 * cerrado, CH…), que ya viene en castellano. Un segundo clic con el pedido en curso lo dice y no abre
 * otra sesión. PURA.
 */
export function mensajeDelDespacho(r: ResultadoParaElMensaje): { ok: true; mensaje: string } | { ok: false; error: string } {
  if (!r.ok) return { ok: false, error: `No se pidió a la IA: ${r.motivo}` };
  const d = r.disparo;
  if (!d.ok) return { ok: false, error: `${TEXTO_APAGADA}.` };
  if (d.disparado) {
    return {
      ok: true,
      mensaje: r.creado
        ? "Listo: la IA está preparando el borrador. Aparece en «Respuesta» cuando termine; no le manda nada al cliente."
        : "El pedido estaba en cola y se le volvió a mandar a la IA. No se abrió otro.",
    };
  }
  const estado = d.estado ?? r.despacho.estado;
  if (estado === "listo") return { ok: true, mensaje: "La IA ya dejó el borrador: revisalo en «Respuesta»." };
  if (estado === "fallido" || estado === "vencido") return { ok: false, error: `${TEXTO_NO_RESPONDIO}.` };
  if (!r.creado && estado === "disparado") {
    return { ok: true, mensaje: "Ya se le pidió a la IA y está trabajando: esperá el borrador. No se abrió otro pedido." };
  }
  return { ok: true, mensaje: "La IA no tomó el pedido todavía: queda en cola y se reintenta sola. Si no llega, respondé a mano." };
}

/**
 * La ENTRADA (entrada.server.ts): ¿se intenta despachar n1 al crear el ticket? Sólo con
 * MANT_MOTOR=automatico y sólo si el ticket es NUEVO (el mismo mensaje dos veces no vuelve a despachar;
 * igual el despacho es idempotente). El resto de las reglas (CH, permiso, estado) las aplica el despacho. PURA.
 */
export function despacharAlEntrar(modo: ModoDelMotor, alta: { nuevo: boolean } | { rechazado: true } | { sinTabla: true }): boolean {
  return modo === "automatico" && "nuevo" in alta && alta.nuevo;
}
