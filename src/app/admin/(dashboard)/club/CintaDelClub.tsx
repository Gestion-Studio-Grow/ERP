"use client";

// ============================================================================
// LA CINTA DE ARRIBA — qué es esto (la demo o la jornada real) y cómo va el guardado.
// ============================================================================
//
//   · Demo: «Datos de ejemplo — no se guarda nada en el sistema», el reloj de la demo y «Volver a la demo».
//   · Jornada real: el estado del guardado («Guardado en este equipo» / «Sin guardar — reintentando») y la hora; si
//     lo guardado pasa de `AVISO_LLENO` (o no entró), «Lo guardado se está llenando: un dueño tiene que archivar…».
//     Si otra pestaña de este equipo tiene la jornada, lo dice y ofrece «Usar acá» (como el vanilla, que avisaba y
//     no dejaba trabajar en la segunda). Sin Web Locks (navegador viejo), avisa que se use una sola pestaña.
// Se suscribe sola (al guardado por su canal y al minuto del reloj): ClubDemo no se repinta por esto.

import { memo, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { useBloqueo } from "./bloquear-ahora";
import { cn } from "@/components/ui/cn";
import { hhmm } from "@/lib/club/motor.mjs";
import type { Almacen, EstadoDelGuardado } from "./almacen";
import { useEstadoDelGuardado, useSeleccion } from "./usar-almacen";

const elMinuto = (_: unknown, a: { min: number }) => a.min;
const elNuevo = <T,>(_: T | undefined, nuevo: T) => nuevo;

function textoDelGuardado(g: EstadoDelGuardado): string {
  if (g.guardado === "sin-almacenamiento") return "Sin guardar — este navegador no deja guardar en el equipo";
  if (g.guardado === "reintentando") return "Sin guardar — reintentando";
  return g.enEsteEquipo ? "Guardado en este equipo" : "Guardado";
}

/**
 * «Bloquear» (tecla L) a la derecha de la hora: el hook de la sesión del club (bloquear-ahora.tsx); el botón en `md`
 * para que en la tablet de recepción mida 44 px (el `sm` baja a 36 px desde 640 px). En la demo o sin operador, nada.
 * Componente aparte: se suscribe al operador sin repintar la cinta.
 */
const BloquearDesdeLaCinta = memo(function BloquearDesdeLaCinta({ almacen }: { almacen: Almacen }) {
  const { bloquear, puedeBloquear } = useBloqueo(almacen);
  if (!puedeBloquear) return null;
  return (
    <Button variant="outline" size="md" atajo="L" aria-keyshortcuts="L" onClick={bloquear}>
      Bloquear
    </Button>
  );
});

export default function CintaDelClub({
  almacen,
  onVolverALaDemo,
  onIrAArchivar,
}: {
  almacen: Almacen;
  onVolverALaDemo: () => void;
  /** Lleva a Configuración (archivar los días cerrados). Sólo llega si quien mira es dueño y la solapa existe. */
  onIrAArchivar?: () => void;
}) {
  const g = useEstadoDelGuardado(almacen);
  // El minuto es un número: si no cambió, React no repinta la cinta.
  const min = useSeleccion(almacen, elMinuto, elNuevo<number>);
  // «Seguís donde la dejaste» cambia con «Volver a la demo» o al recargar lo guardado.
  const leerRetomada = useCallback(() => almacen.retomada(), [almacen]);
  const retomada = useSeleccion(almacen, leerRetomada, elNuevo<boolean>);

  if (almacen.modo() === "demo") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-strong">Datos de ejemplo — no se guarda nada en el sistema</p>
          <p className="text-body">
            Es la demo del club: lo que toques queda sólo en este equipo, para vos. Reloj de la demo: {hhmm(min)}.
            {retomada ? " Seguís donde la dejaste." : ""}
          </p>
        </div>
        <Button variant="outline" size="md" onClick={onVolverALaDemo}>
          Volver a la demo
        </Button>
      </div>
    );
  }

  if (g.jornada === "otra-pestania") {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-strong">La jornada está abierta en otra pestaña de este equipo</p>
          <p className="text-body">Para no pisar lo cargado, se trabaja en una sola pestaña. Acá podés mirar; para seguir en esta, tocá «Usar acá» (la otra queda sólo para mirar).</p>
        </div>
        <Button variant="solid" size="md" onClick={() => almacen.usarAca()}>
          Usar acá
        </Button>
      </div>
    );
  }

  const mal = g.jornada === "ilegible" || g.jornada === "sin-base" || g.guardado !== "guardado" || g.lleno;
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border px-4 py-3 text-sm", mal ? "border-danger/40 bg-danger-soft" : "border-line bg-surface-raised")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-strong">
          <span className="font-semibold">Jornada real</span> · Hora: <span className="tabular-nums">{hhmm(min)}</span> ·{" "}
          <span role="status">{g.jornada === "abriendo" ? "Abriendo lo guardado…" : g.jornada === "ilegible" ? "Sin guardar — lo guardado no se pudo leer" : g.jornada === "sin-base" ? "No hay conexión con la base — reintentando" : textoDelGuardado(g)}</span>
        </p>
        <BloquearDesdeLaCinta almacen={almacen} />
      </div>
      {g.jornada === "sin-base" && (
        <p className="text-body">Hasta que la base conteste no se puede operar: así no se arranca un club vacío encima de lo guardado. Revisá el wifi; no hace falta recargar.</p>
      )}
      {g.jornada === "sin-bloqueo" && <p className="text-body">Este navegador no puede avisar si el club está abierto en otra pestaña: usá una sola.</p>}
      {/* Lo dice siempre que esté lleno (como el aviso del vanilla): archivar es de un dueño, en Configuración. */}
      {g.lleno && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-strong">Lo guardado se está llenando: un dueño tiene que archivar los días cerrados.</p>
          {onIrAArchivar && (
            <Button variant="outline" size="md" onClick={onIrAArchivar}>
              Archivar los días cerrados
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
