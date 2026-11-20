// MIA-50 T11 (O47, D10): el pedido del código de la app de verificación en el momento de una acción sensible (pagar, cambiar
// parámetros de precio o de reparto). Sin estado: lo usan formularios de servidor y de cliente. El servidor decide si hace falta
// (`exigirCodigoEnElMomento`); la pantalla sólo lo muestra en un negocio donde rigen los dos pasos.

import { CAMPO_CODIGO } from "@/lib/proyectos/segundo-factor-core";

export function CampoCodigo({ accion, id = CAMPO_CODIGO }: { accion: "pagar" | "parametros"; id?: string }) {
  const ayuda = `${id}-ayuda`;
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium text-strong">
        Código de tu app de verificación
      </label>
      <input
        id={id}
        name={CAMPO_CODIGO}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9A-Za-z\- ]*"
        maxLength={19}
        aria-describedby={ayuda}
        className="min-h-11 w-44 rounded-md border border-line-strong bg-surface-raised px-3 text-strong tabular-nums"
      />
      <p id={ayuda} className="text-xs text-muted">
        {accion === "pagar"
          ? "Los 6 dígitos de la app (o un código de respaldo). Validado una vez, los pagos de los próximos 10 minutos no lo piden."
          : "Los 6 dígitos de la app (o un código de respaldo). Los precios y el reparto lo piden cada vez."}
      </p>
    </div>
  );
}
