"use client";

import { buttonClasses } from "@/components/ui";

export function BotonImprimir() {
  return (
    <button type="button" className={buttonClasses("solid", "md")} onClick={() => window.print()}>
      Imprimir o guardar como PDF
    </button>
  );
}
