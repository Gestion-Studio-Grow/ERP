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
import EnLaCabecera from "./EnLaCabecera";

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
 * Con el panel de casa va adentro del candado de la barra (MenuDeLaCasa), como el club de hoy.
 * Componente aparte: se suscribe al operador sin repintar la cinta.
 */
const BloquearDesdeLaCinta = memo(function BloquearDesdeLaCinta({ almacen, enMenu = false }: { almacen: Almacen; enMenu?: boolean }) {
  const { bloquear, puedeBloquear } = useBloqueo(almacen);
  if (!puedeBloquear) return null;
  if (enMenu)
    return (
      <button type="button" aria-keyshortcuts="L" onClick={bloquear} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-sm px-3 text-left text-sm font-semibold hover:bg-surface-sunken">
        Bloquear la pantalla <kbd aria-hidden="true" className="rounded-sm border border-line px-1.5 text-xs font-normal text-muted">L</kbd>
      </button>
    );
  return (
    <Button variant="outline" size="md" atajo="L" aria-keyshortcuts="L" onClick={bloquear}>
      Bloquear
    </Button>
  );
});

/**
 * La hora grande de la barra, como el reloj del club de hoy; abajo, chiquito, cómo va el guardado. En la demo, a los
 * costados, −30′ y +30′ corren el reloj para probar lo que pasa a otra hora (la falta, el fin del turno).
 */
function RelojDeLaBarra({ min, estado, onCorrer }: { min: number; estado?: string; onCorrer?: (minutos: number) => void }) {
  const hora = (
    <span className="flex flex-col items-center leading-none">
      <span data-casa="reloj" className="tabular-nums">{hhmm(min)}</span>
      {estado && (
        <span data-casa="tenue" className="mt-0.5 text-[11px]">
          {estado}
        </span>
      )}
    </span>
  );
  if (!onCorrer) return hora;
  return (
    <span data-casa="reloj-demo" className="flex items-center gap-0.5">
      <button type="button" data-casa="enlace" onClick={() => onCorrer(-30)} aria-label="Atrasar el reloj de la demo 30 minutos" className="min-h-11 rounded-md px-2 text-sm font-semibold">
        −30′
      </button>
      {hora}
      <button type="button" data-casa="enlace" onClick={() => onCorrer(30)} aria-label="Adelantar el reloj de la demo 30 minutos" className="min-h-11 rounded-md px-2 text-sm font-semibold">
        +30′
      </button>
    </span>
  );
}

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
      <>
      <EnLaCabecera fuera={null}>
        <RelojDeLaBarra min={min} onCorrer={(m) => almacen.correrRelojDemo(m)} />
      </EnLaCabecera>
      {/* Con el panel de casa, la cinta negra fina de arriba de todo, como el club de hoy; sin él, el cartel de siempre. */}
      <EnLaCabecera
        en="casa-cintas"
        fuera={
      <div data-ui="cinta-demo" className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
        }
      >
        <div data-ui="cinta-demo" data-cinta="fina" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1 text-[0.8125rem]">
          <p>
            <b>Demo de la gestión del club</b> · datos de ejemplo · no se guarda nada en el sistema
          </p>
          <button type="button" onClick={onVolverALaDemo} data-cinta="boton" className="relative rounded-sm border px-2.5 py-0.5 text-xs font-semibold">
            Reiniciar demo
          </button>
        </div>
      </EnLaCabecera>
      </>
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
  // Todo en orden: la hora, el guardado y el candado van en la barra de arriba (si la hay), como el club de hoy. Si
  // algo anda mal, además el aviso queda a la vista abajo.
  const barra = (
    <>
      <RelojDeLaBarra min={min} estado={g.jornada === "abriendo" ? "abriendo…" : mal ? "sin guardar" : textoDelGuardado(g).toLowerCase()} />
      <EnLaCabecera en="casa-menu" fuera={<BloquearDesdeLaCinta almacen={almacen} />}>
        <BloquearDesdeLaCinta almacen={almacen} enMenu />
      </EnLaCabecera>
    </>
  );
  const sinAvisos = !mal && g.jornada !== "sin-bloqueo" && g.jornada !== "abriendo";
  // Con avisos y con barra, el aviso queda abajo SIN su candado (el de la barra alcanza: una sola tecla L).
  return (
    <EnLaCabecera fuera={cintaEnLinea(true)} ademas={sinAvisos ? null : cintaEnLinea(false)}>
      {barra}
    </EnLaCabecera>
  );

  function cintaEnLinea(conCandado: boolean) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border px-4 py-3 text-sm", mal ? "border-danger/40 bg-danger-soft" : "border-line bg-surface-raised")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-strong">
          <span className="font-semibold">Jornada real</span> · Hora: <span className="tabular-nums">{hhmm(min)}</span> ·{" "}
          <span role="status">{g.jornada === "abriendo" ? "Abriendo lo guardado…" : g.jornada === "ilegible" ? "Sin guardar — lo guardado no se pudo leer" : g.jornada === "sin-base" ? "No hay conexión con la base — reintentando" : textoDelGuardado(g)}</span>
        </p>
        {conCandado && <BloquearDesdeLaCinta almacen={almacen} />}
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
}
