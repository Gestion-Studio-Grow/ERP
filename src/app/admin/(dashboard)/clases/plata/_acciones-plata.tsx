"use client";

// Los botones de plata de un alumno (Plata → Quién debe y A favor, y su Ficha):
// - «Cobrar todo ▾» abre los tres medios y UN toque cobra todas las clases que debe, en una sola
//   transacción (cobrarTodo, M-039/F4 = 3 toques desde Plata).
// - «Recordarle»: el WhatsApp con el detalle de las clases y el alias (recordarDeuda, M-074).
// - «Le devolví»: lo que había quedado a favor se le devolvió en mano (devolverSaldo).

import { useState } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { cobrarTodo, devolverSaldo, recordarDeuda } from "@/lib/padel/acciones";
import { MEDIOS_COBRO, MEDIO_LABEL, pesos, type MedioCobro } from "@/lib/padel/core";
import { ErrorEnLinea, useAccion } from "../alumnos/_usar-accion";

const boton = (v: "solid" | "outline" | "ghost" = "outline") => cn(buttonClasses(v, "lg"), "h-12 w-full justify-center px-3");
const primero = (nombre: string) => nombre.trim().split(/\s+/)[0] || nombre;

export function CobrarTodo({ alumnoId, nombre, total, cantidad }: { alumnoId: string; nombre: string; total: number; cantidad: number }) {
  const { pendiente, error, correr } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const idMedios = `medios-${alumnoId}`;
  const cobrar = (medio: MedioCobro) =>
    correr(
      () => cobrarTodo(alumnoId, medio),
      (r) => `Cobraste ${pesos(r.total)} a ${primero(nombre)} (${r.cantidad} clase${r.cantidad === 1 ? "" : "s"}) · ${MEDIO_LABEL[medio]}`,
      nombre,
      () => setAbierto(false),
    );
  return (
    <div className="grid gap-2" aria-busy={pendiente}>
      <button
        type="button"
        className={boton("solid")}
        aria-expanded={abierto}
        aria-controls={idMedios}
        onClick={() => setAbierto((v) => !v)}
        data-qa="cobrar-todo"
      >
        Cobrar todo · {pesos(total)}
      </button>
      {abierto && (
        <div id={idMedios} role="group" aria-label={`¿Cómo te pagó ${primero(nombre)} las ${cantidad} clases?`} className="grid grid-cols-3 gap-2">
          {MEDIOS_COBRO.map((m) => (
            <button key={m} type="button" disabled={pendiente} className={cn(boton(), "text-sm")} onClick={() => cobrar(m)} data-qa={`cobrar-todo-${m.toLowerCase()}`}>
              {MEDIO_LABEL[m]}
            </button>
          ))}
        </div>
      )}
      <ErrorEnLinea texto={error} />
    </div>
  );
}

export function Recordarle({ alumnoId, nombre }: { alumnoId: string; nombre: string }) {
  const { pendiente, error, correr } = useAccion();
  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={pendiente}
        className={boton()}
        onClick={() => correr(() => recordarDeuda(alumnoId), (r) => `Recordatorio de ${pesos(r.total)} listo`, nombre)}
        data-qa="recordar-deuda"
      >
        Recordarle
      </button>
      <ErrorEnLinea texto={error} />
    </div>
  );
}

export function LeDevolvi({ claseId, nombre, monto }: { claseId: string; nombre: string; monto: number }) {
  const { pendiente, error, correr } = useAccion();
  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={pendiente}
        className={boton()}
        onClick={() => correr(() => devolverSaldo(claseId), `Le devolviste ${pesos(monto)} a ${primero(nombre)}`, nombre)}
        data-qa="devolver-saldo"
      >
        Le devolví {pesos(monto)}
      </button>
      <ErrorEnLinea texto={error} />
    </div>
  );
}
