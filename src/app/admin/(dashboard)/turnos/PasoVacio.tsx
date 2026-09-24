// Dibuja un `PasoVacio` (pasos.ts): el estado vacío de la casa con su botón al siguiente paso.
// Sin "use client": es presentacional y lo usan tanto páginas de servidor como componentes
// cliente. El botón es un link de 44 px (h-11), tocable con el dedo.

import Link from "next/link";
import { EmptyState, buttonClasses } from "@/components/ui";
import type { PasoVacio as Paso } from "./pasos";

export default function PasoVacio({ paso, className }: { paso: Paso; className?: string }) {
  return (
    <EmptyState
      className={className}
      title={paso.titulo}
      description={paso.descripcion}
      action={
        paso.accion ? (
          <Link href={paso.accion.href} className={buttonClasses("outline", "md")}>
            {paso.accion.etiqueta}
          </Link>
        ) : undefined
      }
    />
  );
}
