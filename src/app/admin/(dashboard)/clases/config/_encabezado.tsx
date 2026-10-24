// La cabecera de cada pantalla de Ajustes: «‹ Ajustes» para volver y el título, con la campana y el
// engranaje de siempre (el engranaje marcado: estás en Ajustes). Servidor, sin estado.

import Link from "next/link";
import type { ReactNode } from "react";
import { Cabecera } from "../_cabecera";

export function EncabezadoAjuste({ titulo, detalle, pendientes }: { titulo: string; detalle?: ReactNode; pendientes: number }) {
  return (
    <>
      <Link href="/admin/clases/config" className="mb-2 inline-flex min-h-12 items-center text-sm font-semibold text-accent-ink underline-offset-2 hover:underline" data-qa="volver-ajustes">
        ‹ Ajustes
      </Link>
      <Cabecera titulo={titulo} detalle={detalle} pendientes={pendientes} actual="config" />
    </>
  );
}
