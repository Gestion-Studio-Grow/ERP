"use client";

// ============================================================================
// TECLAS DE MEDIO — los medios de pago como botones; UN TOQUE EJECUTA.
// ============================================================================
//
// Principio 4 de la reingeniería de CH: botones, no selects, y nada preelegido en la plata. Ningún
// medio viene marcado: hasta que la recepción toca uno no se cobra nada (CH-003), y tocarlo YA
// cobra (sin un segundo «Cobrar»). La usan la bandeja «Cerrar lo pendiente» (en la línea del
// renglón, en la hoja del celular y en la barra del lote) y el cobro del turno (agente 1-C).
//
// Presentacional con estado mínimo: quien la usa decide qué pasa al tocar (`onElegir`) y avisa
// qué medio está corriendo (`enCurso`) para que esa tecla muestre la línea de progreso.

import { Button } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { METODOS_DE_PAGO, METODO_LABEL, type MetodoDePago } from "@/lib/turnos/cobros";

export type TeclasDeMedioProps = {
  /** Lo que pasa al tocar un medio (cobrar, cerrar el lote, abrir la confirmación…). */
  onElegir: (medio: MetodoDePago) => void;
  /** Para el lector de pantalla: «Cobrar $14.000 a Laura Gómez con». */
  etiqueta: string;
  /** `linea`: chicas, en la misma línea del renglón (PC). `grande`: teclas de 52 px, a lo ancho (hoja del celular). */
  tamano?: "linea" | "grande";
  /** El medio que se está cobrando (su tecla muestra el progreso; las demás quedan quietas). */
  enCurso?: MetodoDePago | null;
  disabled?: boolean;
  /** Por defecto, los medios que el sistema acepta hoy (`METODOS_DE_PAGO`). */
  medios?: readonly MetodoDePago[];
  /** Lo que va al final de la fila con el mismo tamaño (p. ej. [Debe]). */
  children?: React.ReactNode;
  className?: string;
};

export default function TeclasDeMedio({
  onElegir,
  etiqueta,
  tamano = "linea",
  enCurso = null,
  disabled = false,
  medios = METODOS_DE_PAGO,
  children,
  className,
}: TeclasDeMedioProps) {
  const grande = tamano === "grande";
  return (
    <div
      role="group"
      aria-label={etiqueta}
      data-ui="teclas-de-medio"
      className={cn(grande ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : "flex flex-wrap items-center gap-1.5", className)}
    >
      {medios.map((m) => (
        <Button
          key={m}
          type="button"
          variant="outline"
          size={grande ? "lg" : "sm"}
          className={cn(grande && "min-h-13 w-full text-base")}
          disabled={disabled || (enCurso !== null && enCurso !== m)}
          estado={enCurso === m ? "cargando" : undefined}
          onClick={() => onElegir(m)}
        >
          {METODO_LABEL[m]}
        </Button>
      ))}
      {children}
    </div>
  );
}
