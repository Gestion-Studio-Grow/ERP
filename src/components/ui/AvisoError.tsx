import { cn } from "./cn";

// Aviso de error del backoffice: DICE QUÉ PASÓ Y CÓMO SEGUIR. Es la alternativa a la
// pantalla genérica de error y al "Ocurrió un error" suelto: quien lo lee tiene que saber
// qué no se hizo (o qué no se pudo mostrar) y qué puede hacer ahora, sin perder lo cargado.
//
// Por eso `comoSeguir` es obligatorio: un error sin salida es un callejón. `accion` es el
// botón o el link para seguir (reintentar, ir a otra app), cuando existe.
//
// Presentacional puro (sin "use client"): lo usan componentes de servidor y de cliente.
// Canal semántico: `error` (algo falló) en rojo con role="alert", que los lectores de
// pantalla anuncian al aparecer; `aviso` (se pudo en parte) en ámbar con role="status",
// que se anuncia sin interrumpir. El texto va en `text-strong`/`text-body` sobre el fondo
// suave del tono: el color acompaña, no carga el mensaje (contraste AA en los temas).

export type AvisoErrorProps = {
  /** Qué pasó, en una frase de negocio ("No se pudo cobrar el pedido #123"). */
  titulo: React.ReactNode;
  /** Cómo seguir: qué puede hacer la persona ahora. */
  comoSeguir: React.ReactNode;
  /** Botón o link para seguir, si lo hay. */
  accion?: React.ReactNode;
  /** `error` = no se pudo; `aviso` = se pudo en parte. Default `error`. */
  tono?: "error" | "aviso";
  className?: string;
};

export function AvisoError({ titulo, comoSeguir, accion, tono = "error", className }: AvisoErrorProps) {
  const esError = tono === "error";
  return (
    <div
      role={esError ? "alert" : "status"}
      data-ui="aviso-error"
      data-tono={tono}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        esError ? "border-danger/25 bg-danger-soft" : "border-warning/25 bg-warning-soft",
        className,
      )}
    >
      <svg
        className={cn("mt-0.5 h-4 w-4 shrink-0", esError ? "text-danger" : "text-warning")}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-strong">{titulo}</p>
        <p className="mt-0.5 text-body">{comoSeguir}</p>
        {accion && <div className="mt-2 flex flex-wrap gap-2">{accion}</div>}
      </div>
    </div>
  );
}
