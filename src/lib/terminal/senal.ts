"use client";

// ============================================================================
// EL AVISO DEL MOSTRADOR — un pip cuando el producto entra, otro cuando algo falla.
// ============================================================================
//
// Plan: docs/producto/PLAN-TERMINALES-MOSTRADOR.md §6 T-2. En un mostrador con ruido no se mira
// la pantalla en cada lectura: el oído (o la mano, en el celular) avisa. Cada equipo decide en
// «Este equipo» si suena y si vibra (perfil-core.ts → `sonido`, `vibracion`). Sin el módulo
// `terminal` no hay perfil y `avisar` no hace nada: la pantalla queda como siempre.
//
// Sonido: un oscilador del `AudioContext`, sin archivos de audio y sin dependencias. El contexto
// se crea RECIÉN cuando hace falta, y sólo si la página ya tuvo un gesto de la persona (una tecla,
// un toque): los navegadores no dejan arrancar audio antes, y así no queda un contexto colgado en
// pantallas que nunca suenan. Si el navegador no tiene audio o algo falla, en silencio: el aviso
// es una ayuda, nunca rompe la venta.
//
// Vibración: el `vibrar` de siempre (components/ui/tactil.ts), que ya respeta "menos movimiento"
// y no existe en el iPhone.

import { vibrar } from "@/components/ui/tactil";
import type { PerfilDeTerminal } from "./perfil-core";

export type Senal = "ok" | "error";

type Tono = { hz: number; ms: number };

// OK: un pip agudo y corto. Error: dos tonos graves, descendentes: se distinguen sin mirar.
const TONOS: Readonly<Record<Senal, readonly Tono[]>> = {
  ok: [{ hz: 1320, ms: 70 }],
  error: [
    { hz: 440, ms: 120 },
    { hz: 280, ms: 180 },
  ],
};
const VIBRACION: Readonly<Record<Senal, number | number[]>> = { ok: 40, error: [90, 60, 90] };
const VOLUMEN = 0.18;

type ConstructorDeAudio = new () => AudioContext;

let contexto: AudioContext | null = null;
let sinAudio = false;

/** El contexto de audio, creado la primera vez que hace falta (y después de un gesto). */
function contextoDeAudio(): AudioContext | null {
  if (contexto || sinAudio || typeof window === "undefined") return contexto;
  const activacion = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  // Todavía nadie tocó la página: no se puede (ni conviene) arrancar audio. Se prueba la próxima.
  if (activacion && !activacion.hasBeenActive) return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: ConstructorDeAudio }).webkitAudioContext;
  if (!Ctor) {
    sinAudio = true;
    return null;
  }
  try {
    contexto = new Ctor();
  } catch {
    sinAudio = true;
  }
  return contexto;
}

/** Suena el aviso. En silencio si no hay audio o algo falla. */
export function sonar(senal: Senal): void {
  const ctx = contextoDeAudio();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    let t = ctx.currentTime;
    for (const tono of TONOS[senal]) {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      const dura = tono.ms / 1000;
      osc.type = senal === "ok" ? "sine" : "square";
      osc.frequency.setValueAtTime(tono.hz, t);
      // Entrada y salida de 10 ms: sin el "clic" de cortar la onda de golpe.
      vol.gain.setValueAtTime(0.0001, t);
      vol.gain.exponentialRampToValueAtTime(VOLUMEN, t + 0.01);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + dura);
      osc.connect(vol).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dura + 0.02);
      t += dura + 0.04;
    }
  } catch {
    // El aviso es una ayuda: si el navegador no deja, se sigue sin sonido.
  }
}

/**
 * El aviso según el perfil de ESTE equipo. `null` (el negocio no tiene el módulo `terminal`, o
 * todavía no se leyó el perfil) = nada, como siempre.
 */
export function avisar(senal: Senal, perfil: Pick<PerfilDeTerminal, "sonido" | "vibracion"> | null | undefined): void {
  if (!perfil) return;
  if (perfil.sonido) sonar(senal);
  if (perfil.vibracion) vibrar(VIBRACION[senal]);
}
