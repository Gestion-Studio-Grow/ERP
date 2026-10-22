"use client";

// ============================================================================
// PIEZAS DE LA CONFIGURACIÓN — la tarjeta de cada sección, descargar y leer archivos, el PIN de una vez.
// ============================================================================
//
// Las comparten las secciones de la solapa Configuración (ConfiguracionDelClub.tsx y config-*.tsx). La lógica está en
// configuracion-core.ts; acá sólo lo que necesita el navegador (Blob, archivos elegidos, el cuadro siguiente).

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { Almacen } from "./almacen";
import { esDeshacible, llevaPinDeQuienOpera, type AccionConfig, type DesenlaceConfig } from "./configuracion-core";
import { conTopeDePin, guardaDelPin, type DesenlaceConPin } from "./tope-de-pin";

export const tarjeta = "flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4";
export const subtarjeta = "flex min-w-0 flex-col gap-3 rounded-md border border-line-strong bg-surface p-3";
/** Un nombre de archivo largo no empuja la pantalla de costado (390 px). */
export const sinDesborde = "[overflow-wrap:anywhere]";
/** El campo de archivo con su botón de 44 px. */
export const campoArchivo =
  "block min-h-11 w-full text-sm text-body file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-surface-raised file:px-4 file:text-sm file:font-medium file:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function Seccion({ id, titulo, bajada, extra, children }: { id: string; titulo: string; bajada?: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={tarjeta}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={id} className="text-lg font-semibold text-strong">
            {titulo}
          </h2>
          {extra}
        </div>
        {bajada && <p className="text-sm text-body">{bajada}</p>}
      </div>
      {children}
    </section>
  );
}

/** Un error de esta sección: la región está siempre montada (si aparece junto con su texto, no todos la anuncian). */
export function ErrorDeSeccion({ texto }: { texto: string }) {
  return (
    <p role="alert" className={`-my-1.5 text-sm font-medium text-danger ${sinDesborde}`}>
      {texto}
    </p>
  );
}

/** Pide al navegador que baje `texto` como `nombre`. No se sabe si llegó: por eso después se elige el archivo. */
export function descargarTexto(texto: string, nombre: string): void {
  const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** El texto del archivo elegido en ese campo (null: no se eligió ninguno; "" si no se pudo leer). */
export async function textoElegido(campo: HTMLInputElement | null): Promise<string | null> {
  const archivo = campo?.files?.[0];
  if (!archivo) return null;
  try {
    return await archivo.text();
  } catch {
    return "";
  }
}

/** Deja pintar «Verificando…» antes de una cuenta larga (armar o verificar el archivo tarda ~400 ms). */
export const despuesDePintar = () => new Promise<void>((listo) => requestAnimationFrame(() => setTimeout(listo, 0)));

/** Corre una acción de la configuración por el almacén (aviso abajo; «Deshacer» sólo en lo que no lleva PIN). */
/**
 * Corre algo que pide el PIN de quien opera con EL tope del equipo (tope-de-pin.ts, el del bloqueo): trabado no corre
 * y dice cuánto esperar; un PIN malo suma «(n de 5)»; sólo un acierto de un dueño lo vuelve a cero. `negocio`: el de
 * la clave `gsg-club:<negocio>:intentos-bloqueo:v1`.
 */
export function conElTopeDelEquipo<D extends DesenlaceConPin>(almacen: Almacen, negocio: string | undefined, correr: () => D): D | DesenlaceConPin {
  return conTopeDePin(guardaDelPin(almacen, negocio), Date.now(), correr).desenlace;
}

/**
 * Corre una acción de la solapa por el almacén, como el comando «config» (se re-aplica por nombre si la base avanzó);
 * lo que pide el PIN de quien opera, con el tope del equipo (sólo el toque: las re-aplicaciones no suman intentos).
 */
export function useHacerConfig(almacen: Almacen, negocio?: string) {
  return useCallback(
    (a: AccionConfig): DesenlaceConfig =>
      almacen.comando("config", [a], {
        deshacible: esDeshacible(a),
        ...(llevaPinDeQuienOpera(a) ? { envolver: (correr: () => DesenlaceConfig) => conElTopeDelEquipo(almacen, negocio, correr) as DesenlaceConfig } : {}),
      }),
    [almacen, negocio],
  );
}

/** El PIN recién generado: a la vista hasta «Listo». No queda en el aviso ni en el registro. */
export function PinDeUnaVez({ acceso, onListo }: { acceso: NonNullable<DesenlaceConfig["pinNuevo"]>; onListo: () => void }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);
  return (
    <div role="group" aria-labelledby="club-config-pin-nuevo" className="flex flex-col items-start gap-2 rounded-md border border-success/40 bg-success-soft p-4">
      <h3 id="club-config-pin-nuevo" ref={titulo} tabIndex={-1} className="font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
        ✔ {acceso.nombre}{acceso.rol ? ` · ${acceso.rol}` : ""}
      </h3>
      <p className="text-sm text-strong">Su PIN es</p>
      <p className="text-4xl font-bold tracking-widest tabular-nums text-strong">{acceso.pin}</p>
      <p className="text-sm text-strong">Anotalo y dáselo en persona. No se vuelve a mostrar: si lo pierde, se le arma uno nuevo desde acá.</p>
      <Button variant="solid" size="md" onClick={onListo}>
        Listo, ya se lo di
      </Button>
    </div>
  );
}

/** Una casilla con su texto, de 44 px. */
export function Casilla({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
      <input type="checkbox" className="size-5 shrink-0 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
