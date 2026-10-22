import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, EmptyState } from "@/components/ui";
import { badgePendientes } from "@/lib/padel/datos.server";
import { Cabecera } from "../_cabecera";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Plata", manifest: "/clases/app.webmanifest" };

// PROVISIONAL (Tanda 2B): la barra de abajo ya tiene «Plata» y un lugar de la barra no puede ser
// un callejón sin salida. La pantalla de verdad (Te deben, cobrado por medio, el mes, exportar)
// es de la Tanda 3B (matias-DISENO.md §3B, M-073..M-075) y reemplaza este archivo entero.
export default async function ClasesPlata() {
  await requireApp("padel-clases");
  const numero = await badgePendientes();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Cabecera titulo="Plata" detalle="Lo que cobraste y lo que te deben." pendientes={numero} />
      <EmptyState
        title="Muy pronto, todo junto acá"
        description="Mientras tanto, lo que te debe cada uno lo ves en Alumnos y lo cobrado de hoy, en Hoy."
      />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href="/admin/clases/alumnos" className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")}>
          Ver Alumnos
        </Link>
        <Link href="/admin/clases" className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")}>
          Ver Hoy
        </Link>
      </div>
    </main>
  );
}
