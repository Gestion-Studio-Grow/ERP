"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui";

export default function BotonImprimir({ volver }: { volver: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Link href={volver} className={buttonClasses("ghost", "md")}>← Volver</Link>
      <button type="button" onClick={() => window.print()} className={buttonClasses("solid", "md")}>
        Imprimir o guardar como PDF
      </button>
    </div>
  );
}
