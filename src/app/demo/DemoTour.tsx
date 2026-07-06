"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DemoTour — motor del recorrido interactivo estilo Instagram Stories.
//
// - Marco de teléfono con la app corriendo dentro (escenas de scenes.tsx).
// - Barra de progreso segmentada: el relleno de la escena activa ES el timer del
//   autoplay (al terminar la animación → siguiente). Pausar = pausar la
//   animación (animationPlayState), quedan sincronizados sin timers sueltos.
// - Navegación: tap (izq = atrás / der = adelante), swipe táctil, teclado.
// - Mobile-first (el tráfico viene de Stories). Cero dependencias externas.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  SCENES,
  DEMO_BRAND,
  DEMO_CTA,
  whatsappHref,
  mailtoHref,
} from "./demo-content";
import {
  AgendaScene,
  ReservaScene,
  CajaScene,
  FacturaScene,
  DuenoScene,
  CierreScene,
} from "./scenes";

const SCENE_COMPONENTS = [
  AgendaScene,
  ReservaScene,
  CajaScene,
  FacturaScene,
  DuenoScene,
  CierreScene,
];

export default function DemoTour() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const last = SCENES.length - 1;
  const scene = SCENES[i];
  const Active = SCENE_COMPONENTS[i];

  const go = useCallback(
    (n: number) => {
      setI((prev) => Math.max(0, Math.min(last, n)));
    },
    [last],
  );
  const next = useCallback(() => setI((p) => Math.min(last, p + 1)), [last]);
  const prev = useCallback(() => setI((p) => Math.max(0, p - 1)), []);

  // Teclado (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  // Swipe táctil.
  const [touchX, setTouchX] = useState<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => setTouchX(e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
    setTouchX(null);
  };

  // El relleno de la escena activa terminó → avanzar (salvo en la última).
  const onFillEnd = () => {
    if (i < last) next();
  };

  const onLast = i === last;

  return (
    <main className="demo-stage relative flex min-h-[100dvh] flex-col items-center overflow-hidden px-4 pb-3 pt-4 text-white">
      <StageStyles />

      {/* Header */}
      <header className="z-10 flex w-full max-w-[420px] items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm font-semibold tracking-tight text-white/95">
            {DEMO_BRAND.studio}
          </span>
          <span className="rounded-full border border-white/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/70">
            Demo
          </span>
        </div>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Reanudar" : "Pausar"}
          className="grid size-8 place-items-center rounded-full border border-white/20 text-white/80 transition-colors hover:bg-white/10"
        >
          {paused ? "▶" : "❚❚"}
        </button>
      </header>

      {/* Barra de progreso estilo stories */}
      <div className="z-10 mt-3 flex w-full max-w-[420px] gap-1.5">
        {SCENES.map((s, idx) => (
          <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
            <div
              // key={i} en la activa → reinicia el relleno al cambiar de escena.
              key={idx === i ? `run-${i}` : `static-${idx}`}
              className="h-full rounded-full bg-white"
              style={
                idx < i
                  ? { width: "100%" }
                  : idx === i
                    ? {
                        width: "0%",
                        animation: `demoFill ${scene.seconds}s linear forwards`,
                        animationPlayState: paused ? "paused" : "running",
                      }
                    : { width: "0%" }
              }
              onAnimationEnd={idx === i ? onFillEnd : undefined}
            />
          </div>
        ))}
      </div>

      {/* Escenario: teléfono + zonas de tap */}
      <div className="z-10 mt-4 flex min-h-0 flex-1 flex-col items-center justify-center">
        <div
          className="demo-phone relative w-[clamp(280px,84vw,338px)]"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="h-[clamp(480px,62vh,616px)] overflow-hidden rounded-[2rem]">
            {/* Escena activa remonta con key → sus animaciones de entrada re-corren. */}
            <div key={i} className="h-full">
              <Active />
            </div>
          </div>

          {/* Zonas de tap invisibles (no cubren el CTA, que está debajo). */}
          <button
            type="button"
            aria-label="Anterior"
            onClick={prev}
            className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize"
          />
          <button
            type="button"
            aria-label="Siguiente"
            onClick={next}
            className="absolute inset-y-0 right-0 w-2/3 cursor-e-resize"
          />
        </div>

        {/* Caption bajo el teléfono */}
        <div className="mt-4 max-w-[360px] text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
            {scene.kicker}
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold leading-tight text-white">
            {scene.title}
          </h2>
          <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] leading-relaxed text-white/70">
            {scene.pitch}
          </p>
        </div>
      </div>

      {/* CTA sticky */}
      <div className="z-10 w-full max-w-[420px] pt-3">
        <a
          href={whatsappHref()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] font-semibold text-[color:var(--demo-ink)] shadow-lg transition-transform active:translate-y-px"
        >
          {DEMO_CTA.primaryLabel}
          <span aria-hidden>→</span>
        </a>
        <div className="mt-2 flex items-center justify-center gap-4 text-[12px] text-white/60">
          {onLast ? (
            <button type="button" onClick={() => go(0)} className="underline-offset-2 hover:underline">
              {DEMO_CTA.replayLabel}
            </button>
          ) : (
            <button type="button" onClick={() => go(last)} className="underline-offset-2 hover:underline">
              Saltar al final
            </button>
          )}
          <span className="text-white/25">·</span>
          <a href={mailtoHref()} className="underline-offset-2 hover:underline">
            Escribinos por mail
          </a>
        </div>
      </div>
    </main>
  );
}

// Estilos del escenario y keyframes de las escenas. Se inyectan acá (no en
// globals.css, que es compartido) y quedan namespaceados con prefijo `d`/`demo`.
function StageStyles() {
  return (
    <style>{`
      .demo-stage {
        background:
          radial-gradient(120% 80% at 50% -10%, rgba(95,176,188,0.22), transparent 60%),
          linear-gradient(180deg, #16211f 0%, #101615 55%, #0c100f 100%);
        --demo-ink: #14201f;
      }
      .demo-phone > div:first-child {
        background: var(--surface);
        border: 8px solid #05080a;
        box-shadow: 0 24px 60px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
      }
      @keyframes demoFill { from { width: 0% } to { width: 100% } }
      @keyframes dUp {
        from { opacity: 0; transform: translateY(10px) }
        to { opacity: 1; transform: translateY(0) }
      }
      @keyframes dPop {
        0% { opacity: 0; transform: scale(0.9) }
        70% { opacity: 1; transform: scale(1.03) }
        100% { opacity: 1; transform: scale(1) }
      }
      @keyframes dBar { from { transform: scaleY(0.05); opacity: 0.4 } to { transform: scaleY(1); opacity: 1 } }
      .d-up { animation: dUp 0.5s ease both; }
      .d-pop { animation: dPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both; }
      .d-pick { animation: dPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
      .d-bar { transform-origin: bottom; animation: dBar 0.5s ease both; }
      @media (prefers-reduced-motion: reduce) {
        .d-up, .d-pop, .d-pick, .d-bar { animation-duration: 0.01ms !important; }
        .d-up { transform: none !important; }
      }
    `}</style>
  );
}
