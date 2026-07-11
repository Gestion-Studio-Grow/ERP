import { cn } from "./cn";

// Controles de formulario del design system. Foco de marca, borde de línea,
// superficie elevada, altura táctil (44px). Unifican los inputs inline con
// estilos dispares entre /admin y el sitio.

const control =
  "w-full h-11 rounded-md border border-line-strong bg-surface-raised px-3 " +
  "text-sm text-strong placeholder:text-faint " +
  "transition-colors focus:border-accent focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "aria-invalid:border-danger " +
  "disabled:opacity-60 disabled:bg-surface-sunken";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "h-auto min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
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
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-strong">
        {label}
        {required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
