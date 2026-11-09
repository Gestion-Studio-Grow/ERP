import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { gestionaClases } from "@/lib/padel/plata-guardia";
import { badgePendientes, configCompleta } from "@/lib/padel/datos.server";
import { EncabezadoAjuste } from "../_encabezado";
import { EditorHorarios } from "./EditorHorarios";
import { semanaDesde } from "./grilla";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Horarios", manifest: "/clases/app.webmanifest" };

// Ajustes → Horarios (E3 · M-078..M-082): cuándo das clases, sin tipear. Los bloqueos de un día
// (lluvia, viaje) no van acá: están en «Días bloqueados» (y en Semana → «Se suspende»).
export default async function AjustesHorarios() {
  const user = await requireApp("padel-clases");
  // Todo lo de esta pantalla guarda con acciones que exigen agenda:manage: sin él, vuelve a Hoy.
  if (!gestionaClases(user)) redirect("/admin/clases");
  const [{ config, franjas, clubes }, numero] = await Promise.all([configCompleta(), badgePendientes()]);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <EncabezadoAjuste titulo="Horarios" detalle="Tocá los bloques de cada día. Abajo ves lo que va a ver el alumno." pendientes={numero} />
      <EditorHorarios inicial={semanaDesde(franjas)} duracionMin={config.duracionMin} clubes={clubes.map((c) => ({ id: c.id, nombre: c.nombre, activo: c.activo }))} />
    </main>
  );
}
