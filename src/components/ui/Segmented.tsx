import { cn } from "./cn";

// Control segmentado: UNA opción de pocas (medio de pago, período, filtro), en vez de una fila de
// botones con borde. Son radios nativos de verdad: anda sin JavaScript, adentro de un <form> manda
// su `name`, y con el teclado se recorre con las flechas (el comportamiento de un grupo de radios).
// El radio va oculto a la vista pero no al lector ni al foco; la «cara» es lo que se ve.
//
// Presentacional, sin "use client". En un componente de cliente, `onChange` en el grupo recibe el
// cambio de cualquier opción (el evento sube). `tono="acento"` pinta la elegida con el acento del
// negocio (medio de pago en la venta); por defecto, la elegida es una tecla neutra en relieve.

export type OpcionSegmentada = {
  valor: string;
  etiqueta: React.ReactNode;
  /** Ícono antes de la palabra. */
  icono?: React.ReactNode;
  /** Cuántos hay (se muestra al lado, en cifras tabulares). */
  conteo?: number;
  disabled?: boolean;
};

export type SegmentedProps = {
  /** Nombre del grupo (el `name` de los radios, lo que viaja en el form). */
  name: string;
  /** Qué se elige («Medio de pago»). Lo lee el lector de pantalla; visible si `leyendaVisible`. */
  leyenda: string;
  leyendaVisible?: boolean;
  opciones: OpcionSegmentada[];
  /** Controlado (con `onChange`) … */
  value?: string;
  /** … o sin controlar. */
  defaultValue?: string;
  onChange?: React.ChangeEventHandler<HTMLFieldSetElement>;
  tono?: "neutro" | "acento";
  /** Ocupa todo el ancho y reparte las opciones. */
  lleno?: boolean;
  className?: string;
};

export function Segmented({
  name,
  leyenda,
  leyendaVisible,
  opciones,
  value,
  defaultValue,
  onChange,
  tono = "neutro",
  lleno,
  className,
}: SegmentedProps) {
  const grupo = (
    <fieldset
      data-ui="segmented"
      data-tono={tono}
      data-lleno={lleno || undefined}
      onChange={onChange}
      className={cn(
        "m-0 min-w-0 gap-0.5 rounded-lg border-0 bg-surface-sunken p-[3px]",
        lleno ? "flex w-full" : "inline-flex max-w-full",
        className,
      )}
    >
      <legend className="sr-only">{leyenda}</legend>
      {opciones.map((o) => (
        <label key={o.valor} data-parte="opcion" className={cn("relative flex min-w-0", lleno && "flex-1")}>
          <input
            type="radio"
            name={name}
            value={o.valor}
            disabled={o.disabled}
            {...(value !== undefined
              ? { checked: value === o.valor, readOnly: true }
              : { defaultChecked: defaultValue === o.valor })}
            className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
          />
          <span
            data-parte="cara"
            className={cn(
              "inline-flex min-h-[2.375rem] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium text-muted",
              "peer-checked:bg-surface-raised peer-checked:text-strong peer-checked:shadow-xs",
            )}
          >
            {o.icono}
            <span className="truncate">{o.etiqueta}</span>
            {o.conteo !== undefined && <span data-parte="conteo">{o.conteo}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
  if (!leyendaVisible) return grupo;
  // La leyenda visible va AFUERA del recuadro (una <legend> se dibuja sobre el borde del fieldset);
  // la <legend> de adentro sigue siendo el nombre del grupo para el lector de pantalla.
  return (
    <div className="min-w-0">
      <p aria-hidden className="mb-1.5 text-sm font-medium text-strong" data-parte="leyenda">
        {leyenda}
      </p>
      {grupo}
    </div>
  );
}
