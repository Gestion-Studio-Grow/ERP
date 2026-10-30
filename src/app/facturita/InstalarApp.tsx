"use client";

// Botón «Instalar Facturita» — aparece SÓLO cuando el navegador ofrece instalar (Chrome/Edge en
// Android y en la compu disparan `beforeinstallprompt`). En iPhone ese evento no existe: ahí
// quedan los pasos escritos de la vidriera (Compartir → Agregar a inicio). Si la app ya está
// abierta como instalada, no muestra nada. Botón a la escala de la vidriera (clases `fx-btn` de piel.ts).

import { useEffect, useState, useSyncExternalStore } from "react";

const CONSULTA_STANDALONE = "(display-mode: standalone)";

function suscribirStandalone(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA_STANDALONE);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

type EventoInstalar = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [recienInstalada, setInstalada] = useState(false);
  const abiertaComoApp = useSyncExternalStore(
    suscribirStandalone,
    () => window.matchMedia(CONSULTA_STANDALONE).matches,
    () => false,
  );
  const instalada = recienInstalada || abiertaComoApp;

  useEffect(() => {
    const alOfrecer = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const alInstalar = () => {
      setInstalada(true);
      setEvento(null);
    };
    window.addEventListener("beforeinstallprompt", alOfrecer);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alOfrecer);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  if (instalada) {
    return (
      <p role="status" className="text-base font-medium text-success">
        Ya la tenés instalada en este equipo.
      </p>
    );
  }
  if (!evento) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await evento.prompt();
        const { outcome } = await evento.userChoice;
        if (outcome === "accepted") setInstalada(true);
        setEvento(null);
      }}
      className="fx-btn fx-btn--2"
    >
      Instalar Facturita en este equipo
    </button>
  );
}
