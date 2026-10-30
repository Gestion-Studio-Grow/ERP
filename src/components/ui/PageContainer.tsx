import { cn } from "./cn";

// Contenedor de página del backoffice (gate UX/UI, fix 16) — el marco del
// mockup GSG Fable: max-width 1240px + padding 32px horizontal / 36px vertical
// (compactado en mobile). Reemplaza los `mx-auto max-w-* px-* py-*` que cada
// page.tsx armaba a mano con anchos distintos. `width="narrow"` es para
// pantallas de formulario corto (ej. configuración) que no deben estirarse.

export type PageContainerProps = {
  children: React.ReactNode;
  /** "default" = 1320px (escala nivel 5; antes 1240px); "narrow" = formularios cortos (44rem). */
  width?: "default" | "narrow";
  className?: string;
};

export function PageContainer({ children, width = "default", className }: PageContainerProps) {
  return (
    <main
      data-ui="pagina"
      data-ancho={width === "narrow" ? "angosto" : undefined}
      className={cn(
        "mx-auto w-full px-5 py-7 sm:px-10 sm:py-10",
        width === "narrow" ? "max-w-[44rem]" : "max-w-[1320px]",
        className,
      )}
    >
      {children}
    </main>
  );
}
