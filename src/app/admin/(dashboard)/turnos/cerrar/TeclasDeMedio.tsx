"use client";

// STUB 1-C: lo reemplaza 1-A/1-B — la pieza real la construye 1-B (turnos/cerrar/TeclasDeMedio.tsx)
// con esta misma firma (`TeclasDeMedioProps`). Al integrar gana la de 1-B.
//
// LOS MEDIOS COMO TECLAS — un toque en el medio YA ejecuta (cobra). Ninguno viene elegido: el
// error típico de la fila vieja era cobrar por el medio que venía puesto («Efectivo») y la caja
// cerraba con faltante en una columna y sobrante en otra (B7).

import { Button } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { METODOS_DE_PAGO, METODO_LABEL, type MetodoDePago } from "@/lib/turnos/cobros";

export type TeclasDeMedioProps = {
  /** Lo que pasa al tocar un medio (cobrar, cerrar el lote, abrir la confirmación…). */
  onElegir: (medio: MetodoDePago) => void;
  /** Para el lector de pantalla: «Cobrar $14.000 a Laura Gómez con». */
  etiqueta: string;
  /** `linea`: chicas, en la misma línea del renglón (PC). `grande`: teclas a lo ancho (hoja del celular). */
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
          className={cn(grande && "w-full")}
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
