"use client";

// ============================================================================
// EL SONIDO DEL AVISO DE PEDIDO NUEVO — una sola preferencia y un solo «bip» para todo el panel.
// ============================================================================
//
// Lo comparten el aviso de la bandeja (AvisoDePedidosNuevos.tsx) y el chip de la cabecera
// (../ChipDePedidosNuevos.tsx): apagarlo en uno lo apaga en el otro. La preferencia es de ESTE
// navegador (localStorage, una conveniencia por persona y aparato, no un dato del negocio). Se lee
// con useSyncExternalStore: el servidor dice «prendido», el navegador lo que haya guardado, y si el
// almacenamiento no anda vale lo que se eligió en memoria en esta pestaña.

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

/**
 * ¿El chip de la cabecera está montado? Entonces ÉL hace sonar el pedido nuevo, y el aviso de la
 * bandeja sólo lo muestra: el mismo pedido no suena dos veces. Fuera del mostrador boutique (CH y
 * todo negocio con el interruptor apagado) no hay chip y la bandeja suena como siempre.
 */
export const ChipQueSuena = createContext(false);

/** ¿Suena el chip de la cabecera (y no la bandeja)? */
export function useSuenaElChip(): boolean {
  return useContext(ChipQueSuena);
}

/** La clave de siempre (UAT MAGRA 16/10): quien ya lo había apagado en la bandeja lo sigue teniendo apagado. */
export const PREF_SONIDO = "pedidos:sonido-del-aviso";

let sonidoEnMemoria: boolean | null = null;
const oyentes = new Set<() => void>();

function leerPreferencia(): boolean {
  if (sonidoEnMemoria !== null) return sonidoEnMemoria;
  try {
    return window.localStorage.getItem(PREF_SONIDO) !== "0";
  } catch {
    return true;
  }
}

export function guardarPreferenciaDeSonido(prendido: boolean) {
  sonidoEnMemoria = prendido;
  try {
    window.localStorage.setItem(PREF_SONIDO, prendido ? "1" : "0");
  } catch {
    // vale para esta pestaña
  }
  for (const o of oyentes) o();
}

function suscribir(o: () => void) {
  oyentes.add(o);
  // Otra pestaña del mismo panel lo cambió: se toma acá también.
  const alCambiar = (e: StorageEvent) => {
    if (e.key === PREF_SONIDO) {
      sonidoEnMemoria = null;
      o();
    }
  };
  window.addEventListener("storage", alCambiar);
  return () => {
    oyentes.delete(o);
    window.removeEventListener("storage", alCambiar);
  };
}

/** ¿Suena el aviso? (preferencia de este navegador; por defecto, sí). */
export function useSonidoDelAviso(): boolean {
  return useSyncExternalStore(suscribir, leerPreferencia, () => true);
}

/**
 * El contexto de audio, habilitado con el primer toque en la página: el navegador no deja sonar
 * antes. Si no hay audio, queda null y el aviso es sólo visible.
 */
export function useAudioDelAviso(): RefObject<AudioContext | null> {
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    const habilitar = () => {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume().catch(() => undefined);
      } catch {
        // sin audio: queda el aviso visible
      }
    };
    document.addEventListener("pointerdown", habilitar, { once: true });
    return () => document.removeEventListener("pointerdown", habilitar);
  }, []);
  return audio;
}

// ── La notificación del navegador (opt-in, gratis, sin servidor de push) ─────────────────────────
// La pide la persona con su tecla («Avisarme aunque esté en otra ventana»). El permiso es del
// navegador: «no-soportado» o «denied» → no se dibuja nada ni se intenta nada; «default» → se ofrece
// la tecla; «granted» → cada pedido que ENTRA (el mismo criterio del bip) abre una notificación.
// Ojo: con la pestaña escondida el chip NO consulta (Neon, plan gratuito), así que la notificación
// sirve cuando el panel está a la vista pero detrás de otra ventana (WhatsApp, el mail), no en otra
// pestaña del mismo navegador.

export type PermisoDeNotificacion = "no-soportado" | "default" | "granted" | "denied";

const oyentesDelPermiso = new Set<() => void>();

function leerPermiso(): PermisoDeNotificacion {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return "no-soportado";
    const p = window.Notification.permission;
    return p === "granted" || p === "denied" ? p : "default";
  } catch {
    return "no-soportado";
  }
}

function suscribirPermiso(o: () => void) {
  oyentesDelPermiso.add(o);
  return () => {
    oyentesDelPermiso.delete(o);
  };
}

/** El permiso de notificaciones de este navegador. En el servidor, «no-soportado» (no se dibuja nada). */
export function usePermisoDeNotificacion(): PermisoDeNotificacion {
  return useSyncExternalStore(suscribirPermiso, leerPermiso, () => "no-soportado");
}

/** La tecla: pide el permiso. Si el navegador no lo soporta o falla, no pasa nada. */
export async function pedirPermisoDeNotificacion(): Promise<void> {
  try {
    if (leerPermiso() !== "default") return;
    await window.Notification.requestPermission();
  } catch {
    // navegador viejo o bloqueado: queda el chip y el bip
  } finally {
    for (const o of oyentesDelPermiso) o();
  }
}

/**
 * Muestra la notificación del pedido que entró, sólo con el permiso concedido. El toque trae la
 * pestaña al frente y abre el pedido. Cualquier falla se traga: el chip ya lo muestra.
 */
export function notificar(n: { titulo: string; cuerpo: string; href: string; tag: string } | null): void {
  if (!n || leerPermiso() !== "granted") return;
  try {
    const aviso = new window.Notification(n.titulo, { body: n.cuerpo, tag: n.tag, lang: "es-AR" });
    aviso.onclick = () => {
      try {
        window.focus();
      } catch {
        // sin foco: igual se abre
      }
      window.location.assign(n.href);
      aviso.close();
    };
  } catch {
    // Android Chrome no deja `new Notification` sin service worker: queda el chip y el bip
  }
}

/** Un «bip» corto (0,2 s, el de siempre). Si el navegador no lo deja, no pasa nada: el aviso ya está a la vista. */
export function bip(ctx: AudioContext | null) {
  try {
    if (!ctx || ctx.state !== "running") return;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.frequency.value = 880;
    vol.gain.setValueAtTime(0.15, ctx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(vol).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // sin audio: queda el aviso visible
  }
}
