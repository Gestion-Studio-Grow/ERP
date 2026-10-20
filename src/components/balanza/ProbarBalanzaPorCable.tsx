"use client";

// ============================================================================
// El asistente de la balanza por cable — para la pantalla de configuración.
// ============================================================================
//
// Cuatro pasos, en criollo: 1) enchufar el cable, 2) «Conectar balanza» y elegir el puerto,
// 3) poner algo en el plato (se ve lo que llega crudo, cómo habla la balanza y el peso) y
// 4) «Listo, guardar en esta PC». Hasta el paso 4 no se guarda nada: si la persona se va a la
// mitad, la computadora no queda con una balanza a medio configurar.
//
// Usa su propio `useBalanzaSerie` con `recordarAlConectar: false`. No convive en la misma pantalla
// con otro «Tomar peso» (abrirían dos veces el puerto).

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import type { ConfiguracionSerie } from "@/lib/balanza-serie/detector";
import { useBalanzaSerie } from "@/lib/balanza-serie/usar-balanza-serie";
import { formatearKilos, MENSAJE_SIN_WEB_SERIAL, textoDelEstado } from "./TomarPesoDeBalanza";

export type ProbarBalanzaPorCableProps = {
  negocio: string;
  /** Avisa cuando la persona guardó la balanza en esta PC. */
  alGuardar?: (configuracion: ConfiguracionSerie) => void;
  className?: string;
};

/** Cómo habla la balanza, en palabras. */
export function describirConfiguracion(c: ConfiguracionSerie): string {
  const idioma =
    c.protocolo === "cas"
      ? "formato CAS"
      : c.protocolo === "toledo"
        ? "formato Toledo"
        : c.protocolo === "ascii"
          ? "texto con el peso"
          : `contesta cuando se le pide el peso (${c.comando === "ENQ" ? "ENQ" : `«${c.comando}»`})`;
  const bits = c.bits === "8N1" ? "8 bits sin paridad" : "7 bits con paridad par";
  const modo = c.modo === "continuo" ? "manda el peso todo el tiempo" : "a pedido";
  return `${idioma} · ${c.velocidad} baudios · ${bits} · ${modo}`;
}

function Paso({ numero, titulo, activo, hecho, children }: { numero: number; titulo: string; activo: boolean; hecho: boolean; children?: React.ReactNode }) {
  return (
    <li
      aria-current={activo ? "step" : undefined}
      className={cn("flex gap-3 rounded-md border p-4", activo ? "border-line-strong bg-surface-raised" : "border-line")}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium",
          hecho ? "bg-success-soft text-success" : activo ? "bg-accent text-on-accent" : "bg-surface-sunken text-muted",
        )}
      >
        {hecho ? "✓" : numero}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className={cn("text-sm", activo ? "font-medium text-strong" : "text-body")}>
          <span className="sr-only">{`Paso ${numero}${hecho ? ", hecho" : ""}: `}</span>
          {titulo}
        </p>
        {children}
      </div>
    </li>
  );
}

export function ProbarBalanzaPorCable({ negocio, alGuardar, className }: ProbarBalanzaPorCableProps) {
  const balanza = useBalanzaSerie({ negocio, recordarAlConectar: false });
  const [guardada, setGuardada] = useState(false);

  if (!balanza.soportado) {
    return (
      <p data-ui="balanza-sin-soporte" className={cn("rounded-md bg-surface-sunken p-3 text-sm text-body", className)}>
        {MENSAJE_SIN_WEB_SERIAL}
      </p>
    );
  }

  const { estado, configuracion, crudo, pesoActual } = balanza;
  const conectada = estado === "conectada";
  const buscando = estado === "buscando";
  const llegaPeso = conectada && pesoActual !== null;
  const paso = guardada ? 5 : llegaPeso ? 4 : conectada ? 3 : 2;

  const guardar = () => {
    if (balanza.guardar() && configuracion) {
      setGuardada(true);
      alGuardar?.(configuracion);
    }
  };

  return (
    <section data-ui="asistente-balanza-por-cable" aria-labelledby="titulo-balanza-por-cable" className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1">
        <h2 id="titulo-balanza-por-cable" className="text-lg font-medium text-strong">
          Balanza por cable
        </h2>
        <p className="text-sm text-muted">
          Para leer el peso directo de la balanza, sin tipearlo. Se configura una vez en cada computadora.
        </p>
        {balanza.recordada && !guardada && (
          <p className="text-sm text-body">
            Esta computadora ya tiene una balanza guardada.{" "}
            <button type="button" onClick={balanza.olvidar} className="min-h-11 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-focus">
              Olvidarla
            </button>
          </p>
        )}
      </div>

      <ol className="flex flex-col gap-3">
        <Paso numero={1} titulo="Enchufá el cable de la balanza a la computadora y prendé la balanza." activo={false} hecho={paso > 1} />

        <Paso numero={2} titulo="Tocá «Conectar balanza» y, en la ventanita del navegador, elegí el puerto de la balanza." activo={paso === 2} hecho={paso > 2}>
          {!conectada && (
            <div className="flex flex-col items-start gap-2">
              <Button variant="solid" onClick={() => void balanza.conectar()} estado={buscando ? "cargando" : undefined} disabled={buscando}>
                {buscando ? "Buscando la balanza…" : "Conectar balanza"}
              </Button>
              {!buscando && (
                <p className="text-sm text-muted">
                  ¿La balanza no aparece en la lista? Puede que su salida USB no sea de tipo puerto serie (pasa con algunas Toledo):
                  pedile al técnico que la pase a salida serie o usá un adaptador USB-serie.
                </p>
              )}
              <p role="status" className="text-sm text-muted">
                {buscando
                  ? `Buscando cómo habla la balanza (${balanza.diagnostico?.intentos.length ?? 0} configuraciones vistas). Puede tardar hasta medio minuto.`
                  : ""}
              </p>
            </div>
          )}
          {balanza.error && (
            <p role="alert" className="text-sm text-danger">
              {balanza.error}
            </p>
          )}
        </Paso>

        <Paso numero={3} titulo="Poné algo en el plato de la balanza." activo={paso === 3 || paso === 4} hecho={paso > 4}>
          {conectada && (
            <div className="flex flex-col gap-3">
              <output aria-label="Peso de la balanza" className="text-4xl font-medium tabular-nums text-strong">
                {pesoActual === null ? "—" : formatearKilos(pesoActual)}
              </output>
              <p role="status" className={cn("text-sm", balanza.estable ? "text-success" : "text-muted")}>
                {textoDelEstado(balanza)}
              </p>
              {configuracion && (
                <p className="text-sm text-body">
                  <span className="text-muted">Cómo habla la balanza: </span>
                  {describirConfiguracion(configuracion)}
                </p>
              )}
              <div className="flex flex-col gap-1">
                <p className="text-sm text-muted">Lo que llega por el cable:</p>
                <pre data-ui="crudo-balanza" className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-surface-sunken p-2 font-mono text-xs text-body">
                  {crudo.texto || "Todavía no llegó nada."}
                </pre>
                <details className="text-xs text-muted">
                  <summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-2 focus-visible:outline-focus">Ver en hexadecimal</summary>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-surface-sunken p-2 font-mono text-body">{crudo.hex || "—"}</pre>
                </details>
              </div>
            </div>
          )}
        </Paso>

        <Paso numero={4} titulo="Si el peso coincide con el de la balanza, guardala en esta computadora." activo={paso === 4} hecho={guardada}>
          {paso === 4 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="solid" onClick={guardar}>
                Listo, guardar en esta PC
              </Button>
              <Button variant="ghost" onClick={() => void balanza.desconectar()}>
                Empezar de nuevo
              </Button>
            </div>
          )}
          {guardada && (
            <p role="status" className="text-sm text-success">
              Listo: esta computadora ya reconoce la balanza y se conecta sola cada vez que abras el sistema.
            </p>
          )}
        </Paso>
      </ol>
    </section>
  );
}
