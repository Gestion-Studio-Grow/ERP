"use client";

// ============================================================================
// SeidoritoPlayer — "video" sin video: el personaje lee un guion con la boca sincronizada.
// ============================================================================
//
// Reconstrucción para GSG del `SeidoritoPlayer.tsx` de sap-activate-copiloto (deploy
// `seidorito-console`). El fuente original no se pudo bajar entero de Vercel (ver
// docs/lab/seidorito/README.md), así que se rehízo con la misma técnica y sin sus dependencias de
// SAP Activate (ruta, arte de escenas, progreso de la ruta). Tres capas de voz, en orden:
//   1. audio real pre-generado + visemas de Rhubarb Lip Sync (`audio`)
//   2. voz del navegador (speechSynthesis), escena por escena
//   3. modo lectura: tiempos proporcionales al texto, sin sonido
// En las tres el subtítulo está siempre a la vista y se anuncia a lectores de pantalla.
//
// Pausar y seguir: con audio retoma donde quedó; con voz o lectura retoma desde el comienzo de la
// escena (la voz del navegador no pausa de forma confiable en todos los navegadores).

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { Seidorito } from "./Seidorito";
import {
  bocaEn,
  bocaGenerica,
  duracionLectura,
  elegirVoz,
  escenaEnTiempo,
  parsearVisemas,
  type Boca,
} from "./lipsync";

export type EscenaSeidorito = { texto: string; saluda?: boolean };

export type SeidoritoPlayerProps = {
  titulo: string;
  escenas: readonly EscenaSeidorito[];
  /** Capa 1: pista de audio + el JSON de `rhubarb -f json` (o ya parseado). */
  audio?: { url: string; visemas: unknown };
};

type Estado = "quieto" | "hablando" | "pausado" | "terminado";
type Modo = "audio" | "voz" | "lectura";

function hayVozDelNavegador() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}
const sinSuscripcion = () => () => {};

export function SeidoritoPlayer({ titulo, escenas, audio }: SeidoritoPlayerProps) {
  const cues = useMemo(() => (audio ? parsearVisemas(audio.visemas) : []), [audio]);
  const textos = useMemo(() => escenas.map((e) => e.texto), [escenas]);

  const [estado, setEstado] = useState<Estado>("quieto");
  const [escena, setEscena] = useState(0);
  const [boca, setBoca] = useState<Boca>("X");
  const [conVoz, setConVoz] = useState(true);
  // Cada "Reproducir" o "Desde el principio" es una vuelta nueva: re-dispara la escena aunque el
  // índice no haya cambiado.
  const [vuelta, setVuelta] = useState(0);
  // En el servidor no hay voz; en el navegador, la que haya (sin efecto + setState).
  const vozDisponible = useSyncExternalStore(sinSuscripcion, hayVozDelNavegador, () => false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inicioEscenaRef = useRef(0);
  const moviendoBocaRef = useRef(false);

  const modo: Modo = audio && cues.length > 0 ? "audio" : conVoz && vozDisponible ? "voz" : "lectura";
  const hablando = estado === "hablando";

  // El reloj de la boca: un cuadro por frame mientras habla.
  useEffect(() => {
    if (!hablando) return;
    let raf = 0;
    const cuadro = () => {
      const a = audioRef.current;
      if (modo === "audio" && a) {
        setBoca(bocaEn(cues, a.currentTime));
        setEscena(Math.max(0, escenaEnTiempo(textos, a.duration || 0, a.currentTime)));
      } else {
        const t = (performance.now() - inicioEscenaRef.current) / 1000;
        setBoca(moviendoBocaRef.current ? bocaGenerica(t) : "X");
      }
      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(raf);
  }, [hablando, modo, cues, textos]);

  // Capa 1: el audio grabado manda; la escena sale del tiempo de la pista.
  useEffect(() => {
    const a = audioRef.current;
    if (!hablando || modo !== "audio" || !a) return;
    a.onended = () => setEstado("terminado");
    a.play().catch(() => setEstado("pausado"));
    return () => a.pause();
  }, [hablando, modo, vuelta]);

  // Capas 2 y 3: escena por escena, con la voz del navegador o con tiempos de lectura.
  useEffect(() => {
    if (!hablando || modo === "audio") return;
    const texto = escenas[escena]?.texto;
    if (texto === undefined) return;
    let vigente = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    inicioEscenaRef.current = performance.now();

    const siguiente = () => {
      if (!vigente) return;
      moviendoBocaRef.current = false;
      // Un respiro entre escenas: la boca descansa antes de la próxima frase.
      timer = setTimeout(() => {
        if (escena + 1 < escenas.length) setEscena(escena + 1);
        else setEstado("terminado");
      }, 350);
    };
    const leerEnSilencio = () => {
      inicioEscenaRef.current = performance.now();
      moviendoBocaRef.current = true;
      timer = setTimeout(siguiente, duracionLectura(texto));
    };

    if (modo === "voz") {
      const u = new SpeechSynthesisUtterance(texto);
      const voz = elegirVoz(window.speechSynthesis.getVoices());
      if (voz) u.voice = voz;
      u.lang = voz?.lang ?? "es-AR";
      u.onstart = () => {
        inicioEscenaRef.current = performance.now();
        moviendoBocaRef.current = true;
      };
      u.onend = siguiente;
      // Si la voz falla (sin voces instaladas, bloqueo del navegador) se sigue leyendo en silencio.
      u.onerror = (e) => {
        if (vigente && e.error !== "interrupted" && e.error !== "canceled") leerEnSilencio();
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } else {
      leerEnSilencio();
    }

    return () => {
      vigente = false;
      moviendoBocaRef.current = false;
      if (timer) clearTimeout(timer);
      if (modo === "voz") window.speechSynthesis.cancel();
    };
  }, [hablando, modo, escena, escenas, vuelta]);

  const reproducir = (desdeElPrincipio: boolean) => {
    if (desdeElPrincipio) {
      setEscena(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
    }
    setVuelta((v) => v + 1);
    setEstado("hablando");
  };

  const actual = escenas[escena];

  return (
    <figure className="min-w-0 border border-line bg-surface-raised">
      <div className="grid place-items-center bg-surface-sunken px-4 py-6">
        <Seidorito boca={hablando ? boca : "X"} saluda={actual?.saluda ?? escena === 0} className="h-48 w-auto sm:h-64" />
      </div>
      <figcaption className="space-y-4 p-4">
        <p className="text-[13px] font-semibold text-strong">{titulo}</p>
        <p aria-live="polite" className="min-h-[4.5rem] text-[15px] leading-relaxed text-body">
          {actual?.texto}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {hablando ? (
            <Button variant="solid" size="sm" onClick={() => setEstado("pausado")}>
              Pausar
            </Button>
          ) : (
            <Button
              variant="solid"
              size="sm"
              onClick={() => reproducir(estado !== "pausado")}
              disabled={escenas.length === 0}
            >
              {estado === "pausado" ? "Seguir" : estado === "terminado" ? "Ver de nuevo" : "Reproducir"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => reproducir(true)} disabled={estado === "quieto"}>
            Desde el principio
          </Button>
          {!audio && vozDisponible && (
            <label className="ml-auto inline-flex items-center gap-2 text-[13px] text-body">
              <input
                type="checkbox"
                checked={conVoz}
                disabled={hablando}
                onChange={(e) => setConVoz(e.target.checked)}
              />
              Con voz
            </label>
          )}
        </div>
        <p className="text-[12px] text-muted">
          Escena {Math.min(escena + 1, escenas.length)} de {escenas.length} ·{" "}
          {modo === "audio" ? "audio grabado con boca de Rhubarb" : modo === "voz" ? "voz del navegador" : "modo lectura, sin sonido"}
        </p>
        {audio && <audio ref={audioRef} src={audio.url} preload="auto" className="hidden" />}
      </figcaption>
    </figure>
  );
}
