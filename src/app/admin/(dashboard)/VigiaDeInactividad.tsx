"use client";

// Vigía de inactividad del panel (certificación GSG-SEG-004). Los sondeos automáticos (chip de pedidos, bandeja,
// agenda) renuevan la cookie en el proxy; sin este vigía una PC abandonada con el panel abierto no pedía nunca el PIN.
// Mide el uso REAL (teclado, mouse, toque, rueda) compartido entre pestañas y, a los 15 min sin uso, le pide al
// servidor que bloquee la cookie y va a la pantalla del PIN. No dibuja nada. Reglas puras: src/lib/sesion-vigia.ts.

import { useEffect } from "react";
import { CLAVE_ULTIMO_USO, debeBloquearPorInactividad, ultimoUsoMasReciente } from "@/lib/sesion-vigia";

const REVISAR_CADA_MS = 30_000;
const GUARDAR_CADA_MS = 15_000;

function leerGuardado(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_ULTIMO_USO);
  } catch {
    return null;
  }
}

export default function VigiaDeInactividad() {
  useEffect(() => {
    let propio = Date.now();
    let guardadoEn = 0;
    let bloqueando = false;
    const alUsar = () => {
      propio = Date.now();
      if (propio - guardadoEn < GUARDAR_CADA_MS) return;
      guardadoEn = propio;
      try {
        window.localStorage.setItem(CLAVE_ULTIMO_USO, String(propio));
      } catch {
        // sin almacenamiento: cuenta sólo esta pestaña
      }
    };
    const revisar = async () => {
      const ahora = Date.now();
      if (bloqueando || !debeBloquearPorInactividad(ultimoUsoMasReciente(propio, leerGuardado(), ahora), ahora)) return;
      bloqueando = true;
      try {
        await fetch("/admin/login/bloquear", { method: "POST", credentials: "same-origin", cache: "no-store" });
      } catch {
        // sin red: igual se va a la pantalla del PIN; el servidor la bloquea solo a los 15 min sin sondeos
      }
      const next = window.location.pathname + window.location.search;
      window.location.assign(`/admin/login/desbloquear?next=${encodeURIComponent(next)}`);
    };
    const eventos = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of eventos) window.addEventListener(e, alUsar, { passive: true, capture: true });
    alUsar();
    const id = window.setInterval(() => void revisar(), REVISAR_CADA_MS);
    return () => {
      window.clearInterval(id);
      for (const e of eventos) window.removeEventListener(e, alUsar, { capture: true });
    };
  }, []);
  return null;
}
