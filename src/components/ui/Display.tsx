import { cn } from "./cn";
import { Icono } from "./Icono";
import { leerDelta, partirCifra, rutaMicroLinea, type FormatoCifra } from "./display-core";

// DISPLAY — la cifra grande: lo que está en juego, grande, ancho y seguro de leer a un metro.
// El «$» y los centavos chicos arriba (como en el pizarrón de precios o el visor de la balanza), la
// parte entera en Archivo condensada y pesada. Debajo, el delta con SIGNO, ÍCONO y PALABRA (nunca sólo un
// color) y, si la pantalla tiene el dato real, la micro línea de 7 días.
//
// Recibe los números YA calculados: no suma, no compara, no consulta. Presentacional, sin
// "use client". Fuera de la piel nueva se ve como un número grande común (clases de siempre).

export type DisplayProps = {
  etiqueta: React.ReactNode;
  valor: number;
  formato?: FormatoCifra;
  /** Plata sin centavos (los del Inicio). El cobro los muestra. */
  sinCentavos?: boolean;
  tamano?: "md" | "lg" | "xl";
  /** Variación ya calculada: `valor` en % o en $, frente a qué, y si subir es bueno. */
  delta?: { valor: number; unidad: "%" | "$"; frente: string; subirEsBueno?: boolean };
  /** Serie real (p. ej. los últimos 7 días, del más viejo a hoy). Sin serie, sin línea. */
  serie?: readonly number[];
  /** Qué muestra la serie, para el lector («Ventas de los últimos 7 días»). */
  serieEtiqueta?: string;
  /** Una línea más debajo (p. ej. «12 ventas · última 12:41»). */
  pie?: React.ReactNode;
  className?: string;
};

export function Display({
  etiqueta,
  valor,
  formato = "plata",
  sinCentavos,
  tamano = "lg",
  delta,
  serie,
  serieEtiqueta,
  pie,
  className,
}: DisplayProps) {
  const c = partirCifra(valor, formato, sinCentavos);
  const d = delta ? leerDelta(delta.valor, delta.unidad, delta.frente, delta.subirEsBueno ?? true) : null;
  const linea = serie ? rutaMicroLinea(serie) : null;
  return (
    <div data-ui="display" data-tamano={tamano} className={cn("min-w-0", className)}>
      <p data-parte="etiqueta" className="text-xs font-medium text-muted">
        {etiqueta}
      </p>
      <p
        data-parte="cifra"
        className={cn(
          "mt-1.5 whitespace-nowrap font-bold tabular-nums text-strong",
          tamano === "xl" ? "text-5xl" : tamano === "lg" ? "text-4xl" : "text-2xl",
        )}
      >
        <span className="sr-only">{c.texto}</span>
        <span aria-hidden>
          {c.signo}
          {c.moneda && <span data-parte="moneda">{c.moneda}</span>}
          <span data-parte="entero">{c.entero}</span>
          {c.decimales && (
            // La plata lleva los centavos chicos arriba (pizarrón de precios); el peso, los gramos
            // a la par (se leen enteros: «1,280 kg»).
            <span data-parte={formato === "plata" ? "centavos" : "decimales"}>{c.decimales}</span>
          )}
          {c.unidad && <span data-parte="unidad">{c.unidad}</span>}
        </span>
      </p>
      {d && (
        <p data-parte="delta" data-sentido={d.sentido} data-lectura={d.lectura} className="mt-2 flex flex-wrap items-center gap-1 text-sm">
          <Icono nombre={d.sentido === "sube" ? "sube" : d.sentido === "baja" ? "baja" : "igual"} />
          <b aria-hidden>{d.cifra}</b>
          <span aria-hidden>{d.sentido === "igual" ? `que ${delta!.frente}` : `frente a ${delta!.frente}`}</span>
          <span className="sr-only">{d.enPalabras}</span>
        </p>
      )}
      {linea && (
        <svg
          data-parte="linea"
          viewBox="0 0 120 32"
          className="mt-3 h-8 w-full max-w-48"
          role="img"
          aria-label={serieEtiqueta ?? "Evolución de los últimos días"}
        >
          <line data-parte="base" x1="3" x2="117" y1="29" y2="29" strokeWidth="1" strokeDasharray="1 3" />
          <path d={linea.d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={linea.ultimo.x} cy={linea.ultimo.y} r="2.75" fill="currentColor" />
        </svg>
      )}
      {pie && <p className="mt-2 text-xs text-muted">{pie}</p>}
    </div>
  );
}
