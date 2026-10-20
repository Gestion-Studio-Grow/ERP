"use client";

// ============================================================================
// «Tomar peso» — el peso de la balanza por cable, de un toque.
// ============================================================================
//
// Para las balanzas SIN etiqueta: la que pesa y nada más. Con la balanza conectada por cable a
// esta computadora (Chrome o Edge), muestra el peso en vivo y «Tomar peso» le pasa los kilos a
// la pantalla (`alTomar`). Si el peso se está moviendo, está en cero o da negativo, el botón no
// toma nada y el estado dice por qué.
//
// Dos modos:
//   · "compacto" (Vender, Pedidos): al lado del campo del peso. Si el navegador no puede leer el
//     puerto, no aparece: el peso se carga a mano como siempre.
//   · "completo" (pantalla de configuración): más grande, con «Desconectar», y si el navegador
//     no puede, lo dice.
//
// Usa el hook `useBalanzaSerie`: UNO por pantalla (ver el hook).

import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import type { MotivoSinPeso } from "@/lib/balanza-serie/detector";
import { useBalanzaSerie, type BalanzaSerie } from "@/lib/balanza-serie/usar-balanza-serie";

export type TomarPesoDeBalanzaProps = {
  /** El negocio: la balanza se recuerda por negocio en esta PC. */
  negocio: string;
  /** Recibe los kilos cuando se toca «Tomar peso» con el peso quieto. */
  alTomar: (kg: number) => void;
  modo?: "compacto" | "completo";
  className?: string;
  /** ¿Recordar la balanza en esta PC al conectar? Por defecto sí. */
  recordar?: boolean;
};

export const MENSAJE_SIN_WEB_SERIAL =
  "Este navegador no puede leer la balanza por cable. Usá Chrome o Edge en una computadora; mientras tanto, el peso se carga a mano.";

const TEXTO_DEL_MOTIVO: Record<MotivoSinPeso, string> = {
  "sin-lecturas": "Esperando el peso de la balanza",
  inestable: "Esperando que el peso se quede quieto",
  cero: "Peso en cero",
  negativo: "El peso da negativo: revisá la tara de la balanza",
  sobrecarga: "Pasaste el máximo de la balanza",
};

/** «1,250 kg» */
export function formatearKilos(kg: number): string {
  return `${kg.toFixed(3).replace(".", ",")} kg`;
}

/** El estado en palabras: por qué no se puede tomar, o que ya se puede. */
export function textoDelEstado(b: Pick<BalanzaSerie, "estable" | "motivo">): string {
  return b.estable ? "Peso quieto: listo para tomar" : TEXTO_DEL_MOTIVO[b.motivo ?? "sin-lecturas"];
}

export function TomarPesoDeBalanza({ negocio, alTomar, modo = "compacto", className, recordar = true }: TomarPesoDeBalanzaProps) {
  const balanza = useBalanzaSerie({ negocio, recordarAlConectar: recordar });
  if (!balanza.soportado) {
    if (modo === "compacto") return null;
    return (
      <p data-ui="balanza-sin-soporte" className={cn("rounded-md bg-surface-sunken p-3 text-sm text-body", className)}>
        {MENSAJE_SIN_WEB_SERIAL}
      </p>
    );
  }
  return <PesoDeBalanza balanza={balanza} alTomar={alTomar} modo={modo} className={className} />;
}

/** Lo que se ve con Web Serial. Separado para que el asistente lo reuse con su propio hook. */
export function PesoDeBalanza({
  balanza,
  alTomar,
  modo = "compacto",
  className,
}: {
  balanza: BalanzaSerie;
  alTomar: (kg: number) => void;
  modo?: "compacto" | "completo";
  className?: string;
}) {
  const { estado, pesoActual, estable, error } = balanza;
  const conectada = estado === "conectada";
  const buscando = estado === "buscando";
  const completo = modo === "completo";
  const idEstado = useId();

  const tomar = () => {
    const kg = balanza.tomarPeso();
    if (kg !== null) alTomar(kg);
  };

  return (
    <div
      data-ui="tomar-peso-de-balanza"
      data-modo={modo}
      data-estado={estado}
      className={cn("flex flex-col gap-2", completo ? "items-stretch" : "items-start", className)}
    >
      {conectada ? (
        <div className={cn("flex flex-wrap items-center gap-3", completo && "justify-between")}>
          <output
            aria-label="Peso de la balanza"
            className={cn(
              "font-medium tabular-nums text-strong",
              completo ? "text-4xl" : "text-lg",
              !estable && "text-muted",
            )}
          >
            {pesoActual === null ? "—" : formatearKilos(pesoActual)}
          </output>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="solid"
              size={completo ? "lg" : "md"}
              onClick={tomar}
              aria-disabled={!estable || undefined}
              aria-describedby={idEstado}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
            >
              Tomar peso
            </Button>
            {completo && (
              <Button variant="ghost" size="lg" onClick={() => void balanza.desconectar()}>
                Desconectar
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size={completo ? "lg" : "md"}
          onClick={() => void balanza.conectar()}
          estado={buscando ? "cargando" : undefined}
          disabled={buscando}
        >
          {buscando ? "Buscando la balanza…" : "Conectar balanza"}
        </Button>
      )}
      <p id={idEstado} role="status" className={cn("text-sm", estable ? "text-success" : "text-muted")}>
        {conectada ? textoDelEstado(balanza) : buscando ? "Buscando cómo habla la balanza; puede tardar unos segundos." : ""}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
