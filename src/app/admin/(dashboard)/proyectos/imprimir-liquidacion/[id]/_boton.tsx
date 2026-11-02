"use client";

import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";

export function BotonImprimir({ volver }: { volver: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Link href={volver} className={cn(buttonClasses("ghost", "md"), "min-h-11")}>← Volver</Link>
      <button type="button" onClick={() => window.print()} className={cn(buttonClasses("solid", "md"), "min-h-11")}>Imprimir o guardar como PDF</button>
    </div>
  );
}
