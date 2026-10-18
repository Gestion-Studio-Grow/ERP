"use client";

// ============================================================================
// PIEZAS DE FORMULARIO DEL CLUB — un campo con su etiqueta, el PIN y un grupo de opciones de 44 px.
// ============================================================================
//
// Las usan Stock, Proveedores y el remito. Mismo estilo que los campos de Clientes y de la Caja (que hoy tienen su
// copia local): etiqueta visible y asociada, control de 44 px, foco visible. El PIN no se muestra ni se autocompleta.

import { useId } from "react";
import { LARGO_PIN, largoPin } from "@/lib/club/motor.mjs";
import type { Rol } from "@/lib/club/motor.mjs";
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

/** El más largo de los PIN (el de dueño): lo que deja escribir el campo cuando no se sabe el rol de quien opera. */
export const LARGO_PIN_MAX = Math.max(LARGO_PIN.duenio, LARGO_PIN.recepcion);

/**
 * El PIN de quien opera: numérico, del largo de su rol (dueño 4, recepción 2; un dueño con el viejo de 2 también entra,
 * porque es más corto), sin mostrarse. Sin `rol`, deja escribir el más largo (como `campoPin` del vanilla): el motor
 * verifica.
 */
export function CampoPin({ quien, rol, value, onChange }: { quien: string | null; rol?: Rol | null; value: string; onChange: (pin: string) => void }) {
  const id = useId();
  const largo = rol ? largoPin(rol) : LARGO_PIN_MAX;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={etiquetaDelClub}>
        {quien ? `PIN de ${quien}` : "Tu PIN"}
      </label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={largo}
        placeholder={"•".repeat(largo)}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, largo))}
        className="sm:w-32"
      />
    </div>
  );
}

/** Un PIN NUEVO (inicial, «cambiar mi PIN»): `largo` números que no se ven ni se autocompletan. */
export function CampoPinNuevo({ label, largo, value, onChange }: { label: string; largo: number; value: string; onChange: (v: string) => void }) {
  return (
    <Campo
      label={label}
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={largo}
      placeholder={"•".repeat(largo)}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, largo))}
      className="sm:w-32"
    />
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
