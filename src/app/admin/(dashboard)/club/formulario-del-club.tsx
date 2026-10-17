"use client";

// ============================================================================
// PIEZAS DE FORMULARIO DEL CLUB — un campo con su etiqueta, el PIN y un grupo de opciones de 44 px.
// ============================================================================
//
// Las usan Stock, Proveedores y el remito. Mismo estilo que los campos de Clientes y de la Caja (que hoy tienen su
// copia local): etiqueta visible y asociada, control de 44 px, foco visible. El PIN no se muestra ni se autocompleta.

import { useId } from "react";
import { Input } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";

export const etiquetaDelClub = "text-sm font-medium text-strong";

/** Un campo de texto con su etiqueta real; `ayuda` va debajo y queda asociada (aria-describedby). */
export function Campo({ label, ayuda, ...props }: { label: string; ayuda?: string } & React.ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={etiquetaDelClub}>
        {label}
      </label>
      <Input id={id} autoComplete="off" aria-describedby={ayuda ? `${id}-ayuda` : undefined} {...props} />
      {ayuda && (
        <p id={`${id}-ayuda`} className="text-sm text-body">
          {ayuda}
        </p>
      )}
    </div>
  );
}

/** El PIN de quien opera: numérico, 2 dígitos, sin mostrarse. */
export function CampoPin({ quien, value, onChange }: { quien: string | null; value: string; onChange: (pin: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={etiquetaDelClub}>
        {quien ? `PIN de ${quien}` : "Tu PIN"}
      </label>
      <Input id={id} type="password" inputMode="numeric" autoComplete="off" maxLength={2} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} className="sm:w-28" />
    </div>
  );
}

/** Una opción entre pocas, como radios nativos (flechas para recorrer) con caras de 44 px. */
export function Opciones<T extends string>({
  leyenda,
  leyendaVisible = true,
  opciones,
  valor,
  onElegir,
}: {
  leyenda: string;
  leyendaVisible?: boolean;
  opciones: readonly { valor: T; etiqueta: string }[];
  valor: T;
  onElegir: (v: T) => void;
}) {
  const nombre = useId();
  return (
    <fieldset className="min-w-0">
      <legend className={leyendaVisible ? cn("mb-1", etiquetaDelClub) : "sr-only"}>{leyenda}</legend>
      <div className="flex flex-wrap gap-2">
        {opciones.map((o) => (
          <label
            key={o.valor}
            className={cn(
              "flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border px-3 text-center text-sm",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
              valor === o.valor ? "border-accent bg-accent-soft font-semibold text-strong" : "border-line-strong bg-surface-raised text-body",
            )}
          >
            <input type="radio" name={nombre} value={o.valor} checked={valor === o.valor} onChange={() => onElegir(o.valor)} className="sr-only" />
            {o.etiqueta}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
