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
//
// Tanda 2B: la misma pieza global pinta, para TODOS (recepción y dueño) y en TODAS las solapas, la cinta roja de la caja
// que quedó sin cerrar («Quedó la caja del 20/10 sin cerrar» · «Cerrar esa caja», que lleva a la Caja). Sale de
// `cajasSinCerrar` del motor (la misma alerta `caja` de las dos bandejas).

import { useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { cajasSinCerrar } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen, RolDelPanel } from "./almacen";
import { operadorActual } from "./operador-del-club";
import { pedidosDeCreditoPendientes } from "./tablero-core";
import EnLaCabecera from "./EnLaCabecera";
import { useOperador, useSeleccion } from "./usar-almacen";

/** «Un pedido de crédito espera tu OK.» · «3 pedidos de crédito esperan tu OK.» · null si no hay ninguno. */
export function textoAvisoDelDuenio(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "Un pedido de crédito espera tu OK." : `${n} pedidos de crédito esperan tu OK.`;
}

const mismo = (_: number | undefined, nuevo: number) => nuevo;
const mismoTexto = (_: string | undefined, nuevo: string) => nuevo;
const ddmm = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;

/** «Quedó la caja del 20/10 sin cerrar.» · «Quedaron 3 cajas sin cerrar (del 18/10 al 20/10).» · null si no hay. */
export function textoCajaSinCerrar(dias: readonly string[]): string | null {
  if (!dias.length) return null;
  return dias.length === 1 ? `Quedó la caja del ${ddmm(dias[0])} sin cerrar.` : `Quedaron ${dias.length} cajas sin cerrar (del ${ddmm(dias[0])} al ${ddmm(dias[dias.length - 1])}).`;
}
/** Los días sin cerrar, en un texto (así la selección compara por valor y sólo repinta si cambian). */
const leerCajaSinCerrar = (e: EstadoClub, a: Ahora) => cajasSinCerrar(e, a).join(",");

/**
 * La cinta roja de la caja sin cerrar, en todas las solapas y para todos (BP-053). `role="alert"`: aparece cuando pasa
 * el corte de las 12 con la caja de ayer abierta. El botón lleva a la Caja, donde se cierra con lo contado.
 */
export function CintaDeCajaSinCerrar({ almacen, irASolapa }: Pick<PropsDelAviso, "almacen" | "irASolapa">) {
  const dias = useSeleccion(almacen, leerCajaSinCerrar, mismoTexto);
  const texto = textoCajaSinCerrar(dias ? dias.split(",") : []);
  if (!texto) return null;
  const una = !dias.includes(",");
  const contenido = (fina: boolean) => (
    <div role="alert" data-ui="caja-sin-cerrar" data-cinta={fina ? "fina" : undefined} className={fina ? "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-sm" : "flex flex-col gap-2 rounded-lg border border-danger/40 bg-danger-soft px-4 py-2 sm:flex-row sm:items-center sm:justify-between"}>
      <p className={fina ? "text-strong" : "text-sm font-semibold text-danger"}>{texto}</p>
      <Button variant="outline" size="md" onClick={() => irASolapa("caja")}>
        {una ? "Cerrar esa caja" : "Cerrar esas cajas"}
      </Button>
    </div>
  );
  return (
    <EnLaCabecera en="casa-cintas" fuera={contenido(false)}>
      {contenido(true)}
    </EnLaCabecera>
  );
}

/** Las props de una pieza global (`PropsDePieza` de la sesión de terminales). `rol` llega pero no decide: manda el operador. */
export interface PropsDelAviso {
  almacen: Almacen;
  rol: RolDelPanel;
  irASolapa: (id: string) => void;
}

export function AvisoDelDuenio({ almacen, irASolapa }: PropsDelAviso) {
  // A quien no es dueño no le llega (como hoy): cuenta 0. Se vuelve a contar cuando cambia quién opera.
  const operador = useOperador(almacen);
  const contar = useCallback(
    (e: EstadoClub) => (operador && operadorActual(almacen).esDuenio ? pedidosDeCreditoPendientes(e) : 0),
    [almacen, operador],
  );
  const n = useSeleccion(almacen, contar, mismo);
  const texto = textoAvisoDelDuenio(n);
  // Con el panel de casa, la cinta ámbar fina de arriba de todo (como el club de hoy); sin él, el cartel de siempre.
  return (
    <>
    <CintaDeCajaSinCerrar almacen={almacen} irASolapa={irASolapa} />
    <EnLaCabecera
      en="casa-cintas"
      fuera={
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
      }
    >
      <div aria-live="polite" data-ui="aviso-del-duenio" data-cinta="fina">
        {texto && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-sm">
            <p className="text-strong">
              <span aria-hidden>🔔 </span>
              {texto}
            </p>
            <button type="button" data-cinta="boton" onClick={() => irASolapa("tablero")} aria-label="Ver y resolver en el Tablero" className="relative rounded-sm border px-3 py-1 text-sm font-semibold">
              Ver y resolver
            </button>
          </div>
        )}
      </div>
    </EnLaCabecera>
    </>
  );
}
