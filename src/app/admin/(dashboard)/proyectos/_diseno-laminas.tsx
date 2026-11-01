"use client";

// La presentación a pantalla completa: flechas del teclado, botones o deslizar con el dedo. La lámina es el material del cliente, no la pantalla
// del sistema: la oscura usa los tokens del tema oscuro, la editorial es papel claro aunque el panel esté en oscuro, y «colores del cliente», los suyos.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { srcDeImagen, type Lamina } from "@/lib/proyectos/diseno-core";

const PAPEL = { fondo: "#faf8f4", texto: "#1d1d1f" };

function ContenidoLamina({ l, plantilla }: { l: Lamina; plantilla: string }) {
  const clara = plantilla === "EDITORIAL";
  const acento: CSSProperties | undefined = l.colores ? { backgroundColor: l.colores.acento } : undefined;
  const raya = <span aria-hidden style={acento} className={cn("block h-1 w-16 rounded-full", !l.colores && (clara ? "bg-current" : "bg-accent"))} />;
  const titulo = cn("font-bold leading-tight", clara && "font-serif");
  if (l.tipo === "imagen") {
    const src = srcDeImagen(l.imagen);
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={l.titulo} className="max-h-full max-w-full rounded-lg object-contain" /> : <p>Esta imagen ya no está disponible.</p>}
      </div>
    );
  }
  if (l.tipo === "portada" || l.tipo === "cierre") {
    return (
      <div className={cn("flex max-w-4xl flex-col gap-4", clara ? "items-start text-left" : "items-center text-center")}>
        {raya}
        <h1 className={cn(titulo, "break-words text-[clamp(2rem,7vw,4.5rem)]")}>{l.titulo}</h1>
        {l.texto && <p className="break-words text-[clamp(1rem,2.5vw,1.5rem)] opacity-80">{l.texto}</p>}
      </div>
    );
  }
  return (
    <div className="flex max-h-full w-full max-w-4xl flex-col gap-4 overflow-y-auto">
      {raya}
      <h2 className={cn(titulo, "break-words text-[clamp(1.5rem,4.5vw,3rem)]")}>{l.titulo}</h2>
      {l.texto && <p className="whitespace-pre-wrap break-words text-[clamp(1rem,2.2vw,1.5rem)] leading-relaxed">{l.texto}</p>}
      {l.items && (
        <ul className="grid gap-2 text-[clamp(1rem,2.2vw,1.5rem)]">
          {l.items.map((i, n) => <li key={n} className="break-words">{i}</li>)}
        </ul>
      )}
    </div>
  );
}

export function VisorLaminas({ laminas, plantilla, nombre, volverA }: { laminas: readonly Lamina[]; plantilla: string; nombre: string; volverA: string }) {
  const [i, setI] = useState(0);
  const toque = useRef<number | null>(null);
  const router = useRouter();
  const ir = useCallback((n: number) => setI(Math.max(0, Math.min(laminas.length - 1, n))), [laminas.length]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") ir(i + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") ir(i - 1);
      else if (e.key === "Home") ir(0);
      else if (e.key === "End") ir(laminas.length - 1);
      else if (e.key === "Escape") router.push(volverA);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [i, ir, laminas.length, router, volverA]);

  const l = laminas[i];
  if (!l) return null;
  const paleta = l.colores ?? (plantilla === "EDITORIAL" ? PAPEL : null);
  const propio: CSSProperties | undefined = paleta ? { backgroundColor: paleta.fondo, color: paleta.texto } : undefined;
  return (
    <div
      data-theme={plantilla === "CLASICA" ? "dark" : undefined}
      style={propio}
      role="group"
      aria-roledescription="presentación"
      aria-label={nombre}
      onTouchStart={(e) => { toque.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (toque.current === null) return;
        const d = e.changedTouches[0].clientX - toque.current;
        toque.current = null;
        if (Math.abs(d) > 50) ir(i + (d < 0 ? 1 : -1));
      }}
      className={cn("fixed inset-0 z-50 flex flex-col overflow-hidden", !paleta && "bg-surface text-strong")}
    >
      <div aria-live="polite" className={cn("flex min-h-0 flex-1 items-center justify-center p-5 sm:p-12", plantilla === "EDITORIAL" && "justify-start")}>
        <ContenidoLamina l={l} plantilla={plantilla} />
      </div>
      <nav aria-label="Pasar láminas" className="flex items-center justify-between gap-2 p-2 sm:p-3">
        <Link href={volverA} className={buttonClasses("ghost", "md")} style={paleta ? { color: paleta.texto } : undefined}>Cerrar</Link>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Lámina anterior" disabled={i === 0} onClick={() => ir(i - 1)} className="flex size-11 items-center justify-center rounded-lg border border-current text-lg opacity-90 disabled:opacity-30">←</button>
          <span className="min-w-14 text-center text-sm tabular-nums">{i + 1} / {laminas.length}</span>
          <button type="button" aria-label="Lámina siguiente" disabled={i === laminas.length - 1} onClick={() => ir(i + 1)} className="flex size-11 items-center justify-center rounded-lg border border-current text-lg opacity-90 disabled:opacity-30">→</button>
        </div>
      </nav>
    </div>
  );
}
