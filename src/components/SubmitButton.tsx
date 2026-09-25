"use client";

import { useFormStatus } from "react-dom";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { atributosBoton } from "@/components/ui/Button";

// Botón de enviar de un <form> con server action: se deshabilita mientras la action corre.
//
// Diseño de siempre (CH): mientras corre, la palabra cambia a `pendingText` («Guardando…"). Mismo
// HTML de siempre.
// Diseño nuevo (ADR-099): la palabra SE QUEDA y una línea de progreso recorre el borde de abajo
// (`data-estado="cargando"`); `pendingText` lo oye el lector de pantalla. Para que la piel lo
// vista de tecla, el llamador dice qué botón es con `variant`/`size` (los mismos de Button); sin
// eso, sus clases de siempre y, mientras corre, la misma línea de progreso.
export default function SubmitButton({
  children,
  pendingText,
  className,
  variant,
  size,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  variant?: "solid" | "outline" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
}) {
  const { pending } = useFormStatus();
  const nuevo = useDiseno();
  if (!nuevo) {
    return (
      <button type="submit" disabled={pending} className={`${className ?? ""} disabled:opacity-50`}>
        {pending ? pendingText ?? "Guardando…" : children}
      </button>
    );
  }
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={`${className ?? ""} disabled:opacity-50`}
      {...(variant ? atributosBoton(variant, size) : {})}
      data-estado={pending ? "cargando" : undefined}
    >
      {children}
      {pending && <span className="sr-only">{pendingText ?? "Guardando…"}</span>}
    </button>
  );
}
