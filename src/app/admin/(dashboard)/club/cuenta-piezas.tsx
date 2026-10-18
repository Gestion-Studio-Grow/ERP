"use client";

// ============================================================================
// PIEZAS DE LA CUENTA DEL TURNO — sumar un jugador y cobrar la cancha (una parte, o cerrarla a cuenta corriente).
// ============================================================================
//
// Ola 1 de paridad con `verReserva` del club vanilla:
//   · «Sumar jugador»: por nombre (Enter o «Sumar») o eligiendo su ficha (desde 2 letras, sin los que ya juegan).
//   · «Cuenta de la cancha»: cobrar un monto (lo que falta de la seña, o todo, ya escrito) y, si el titular tiene
//     cuenta corriente con margen, cerrar la cancha pasando lo que falta a su cuenta.
// Cada pieza tiene su estado (lo que se tipea): tipear no repinta la cuenta ni la agenda. Lo que pasa lo dice la barra
// de avisos del club. Nada se anima: se toca cien veces por día.

import { memo, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { pesos } from "@/lib/club/motor.mjs";
import type { Almacen, Desenlace } from "./almacen";
import { fichasParaSumar, type AccionCuenta, type VistaCuenta } from "./cuenta-core";
import { leerMonto } from "./montos-core";

export const SumarJugador = memo(function SumarJugador({
  almacen,
  reservaId,
  onAccion,
}: {
  almacen: Almacen;
  reservaId: string;
  onAccion: (a: AccionCuenta) => Desenlace;
}) {
  const [texto, setTexto] = useState("");
  const id = useId();
  const fichas = fichasParaSumar(almacen.estado(), reservaId, texto);
  const sumar = (a: AccionCuenta & { tipo: "sumarJugador" }) => {
    if (onAccion(a).ok) setTexto("");
  };
  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-2 border-t border-line pt-3">
      <h3 id={`${id}-t`} className="text-sm font-semibold text-strong">
        Sumar un jugador
      </h3>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          sumar({ tipo: "sumarJugador", nombre: texto, clienteId: null });
        }}
      >
        <Field label="Nombre, o buscá su ficha" htmlFor={id} className="flex-1">
          <Input id={id} value={texto} autoComplete="off" maxLength={60} onChange={(e) => setTexto(e.target.value)} aria-describedby={`${id}-r`} />
        </Field>
        <Button type="submit" variant="outline" size="md" disabled={!texto.trim()}>
          Sumar
        </Button>
      </form>
      <p id={`${id}-r`} className="sr-only" aria-live="polite">
        {texto.trim().length >= 2 ? (fichas.length ? `${fichas.length} fichas que coinciden` : "Ninguna ficha coincide: se suma por el nombre") : ""}
      </p>
      {fichas.length > 0 && (
        <ul aria-label="Fichas que coinciden" className="grid grid-cols-1 gap-1">
          {fichas.map((f) => (
            <li key={f.id}>
              <Button variant="ghost" size="md" className="w-full justify-between!" onClick={() => sumar({ tipo: "sumarJugador", nombre: f.nombre, clienteId: f.id })}>
                <span className="truncate">Sumar a {f.nombre}</span>
                <span className="text-xs text-muted">{f.detalle}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

/** «Cuenta de la cancha»: cobrar un monto y, con cuenta corriente, cerrarla pasando lo que falta. */
export function CobroDeLaCancha({
  cancha,
  titular,
  onCobrar,
  onACuenta,
}: {
  cancha: NonNullable<VistaCuenta["cancha"]>;
  titular: string;
  onCobrar: (monto: number) => Desenlace | null;
  onACuenta: () => void;
}) {
  // null = lo sugerido (cambia solo cuando se cobra algo); un texto = lo que escribió la persona.
  const [escrito, setEscrito] = useState<string | null>(null);
  const id = useId();
  const texto = escrito ?? String(cancha.sugerido);
  // La misma lectura que la caja (montos-core.ts): «$ 12.500», «12.500» y «12500» son lo mismo.
  const monto = leerMonto(texto);
  const valido = monto > 0 && monto <= cancha.saldo;
  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-2 rounded-md border border-line p-3">
      <h3 id={`${id}-t`} className="text-sm font-semibold text-strong">
        Cuenta de la cancha: le quedan <span className="tabular-nums">{pesos(cancha.saldo)}</span>
      </h3>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valido) return;
          if (onCobrar(monto)?.ok) setEscrito(null);
        }}
      >
        <Field
          label="Cobrar una parte (monto)"
          htmlFor={id}
          className="sm:w-48"
          error={texto.trim() && !valido ? `Entre $ 1 y ${pesos(cancha.saldo)}.` : undefined}
        >
          <Input id={id} importe inputMode="numeric" autoComplete="off" value={texto} aria-invalid={!valido || undefined} onChange={(e) => setEscrito(e.target.value)} />
        </Field>
        <Button type="submit" variant="outline" size="md" disabled={!valido}>
          Cobrar {valido ? pesos(monto) : ""} de la cancha
        </Button>
      </form>
      {cancha.aCuenta.ok ? (
        <Button variant="outline" size="md" className="h-auto! min-h-11 whitespace-normal! py-2" onClick={onACuenta}>
          Cerrar la cancha y pasar {pesos(cancha.saldo)} a la cuenta corriente de {titular}
        </Button>
      ) : (
        <p className="text-xs text-muted">Cerrar a cuenta corriente: {cancha.aCuenta.motivo}</p>
      )}
    </section>
  );
}
