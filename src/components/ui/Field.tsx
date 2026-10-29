import { cn } from "./cn";

// Controles de formulario del design system. Foco de marca, borde de línea,
// superficie elevada, altura táctil. Unifican los inputs inline con estilos
// dispares entre /admin y el sitio. Escala nivel 5 (29/10/2026): 48 px de alto y
// letra de 16 px o más (`text-base`): el iPhone no hace zoom al tocar el campo.

const control =
  "w-full h-12 rounded-md border border-line-strong bg-surface-raised px-3.5 " +
  "text-base text-strong placeholder:text-faint hover:border-[color-mix(in_srgb,var(--text-strong)_30%,transparent)] " +
  "transition-colors focus:border-accent focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "aria-invalid:border-danger " +
  "disabled:opacity-60 disabled:bg-surface-sunken";

// Diseño nuevo (ADR-099): cada control lleva `data-ui` (input / select / textarea) y la piel lo
// viste de pozo con la línea de escribir; `importe` (sólo Input) lo pone en cifra ancha a la
// derecha, para cargar plata. Sin la piel, las mismas clases de siempre.
export function Input({
  className,
  importe,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { importe?: boolean }) {
  return <input data-ui="input" data-importe={importe || undefined} className={cn(control, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select data-ui="select" className={cn(control, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea data-ui="textarea" className={cn(control, "h-auto min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

// Envoltura label + control + hint/error, con asociación accesible. `htmlFor`
// se pasa al label; el control va como children.
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-ui="field" className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={htmlFor} data-parte="etiqueta" className="text-sm font-semibold text-strong">
        {label}
        {required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
      </label>
      {children}
      {error ? (
        <p data-parte="error" className="flex items-start gap-1.5 text-sm font-medium text-danger" role="alert">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" className="mt-[3px] shrink-0">
            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.5v4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="8" cy="11.2" r=".95" fill="currentColor" />
          </svg>
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p data-parte="ayuda" className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
