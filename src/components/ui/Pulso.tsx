import { cn } from "./cn";

// PULSO — el estado de la conexión como un punto que late, SIEMPRE con palabra:
//   · «En vivo»: lo que se ve es lo último, y lo que se carga llega;
//   · «Sin señal: a salvo»: se cortó internet, lo cargado queda guardado en este aparato;
//   · «Enviando…»: volvió la señal y se está mandando lo guardado.
// Presentacional, sin "use client": la pantalla decide el estado (con `navigator.onLine`, su cola
// de envíos, etc.). `role="status"`: el cambio se anuncia sin interrumpir.

export type EstadoPulso = "vivo" | "sin-senal" | "enviando";

const PALABRA: Record<EstadoPulso, string> = {
  vivo: "En vivo",
  "sin-senal": "Sin señal: a salvo",
  enviando: "Enviando…",
};

export function Pulso({ estado, texto, className }: { estado: EstadoPulso; texto?: string; className?: string }) {
  return (
    <span data-ui="pulso" data-estado={estado} role="status" className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <span
        data-parte="punto"
        aria-hidden
        className={cn(
          "relative inline-block size-2 shrink-0 rounded-full",
          estado === "vivo" ? "bg-success-fill" : estado === "sin-senal" ? "bg-warning-fill" : "bg-accent",
        )}
      />
      {texto ?? PALABRA[estado]}
    </span>
  );
}
