"use client";
// Formulario de alta de la ficha de color. Sólo datos técnicos: no pide salud ni alergias.
import { useActionState, useState } from "react";
import { registrarFichaColor, type EstadoAltaFichaColor } from "@/lib/clientes/ficha-color-actions";
import { OXIDANTES, TOPES } from "@/lib/clientes/ficha-color-core";
import { Field, Input, Select, Textarea, buttonClasses } from "@/components/ui";

export default function AltaFichaColor({ clientId }: { clientId: string }) {
  const [abierta, setAbierta] = useState(false);
  const [estado, accion, guardando] = useActionState<EstadoAltaFichaColor, FormData>(registrarFichaColor, null);
  if (!abierta) {
    return (
      <div>
        <button type="button" onClick={() => setAbierta(true)} className={buttonClasses("outline", "sm")}>
          Anotar color
        </button>
        {estado?.ok && <p role="status" className="mt-2 text-sm text-success">{estado.mensaje}</p>}
      </div>
    );
  }
  return (
    <form action={accion} className="rounded-lg border border-line bg-surface-raised p-4 space-y-4">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tono" htmlFor="fc-tono" required hint="Ej.: 7.1 rubio ceniza.">
          <Input id="fc-tono" name="tono" required maxLength={TOPES.tono} autoComplete="off" />
        </Field>
        <Field label="Profesional" htmlFor="fc-prof" hint="Opcional.">
          <Input id="fc-prof" name="profesional" maxLength={TOPES.profesional} autoComplete="off" />
        </Field>
        <Field label="Oxidante" htmlFor="fc-ox" hint="Opcional.">
          <Select id="fc-ox" name="oxidante" defaultValue="">
            <option value="">Sin oxidante</option>
            {OXIDANTES.map((v) => (
              <option key={v} value={v}>{v} vol.</option>
            ))}
          </Select>
        </Field>
        <Field label="Tiempo de pose (minutos)" htmlFor="fc-pose" hint="Opcional.">
          <Input id="fc-pose" name="tiempoPose" type="number" inputMode="numeric" min={1} max={TOPES.tiempoMax} />
        </Field>
      </div>
      <Field label="Fórmula" htmlFor="fc-formula" required hint="Mezcla y proporciones. Ej.: 30 g 7.1 + 10 g 8.0.">
        <Textarea id="fc-formula" name="formula" required rows={2} maxLength={TOPES.formula} />
      </Field>
      <Field label="Notas técnicas" htmlFor="fc-notas" hint="Del servicio: zona, resultado, qué ajustar la próxima.">
        <Textarea id="fc-notas" name="notas" rows={2} maxLength={TOPES.notas} />
      </Field>
      {estado && !estado.ok && <p role="alert" className="text-sm text-danger">{estado.mensaje}</p>}
      {estado?.ok && <p role="status" className="text-sm text-success">{estado.mensaje}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={guardando} className={buttonClasses("solid", "sm")}>
          {guardando ? "Guardando…" : "Guardar color"}
        </button>
        <button type="button" onClick={() => setAbierta(false)} disabled={guardando} className={buttonClasses("ghost", "sm")}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
