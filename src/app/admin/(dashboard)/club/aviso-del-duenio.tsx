"use client";

// ============================================================================
// EL AVISO DEL DUEÑO 🔔 — «N pedidos de crédito esperan tu OK», con el botón que lleva al Tablero.
// ============================================================================
//
// Lo mismo que `pintarAvisoDuenio` del sistema de hoy (public/previews/breakpoint/club/app.mjs): sólo a un dueño, sólo
// si hay pedidos de crédito (cuenta corriente o fiado) esperando. Es una PIEZA EXPORTABLE: la monta la sesión de
// terminales arriba de las solapas (lista `PIEZAS_GLOBALES_DEL_CLUB` de solapas-club.ts) con las props de pieza
// `{ almacen, rol, irASolapa }`; el botón llama `irASolapa("tablero")`. Acá no se monta.
//
// La región `aria-live` está siempre montada (un aviso que aparece junto con su región no se anuncia en todos los
// lectores); adentro, el texto y el botón sólo cuando hay algo. Sólo se repinta si cambia la cantidad.

import { useCallback } from "react";
import { Button } from "@/components/ui/Button";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen, RolDelPanel } from "./almacen";
import { operadorActual } from "./operador-del-club";
import { pedidosDeCreditoPendientes } from "./tablero-core";
import { useSeleccion } from "./usar-almacen";

/** «Un pedido de crédito espera tu OK.» · «3 pedidos de crédito esperan tu OK.» · null si no hay ninguno. */
export function textoAvisoDelDuenio(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "Un pedido de crédito espera tu OK." : `${n} pedidos de crédito esperan tu OK.`;
}

const mismo = (_: number | undefined, nuevo: number) => nuevo;

/** Las props de una pieza global (`PropsDePieza` de la sesión de terminales). `rol` llega pero no decide: manda el operador. */
export interface PropsDelAviso {
  almacen: Almacen;
  rol: RolDelPanel;
  irASolapa: (id: string) => void;
}

export function AvisoDelDuenio({ almacen, irASolapa }: PropsDelAviso) {
  // A quien no es dueño no le llega (como hoy): cuenta 0.
  const contar = useCallback((e: EstadoClub) => (operadorActual(almacen).esDuenio ? pedidosDeCreditoPendientes(e) : 0), [almacen]);
  const n = useSeleccion(almacen, contar, mismo);
  const texto = textoAvisoDelDuenio(n);
  return (
    <div aria-live="polite" data-ui="aviso-del-duenio">
      {texto && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-strong">
            <span aria-hidden>🔔 </span>
            {texto}
          </p>
          <Button variant="outline" size="md" onClick={() => irASolapa("tablero")}>
            Ver y resolver en el Tablero
          </Button>
        </div>
      )}
    </div>
  );
}
