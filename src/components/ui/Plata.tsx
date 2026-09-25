import { cn } from "./cn";
import { partirCifra } from "./display-core";

// ============================================================================
// PLATA — la cifra de dinero de «Renglón». La firma del sistema.
// ============================================================================
//
// Toda cifra de dinero va con esta pieza: cifras tabulares, el `$` en peso liviano, los centavos
// más chicos y más claros, y SIEMPRE a la derecha en su columna (`--col-plata`), en todas las
// pantallas. El ojo aprende dónde mirar. Nunca un importe gigante dentro de una tarjeta: la cifra
// grande (`tamano="grande"`) es sólo para lo que se le muestra al cliente del otro lado del
// mostrador (el total a cobrar, el vuelto, la diferencia del cierre) y va en `cqi` de su
// contenedor, nunca en `vw` (un monto de siete cifras no se sale de su lugar).
//
// El texto entero (`$36.608,00`) queda para el lector de pantalla en `aria-label`; lo de adentro
// es decorado. Presentacional: sirve en servidor y en cliente.

export type PlataProps = {
  valor: number;
  /** Sin centavos (los importes redondos de una bandeja). Por defecto, con centavos. */
  sinCentavos?: boolean;
  /** `renglon` (14–16 px, la de todas las filas) o `grande` (lo que ve el cliente). */
  tamano?: "renglon" | "grande";
  /** Tono: `peligro` para lo negativo o lo que falta, `cobrado` para lo que entró. */
  tono?: "peligro" | "cobrado";
  className?: string;
};

export function Plata({ valor, sinCentavos = false, tamano = "renglon", tono, className }: PlataProps) {
  const c = partirCifra(valor, "plata", sinCentavos);
  const negativo = c.signo === "-";
  return (
    <span
      data-ui="plata"
      data-tamano={tamano === "grande" ? "grande" : undefined}
      data-tono={tono ?? (negativo ? "peligro" : undefined)}
      aria-label={negativo ? `menos ${c.texto.slice(1)}` : c.texto}
      className={cn("tabular-nums", className)}
    >
      <span aria-hidden>
        {negativo ? "−" : ""}
        <span data-parte="moneda">$</span>
        {c.entero}
        {c.decimales && <span data-parte="centavos">{c.decimales}</span>}
      </span>
    </span>
  );
}
