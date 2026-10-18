"use client";

// ============================================================================
// PIEZAS DEL CLUB — lo que comparten la cuenta del turno, el buffet y la caja.
// ============================================================================
//
//   · `ComoPaga`: el medio de pago como grupo de radios de 44 px (efectivo, Mercado Pago, transferencia, débito y,
//     si el cliente tiene, sus créditos).
//   · `ConfirmarCreditos`: el paso previo de «Créditos del cliente» que validó el dueño — de quién son, cuánto se
//     usa, qué cubre (si queda pagada la seña) y con cuánto queda — con «Sí, usar» y «No, elegir otro medio».
//   · `AvisosDelClub`: el aviso de la última acción en un solo lugar (role="status" / role="alert") con
//     «Deshacer» cuando se puede. Las dos regiones están siempre montadas: un aviso que aparece junto con su
//     región no se anuncia en todos los lectores.
// Nada se anima: se toca cien veces por día.

import { useCallback, useId } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { Almacen, AvisoDelClub } from "./almacen";
import { ETIQUETA_MEDIO, MEDIOS_CAJA, type MedioCobro } from "./cuenta-core";
import { useSeleccion } from "./usar-almacen";

export function ComoPaga({
  medio,
  onElegir,
  conCreditos = 0,
  leyenda = "Cómo paga",
  angosto = false,
}: {
  medio: MedioCobro;
  onElegir: (m: MedioCobro) => void;
  /** Si es > 0, se ofrecen «Créditos del cliente» con el saldo a la vista. */
  conCreditos?: number;
  leyenda?: string;
  /** En el panel angosto van de a dos aunque la pantalla sea ancha. */
  angosto?: boolean;
}) {
  const nombre = useId();
  const medios: MedioCobro[] = conCreditos > 0 ? [...MEDIOS_CAJA, "monedero"] : [...MEDIOS_CAJA];
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-medium text-strong">{leyenda}</legend>
      <div className={cn("grid grid-cols-2 gap-2", !angosto && "sm:grid-cols-4", angosto && "sm:grid-cols-4 lg:grid-cols-2")}>
        {medios.map((m) => (
          <label
            key={m}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-sm",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
              medio === m ? "border-accent bg-accent-soft font-semibold text-strong" : "border-line-strong bg-surface-raised text-body",
            )}
          >
            <input type="radio" name={nombre} value={m} checked={medio === m} onChange={() => onElegir(m)} className="sr-only" />
            {ETIQUETA_MEDIO[m]}
            {m === "monedero" ? ` (${pesos(conCreditos)})` : ""}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export type DatosConfirmacion = { de: string; que: string; usa: number; creditos: number; quedan: number; cubreSena: boolean };

export function ConfirmarCreditos({ datos, onSi, onNo }: { datos: DatosConfirmacion; onSi: () => void; onNo: () => void }) {
  const titulo = useId();
  return (
    <div role="group" aria-labelledby={titulo} className="flex flex-col gap-3 rounded-md border border-accent bg-accent-soft p-3">
      <p id={titulo} className="font-semibold text-strong">
        ¿Usamos los créditos de {datos.de}?
      </p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular-nums">
        <dt className="text-muted">{datos.que}</dt>
        <dd className="text-right text-strong">{pesos(datos.usa)}</dd>
        <dt className="text-muted">Créditos hoy</dt>
        <dd className="text-right text-strong">{pesos(datos.creditos)}</dd>
        <dt className="font-semibold text-strong">Le quedan</dt>
        <dd className="text-right font-semibold text-strong">{pesos(datos.quedan)}</dd>
      </dl>
      {datos.cubreSena && <p className="text-sm text-strong">Con esto queda pagada la seña del turno.</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="solid" size="md" onClick={onSi}>
          Sí, usar {pesos(datos.usa)} de créditos
        </Button>
        <Button variant="outline" size="md" onClick={onNo}>
          No, elegir otro medio
        </Button>
      </div>
    </div>
  );
}

const sinCompartir = (_: AvisoDelClub | null | undefined, nuevo: AvisoDelClub | null) => nuevo;

export function AvisosDelClub({ almacen }: { almacen: Almacen }) {
  const leer = useCallback(() => almacen.aviso(), [almacen]);
  const aviso = useSeleccion(almacen, leer, sinCompartir);
  return (
    <div className="sticky bottom-0 z-40 -mx-1 px-1 pb-2">
      <div className={cn("flex flex-col gap-2 rounded-lg border px-4 py-2 sm:flex-row sm:items-center sm:justify-between", aviso ? "border-line-strong bg-surface-raised shadow-raised" : "border-transparent")}>
        <div className="min-w-0 text-sm font-medium">
          <p role="status" className="text-success">
            {aviso?.ok ? aviso.mensaje : ""}
          </p>
          <p role="alert" className="text-danger">
            {aviso && !aviso.ok ? aviso.mensaje : ""}
          </p>
        </div>
        {aviso?.deshacer && (
          <Button variant="outline" size="md" onClick={() => almacen.deshacer()}>
            Deshacer
          </Button>
        )}
      </div>
    </div>
  );
}
