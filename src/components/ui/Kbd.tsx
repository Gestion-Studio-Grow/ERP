import { cn } from "./cn";

// Teclita de atajo («F2», «Enter», «Ctrl K»). En la PC el atajo se VE (dentro del botón o al lado
// de la barra de comandos); en el celular, dentro de un botón, se esconde solo (`atajo` de Button).
// Presentacional, sin "use client". Bajo la piel nueva se viste de tecla (data-ui="kbd").

export function Kbd({
  children,
  className,
  enBoton,
}: {
  children: React.ReactNode;
  className?: string;
  /** Va adentro de un botón: toma el color del botón. */
  enBoton?: boolean;
}) {
  return (
    <kbd
      data-ui="kbd"
      data-en={enBoton ? "boton" : undefined}
      className={cn("inline-grid place-items-center rounded border border-line px-1.5 font-mono text-[11px] leading-5", className)}
    >
      {children}
    </kbd>
  );
}
