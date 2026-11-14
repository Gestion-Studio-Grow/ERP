import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { gestionaClases } from "@/lib/padel/plata-guardia";
import { cn } from "@/components/ui";
import { badgePendientes, configCompleta } from "@/lib/padel/datos.server";
import { DIRECTORIO_DEFAULT } from "@/lib/padel/directorio";
import { tarjeta } from "../../_vista";
import { EncabezadoAjuste } from "../_encabezado";
import { EditorDirectorio } from "./EditorDirectorio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Buscador de profes", manifest: "/clases/app.webmanifest" };

// Ajustes → Buscador de profes: dos caminos conviven. Tu link (tu turnero, el de siempre) y el
// buscador público de ProfeTurnos (/profeturnos/profes), donde la gente busca profe por zona y día.
// Aparecer es opcional y arranca en NO. Sin migración: clave reservada `_directorio` del JSON de textos.
export default async function AjustesDirectorio() {
  const user = await requireApp("padel-clases");
  // Todo lo de esta pantalla guarda con acciones que exigen agenda:manage: sin él, vuelve a Hoy.
  if (!gestionaClases(user)) redirect("/admin/clases");
  const [{ config }, numero] = await Promise.all([configCompleta(), badgePendientes()]);
  const d = config.directorio ?? DIRECTORIO_DEFAULT;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <EncabezadoAjuste titulo="Buscador de profes" detalle="Que te encuentren alumnos nuevos. Se guarda solo." pendientes={numero} />
      <section className={cn(tarjeta, "mb-4")} aria-label="Buscador de profes" data-qa="directorio">
        <EditorDirectorio inicial={d} />
      </section>
      <section className={cn(tarjeta, "grid gap-2")} aria-labelledby="t-caminos">
        <h2 id="t-caminos" className="text-base font-semibold text-strong">Cómo te encuentran</h2>
        <ul className="grid list-disc gap-1.5 pl-5 text-sm text-body">
          <li>Tu link sigue igual: tus alumnos te piden clase directo desde ahí.</li>
          <li>En el buscador, la gente ve tus próximos horarios libres y toca «Reservar»: cae en tu mismo turnero, con el horario elegido.</li>
          <li>Lo que te reservan desde el buscador lo confirmás igual que siempre. Al alumno le escribe Gestión Studio Grow en tu nombre («Tu profe … confirmó tu clase»). Por ahora ese mensaje sale con el mismo botón verde que tocás vos.</li>
          <li>Lo que te piden por tu link sigue como hoy: les escribís vos.</li>
          <li>Si después no querés aparecer más, tocá «No» y salís del buscador en unos 10 minutos.</li>
        </ul>
        <Link href="/profeturnos/profes" target="_blank" className="inline-flex min-h-12 items-center text-sm font-semibold text-accent-ink underline underline-offset-2" data-qa="ver-buscador">
          Ver el buscador
        </Link>
      </section>
    </main>
  );
}
