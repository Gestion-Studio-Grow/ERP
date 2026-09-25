// LÍNEA DE CUENTA (diseño «Renglón»): «Saldo al abrir ……… $299.220». Una cuenta (un estado de
// resultados, un arqueo) no es una lista de cosas: es concepto e importe, en UNA línea también en
// el celular. El Renglón pone la plata arriba del asunto en el celular y reserva la columna del
// folio; acá no hay folio ni tecla. `total` la cierra con la raya fuerte, como el total de un libro.
// Lo usan Caja, Cierre, Cuentas a cobrar, Flujo, Resultado, Retenciones y Libro IVA.
//
// Presentacional (sin "use client"): sirve en servidor y en cliente.

import { cn } from "./cn";

/**
 * Una línea de una cuenta: concepto a la izquierda (con su aclaración debajo, si la tiene) y el
 * importe a la derecha, en su columna. `total` la marca con la raya fuerte arriba.
 */
export function LineaDeCuenta({
  concepto,
  detalle,
  importe,
  total = false,
  className,
}: {
  concepto: React.ReactNode;
  detalle?: React.ReactNode;
  importe: React.ReactNode;
  total?: boolean;
  className?: string;
}) {
  return (
    <div
      data-ui="linea-cuenta"
      className={cn(
        "flex min-h-10 items-baseline justify-between gap-x-4 py-2",
        total ? "border-t-2 border-line-strong font-semibold text-strong" : "border-b border-line text-body",
        className,
      )}
    >
      <span className="min-w-0">
        <span className={cn("block", total && "font-semibold")}>{concepto}</span>
        {detalle && <span className="block text-[13px] font-normal text-muted">{detalle}</span>}
      </span>
      <span className="shrink-0 whitespace-nowrap text-right">{importe}</span>
    </div>
  );
}
