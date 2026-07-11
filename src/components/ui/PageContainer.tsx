import { cn } from "./cn";

// Contenedor de página del backoffice (gate UX/UI, fix 16) — el marco del
// mockup GSG Fable: max-width 1240px + padding 32px horizontal / 36px vertical
// (compactado en mobile). Reemplaza los `mx-auto max-w-* px-* py-*` que cada
// page.tsx armaba a mano con anchos distintos. `width="narrow"` es para
// pantallas de formulario corto (ej. configuración) que no deben estirarse.

export type PageContainerProps = {
  children: React.ReactNode;
  /** "default" = 1240px del mockup; "narrow" = formularios cortos (42rem). */
  width?: "default" | "narrow";
  className?: string;
};

export function PageContainer({ children, width = "default", className }: PageContainerProps) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-8 sm:py-9",
        width === "narrow" ? "max-w-2xl" : "max-w-[1240px]",
        className,
      )}
    >
      {children}
    </main>
  );
}
